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
import { connectorGeometry, type Pt } from './pptx-connector';
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
 * One run of text: a stretch of a paragraph in one face and colour.
 *
 * Sizes are in points and `spc` in hundredths of a point, because that is what
 * DrawingML stores. Converting from the browser's CSS pixels is the caller's
 * job, so this module stays free of anything DOM shaped.
 */
export interface PptxRun {
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
}

/** One native text box: a single paragraph, one run or several. */
export interface PptxTextBox extends PptxRun {
  readonly place: Placement;
  /** Further runs of the same paragraph, after the one the box's own fields describe. */
  readonly runs?: readonly PptxRun[];
  readonly align?: 'l' | 'ctr' | 'r';
  readonly anchor?: 't' | 'ctr' | 'b';
  /**
   * False for a cell that clips on screen rather than wrapping. PowerPoint has
   * no ellipsis, so an over-long value overflows its box either way; not
   * wrapping at least keeps it on one line where the sheet had one line.
   */
  readonly wrap?: boolean;
}

/** A line's colour and weight. `dash` is PowerPoint's own dash, not the screen's dash array. */
export interface PptxStroke {
  readonly color: string;
  readonly widthPt: number;
  readonly dash?: boolean;
}

/** The text a shape carries inside itself, so it moves and resizes with the shape. Insets are inches. */
export type PptxShapeText = Omit<PptxTextBox, 'place'> & {
  readonly inset?: { readonly l: number; readonly t: number; readonly r: number; readonly b: number };
};

/**
 * A native autoshape. `key` names it for a connector to attach to; it is
 * resolved to a shape id by the writer, so a caller never numbers anything.
 */
export interface PptxShape {
  readonly kind: 'shape';
  readonly key?: string;
  readonly name?: string;
  /** Alt text. */
  readonly descr?: string;
  readonly geom: 'rect' | 'roundRect' | 'ellipse';
  readonly place: Placement;
  /** `roundRect` only: the corner as a fraction of the shorter side, up to 0.5, which is a pill. */
  readonly radius?: number;
  /** Six hex digits; none is no fill. */
  readonly fill?: string;
  /** None is no outline. */
  readonly stroke?: PptxStroke;
  readonly text?: PptxShapeText;
}

/** A rectangle's connection sites, in the order DrawingML numbers them: 0 top, 1 left, 2 bottom, 3 right. */
export type CxnSite = 0 | 1 | 2 | 3;

/**
 * A native connector along `points`, in inches, from the first to the last.
 *
 * `start` and `end` attach it to a shape's connection site by that shape's
 * `key`, which is what makes PowerPoint carry the line when the shape is
 * dragged. A connector with neither is a plain line. The stored route is what
 * is drawn until an end is moved, and then PowerPoint draws it afresh between
 * the sites, so a route with more bends than an elbow connector has (see
 * `connectorGeometry`) is right on open and simplified after.
 */
export interface PptxConnector {
  readonly kind: 'connector';
  readonly name?: string;
  readonly descr?: string;
  readonly points: readonly (readonly [number, number])[];
  readonly start?: { readonly key: string; readonly site: CxnSite };
  readonly end?: { readonly key: string; readonly site: CxnSite };
  readonly stroke: PptxStroke;
}

/** A native text box among the objects, so its place in the stacking order is the caller's. */
export interface PptxTextObject {
  readonly kind: 'text';
  readonly box: PptxTextBox;
}

/** Objects that move as one: a card and everything on it. The group's frame is the union of its children. */
export interface PptxGroup {
  readonly kind: 'group';
  readonly name?: string;
  readonly descr?: string;
  readonly children: readonly PptxObject[];
}

/**
 * One cell of a native table: paragraphs of runs, a fill and its four borders.
 *
 * A border left out is no border, never the table style's, because a table
 * here names no style: every line a cell draws is its own, so two cells that
 * share an edge are given the same stroke on it. `span` is how many grid
 * columns the cell covers; the writer adds the merged placeholders after it.
 * Margins are inches.
 */
export interface PptxTableCell {
  /** Each paragraph is a list of runs; an empty list is an empty paragraph. */
  readonly paragraphs: readonly (readonly PptxRun[])[];
  readonly align?: 'l' | 'ctr' | 'r';
  readonly anchor?: 't' | 'ctr' | 'b';
  /** Six hex digits; none is no fill. */
  readonly fill?: string;
  readonly span?: number;
  readonly borders?: { readonly l?: PptxStroke; readonly r?: PptxStroke; readonly t?: PptxStroke; readonly b?: PptxStroke };
  readonly margin?: { readonly l: number; readonly t: number; readonly r: number; readonly b: number };
}

