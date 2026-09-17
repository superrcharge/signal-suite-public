# Project Context

**Asset Tracker** - full-stack terminal and equipment tracking for field units. Manages sections, terminals, kit assignments, ownership, and operational status. Includes an Equipment Catalog for browsing and editing SATCOM/radio terminal data sheets.

## Tech stack

- **Frontend:** React 19 + TypeScript (strict) + MUI v9 + TanStack Query + React Router v8 + Vite 8. Tests: Vitest + React Testing Library.
- **Backend:** Go 1.26.8 + Fiber v3 + PostgreSQL 16 + pgx/v5 + go-playground/validator/v10. Migrations: Goose. The Go version is the `go.mod` directive, which is also CI's toolchain pin - `scripts/preflight-versions.mjs` is what keeps it, the golangci-lint pin and the container base image from disagreeing.
- **Auth:** Azure Entra ID native OIDC (in-process JWT validation in the Go backend; MSAL.js in the SPA); app-local RBAC (admin/editor/rto/planner/viewer) stored in DB.
- **Infrastructure:** Docker Compose for dev (`compose.yaml` + `compose.dev.yaml`) and for running it (`compose.selfhost.yaml`, one production container + Postgres, see `docs/self-hosting.md`). CI via GitHub Actions; `release.yml` would push the image to GHCR on a tag, but this copy cuts no releases; run it from source with `compose.selfhost.yaml`. Postgres auth is a password by default, or a managed identity's Entra token on Azure.

## Load-on-demand context (by task)

Don't read everything every session. Pull the focused files relevant to the task:

| Working on… | Read |
|---|---|
| Terminals (CRUD, page UI, inline edit, drawer, CSV import/export) | `context/domains/terminal.md` |
| Kits (CRUD, type/network booleans, page UI, inline edit, drawer, CSV) | `context/domains/kit.md` |
| Sections (management, reassign-on-delete, sidebar dialog) | `context/domains/section.md` |
| Contracts (POP dates, vendor, FY, inline edit, drawer, sorting) | `context/domains/contract.md` |
| Users (Users page, display) | `context/domains/user.md` + `context/authz.md` |
| Audit log | `context/domains/audit.md` |
| Equipment Catalog (browse, facet filter, datasheet, compare, print, 3-pane editor, photo upload, Comms Library) | `context/domains/equipment.md` |
| Global Waveform Library (waveform CRUD, toggle chips in editor) | `context/domains/waveform.md` |
| Global Services Library (SATCOM service CRUD, toggle chips, CIR/MIR rows) | `context/domains/service.md` |
| Transport Library (fibre/cellular/MANET/HF CRUD, kinds, Comms Library pane) | `context/domains/transport.md` |
| Platform Library + joint compatibility matrix (platform CRUD, open category/kind, `/catalog/compatibility`, print) | `context/domains/platform.md` |
| Nets Library (net CRUD, JEM/MPU5 tabs, TX/RX, radio type) | `context/domains/net.md` |
| PACE Planner (comms card, channel wheels, card editor, print sheet) | `context/domains/pace.md` |
| Help / FAQ content, the "I need help!" dialog, the role chip | `context/help.md` |
| RBAC / auth middleware / role changes / self-registration | `context/authz.md` |
| Settings page | `context/settings-page.md` |
| Adding a page, or any page chrome: banner, title, stat strip, table, document actions | `context/patterns/frontend-page.md` |
| Directory tree / file layout | `context/structure.md` |
| Backend patterns (service shape, errors, validation, tests) | `context/patterns/*.md` |

## Cross-cutting architecture decisions

These apply everywhere and stay in this file because they affect every domain.

### Backend

