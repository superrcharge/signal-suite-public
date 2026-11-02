// Holds every responsive diagram to a readable text size where it is read.
//
// The four diagrams are embedded at width="100%" in a GitHub README, whose
// column is 838px, so a diagram W units wide is drawn at 838/W of its size.
// They used to be laid out four columns wide with 9pt labels, about 1,600
// units across, which put their text at 4.5px to 6.3px on the page: present,
// correct, and unreadable. Nothing checked it, because every other diagram
// check asks whether the picture is true, not whether it can be read.
//
// Two facts make the question mechanical:
//   - every text size in a diagram comes from design/tokens.typ, so the
//     smallest one is known without reading the SVG (Typst bakes glyph size
//     into path geometry, so the SVG cannot answer it), and
//   - the rendered width is the SVG's viewBox.
// The first is only true while no diagram sets a literal size, which is why
// literalSizes() is part of the check rather than a convention.
//
// Pure functions only; check-docs.mjs reads the files.

export const README_COLUMN_PX = 838
export const MIN_TEXT_PX = 11

const lf = (s) => s.replace(/\r\n/g, '\n')

/**
 * The smallest text size design/tokens.typ declares, in pt: every size-* key
 * and label-size.
 * @param {string} tokensTyp
 * @returns {number}
 */
export function smallestTokenSize(tokensTyp) {
  const sizes = [...lf(tokensTyp).matchAll(/^\s*(?:size-[a-z-]+|label-size)\s*:\s*([\d.]+)pt/gm)].map((m) => Number(m[1]))
  if (sizes.length === 0) throw new Error('no size-* or label-size tokens found in design/tokens.typ')
  return Math.min(...sizes)
}

/**
 * The viewBox width of an SVG, or null when there is none.
 * @param {string} svg
 * @returns {number | null}
 */
export function viewBoxWidth(svg) {
  const m = svg.match(/<svg\b[^>]*\bviewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+[\d.]+\s*"/)
  return m ? Number(m[1]) : null
}

/**
 * Text size literals in a diagram source (`size: 9pt`), which would bypass the
 * tokens and make smallestTokenSize() a guess. Comment lines are ignored.
 * @param {string} typ
 * @returns {{ line: number, text: string }[]}
 */
export function literalSizes(typ) {
  const out = []
  lf(typ).split('\n').forEach((text, i) => {
    if (/^\s*\/\//.test(text)) return
    if (/\bsize\s*:\s*[\d.]+\s*(?:pt|em|px)\b/.test(text)) out.push({ line: i + 1, text: text.trim() })
  })
  return out
}

/**
 * The smallest text's on-page size in px.
 * @param {number} minPt smallest token size
 * @param {number} width viewBox width
 * @returns {number}
 */
export const renderedPx = (minPt, width) => (minPt * README_COLUMN_PX) / width

/**
 * The widest a responsive diagram can be and still clear the floor.
 * @param {number} minPt
 * @returns {number}
 */
export const maxWidth = (minPt) => (minPt * README_COLUMN_PX) / MIN_TEXT_PX
