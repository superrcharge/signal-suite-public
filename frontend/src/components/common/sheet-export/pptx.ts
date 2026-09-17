/**
 * Writes a .pptx holding one slide and one picture. No dependency.
 *
 * See `zip-store.ts` for why this is hand written rather than delegated to
 * `pptxgenjs`. The short version: that library's only route to a browser bundle
 * drags in two unfixable HIGH advisories, and this package is small enough to
 * own outright.
 *
 * Small because the shape is fixed. A presentation needs twelve parts, eleven of
 * which are constant boilerplate; the only things that vary are the slide size,
 * the picture's extent, and the PNG bytes. There is no text, no placeholder, no
 * second layout, and no notes slide, because a full-bleed picture uses none of
 * them.
 *
 * Verified against TWO consumers, and the second one is the reason this file
 * has as many parts as it does. `python-pptx` accepted a twelve-part package
 * happily; **Keynote rejected that same file outright** with "The file format
 * is invalid". A parser library is lenient about parts it does not need, and a
 * real presentation app is not. What was missing, measured by diffing against a
 * genuine PowerPoint deck: the two `docProps` parts, `presProps`, `viewProps`,
 * `tableStyles`, and `p:txStyles` on the slide master. None of them carry any
 * information this export cares about, and all of them are required in practice.
 *
 * The rule to carry away: do not treat "python-pptx opens it" as proof a .pptx
 * is valid. It is necessary, not sufficient.
 */
import { emu, slideImagePlacement, type Placement, type SheetSize, type SlideSize } from './slide-geometry';
import { ttfToEot } from './eot';
import type { FetchedFontFamily } from './sheet-fonts';
import { zipStore, type ZipEntry } from './zip-store';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

// The four OOXML namespaces this package touches. Named rather than repeated so
// a typo is a compile error in one place instead of a part PowerPoint rejects.
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/**
 * A theme is required by the spec even though nothing here reads a theme colour
 * or a theme font. PowerPoint refuses to open a package whose slide master has
 * no theme relationship, so this is the smallest one that satisfies it: the
 * stock Office palette and font scheme, and the three-entry format lists the
 * schema demands.
 */
const THEME_XML = `${DECL}<a:theme xmlns:a="${NS_A}" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

/**
 * An OPEN shape tree, deliberately unclosed. Every caller appends its own
 * children (the slide appends a picture, the master and layout append nothing)
 * and then writes the matching `</p:spTree>` itself. Closing it here would mean
 * three near-identical copies of the group properties block instead of one.
 */
/**
 * Minimal presentation properties. PowerPoint writes far more into each of
 * these; what matters is that the parts exist and are related, because a
 * consumer that expects them refuses the whole package when they are absent.
 */
const PRES_PROPS_XML = `${DECL}<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`;
const VIEW_PROPS_XML = `${DECL}<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`;
const TABLE_STYLES_XML = `${DECL}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;

/** Package metadata. Empty-ish values are fine; the parts being absent is not. */
const CORE_XML = `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Signal Suite sheet</dc:title><dc:creator>Signal Suite</dc:creator><cp:lastModifiedBy>Signal Suite</cp:lastModifiedBy></cp:coreProperties>`;
const APP_XML = `${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Signal Suite</Application><Slides>1</Slides><Paragraphs>0</Paragraphs><Words>0</Words></Properties>`;

/**
 * The master's text styles, and the header/footer flags beside them.
 *
 * These are populated to match the shape a real generator emits, rather than
 * left as empty `<p:titleStyle/><p:bodyStyle/><p:otherStyle/>` elements.
 *
 * This comment used to claim the empty form was measured as refused and the
 * populated form as accepted. That was not true and should not be repeated:
 * the only populated-`txStyles` package ever built here was the one whose
 * `p:otherStyle` was malformed XML, so it could not have opened anywhere. Both
 * forms are schema-valid, and neither was the reason the writer's output was
 * rejected - see OTHER_STYLE below and the slide's rels for the two defects
 * that were.
 */
const HEADER_FOOTER = '<p:hf sldNum="0" hdr="0" ftr="0" dt="0"/>';

/**
 * The master's `p:otherStyle`, nine levels of it.
 *
 * Extracted verbatim from a known-good package rather than retyped, because
 * the value this replaced was a CPython `repr()` that had leaked into the
 * string literal:
 *
 *   <p:otherStyle><function other at 0x109353530></p:otherStyle>
 *
 * That is not well-formed XML - `xmllint` reports "Specification mandates
 * value for attribute other" - so every package built with it was rejected
 * outright. It is the reason the writer's output would not open, and it is
 * why `pptxParts` is now parsed by a test rather than only substring-matched.
 */