- **Manual DI in `main.go`** - no DI framework
- **Domain ownership** - each domain owns its errors, validation, DTOs
- **No cross-domain imports** - use `shared/contracts/` interfaces. Current contracts: `SectionLister`, `TerminalSectionReassigner`, `KitSectionReassigner`, `NetSectionCounter`, `PaceSectionChecker`, `AuditRecorder`, `NetLookup`, `NetUsage`, `WaveformAssets`, `WaveformLookup`, `ServiceAssets`. Setter injection (`SetReassigner`, `SetKitReassigner`, `SetNetCounter`, `SetPaceChecker`, `SetAudit`, `SetNetLookup`, `SetNetUsage`, `AddWaveformAssets`, `SetWaveformLookup`, `SetServiceAssets`) avoids circular constructor ordering. `NetLookup`/`NetUsage` are the first **mutually** injected pair - `radionet` and `pace` each implement one and consume the other, closing both directions of the nets↔wheel reference. Section delete reassigns terminals and kits, and refuses first while the squadron has nets or PACE card data (`NetSectionCounter`, `PaceSectionChecker`).
- **Service signature:** `func (s *Service) Method(ctx context.Context, req *dto.Request, resp *dto.Response) (int, error)`
- **pgx over GORM** - direct SQL control
- **CSV via encoding/csv** - no third-party CSV dependency
- **CSV is declared once per domain** - a `csvtable.Table` in `<domain>/csv.go`; export, template and import all read it, and a column with no `Set` is server-owned. `backend/internal/csvregistry` generates the frontend's column manifest, so the picker cannot describe a different set from the exporter
- **CSV coverage is declared, not inferred** - `backend/internal/domain/csv-manifest.json` records export/import/template state per domain, and `verify.mjs` fails on a domain absent from it or whose declaration disagrees with its routes. See the fourth trap in AGENTS.md
- **`updated_by` / `ActorID` via DTO enrichment** - auth-context data set on the request DTO by the handler using `json:"-"` fields before calling the service. Service signature stays `(ctx, req, resp) (int, error)` - no 4th parameter. Pattern for any domain needing auth-context data.
- **Access log format** - Fiber logger includes `${queryParams}` so filter/pagination calls are visible in logs.

### Frontend

