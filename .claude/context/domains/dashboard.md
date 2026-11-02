# Dashboard and Stats

Two pages, both open to every signed-in role, both reading the app rather than owning data: there is no backend domain, no migration and no CSV dataset behind either.
The Dashboard is the front door, a grid of tiles that go to the other pages.
Stats is the counts overview, the page the Dashboard used to be.

## Dashboard

- **Route and file:** `/dashboard`, `pages/dashboard-page.tsx` (`DashboardPage`), lazy-loaded in `routes/router.tsx` behind `ProtectedRoute`.
- **Home for every role.** `homePathFor` and `fallbackPathFor` in `routes/home-path.ts` both return `/dashboard`, so the `/` redirect and the not-found button land here. The planner role used to be the exception and bounced into pages it has no nav entry for.
- **Tiles come from `NAV_ITEMS`**, the same list the header page menu reads, through `visibleNavItems` in `components/layouts/nav-items.tsx`, with the Dashboard's own entry filtered out. The page takes `isAdmin`, `canSeeContracts`, `canSeeTrackers` and `isPlanner` from `useAuth()`, so the tiles and the menu cannot disagree about what a viewer is offered. Each tile is a router link with the menu's icon over the page label.
- **Layout:** `TILE_GRID_SX` in `components/common/surface-sx.ts`, `repeat(auto-fill, 176px)` with `gap: 3`, shared with the Operations picker so the two grids keep one tile size.
- **Who sees what**, as `dashboard-page.test.tsx` pins it: an admin sees every page but the Dashboard (Stats, Terminals, Kits, Catalog, PACE, Operations, Contracts, Users, Settings); an editor adds Contracts and loses Users; a planner sees Stats, Catalog, PACE, Operations and Settings.
- **`canSeeTrackers`** (`admin || editor`, in `contexts/auth-context.tsx`) is the gate on the Terminals and Kits entries. It hides them from the Dashboard tiles, the header menu and the sidebar's Terminals and Kits groups; it is a decluttered view, not a boundary, because the reads stay open to every role. See `terminal.md` and `kit.md`.
- **An item with no tile is a change to `NAV_ITEMS`**, not to this page. A new page gets its tile by being added there.

## Stats

- **Route and file:** `/stats`, `pages/stats-page.tsx` (`StatsPage`). Its `h1` is visually hidden (`PageTitle visuallyHidden`), since the header's page menu names the page.
- **Data:** `useTerminals`, `useKits`, `useSections`, `useEquipment` and `useWaveforms`, aggregated client-side, plus `useContracts({ limit: 1 }, canSeeContracts)`, which is skipped for a role that does not see contracts.
- **Blocks:** Terminals by Status and by Type, Kits by Status and by Type, Terminals by Section and Kits by Section, Contracts (role-gated) and Catalog. The Contracts tiles are Total, Expiring (30 days), Caution (60) and Watch (90), read from the `expiring_30`, `expiring_60` and `expiring_90` counts.
- **Tiles are deep links.** Terminal family tiles go to `/terminals?model=`, kit tiles to `/kits?status=` and `/kits?type=`, and the Catalog tiles to `/catalog?type=satcom`, `/catalog?type=radio` and `/catalog/comms-library` (`stats-page.tsx` L139 and L217-218 for the kit and catalog ones).
- **The page is not gated on `canSeeTrackers`.** Every role can open it and sees the terminal and kit counts, the same as the reads those pages make.

### Layout and kit strips

The `/stats` page (`stats-page.tsx`), the counts overview. The tile home page is the separate `/dashboard` (`dashboard-page.tsx`), one tile per page-menu entry the role can see.

`useKits({ limit: 1000 })` client-side aggregation. Three blocks.

**Layout primitives** (shared with Terminals and Contracts, all in `stats-page.tsx`):

- `BlockLabel` - heading that sits **above** its bordered block, never inside. Every heading on the page uses it (13px / 800 / `text.primary`).
- `StatPanel` - the bordered box holding one row of tiles. No rules inside it.
- `StripRow` - grid of `repeat(columns, minmax(0, 1fr))`, `columns` defaulting to `PANEL_COLUMNS` (5). Every row in a domain uses the **same column count**, so a 5-tile status row and a 4-tile type row share column widths and align; the shorter row just leaves trailing columns empty. Do not switch this to one column per tile - that misaligns the rows, which is what it exists to prevent.

Terminals and Kits sit **side by side** (`flex`, `gap: 3`, stacking on mobile) for status and type, matching the by-section row beneath them: terminals left, kits right, same column x.

Tiles whose `sub` is an **array** render it as a list to the right of the count, top-aligned with the label; a string `sub` renders beneath the count. Kit type tiles pass a single-element array for exactly this reason. `Total` tiles carry no subtext.

`SectionRow` reserves `minWidth: '2ch'` with `tabular-nums` on its count so the following hyphen lands at the same x on every row regardless of 1- vs 2-digit totals.

- **Kits by Status** strip - Available / ALERT / On Mission / Reserved / INOP, same colors and subtext as the `/kits` page strip so the two agree. ALERT rolls up `alert` + `alert-blue` + `alert-green`. No Total tile (it heads the type strip, matching Terminals). Tiles link to `/kits?status=<key>` (the page hydrates `?status=` on mount).
- **Kits by Type** strip - Total / Remote / IFK / ATK, structurally identical to Terminals by Type. Subtext on each type is that type's available count. Tiles link to `/kits?type=<value>`.
- **Kits by Section** sits beside "Terminals by Section" in a `flex` row separated by `gap: 3` only - no vertical divider (each panel has its own border and heading). Stacks on mobile.

Stats tests scope `getByText` to a strip via `getByText('<heading>').nextElementSibling` - the terminal and kit strips share several bucket subtexts, so unscoped queries collide. Both reuse the generalized `SectionRow` component (now takes `items` / `itemOrder` / `itemLabels` props instead of hard-coded terminal models) - kits pass `remote/ifk/atk`, terminals pass model families.