const OTHER_STYLE =
  '<p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL="2286000" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL="2743200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL="3200400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL="3657600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr></p:otherStyle>';

const TX_STYLES =
  '<p:txStyles>' +
  '<p:titleStyle><a:lvl1pPr algn="ctr" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
  '<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL="742950" indent="-285750" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8211;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL="1143000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL="1600200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8211;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL="2057400" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#187;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL="2514600" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL="2971800" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL="3429000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL="3886200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr></p:bodyStyle>' +
  OTHER_STYLE +
  '</p:txStyles>';

const EMPTY_SP_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

export interface PptxPictureSlide {
  /** Slide size, in inches. */
  readonly slide: SlideSize;
  /** The rasterized sheet, PNG bytes. */
  readonly png: Uint8Array;
  /** The sheet's CSS pixel size, used only to decide full bleed against fitted. */
  readonly sheet: SheetSize;
  /** Alt text on the picture shape. Screen readers in PowerPoint read this. */
  readonly altText?: string;
}

/** One picture on the slide, already placed. Inches, like everything public here. */
export interface PptxPicture {
  readonly png: Uint8Array;
  readonly place: Placement;
  readonly altText?: string;
}

/**
 * One native text box.
 *
 * Sizes are in points and `spc` in hundredths of a point, because that is what
 * DrawingML stores. Converting from the browser's CSS pixels is the caller's
 * job, so this module stays free of anything DOM shaped.
 */
export interface PptxTextBox {
  readonly place: Placement;
  readonly text: string;
  /** Font family name. Named, not embedded: see the font list in sheet-fonts. */
  readonly font: string;
  readonly sizePt: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  /** Six hex digits, no leading '#'. */
  readonly color: string;
  /** Letter spacing, hundredths of a point. */
  readonly spc?: number;
  readonly align?: 'l' | 'ctr' | 'r';
  readonly anchor?: 't' | 'ctr' | 'b';
  /**
   * False for a cell that clips on screen rather than wrapping. PowerPoint has
   * no ellipsis, so an over-long value overflows its box either way; not
   * wrapping at least keeps it on one line where the sheet had one line.
   */
  readonly wrap?: boolean;
}

/**
 * A slide built from parts, rather than one flat picture.
 *
 * The PACE card uses this: its two wheels are pictures and everything else is
 * real, editable PowerPoint text. The catalog datasheet does not, and stays a
 * single full-bleed picture - it needs ~100 hairline shapes that are
 * `border-bottom` on text divs rather than elements, its scale varies per
 * record, and it aligns rows on a shared baseline, which a text box cannot do.
 */
export interface PptxSlide {
  readonly slide: SlideSize;
  readonly pictures: readonly PptxPicture[];
  readonly texts?: readonly PptxTextBox[];
  /** Slide background, six hex digits. Needed once there is no picture behind the text. */
  readonly background?: string;
  /**
   * Faces to embed, so native text renders in the sheet's own fonts on a
   * machine that does not have them installed.
   *
   * Honoured by PowerPoint on Windows. Keynote ignores embedded fonts outright
   * and Mac PowerPoint is unreliable about them, which means a correct
   * implementation and a broken one look identical on this machine - the only
   * check that means anything is opening the file on Windows.
   */
  readonly fonts?: readonly FetchedFontFamily[];
}

/** XML-escapes a value going into an attribute. Alt text is the only such value here. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escapes element content. Quotes are harmless here but cost nothing to keep. */
const escapeText = escapeXml;

