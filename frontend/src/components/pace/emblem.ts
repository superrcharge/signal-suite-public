/**
 * Emblem helpers, kept out of SheetPreview.tsx because react-refresh requires a
 * module to export only components. Same reason components/shf-form/styles.ts
 * is its own file.
 *
 * Both the printed sheet and the card editor's live preview draw the emblem, so
 * the placeholder lives in one place: a squadron with none must look identical
 * in both, or the editor stops being a preview of the sheet.
 */

// The label is a DB value being spliced into markup, so it is escaped rather
// than trusted. Today it is consumed through <image href>, where browsers
// disable scripting -- but that is one element swap away from being an XSS, and
// the escape costs nothing.
export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// The fallback for a squadron that has uploaded no emblem yet. Draws the
// squadron's own label so a placeholder on B SQD's card does not read "A SQD",
// and says SAMPLE on its face so it is never mistaken for a real patch.
export function placeholderEmblem(label: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
       <circle cx="100" cy="100" r="98" fill="#141618"/>
       <circle cx="100" cy="100" r="78" fill="none" stroke="#F5A21F" stroke-width="3" opacity="0.8"/>
       <text x="100" y="94" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="700" fill="#F5A21F">${escapeXmlText(label)}</text>
       <text x="100" y="126" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#F5A21F" opacity="0.7">SAMPLE EMBLEM</text>
     </svg>`,
  )}`;
}
