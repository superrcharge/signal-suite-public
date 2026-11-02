// ==============================================================
// Design tokens - pure values, no colour.
//
// Palette lives in theme.typ for dual-theme swap. Tokens here are
// values diagrams reference for typography, whitespace, stroke
// thickness, and geometry. Edge weight + dash patterns are picked
// at the point of use; the catalog (marks.typ, edges.typ) shows
// what works.
//
// Single universal font via CaskaydiaMono NFP (proportional Nerd Font):
//   - reads cleanly for prose-style labels
//   - carries mono identity for code-style content (raw())
//   - provides Nerd Font icon glyphs for symbology
// Hierarchy is expressed through weight + size, never font family.
//
// Sizes are set for the screen these are read on, not for print. Every
// diagram is embedded at width="100%" in a GitHub README, whose column is
// 838px, so a diagram W units wide is drawn at 838/W of its size. The rule,
// held by scripts/check-docs.mjs: the smallest size below must land at 11px
// or more there, which means no responsive diagram wider than about
// 838 * size-label / 11 units. At 9pt labels and 1,600 units wide they
// rendered at 4.6px, which is what "unreadable" measured as.
// ==============================================================

#let tokens = (
  // ---- whitespace ----
  pad-inside-shape:       10pt,
  pad-inside-container:   20pt,
  space-between-shapes:   28pt,
  space-between-ranks:    36pt,
  gap-structured-text:    5pt,
  gap-cell:               14pt,

  // ---- typography (single family; hierarchy via weight + size) ----
  font:           "CaskaydiaMono NFP",
  size-label:     11pt,
  size-caption:   11pt,
  size-body:      12pt,
  size-title:     13.5pt,
  size-heading:   15pt,
  weight-light:   "light",
  weight-body:    "regular",
  weight-bold:    "semibold",

  // ---- stroke widths (point-of-use selects from these) ----
  stroke-thin:      0.8pt,    // container borders, subtle dividers
  stroke-default:   1.2pt,    // entity outlines
  stroke-emphasis:  2pt,      // headline entities, thick edges

  // ---- shape geometry ----
  radius-shape:     6pt,
  radius-container: 10pt,

  // ---- edge labels ----
  label-sep:        10pt,     // edge label offset from line (was 6pt - too tight)
  label-size:       11pt,
)