/** A row's height is the least it takes; PowerPoint grows it to fit what the cells hold. */
export interface PptxTableRow {
  /** Inches. */
  readonly h: number;
  /** In column order; a cell with a `span` stands for that many columns. */
  readonly cells: readonly PptxTableCell[];
}

/**
 * A native table: a `p:graphicFrame` holding an `a:tbl`, so the grid is rows and
 * cells a person edits in PowerPoint rather than shapes laid out to look like
 * one. `x` and `y` are the top left corner and the columns' widths its width,
 * in inches.
 */
export interface PptxTable {
  readonly kind: 'table';
  readonly name?: string;
  readonly descr?: string;
  readonly x: number;
  readonly y: number;
  readonly colWidths: readonly number[];
  readonly rows: readonly PptxTableRow[];
}

/** One native object on a slide. A list of them is in stacking order, the first at the back. */
export type PptxObject = PptxShape | PptxConnector | PptxTextObject | PptxGroup | PptxTable;

/**
 * A slide built from parts, rather than one flat picture.
 *
 * The PACE card uses this: its two wheels are pictures and everything else is
 * real, editable PowerPoint text. The catalog datasheet does not, and stays a
 * single full-bleed picture - it needs ~100 hairline shapes that are
 * `border-bottom` on text divs rather than elements, its scale varies per
 * record, and it aligns rows on a shared baseline, which a text box cannot do.
 *
 * `objects` is for a slide with no picture at all, the operation deck's:
 * shapes, connectors and groups, over any pictures and `texts`.
 */
export interface PptxSlide {
  readonly slide: SlideSize;
  readonly pictures: readonly PptxPicture[];
  readonly texts?: readonly PptxTextBox[];
  readonly objects?: readonly PptxObject[];
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

function runXml(run: PptxRun): string {
  const spc = run.spc && run.spc !== 0 ? ` spc="${Math.round(run.spc)}"` : '';
  const bold = run.bold ? ' b="1"' : '';
  const italic = run.italic ? ' i="1"' : '';
  // sz is hundredths of a point, and PowerPoint rejects anything under 1pt.
  const sz = Math.max(100, Math.round(run.sizePt * 100));
  return (
    `<a:r><a:rPr lang="en-US" sz="${sz}"${bold}${italic}${spc} dirty="0">` +
    `<a:solidFill><a:srgbClr val="${run.color}"/></a:solidFill>` +
    `<a:latin typeface="${escapeXml(run.font)}"/><a:cs typeface="${escapeXml(run.font)}"/></a:rPr>` +
    `<a:t>${escapeText(run.text)}</a:t></a:r>`
  );
}

/**
 * The text body of a box or a shape. Insets are zeroed unless the shape says
 * otherwise and autofit is off, so the rect is the text's rect. PowerPoint's
 * defaults are a 0.05in left/right inset and 0.025in top/bottom, which would
 * shift every one of these off its measured position, and normAutofit would
 * quietly rescale the type.
 */
function textBodyXml(box: Omit<PptxTextBox, 'place'>, inset = { l: 0, t: 0, r: 0, b: 0 }): string {
  const anchor = box.anchor ?? 'ctr';
  const align = box.align ?? 'l';
  // `wrap="none"` lets the consumer shrink the shape to fit its one line, which
  // is harmless for left-aligned text (it still starts at the measured x) and
  // is NOT harmless for centred text, where a narrower box re-centres the
  // string and slides it sideways. Measured in Keynote: a 72pt non-wrapping box
  // came back 33pt wide. So non-wrapping is honoured only where it cannot move
  // anything, and a centred box always keeps the width it was measured at.
  const wrap = box.wrap === false && align === 'l' ? 'none' : 'square';
  const ins = `lIns="${emu(inset.l)}" tIns="${emu(inset.t)}" rIns="${emu(inset.r)}" bIns="${emu(inset.b)}"`;
  return (
    `<p:txBody><a:bodyPr wrap="${wrap}" ${ins} anchor="${anchor}"><a:noAutofit/></a:bodyPr>` +
    '<a:lstStyle/>' +
    `<a:p><a:pPr algn="${align}" marL="0" indent="0"/>` +
    `${runXml(box)}${(box.runs ?? []).map(runXml).join('')}</a:p></p:txBody>`
  );
}

function textBoxXml(box: PptxTextBox, id: number): string {
  const { place } = box;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${emu(place.x)}" y="${emu(place.y)}"/><a:ext cx="${emu(place.w)}" cy="${emu(place.h)}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
    `${textBodyXml(box)}</p:sp>`
  );
}