- **Server state → React Query** - never in local state
- **URL state for shareables** - filters, pagination, tabs, drawer open/close use `searchParams` (e.g. `?section=asqd`, `?search=mini`, `?drawer=add&focus=notes`)
- **Context only when needed** - >3 levels of prop drilling or 3+ siblings
- **Code splitting** - lazy-load route pages
- **Test behavior not implementation** - accessible queries
- **Sidebar has six top-level collapsible groups** - Terminals, Kits, By Section:, Equipment Catalog, PACE Planning, and Contracts - for admin and editor. Contracts is internal and sits behind `canSeeContracts`, so `rto` and `viewer` see five groups without it; `planner` sees only Equipment Catalog and PACE Planning (`isPlanner`). Both flags are nav shaping rather than authorization; the reads stay open. PACE Planning holds two `familyNavLabel` subsections that are **siblings, not nested** - Nets Library (`/nets`) and JEM/MPU5 Wheels (`/pace`) - so neither reads as a sub-feature of the other; each expands to one navItem per card-bearing squadron (`sections.pace_enabled`, migration 036), and the subsection header itself navigates to the picker. See `context/domains/pace.md`. The Kits group uses **static** Remote/IFK/ATK links (`/kits?type=<value>`) with no data hook (adds no `@/services` mock dependency), plus "All Kits". Every group header is the `groupLabel` helper drawn as a **full-bleed banner**: one bottom rule in `divider` (the rule that appears above a banner is the previous group's body border), padding `13px 44px 10px 22px` (the right padding reserves the chevron's column so a long title stops short of it), `mb: 6px` while expanded and none while collapsed so collapsed groups stack, title Roboto 700 / 15px / `.1em` uppercase in `text.primary`, a 24px chevron absolutely placed at `right: 12, top: 6` that points **down while open** and up while closed. With only a bottom rule the first banner sits flush under the header with no special case; the banner and body rules replaced the standalone `Divider` rows that used to sit above each group. The drawer scroll box has no horizontal padding, and the 64px brand block that used to offset it under the fixed AppBar is now a bare spacer reading `theme.custom.headerHeight` - the product identity is the Signal Suite lockup in the header. Under Terminals: `allItem` "All Terminals" (no dot, uppercase, amber when active), then nested Starshield, Paradigm and OneWeb collapsibles (`familyLabel` helper, pr:1.5), each with leaf navItems in a `pl: '54px'` box. Under By Section: `allItem` "All Sections" then section navItems in a `pl: '54px'` box. Under Equipment Catalog: "All Equipment", "Compare", a canWriteRadio-only "Editor" item, an **ungated** "Comms Library" item (every pane on that route gates its own write controls, so a viewer browses the four reference tables and sees no editing affordances), and "Compatibility". Under Contracts: `allItem` "All Contracts" then FY navItems in a `pl: '54px'` box. Model leaf items navigate to `?model=<value>`; `activeModels` syncs from URL via `useEffect` on searchParams change (not just on mount). Section items set `?sections=<key>`. Rows are flat (`borderRadius: 0`) with `py: '5px'`, `mb: 0.25`. Top-level rows (`allItem`, `familyLabel`, `familyNavLabel`, the catalog items) carry `pl: '34px'`; `navItem` has `px: '14px'` inside its 54px box, a 10px pip (2px ring; section colour, else `theme.palette.primary.main`, the same source as its 3px active bar) and `minWidth: 20` on ListItemIcon.
- **Header owns page navigation** - page-picker dropdown in the AppBar, with the CSV controls immediately to its right and the Add cluster right-anchored. The Toolbar sets its own gutters (`disableGutters`, 20px left inset, 36px right so the lockup ends on the catalog cards' edge, 14px gap; the right cluster's gap is `HEADER_CLUSTER_GAP`, 10px, and every visible gap in it measures that because icon-only buttons cancel their own padding with `HEADER_ICON_BUTTON_SX` / `HEADER_SMALL_ICON_BUTTON_SX` and a rule carries no margin). Up to four 1px x 24px rules (`HeaderRule`, local to `header.tsx`, `rgba(255,255,255,0.15)`) stand beside the sidebar toggle, after the page picker, after the `+` (gated with the `+` itself, so a viewer sees three), and before the **Signal Suite lockup** (`components/common/signal-suite-mark.tsx`, 114 x 27, static, on every route and for every auth state) that closes the bar on the right; no rule carries a margin; the avatar's small IconButton cancels its own 5px padding with `HEADER_SMALL_ICON_BUTTON_SX`, which is what makes the avatar circle (`HEADER_CONTROL_H`) and the wordmark read as evenly spaced. The list pages' search fields share `components/common/search-field-sx.ts`. The rules are 24px rather than `HEADER_CONTROL_H` so they match the lockup's optical height.
- **Amber is `primary`, blue is `info`** (`theme/theme.ts`, dark branch: `#F5A21F` / `#FFB935` / `#C7821A`, contrastText `#0A0A0A`; `background.default` `#111721`). The amber scale is published as `--shf-amber*` from `theme/global-styles.tsx`, read off the palette, so the shell and the `/catalog` routes share one accent; `catalog-tokens.css` keeps the fonts, print rules and graphite ramp. The outlined header controls stay white by `HEADER_CONTROL_SX`, deliberately - they do not follow `primary`.
- **Export / Template / Import live in the header, on every route** (`components/common/csv/csv-header-controls.tsx`). One icon button opening a menu of the three, identical everywhere: the dataset is chosen inside the dialog, not implied by the page. That is what makes every dataset reachable from wherever you are, rather than only from the page about it. (The four libraries do now have a page - `/catalog/comms-library` - but the header control predates it and is still what makes a dataset reachable from anywhere.) The route contributes a pre-tick and a squadron and nothing else (`route-dataset.ts`, pure). Export and Template are both ungated, because both are reads - the backend serves import templates to anyone, which `TestImportTemplatesAreReachableWithoutAuth` asserts, so gating the button contradicted the server and left a viewer no way to see which columns an import file needs. Import alone sits behind `canWrite || canWriteRadio || canWritePace`, because a viewer would otherwise get a control whose every destination 403s. **The controls call no `@/services` hook** - the dialogs mount only on click - and `header.test.tsx` fails if that changes, because many test files mock `@/services` with a closed object, and those rendering `MainLayout` reach the header through it. `checkServiceMocks` in `scripts/verify.mjs` is the authority on which ones, not a count written here.
- **Scroll container** - `MainLayout`'s main content Box has `height: calc(100vh - 64px); overflow: auto` so sticky elements inside pages use `top: 0` relative to the content area, not the viewport. The terminals stat strip is sticky at `top: 0` inside this container.
- **Inline edit pattern** - Enter/blur to save, Escape to cancel, `readOnly` prop for viewers

