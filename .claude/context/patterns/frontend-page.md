# Pattern: adding a page

The first frontend file in this directory. Everything else here is backend, which is
how the app ended up with three page frameworks and no written recipe for a fourth
page: there was nothing to read, so each new page copied whichever one it landed
next to.

`node scripts/check-ui-tokens.mjs` enforces the parts of this that are mechanical.
It runs inside `verify.mjs` as `ui tokens` and as its own CI preflight step. The
rest is here because it is judgement, not because it is optional.

## The two systems, and the line between them

There are two styling systems in this app and a page belongs to exactly one:

| | Shell | Sheet |
|---|---|---|
| Pages | dashboard, terminals, kits, contracts, users, audit, settings | catalog, comms library, compatibility, compare, nets, PACE |
| Styled with | MUI `sx` and `theme.palette` | inline `style` and `var(--shf-*)` |
| Surfaces | `background.paper` on `background.default` | the graphite ramp |
| Tokens | `components/common/surface-sx.ts` | `components/common/banner-controls.ts` |
| Why | it is a database front end | it is a document, and it is rasterized for export |

The split is deliberate and is not being collapsed. What is not allowed is a page
that mixes them, because the two disagree on ground truth: MUI's dark surface is
`#161b22` and the graphite ramp's is `#1C1F22`, so a shell panel inside a sheet
reads as a mistake.

A page that prints, or exports to `.png` / `.pptx`, is a sheet page. Everything
else is a shell page.

## The chrome every page has

```tsx
<MainLayout>
  <PageBanner variant="plain">          {/* or the default "rail" on a sheet page */}
    <PageTitle>
      Contracts
      <PageSubtitle>what this page is for.</PageSubtitle>   {/* optional */}
    </PageTitle>
    {/* stat strip, toolbar, filters */}
  </PageBanner>
  {/* content */}
</MainLayout>
```

- **`PageBanner` is never an `sx` snippet.** `MainLayout` pads every page by
  `CONTENT_GUTTER`, and a bar that meets the sidebar has to cancel that with a
  negative margin. The snippet had been copy-pasted into three pages while four
  went without, which is how half the app had flush bars and half did not.
  `variant="rail"` is the amber-underlined bar on a sheet page; `variant="plain"`
  is the page-coloured strip a list toolbar sits in, and it stays a block
  container because it stacks a stat row above a toolbar.
- **`PageTitle` is mandatory and is the page's `h1`.** Four routes shipped with
  no heading at all. If the page already has an `h1` in its content - the sheet's
  record name - pass `component="div"`.
- **A list page renders it `visuallyHidden`.** Terminals, Kits and Contracts pass
  `<PageTitle visuallyHidden>`: the header's page picker is already showing the
  route's name two inches above, so a visible copy is the same word twice and costs
  a line on the pages with the most to fit. The heading still exists, because it is
  the only `h1` a screen reader can jump to - and because that keeps "every page has
  a title" a rule the check can enforce, rather than one carrying three carve-outs
  whose stated reason would justify deleting every title in the app. Everything else
  - the admin pages, the sheet pages, the landing pages - renders it.
- **`PageSubtitle` is the sentence after the title, on the same line.** 15px, not
  the title's 18: at 18 these wrapped to a second line at 1280px, which is the
  smallest screen this app is used on.
- **`RailTitle` replaces `PageTitle` when the page has a left rail**, so the bar's
  vertical rule falls exactly where the rail's own border runs beneath it.

## Numbers a page may not restate

Import them. Every one of these was a literal in several files before it was a
token, and every one of them had drifted.

| Constant | From | Is |
|---|---|---|
| `CONTENT_GUTTER` | `components/layouts/main-layout` | the page's padding, 3.5 (28px) |
| `CONTENT_LINE` | `components/common` | 28px, the line every page's content starts on |
| `HEADER_HEIGHT` | `components/layouts/main-layout` | 64px, what a `100vh` box subtracts |
| `SURFACE_RADIUS` / `PANEL_SX` | `components/common` | the shell's bordered panel |
| `TABLE_HEAD_SX` / `TIGHT_CELL_SX` / `ROW_HOVER_SX` | `components/common` | a shell table's cells |
| `TOGGLE_SX` | `components/common` | a toolbar's `ToggleButtonGroup` |
| `SEARCH_FIELD_SX` | `components/common` | a toolbar's search field |
| `RAIL_BANNER_PX/PY/H`, `BANNER_BTN_*` | `components/common` | a sheet page's bar and its 30px controls |
| `CATALOG_RAIL_W` | `components/catalog` | 240px, the catalog rail |