/** The outline: DrawingML orders fill, dash, join, so the dash follows the colour. */
function lineXml(stroke: PptxStroke | undefined): string {
  if (!stroke) return '<a:ln><a:noFill/></a:ln>';
  return (
    `<a:ln w="${Math.round(stroke.widthPt * 12700)}"><a:solidFill><a:srgbClr val="${stroke.color}"/></a:solidFill>` +
    `${stroke.dash ? '<a:prstDash val="dash"/>' : ''}</a:ln>`
  );
}

const nameAttrs = (id: number, name: string | undefined, fallback: string, descr: string | undefined) =>
  `id="${id}" name="${escapeXml(name ?? `${fallback} ${id}`)}"${descr ? ` descr="${escapeXml(descr)}"` : ''}`;

/** Where a native object has its ids, and which key stands for which. */
interface ObjectIds {
  readonly ids: Map<PptxObject, number>;
  readonly keys: Map<string, number>;
}

/**
 * Numbers every object in stacking order, groups before their children, and
 * records the id each `key` stands for. Done before anything is written
 * because a connector sits under the cards it is attached to, so it names an
 * id that has not been written yet.
 */
function numberObjects(objects: readonly PptxObject[], first: number): { numbered: ObjectIds; next: number } {
  const numbered: ObjectIds = { ids: new Map(), keys: new Map() };
  let next = first;
  const walk = (list: readonly PptxObject[]) => {
    for (const object of list) {
      numbered.ids.set(object, next);
      if (object.kind === 'shape' && object.key !== undefined) {
        if (numbered.keys.has(object.key)) throw new Error(`Two shapes on one slide are both keyed "${object.key}".`);
        numbered.keys.set(object.key, next);
      }
      next += 1;
      if (object.kind === 'group') walk(object.children);
    }
  };
  walk(objects);
  return { numbered, next };
}

type Box = readonly [number, number, number, number];

/** An object's frame on the slide in EMU: left, top, right, bottom. A group's is the union of its children's. */
function frameOf(object: PptxObject): Box {
  switch (object.kind) {
    case 'shape': {
      const { place } = object;
      return [emu(place.x), emu(place.y), emu(place.x) + emu(place.w), emu(place.y) + emu(place.h)];
    }
    case 'text': {
      const { place } = object.box;
      return [emu(place.x), emu(place.y), emu(place.x) + emu(place.w), emu(place.y) + emu(place.h)];
    }
    case 'connector': {
      const xs = object.points.map((p) => emu(p[0]));
      const ys = object.points.map((p) => emu(p[1]));
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'group': {
      const frames = object.children.map(frameOf);
      return [
        Math.min(...frames.map((f) => f[0])), Math.min(...frames.map((f) => f[1])),
        Math.max(...frames.map((f) => f[2])), Math.max(...frames.map((f) => f[3])),
      ];
    }
    case 'table': {
      const w = object.colWidths.reduce((sum, c) => sum + emu(c), 0);
      const h = object.rows.reduce((sum, r) => sum + emu(r.h), 0);
      return [emu(object.x), emu(object.y), emu(object.x) + w, emu(object.y) + h];
    }
  }
}

function shapeXml(shape: PptxShape, id: number): string {
  const { place } = shape;
  const adj = shape.geom === 'roundRect'
    ? `<a:avLst><a:gd name="adj" fmla="val ${String(Math.round(Math.min(0.5, Math.max(0, shape.radius ?? 0.1667)) * 100000))}"/></a:avLst>`
    : '<a:avLst/>';
  const fill = shape.fill ? `<a:solidFill><a:srgbClr val="${shape.fill}"/></a:solidFill>` : '<a:noFill/>';
  const { text } = shape;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr ${nameAttrs(id, shape.name, 'Shape', shape.descr)}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${emu(place.x)}" y="${emu(place.y)}"/><a:ext cx="${emu(place.w)}" cy="${emu(place.h)}"/></a:xfrm>` +
    `<a:prstGeom prst="${shape.geom}">${adj}</a:prstGeom>${fill}${lineXml(shape.stroke)}</p:spPr>` +
    `${text ? textBodyXml(text, text.inset) : ''}</p:sp>`
  );
}