## Conventions

- **Files:** kebab-case (`user-profile.tsx`)
- **Components:** PascalCase (`UserProfile`)
- **Functions:** camelCase
- **Constants:** SCREAMING_SNAKE_CASE
- **DB tables:** snake_case
- **Branches:** `type/description` (e.g., `feature/terminal-filter`)
- **Commits:** Conventional Commits

## Environment variables

| Variable | Description | Required |
|---|---|---|
| `SERVER_PORT` | Backend HTTP port (default: 3001) | No |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` | PostgreSQL connection | Yes |
| `DB_SSLMODE` | SSL mode (default: disable). An unencrypted value is refused at startup unless `ALLOW_INSECURE_DB=true` | No |
| `ALLOW_INSECURE_DB` | Permits an unencrypted `DB_SSLMODE`. Dev and CI only - a deployed environment sets `DB_SSLMODE=require` instead | No (default: false) |
| `DB_AUTH_MODE` | `password` (compose, self-hosted) or `managed_identity` (Azure) | No (default: `password`) |
| `DB_PASSWORD` | Required when `DB_AUTH_MODE=password`; no default, and an empty one fails startup | Dev only |
| `DB_TOKEN_SCOPE` | Entra token audience for Postgres (`https://ossrdbms-aad.database.windows.net/.default`) - used when `DB_AUTH_MODE=managed_identity` | No |
| `AZURE_CLIENT_ID` | Managed identity client ID - steers `azidentity.DefaultAzureCredential` at the right identity inside the container | Azure only (managed_identity mode) |
| `AZURE_STORAGE_URL` | Full blob service URL for equipment photo upload (e.g. `https://<account>.blob.core.windows.net`). Empty string disables the feature (returns 501), which is the self-hosted default. | Only when photo upload is wanted |
| `AZURE_STORAGE_CONTAINER` | Blob container name for equipment photos (default: `equipment-photos`) | No |
| `FRONTEND_MODE` | `proxy` (dev) or `static` (prod) | No |
| `FRONTEND_PROXY_URL` | Vite dev server URL | Dev only |
| `AUTH_ENABLED` | Enable auth enforcement (default: true) | No |
| `AUTH_TENANT_ID` | Entra tenant ID owning the app registration | When `AUTH_ENABLED=true` |
| `AUTH_CLIENT_ID` | The combined app reg's client ID - used as both backend audience (the bare client ID - Entra v2 tokens carry no `api://` prefix, see `auth/config.go`) and SPA login client. Single value. | Yes (prod) |
| `AUTH_AUTHORITY_HOST` | `login.microsoftonline.com` (commercial) or `login.microsoftonline.us` (Azure Government) | When `AUTH_ENABLED=true` |

## External dependencies

| Service | Purpose |
|---|---|
| Azure Entra ID (optional) | OIDC identity provider when `AUTH_ENABLED=true` - one combined app registration (Web + SPA platforms; backend audience and SPA client share a single client ID). Backend validates JWTs via JWKS; SPA acquires tokens via MSAL.js. |
| Azure managed identity (optional) | On Azure, the container's identity can authenticate to Postgres (`DB_AUTH_MODE=managed_identity`) and to Blob Storage. Honored by the Go backend via `AZURE_CLIENT_ID`. Not used off Azure. |
| Azure Blob Storage (optional) | Equipment photo storage. The identity the container runs as needs `Storage Blob Data Contributor` on the account. Configured via `AZURE_STORAGE_URL` + `AZURE_STORAGE_CONTAINER`; unset means photo upload answers 501. |
| PostgreSQL 16 | Primary database. A `postgres:16` container in every compose stack; any PostgreSQL 16 server works. The OIDC subject column is `users.oidc_subject`. |

## Known constraints

- Pattern files under `context/patterns/` referenced by agents for security/observability/frontend are Phase 2 upstream template work - agents should proceed without them and flag gaps
- `.claude/workflows/` holds `catalog-lookup.js`, the equipment spec-research workflow driven by the `catalog-lookup` skill. There is no handoff protocol there; handoffs go through `/handoff` and `.claude/context/handoff.md` (a gitignored file `/handoff` writes)