**A sheet names its own fonts and never inherits the shell's.** `rasterize.ts` captures a
sheet into a standalone clone that cannot reach the page's loaded fonts, so it inlines only
the faces in `SHEET_FONT_FACES`. Anything that merely inherits `theme.typography.fontFamily`
is outside that list and exports in a substituted font, with nothing to say so - it was 52
elements on the data sheet before `[data-sheet-root]` named `var(--font-body)` itself. Adding
a family to the shell needs no export work; putting one *on a sheet* means adding its face to
`SHEET_FONT_FACES` and a `.ttf` to `public/fonts/`, because the `.pptx` embeds an sfnt.

Colours come from `theme.palette` in an `sx` and from `var(--shf-*)` in a style.
The amber is `palette.primary.main`, published as `--shf-amber` by
`theme/global-styles.tsx`, and writing `#F5A21F` is a check failure outside the
export-side files listed in `check-ui-tokens.mjs`.

## The four states

A page that loads data has all four, and `check-ui-tokens.mjs` does not check
this one - it is the reviewer's job:

| State | Use |
|---|---|
| loading | `LoadingSpinner` |
| empty | `EmptyState` |
| error | an `Alert severity="error"`, not only a toast - a toast is gone in six seconds and the page still shows nothing |
| loaded | the content |

## Document actions are a sheet-page affordance

`DocumentActions` (share → **Print / Save PDF**) belongs on a page that *is* a
document: the data sheet, the compare matrix, the compatibility matrix, the comms
library, a nets list, a PACE card. It goes last in the banner, with its right edge
on `CONTENT_LINE`.

**A list page does not get one.** Terminals, kits, contracts, users and the audit
log export through the CSV control in the header, which is on every route, and
their datasets are chosen inside that dialog rather than implied by the page. The
two are not inconsistent with each other: CSV export is *dataset* scoped, so it
has to be reachable from anywhere; a sheet export is *document* scoped and exports
the page on screen, so in the header it would sit permanently disabled on every
route without a sheet.

## A table

- `size="small"`, always.
- `TableContainer component={Paper} elevation={0} sx={PANEL_SX}`.
- `TABLE_HEAD_SX` on the header cells (amber, from the palette), `TIGHT_CELL_SX` on a
  cell that should take only its content's width, `ROW_HOVER_SX` on a row.
- `ListPagination` under the table, never a hand-rolled prev/next.
- **Decide what happens when the columns do not fit at 1280x720.** Two answers, and
  a third that is a bug:
  - `tableLayout: 'fixed'` with column widths and ellipsis, when the values
    tolerate truncation. Contracts.
  - `tableLayout: 'auto'` inside a container with `overflow: 'auto'`, when they do
    not - a serial or a name an operator reads off a physical label. Terminals, kits.
  - `overflow: 'hidden'` on a container narrower than its table, which is what
    terminals and kits used to do. It clips the last columns with no scrollbar, so
    there is no way to reach them and nothing says so.
- **Before reaching for either, take the padding back.** MUI's default cell padding is
  16px a side, so an eleven-column table spends 352px on gutters - more than Terminals
  was overflowing by. `'& th, & td': { px: 1 }`, with `px: 0.5` on short fixed-format
  columns whose header is wider than anything under them, is most of a fit for free.
  Contracts and Terminals both do this.
- **Use `nth-child`, never `nth-of-type`, for a per-column rule.** If any body cell is a
  `th` - and a row-header name cell should be - then `td:nth-of-type(n)` counts from the
  *second* cell of the row while `th:nth-of-type(n)` counts from the first of the head,
  so every rule lands one column off and the data stops lining up with its title. It
  looks like a rendering bug and it is a selector bug.
- **A sticky header needs a bounded scrollport.** `stickyHeader` sticks within the
  nearest scrolling ancestor, and a `TableContainer` with `overflow: auto` already is
  one - CSS forces both axes once either is non-visible. Unbounded it never scrolls
  vertically, so the header never moves and the page scrolls instead. Give the page a
  `height: calc(100vh - HEADER_HEIGHT)` flex column, bound the container with `flex: 1`,
  and put `ListPagination` outside it. Terminals, Kits and Contracts do this.
- **Truncate the half that is worth losing.** Text-overflow cuts the tail, so a cell
  holding `name · timestamp` loses the timestamp - usually the part being read. Split it
  into two spans and let the first shrink, as Terminals' Updated column does.

## When you add a page, also

- Add the route to `routes/router.tsx` as a lazy import, inside `SuspenseWrapper`
  and `ProtectedRoute`.
- Add it to the header's page picker in `components/layouts/header.tsx` if it is a
  top-level destination, and to the sidebar if it belongs to a group.
- If it is a new domain, everything in the AGENTS.md "When adding a domain" list:
  the README Features section, `structure.md`, a `context/domains/<domain>.md`, a
  `csv-manifest.json` entry, and a row in **both** load-on-demand tables.