function connectorXml(connector: PptxConnector, id: number, keys: ReadonlyMap<string, number>): string {
  // Level to within 0.015in, a pixel and a half at 96 to the inch, is level: a layout's right-angled routes drift that much.
  const g = connectorGeometry(connector.points.map((p): Pt => [emu(p[0]), emu(p[1])]), emu(0.015));
  const glue = (tag: 'stCxn' | 'endCxn', to: PptxConnector['start']) => {
    if (!to) return '';
    const target = keys.get(to.key);
    if (target === undefined) throw new Error(`A connector is attached to "${to.key}", which no shape on the slide is keyed.`);
    return `<a:${tag} id="${target}" idx="${to.site}"/>`;
  };
  const flips = `${g.rot ? ` rot="${g.rot}"` : ''}${g.flipH ? ' flipH="1"' : ''}${g.flipV ? ' flipV="1"' : ''}`;
  const adj = g.adj.length > 0
    ? `<a:avLst>${g.adj.map((v, i) => `<a:gd name="adj${i + 1}" fmla="val ${v}"/>`).join('')}</a:avLst>`
    : '<a:avLst/>';
  return (
    `<p:cxnSp><p:nvCxnSpPr><p:cNvPr ${nameAttrs(id, connector.name, 'Connector', connector.descr)}/>` +
    `<p:cNvCxnSpPr>${glue('stCxn', connector.start)}${glue('endCxn', connector.end)}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>` +
    `<p:spPr><a:xfrm${flips}><a:off x="${g.off[0]}" y="${g.off[1]}"/><a:ext cx="${g.ext[0]}" cy="${g.ext[1]}"/></a:xfrm>` +
    `<a:prstGeom prst="${g.preset}">${adj}</a:prstGeom>${lineXml(connector.stroke)}</p:spPr></p:cxnSp>`
  );
}

/** One side of a cell: its stroke, or no line at all, in the element the schema names it by. */
function cellLineXml(tag: 'lnL' | 'lnR' | 'lnT' | 'lnB', stroke: PptxStroke | undefined): string {
  if (!stroke) return `<a:${tag} w="0"><a:noFill/></a:${tag}>`;
  return (
    `<a:${tag} w="${Math.round(stroke.widthPt * 12700)}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${stroke.color}"/></a:solidFill>` +
    `<a:prstDash val="${stroke.dash ? 'dash' : 'solid'}"/></a:${tag}>`
  );
}

const EMPTY_CELL_BODY = '<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></a:txBody><a:tcPr/>';

function tableCellXml(cell: PptxTableCell): string {
  const span = cell.span ?? 1;
  const align = cell.align ?? 'l';
  const margin = cell.margin ?? { l: 0.1, t: 0.05, r: 0.1, b: 0.05 };
  const paragraphs = (cell.paragraphs.length > 0 ? cell.paragraphs : [[]])
    .map((runs) => `<a:p><a:pPr algn="${align}"/>${runs.map(runXml).join('')}${runs.length === 0 ? '<a:endParaRPr lang="en-US"/>' : ''}</a:p>`)
    .join('');
  const { borders } = cell;
  const fill = cell.fill ? `<a:solidFill><a:srgbClr val="${cell.fill}"/></a:solidFill>` : '<a:noFill/>';
  // The merged cells a span covers carry nothing of their own; the schema still wants them in the row.
  const merged = Array.from({ length: span - 1 }, () => `<a:tc hMerge="1">${EMPTY_CELL_BODY}</a:tc>`).join('');
  return (
    `<a:tc${span > 1 ? ` gridSpan="${span}"` : ''}><a:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</a:txBody>` +
    `<a:tcPr marL="${emu(margin.l)}" marR="${emu(margin.r)}" marT="${emu(margin.t)}" marB="${emu(margin.b)}" anchor="${cell.anchor ?? 'ctr'}">` +
    // CT_TableCellProperties fixes the order: the four lines, then the fill.
    `${cellLineXml('lnL', borders?.l)}${cellLineXml('lnR', borders?.r)}${cellLineXml('lnT', borders?.t)}${cellLineXml('lnB', borders?.b)}${fill}</a:tcPr></a:tc>${merged}`
  );
}