function pictureXml(picture: PptxPicture, id: number, embedId: string): string {
  const { place } = picture;
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}" descr="${escapeXml(picture.altText ?? '')}"/>` +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
    `<p:blipFill><a:blip r:embed="${embedId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${emu(place.x)}" y="${emu(place.y)}"/><a:ext cx="${emu(place.w)}" cy="${emu(place.h)}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
  );
}

function textBoxXml(box: PptxTextBox, id: number): string {
  const { place } = box;
  // Insets are zeroed and autofit is off so the box's own rect is the text's
  // rect. PowerPoint's defaults are a 0.05in left/right inset and 0.025in
  // top/bottom, which would shift every one of these off its measured
  // position, and normAutofit would quietly rescale the type.
  const anchor = box.anchor ?? 'ctr';
  const align = box.align ?? 'l';
  // `wrap="none"` lets the consumer shrink the shape to fit its one line, which
  // is harmless for left-aligned text (it still starts at the measured x) and
  // is NOT harmless for centred text, where a narrower box re-centres the
  // string and slides it sideways. Measured in Keynote: a 72pt non-wrapping box
  // came back 33pt wide. So non-wrapping is honoured only where it cannot move
  // anything, and a centred box always keeps the width it was measured at.
  const wrap = box.wrap === false && align === 'l' ? 'none' : 'square';
  const spc = box.spc && box.spc !== 0 ? ` spc="${Math.round(box.spc)}"` : '';
  const bold = box.bold ? ' b="1"' : '';
  const italic = box.italic ? ' i="1"' : '';
  // sz is hundredths of a point, and PowerPoint rejects anything under 1pt.
  const sz = Math.max(100, Math.round(box.sizePt * 100));

  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${emu(place.x)}" y="${emu(place.y)}"/><a:ext cx="${emu(place.w)}" cy="${emu(place.h)}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
    `<p:txBody><a:bodyPr wrap="${wrap}" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}"><a:noAutofit/></a:bodyPr>` +
    '<a:lstStyle/>' +
    `<a:p><a:pPr algn="${align}" marL="0" indent="0"/>` +
    `<a:r><a:rPr lang="en-US" sz="${sz}"${bold}${italic}${spc} dirty="0">` +
    `<a:solidFill><a:srgbClr val="${box.color}"/></a:solidFill>` +
    `<a:latin typeface="${escapeXml(box.font)}"/><a:cs typeface="${escapeXml(box.font)}"/></a:rPr>` +
    `<a:t>${escapeText(box.text)}</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

function slideXml(input: PptxSlide): string {
  const background = input.background
    ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${input.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    : '';

  // Shape ids start at 2 because the spTree's own group shape is id 1.
  let id = 2;
  const pictures = input.pictures
    .map((picture, index) => pictureXml(picture, id++, `rId${index + 1}`))
    .join('');
  const texts = (input.texts ?? []).map((box) => textBoxXml(box, id++)).join('');

  return (
    `${DECL}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld>${background}${EMPTY_SP_TREE}${pictures}${texts}</p:spTree></p:cSld>` +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}

/**
 * Every part, in the order they are written into the archive.
 *
 * One media part per picture, so the count is 16 + pictures rather than fixed.
 */
export function pptxSlideParts(input: PptxSlide): ZipEntry[] {
  const { slide, pictures } = input;
  const cx = emu(slide.w);
  const cy = emu(slide.h);

  // One part per DISTINCT face, so a family naming one file for both slots
  // costs one copy rather than two. Oswald ships only as a variable file here
  // and fills both slots with it, which without this would embed 165 KB twice.
  //
  // The EOT wrap happens HERE rather than at fetch time, so a deduped face is
  // converted once rather than once per slot. Keyed on the face bytes AND the
  // typeface, because the EOT header carries the family name: two families
  // sharing one file would still need a header each.
  const fontFamilies = input.fonts ?? [];
  const fontFiles: { name: string; data: Uint8Array; relId: string }[] = [];
  const relForFace = new Map<Uint8Array, { relId: string; typeface: string }>();

  const faceRel = (data: Uint8Array, typeface: string): string => {
    const existing = relForFace.get(data);
    if (existing && existing.typeface === typeface) return existing.relId;

    const relId = `rIdF${fontFiles.length + 1}`;
    fontFiles.push({
      name: `ppt/fonts/font${fontFiles.length + 1}.fntdata`,
      // `.fntdata` is EOT, not an sfnt. Writing the raw TTF here passes every
      // local check and is then ignored by the consumer - see eot.ts.
      data: ttfToEot(data, typeface),
      relId,
    });
    relForFace.set(data, { relId, typeface });
    return relId;
  };

  // CT_Presentation fixes the child order: embeddedFontLst sits after notesSz.
  const embeddedFontLst = fontFamilies.length
    ? `<p:embeddedFontLst>${fontFamilies
        .map((family) => {
          const regular = faceRel(family.regular, family.typeface);
          const bold = faceRel(family.bold, family.typeface);
          return (
            `<p:embeddedFont><p:font typeface="${escapeXml(family.typeface)}" pitchFamily="34" charset="0"/>` +
            `<p:regular r:id="${regular}"/><p:bold r:id="${bold}"/></p:embeddedFont>`
          );
        })
        .join('')}</p:embeddedFontLst>`
    : '';

  const fontRels = fontFiles
    .map(
      (file) =>
        `<Relationship Id="${file.relId}" Type="${NS_R}/font" Target="${file.name.replace('ppt/', '')}"/>`,
    )
    .join('');

  const imageRels = pictures
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/image" Target="../media/image${i + 1}.png"/>`)
    .join('');
  // The layout takes the id after the last image, so adding a picture cannot
  // silently renumber it out from under the slide.
  const layoutRelId = `rId${pictures.length + 1}`;

  return [
    {
      name: '[Content_Types].xml',
      data: `${DECL}<Types xmlns="${NS_CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="fntdata" ContentType="application/x-fontdata"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      data: `${DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    {
      // notesSz is the slide size transposed, which is what PowerPoint itself
      // writes for a presentation with no notes master.
      name: 'ppt/presentation.xml',
      data: `${DECL}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="${cy}" cy="${cx}"/>${embeddedFontLst}</p:presentation>`,
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: `${DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_R}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${NS_R}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${NS_R}/theme" Target="theme/theme1.xml"/><Relationship Id="rId4" Type="${NS_R}/presProps" Target="presProps.xml"/><Relationship Id="rId5" Type="${NS_R}/viewProps" Target="viewProps.xml"/><Relationship Id="rId6" Type="${NS_R}/tableStyles" Target="tableStyles.xml"/>${fontRels}</Relationships>`,
    },
    { name: 'ppt/theme/theme1.xml', data: THEME_XML },
    { name: 'ppt/presProps.xml', data: PRES_PROPS_XML },
    { name: 'ppt/viewProps.xml', data: VIEW_PROPS_XML },
    { name: 'ppt/tableStyles.xml', data: TABLE_STYLES_XML },
    { name: 'docProps/core.xml', data: CORE_XML },
    { name: 'docProps/app.xml', data: APP_XML },
    {
      name: 'ppt/slideMasters/slideMaster1.xml',
      data: `${DECL}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${EMPTY_SP_TREE}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>${HEADER_FOOTER}${TX_STYLES}</p:sldMaster>`,
    },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: `${DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${NS_R}/theme" Target="../theme/theme1.xml"/></Relationships>`,
    },
    {
      name: 'ppt/slideLayouts/slideLayout1.xml',
      data: `${DECL}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" preserve="1"><p:cSld name="DEFAULT"><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_SP_TREE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: `${DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    },
    { name: 'ppt/slides/slide1.xml', data: slideXml(input) },
    {
      name: 'ppt/slides/_rels/slide1.xml.rels',
      // A slide part is REQUIRED to carry exactly one slideLayout
      // relationship, and this one carried none for its whole life. Without it
      // the slide is orphaned from the layout/master tree and the package is
      // rejected, even though every part in it parses.
      //
      // Worth knowing, because the evidence once said otherwise: grafting this
      // writer's slide1.xml into a package exported by another application
      // opened correctly, which looked like proof the slide XML was fine. That
      // graft had silently supplied this relationship too, so it moved two
      // variables at once. The slide XML was never the defect.
      //
      // Images keep rId1..rIdN so the `r:embed` values in `slideXml` do not
      // move, and the layout takes the next id after them.
      data: `${DECL}<Relationships xmlns="${NS_PKG_REL}">${imageRels}<Relationship Id="${layoutRelId}" Type="${NS_R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
    },
    ...pictures.map((picture, i) => ({
      name: `ppt/media/image${i + 1}.png`,
      data: picture.png,
    })),
    ...fontFiles.map((file) => ({ name: file.name, data: file.data })),
  ];
}

/**
 * The single full-bleed picture case, which is what the catalog datasheet uses
 * and what every sheet used before the PACE card grew native text.
 *
 * Kept as its own entry point rather than folded into `pptxSlideParts`, because
 * deciding full bleed against letterboxed from the sheet's aspect is this
 * function's whole job and no composite caller wants it.
 */
export function pptxParts(input: PptxPictureSlide): ZipEntry[] {
  return pptxSlideParts({
    slide: input.slide,
    pictures: [
      {
        png: input.png,
        place: slideImagePlacement(input.slide, input.sheet),
        altText: input.altText ?? 'Exported sheet',
      },
    ],
  });
}

/** The finished package. Pure: the same input gives byte-identical output. */
export function buildPptx(input: PptxPictureSlide): Uint8Array {
  return zipStore(pptxParts(input));
}

/** The composite case: pictures plus native text. Pure, same as `buildPptx`. */
export function buildPptxSlide(input: PptxSlide): Uint8Array {
  return zipStore(pptxSlideParts(input));
}