function tableXml(table: PptxTable, id: number): string {
  const cols = table.colWidths.length;
  table.rows.forEach((row, r) => {
    const covered = row.cells.reduce((sum, c) => sum + (c.span ?? 1), 0);
    if (covered !== cols) throw new Error(`Row ${r + 1} of a table covers ${covered} columns of ${cols}.`);
  });
  const [x0, y0, x1, y1] = frameOf(table);
  const grid = table.colWidths.map((w) => `<a:gridCol w="${emu(w)}"/>`).join('');
  const rows = table.rows
    .map((row) => `<a:tr h="${emu(row.h)}">${row.cells.map(tableCellXml).join('')}</a:tr>`)
    .join('');
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr ${nameAttrs(id, table.name, 'Table', table.descr)}/>` +
    '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>' +
    `<p:xfrm><a:off x="${x0}" y="${y0}"/><a:ext cx="${x1 - x0}" cy="${y1 - y0}"/></p:xfrm>` +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
    `<a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  );
}

function objectXml(object: PptxObject, numbered: ObjectIds): string {
  const id = numbered.ids.get(object)!;
  switch (object.kind) {
    case 'table': return tableXml(object, id);
    case 'shape': return shapeXml(object, id);
    case 'text': return textBoxXml(object.box, id);
    case 'connector': return connectorXml(object, id, numbered.keys);
    case 'group': {
      const [x0, y0, x1, y1] = frameOf(object);
      const off = `<a:off x="${x0}" y="${y0}"/>`;
      const ext = `<a:ext cx="${x1 - x0}" cy="${y1 - y0}"/>`;
      return (
        `<p:grpSp><p:nvGrpSpPr><p:cNvPr ${nameAttrs(id, object.name, 'Group', object.descr)}/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
        // The child space is the slide's own, so a child's coordinates are written as they are.
        `<p:grpSpPr><a:xfrm>${off}${ext}<a:chOff x="${x0}" y="${y0}"/><a:chExt cx="${x1 - x0}" cy="${y1 - y0}"/></a:xfrm></p:grpSpPr>` +
        `${object.children.map((child) => objectXml(child, numbered)).join('')}</p:grpSp>`
      );
    }
  }
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
  const objects = input.objects ?? [];
  const { numbered } = numberObjects(objects, id);
  const native = objects.map((object) => objectXml(object, numbered)).join('');

  return (
    `${DECL}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld>${background}${EMPTY_SP_TREE}${pictures}${texts}${native}</p:spTree></p:cSld>` +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}

/**
 * The embedded fonts of a package: what `p:presentation` lists, the
 * relationships it needs and the parts themselves. Shared by the single slide
 * and the deck, which differ in nothing about fonts but where they are listed.
 */
function embedFonts(fontFamilies: readonly FetchedFontFamily[]) {
  // One part per DISTINCT face, so a family naming one file for both slots
  // costs one copy rather than two. Oswald ships only as a variable file here
  // and fills both slots with it, which without this would embed 165 KB twice.
  //
  // The EOT wrap happens HERE rather than at fetch time, so a deduped face is
  // converted once rather than once per slot. Keyed on the face bytes AND the
  // typeface, because the EOT header carries the family name: two families
  // sharing one file would still need a header each.
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

  return { embeddedFontLst, fontRels, fontFiles };
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
  const { embeddedFontLst, fontRels, fontFiles } = embedFonts(input.fonts ?? []);

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

/**
 * Every part of a deck of N slides, in the order they are written.
 *
 * Added beside `pptxSlideParts` rather than replacing it, so the single-slide
 * writers are untouched; for one slide this produces the same package, byte
 * for byte, which `pptx.test.ts` asserts. What changes with N:
 *
 * - `presentation.xml` lists a `sldId` per slide, ids from 256 in order.
 * - The presentation's rels keep rId1..rId6 for the master, the first slide
 *   and the four fixed parts, and give slide k (k >= 2) rId(k + 5), so adding
 *   a slide never renumbers what a one-slide package already used.
 * - Every slide has its own rels part. Its images are named by a count across
 *   the whole deck (`image1.png`..`imageM.png`), so two slides can never
 *   write the same media part, while each slide's own `r:embed` ids stay
 *   rId1.. as `slideXml` writes them.
 * - Every slide shares the one layout, and the size comes from the first
 *   slide: a deck has one size, so a slide of another is refused rather than
 *   silently drawn at the wrong scale.
 *
 * Fonts belong to the deck, never to a slide: `options.fonts` is embedded once
 * and every slide's native text draws on it, where a slide that names some of
 * its own is refused rather than having them dropped. With none, which is
 * every deck of pictures, no font part, relationship or list is written and
 * the package is what it was before fonts were accepted here.
 */
export function pptxDeckParts(slides: readonly PptxSlide[], options: { readonly fonts?: readonly FetchedFontFamily[] } = {}): ZipEntry[] {
  const first = slides[0];
  if (!first) throw new Error('A deck needs at least one slide.');
  const { slide: size } = first;
  for (const s of slides) {
    if (s.slide.w !== size.w || s.slide.h !== size.h) throw new Error('Every slide in a deck must be the same size.');
    if (s.fonts && s.fonts.length > 0) throw new Error('A deck embeds its fonts once, not per slide.');
  }
  const cx = emu(size.w);
  const cy = emu(size.h);
  const { embeddedFontLst, fontRels, fontFiles } = embedFonts(options.fonts ?? []);

  const slideOverrides = slides
    .map((_, k) => `<Override PartName="/ppt/slides/slide${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join('');
  const slideRelId = (k: number) => (k === 0 ? 'rId2' : `rId${k + 6}`);
  const sldIds = slides.map((_, k) => `<p:sldId id="${256 + k}" r:id="${slideRelId(k)}"/>`).join('');
  const slideRel = (k: number) =>
    `<Relationship Id="${slideRelId(k)}" Type="${NS_R}/slide" Target="slides/slide${k + 1}.xml"/>`;
  // The first slide keeps the slot a one-slide package gives it; the rest follow the fixed parts.
  const laterSlideRels = slides.slice(1).map((_, k) => slideRel(k + 1)).join('');
  // Where each slide's pictures start in the deck-wide media numbering.
  let mediaCount = 0;
  const slideParts: ZipEntry[] = [];
  const mediaParts: ZipEntry[] = [];
  slides.forEach((s, k) => {
    const imageRels = s.pictures
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/image" Target="../media/image${mediaCount + i + 1}.png"/>`)
      .join('');
    slideParts.push(
      { name: `ppt/slides/slide${k + 1}.xml`, data: slideXml(s) },
      {
        name: `ppt/slides/_rels/slide${k + 1}.xml.rels`,
        data: `${DECL}<Relationships xmlns="${NS_PKG_REL}">${imageRels}<Relationship Id="rId${s.pictures.length + 1}" Type="${NS_R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
      },
    );
    s.pictures.forEach((picture, i) => {
      mediaParts.push({ name: `ppt/media/image${mediaCount + i + 1}.png`, data: picture.png });
    });
    mediaCount += s.pictures.length;
  });

  return [
    {
      name: '[Content_Types].xml',
      data: `${DECL}<Types xmlns="${NS_CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="fntdata" ContentType="application/x-fontdata"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>${slideOverrides}<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      data: `${DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    {
      name: 'ppt/presentation.xml',
      data: `${DECL}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="${cy}" cy="${cx}"/>${embeddedFontLst}</p:presentation>`,
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: `${DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_R}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRel(0)}<Relationship Id="rId3" Type="${NS_R}/theme" Target="theme/theme1.xml"/><Relationship Id="rId4" Type="${NS_R}/presProps" Target="presProps.xml"/><Relationship Id="rId5" Type="${NS_R}/viewProps" Target="viewProps.xml"/><Relationship Id="rId6" Type="${NS_R}/tableStyles" Target="tableStyles.xml"/>${laterSlideRels}${fontRels}</Relationships>`,
    },
    { name: 'ppt/theme/theme1.xml', data: THEME_XML },
    { name: 'ppt/presProps.xml', data: PRES_PROPS_XML },
    { name: 'ppt/viewProps.xml', data: VIEW_PROPS_XML },
    { name: 'ppt/tableStyles.xml', data: TABLE_STYLES_XML },
    { name: 'docProps/core.xml', data: CORE_XML },
    { name: 'docProps/app.xml', data: APP_XML.replace('<Slides>1</Slides>', `<Slides>${slides.length}</Slides>`) },
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
    ...slideParts,
    ...mediaParts,
    ...fontFiles.map((file) => ({ name: file.name, data: file.data })),
  ];
}

/** A deck of slides, one per entry, in order. Pure, same as `buildPptxSlide`. */
export function buildPptxDeck(slides: readonly PptxSlide[], options: { readonly fonts?: readonly FetchedFontFamily[] } = {}): Uint8Array {
  return zipStore(pptxDeckParts(slides, options));
}
