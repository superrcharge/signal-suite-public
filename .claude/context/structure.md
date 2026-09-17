# Project structure

## Backend

```
backend/
├── main.go                          # DI wiring, server bootstrap
├── config/
│   └── config.go                    # Environment configuration
├── migrations/                      # Goose SQL migrations + migrate.go runner
├── internal/
│   ├── auth/                        # Auth primitives (Config, User, errors)
│   │                                    package consumed by
│   │                                  middleware/auth.go and any code that
│   │                                  needs the JWT-derived identity
│   ├── csvbulk/                     # POST /api/v1/export/bundle and
│   │                                  /api/v1/template/bundle - the multi-dataset
│   │                                  zip paths. Route-level RequireAuth, not a
│   │                                  group, so fiber's prefix matching does not
│   │                                  apply to them
│   ├── csvregistry/                 # Renders frontend/src/generated/csv-columns.ts
│   │                                  from every domain's csvTable. A Go test
│   │                                  fails when the committed copy is stale.
│   ├── domain/
│   │   ├── csv-manifest.json        # Declared CSV export/import/template state per
│   │   │                              domain. verify.mjs fails on one that is
│   │   │                              absent. See AGENTS.md, fourth trap.
│   │   ├── user/                    # User domain (auth sync from IdP)
│   │   ├── section/                 # Sections domain (key, label, color)
│   │   ├── terminal/                # Terminals domain (full CRUD + CSV import/export)
│   │   │   ├── model.go
│   │   │   ├── errors.go
│   │   │   ├── dto/{request,response}.go
│   │   │   ├── repository.go
│   │   │   ├── service.go
│   │   │   ├── handler.go
│   │   │   ├── routes.go
│   │   │   ├── validation.go
│   │   │   └── helpers.go
│   │   ├── kit/                     # Kits domain (parallel to terminals; type + network booleans, CSV)
│   │   ├── contract/                # Contracts domain (POP dates, vendor, FY, deadline tracking)
│   │   ├── audit/                   # Audit log
│   │   ├── equipment/               # Equipment Catalog (CSV export/import; import creates empty datasheets)
│   │   │                            #   handler.go adds UploadPhoto (POST /:id/photo) + GetPhoto (GET /:id/photo)
│   │   ├── satcomservice/           # Global Services Library (CSV export/import/template)
│   │   │                            #   package is satcomservice, not service, so SatcomService does not
│   │   │                            #   collide with the Service layer type
│   │   ├── transport/               # Transport Library (CSV export/import/template)
│   │   │                            #   no abbrev column, so the unique index is on lower(name)
│   │   ├── platform/                # Platform Library (CSV export/import/template)
│   │   │                            #   TEXT[] waveform_abbrevs + equipment_ids, ; separated in CSV
│   │   ├── radionet/                # Nets Library (per-squadron CSV export/import)
│   │   │                            #   package is radionet, not net, so it does not shadow stdlib net
│   │   │                            #   implements contracts.NetLookup; consumes contracts.NetUsage
│   │   ├── pace/                    # PACE Planner (CSV export of channel assignments only)
│   │   │                            #   repository_mock.go sits outside _test.go so it is importable
│   │   │                            #   SaveCard is the repo's only transaction (upsert + delete + insert)
│   │   │                            #   implements contracts.NetUsage; consumes contracts.NetLookup
│   │   └── waveform/                # Global Waveform Library (CSV export/import/template)
│   │       ├── model.go
│   │       ├── errors.go
│   │       ├── dto/{request,response}.go
│   │       ├── repository.go
│   │       ├── service.go
│   │       ├── handler.go
│   │       ├── routes.go
│   │       └── validation.go
│   ├── blob/                        # Azure Blob Storage wrapper (equipment photo upload/proxy)
│   │   └── blob.go                  # NewClient + UploadStream + Download + Delete + BlobNameFromURL;
│   │                                  uses DefaultAzureCredential. Delete treats an absent blob as
│   │                                  success so a partially-failed delete converges on retry
│   ├── shared/
│   │   ├── contracts/               # Cross-domain interfaces (SectionLister,
│   │   │                             TerminalSectionReassigner, KitSectionReassigner,
│   │   │                             AuditRecorder, NetLookup + NetUsage in net.go -
│   │   │                             the two halves of the nets↔pace reference;
│   │   │                             WaveformAssets + WaveformLookup, ServiceAssets;
│   │   │                             NetSectionCounter + PaceSectionChecker, which
│   │   │                             a section delete asks before moving anything)
│   │   ├── csvtable/                # csvtable.Table - the single per-domain column
│   │   │                             declaration that export, the import template
│   │   │                             and the importer all read. A column with no
│   │   │                             Set is server-owned, which is what keeps it
│   │   │                             out of the template and out of import
│   │   ├── response/                # Standard API response wrapper
│   │   └── validator/               # Base validator types
│   ├── infrastructure/database/     # PostgreSQL connection pool - branches on
│   │                                  DB_AUTH_MODE; managed_identity uses
│   │                                  pgxpool.BeforeConnect with an Entra token
│   └── middleware/                  # Auth (thin Fiber adapter over internal/auth),
│                                      security headers, rate limiting, access
│                                      logging, frontend serving (with runtime
│                                      window.__SHF_AUTH__ injection in static mode)
```

Every domain follows the same layout: `model.go`, `errors.go`, `dto/{request,response}.go`, `repository.go`, `service.go`, `handler.go`, `routes.go`, optional `validation.go`, optional `helpers.go`.

The `internal/auth/` package mirrors the sibling project's `pkg/auth/` shape (config / user / errors). The Fiber-specific HTTP plumbing lives in `internal/middleware/auth.go` and consumes those types - a deliberate split so auth concerns stay separable from the HTTP framework.

## Frontend

```
frontend/
├── index.html
├── src/
│   ├── main.tsx                     # MSAL bootstrap (initialize +
│   │                                  handleRedirectPromise + loginRedirect
│   │                                  when no account) before render
│   ├── App.tsx                      # MsalProvider + the rest of the providers
│   ├── auth/
│   │   ├── msal-config.ts           # MSAL Configuration; reads
│   │   │                             window.__SHF_AUTH__ (backend-injected)
│   │   │                             with VITE_AUTH_* fallback for dev
│   │   └── api-client.ts            # apiFetch wrapper - Bearer header +
│   │                                  401 retry with forced token refresh
│   ├── components/
│   │   ├── common/                  # Reusable UI (SectionEditDialog,
│   │   │                             LoadingSpinner, EmptyState, ErrorBoundary,
│   │   │                             RoleBadge - the role pill, shared by the Users
│   │   │                             page and the header chip,
│   │   │                             PageBanner - the flush top bar, RailTitle - the
│   │   │                             rail-width title block whose rule sits on the rail's
│   │   │                             edge (catalog browse, sheet, editor), and
│   │   │                             PageTitle - the title in it, see below)
│   │   ├── ice-mark.tsx             # The ICE designator for a ROIP net: the "o" device
│   │   │                             from the Instant Connect wordmark, as two flat
│   │   │                             paths. IceMark for the DOM, IceMarkDefs +
│   │   │                             ICE_SYMBOL_ID for SVG (one <symbol>, N <use> -
│   │   │                             a wheel draws it up to 16 times). Do not redraw
│   │   │                             it from memory; two attempts were wrong.
│   │   ├── signal-suite-mark.tsx    # The Signal Suite lockup: Oswald wordmark
│   │   │                             (SIGNAL 500 in the surface colour, SUITE 700
│   │   │                             amber) alone, in a 304x72 box that ends at the
│   │   │                             ink. Wordmark only - the badge, placard, tile,
│   │   │                             reticle and signal-bar variants were rejected.
│   │   │                             Drawn at 114x27 hard right in the header; `color`
│   │   │                             recolours the SIGNAL half for print surfaces.
│   │   ├── header-trigger-sx.ts     # HEADER_CONTROL_H / _SX / HEADER_TRIGGER_SX /
│   │   │                             SHARE_ICON_FONT_SIZE - the one definition of the
│   │   │                             three outlined header controls (share, help, +),
│   │   │                             and OUTLINED_WHITE_SX, the colour half alone, for
│   │   │                             a white outlined button in page content. Also
│   │   │                             HEADER_CLUSTER_GAP (10px, the visible gap between
│   │   │                             everything in the right cluster) and the two
│   │   │                             HEADER_*ICON_BUTTON_SX presets that cancel an
│   │   │                             IconButton's padding so a glyph meets that gap,
│   │   │                             including the MD_UP step that makes them taller
│   │   │                             from 900px up.
│   │   │                             Its own module because header.tsx imports
│   │   │                             csv-header-controls, so it cannot live in either
│   │   │                             without a cycle. Same shape as CONTENT_GUTTER.
│   │   ├── search-field-sx.ts       # SEARCH_FIELD_SX - the one width for the list
│   │   │                             pages' search field (Terminals, Kits, Contracts),
│   │   │                             so the toolbar holds still across the scope switch.
│   │   ├── banner-controls.ts       # BANNER_BTN_*_SX - the one look for a button in a
│   │   │                             catalog page banner (sheet, editor, share trigger):
│   │   │                             30px, mono, 4px radius; primary / amber / paper
│   │   │                             say what the button does. Five heights before.
│   │   │                             Also CONTENT_LINE (28px, the line cards, search
│   │   │                             fields, rail titles and document actions share),
│   │   │                             RAIL_BANNER_PX/PY (PageBanner's padding, which
│   │   │                             RailTitle cancels) and RAIL_BANNER_H (the banner's
│   │   │                             rendered height, which the editor grid and the sheet
│   │   │                             body subtract from 100vh).
│   │   ├── list-pagination.tsx      # ListPagination - the paged list's footer: page
│   │   │                             sizes and prev/next on the left, row count on the
│   │   │                             right. One definition for Terminals, Kits and
│   │   │                             Contracts, which each had their own copy in both
│   │   │                             the toolbar and the footer. The Audit log's
│   │   │                             footer was this component mirrored - same padding,
│   │   │                             count and arrows on opposite sides - and now is it.
│   │   ├── surface-sx.ts            # The shell's counterpart to banner-controls: the
│   │   │                             bordered panels, tables and stat strips on the list
│   │   │                             and admin pages. SURFACE_RADIUS (10px, which was a
│   │   │                             literal in fourteen places and silently overrode
│   │   │                             both the theme's 8px MuiPaper rule and its 4px
│   │   │                             shape.borderRadius), PANEL_SX, TABLE_HEAD_SX (a
│   │   │                             page-local const HEAD_SX in four files, inlined in
│   │   │                             a fifth and at a different size in a sixth),
│   │   │                             TIGHT_CELL_SX, ROW_HOVER_SX and TOGGLE_SX.
│   │   ├── stat-strip.tsx           # StatStrip / StatCell - the row of counts above a
│   │   │                             list page's toolbar, and StatLabel / StatValue for
│   │   │                             the dashboard's tiles, which keep their own grid.
│   │   │                             A cell is a filter only when given an onClick, so
│   │   │                             the users and contracts strips carry no hover.
│   │   │                             Five hand-rolled copies before, four of them drifted.
│   │   ├── record-badges.tsx        # PillBadge / TagBadge / SectionBadge - the two badge
│   │   │                             shapes a record list uses. The status-to-colour
│   │   │                             lookup stays on the page; only the shape is shared.
│   │   │                             Byte-identical private copies in terminals-page and
│   │   │                             kits-page before.
│   │   ├── csv/                     # One dialog for all ten CSV domains, one or
│   │   │   │                         several at a time. CsvHeaderControls is the
│   │   │   │                         app-header cluster; CsvToolbar is the locked
│   │   │   │                         single-domain strip, used only by CsvCatalogue
│   │   │   │                         on the Settings page - the catalog editor does
│   │   │   │                         not import it;
│   │   │   │                         CsvCatalogue is the Settings discovery list.
│   │   │   │                         planCsvRequest and route-dataset are pure.
│   │   │   └── csv-labels.ts        # Column copy. Membership and order come from
│   │   │                             generated/csv-columns.ts, not from here.
│   │   ├── sheet-export/            # DocumentActions: the share trigger then Print / Save PDF,
│   │   │   │                         right-justified on CONTENT_LINE, the last two controls of
│   │   │   │                         every printable page's bar, with the page's own output
│   │   │   │                         settings as children. PrintPageShell: the chrome-free
│   │   │   │                         print route (dark canvas, Back + DocumentActions, the
│   │   │   │                         marked root) with the @page rule injected through a
│   │   │   │                         <style> in document.head, written once for the
│   │   │   │                         compatibility, library and nets print routes.
│   │   │   │                         sheet-root also marks what stays OUT of a picture
│   │   │   │                         (sheetOmitProps: a search box, an add form, row pencils)
│   │   │   │                         and rasterize filters it from the clone.
│   │   │   │                         The three printable sheets - PACE comms card, catalog
│   │   │   │                         data sheet, comparison matrix - to a .png, the
│   │   │   │                         clipboard or a .pptx slide. Named sheet-export, not
│   │   │   │                         export, because common/csv/ already owns that word.
│   │   │   │                         sheet-specs holds one spec per sheet; compareExportSpec
│   │   │   │                         is the only one with no fixed size, measuring its grid
│   │   │   │                         at click time.
│   │   │   │                         sheet-root, slide-geometry, pace-text-runs,
│   │   │   │                         inline-blob-images, sheet-fonts, wait-for-sheet and
│   │   │   │                         eot are pure or DOM-only and unit tested;
│   │   │   │                         rasterize is the only file importing html-to-image;
│   │   │   │                         pptx + zip-store + eot are the whole .pptx writer,
│   │   │   │                         no dependency. sheet-export-menu imports nothing
│   │   │   │                         from @/services, the same rule as the CSV header.
│   │   ├── catalog/                 # Equipment Catalog components (pixel-perfect data sheets)
│   │   │                             BrowseGrid, TerminalCard, DataSheet, DataSheetView,
│   │   │                             HeroBlock, SectionBlock, SpecTable, FrequencyTable,
│   │   │                             StandardSpecsTable, SwapBlock, FeaturesBlock,
│   │   │                             CompatibilityMatrix, AccessoriesList, StatusPill,
│   │   │                             PhotoCropModal (crop/scale before upload),
│   │   │                             FacetSidebar + facet-params.ts + facet-selection.ts
│   │   │                             + catalog-vocab.ts (the /catalog facet rail: a facet
│   │   │                             references a compare-params entry by id rather than
│   │   │                             restating its extractor) + FacetSidebar.test.tsx,
│   │   │                             rail.ts (CATALOG_RAIL_W = 240: the one rail width
│   │   │                             the browse facet rail, the sheet's inventory list
│   │   │                             and the editor's list share, so the RailTitle rule
│   │   │                             above each lands on the same line),
│   │   │                             library-keys.ts (LIBRARIES, LibraryKey, isLibraryKey,
│   │   │                             libraryLabel, libraryQuery: the ?lib= vocabulary the
│   │   │                             Comms Library page and its print route both read) +
│   │   │                             library-pane.tsx (LibraryPane, the key-to-pane switch
│   │   │                             both routes render; their own modules so a page file
│   │   │                             exports one component and the print route's chunk does
│   │   │                             not drag MainLayout in),
│   │   │                             ReferenceLibraryPane (+ reference-library-cells.ts:
│   │   │                             ONE screen for the reference tables - search, add
│   │   │                             form, inline row editor - and it owns save and delete
│   │   │                             error reporting for every caller, because it owns
│   │   │                             editingId and so decides whether the editor closes),
│   │   │                             configured by WaveformLibraryPane + ServiceLibraryPane
│   │   │                             + TransportLibraryPane + PlatformLibraryPane; each
│   │   │                             passes its OWN write gate, which is what lets the
│   │   │                             Comms Library route be ungated,
│   │   │                             CompareMatrix (screen grid) + CompareSheet (print
│   │   │                             table) + CompareControls (the two picker panels)
│   │   │                             + compare-params.ts + compare-selection.ts +
│   │   │                             compare-page-guides.ts + compare-pagination.ts +
│   │   │                             compare-palette.ts (+ tests) + use-print-pagination.tsx
│   │   │                             (the /catalog/compare and /catalog/compare/print
│   │   │                             pages: compare-params is the one declaration of what
│   │   │                             can be compared, compare-selection is the URL codec,
│   │   │                             compare-page-guides sizes columns and column seams
│   │   │                             from one PRINT_MARGIN_IN, compare-pagination turns
│   │   │                             measured row heights into printed row pages, and
│   │   │                             compare-palette declares the DARK/INK --cmp-* color
│   │   │                             schemes; all five are pure and tested without
│   │   │                             rendering. use-print-pagination.tsx is the one
│   │   │                             non-pure piece: it mounts a hidden twin of the print
│   │   │                             table purely to measure it, so print, the preview
│   │   │                             captions and the live guides read one answer),
│   │   │                             compat-matrix-model.ts (+ test) + compat-matrix-params.ts
│   │   │                             + compat-matrix-styles.ts + JointCompatibilityMatrix
│   │   │                             (the /catalog/compatibility page and its print route;
│   │   │                             the model is pure and resolves carried radios live,
│   │   │                             and the styles are shared with CompatibilityMatrix)
│   │   ├── shf-form/                # Shared editor form primitives, lifted verbatim out of
│   │   │   ├── index.tsx            #   catalog-editor-page.tsx. SHFTextField, SHFNumberField,
│   │   │   ├── VocabField.tsx       #   SHFSelectField, SHFMultiCheck, SHFCheckbox, SHFRowList,
│   │   │   └── styles.ts            #   EditorFormSection. Consumed by catalog-editor-page.tsx
│   │   │                            #   AND pace-editor-page.tsx. styles.ts is separate because
│   │   │                            #   react-refresh requires a module to export only components.
│   │   │                            #   Every value comes from catalog-tokens.css - a page using
│   │   │                            #   these must import that stylesheet.
│   │   │                            #   VocabField is the select-over-an-open-vocabulary whose
│   │   │                            #   last entry types a new value: one control, previously a
│   │   │                            #   copy each in TransportLibraryPane and PlatformLibraryPane.
│   │   ├── help/                    # HelpButton (the `?` in the header's left cluster) +
│   │   │                             HelpDialog. No @/services hook in the button -
│   │   │                             it renders inside MainLayout in every test that
│   │   │                             mocks that module with a closed object.
│   │   └── layouts/                 # Header, sidebar, main layout
│   │       └── layout-constants.ts  # SIDEBAR_WIDTH / HEADER_HEIGHT / CONTENT_GUTTER,
│   │                                 in a module that imports nothing. main-layout.tsx
│   │                                 re-exports the last two, which is where every page
│   │                                 reads them; the sidebar needs HEADER_HEIGHT and
│   │                                 main-layout imports the sidebar, so defining them
│   │                                 there would close an import cycle.
│   ├── contexts/
│   │   ├── auth-context.tsx         # role (display only) / isAdmin / canWrite /
│   │                                  canWriteRadio / canWritePace / isPlanner; gates
│   │   │                             useCurrentUser on MSAL having an account
│   │   ├── theme-context.tsx        # mode only, and it is the constant 'dark'.
│   │   │                             No toggleTheme/setMode - the app is dark
│   │   │                             structurally, not by default.
│   │   └── toast-context.tsx        # global toast notifications (useToast)
│   ├── help/                        # help-content.ts - every FAQ question and answer,
│   │                                  pure data. help-content.test.ts holds route
│   │                                  coverage in both directions: every topic route
│   │                                  resolves to one the router declares, and every
│   │                                  declared route is covered by a topic or carries
│   │                                  a written exception in ROUTE_EXCEPTIONS.
│   │                                  route-coverage.ts is that rule as a pure
│   │                                  function, with route-coverage.test.ts holding
│   │                                  both directions of each case as fixtures - it is
│   │                                  imported by nothing in the app.
│   ├── hooks/
│   ├── services/                    # apiClient (uses apiFetch under the hood) +
│   │                                  domain service hooks + queryKeys factory
│   │                                  includes waveform-service.ts (useWaveforms,
│   │                                  useCreateWaveform, useUpdateWaveform, useDeleteWaveform),
│   │                                  service-library.ts (useServices, useCreateService,
│   │                                  useUpdateService, useDeleteService - named for readability,
│   │                                  service-service.ts would say nothing),
│   │                                  transport-service.ts (useTransports, useCreateTransport,
│   │                                  useUpdateTransport, useDeleteTransport)
│   │                                  platform-service.ts (usePlatforms, useCreatePlatform,
│   │                                  useUpdatePlatform, useDeletePlatform)
│   │                                  net-service.ts (useNets, useCreateNet,
│   │                                  useUpdateNet, useDeleteNet - every mutation also
│   │                                  invalidates queryKeys.pace.all, since the card
│   │                                  JOINs nets) and pace-service.ts (usePaceCard,
│   │                                  useSavePaceCard)
│   ├── types/                       # api.ts, roles.ts, role-meta.ts (ROLE_OPTIONS + roleStyle,
│   │                                  read by the Users page, the header chip and the help dialog),
│   │                                  equipment.ts, waveform.ts, service.ts, transport.ts, platform.ts, net.ts,
│   │                                  net-format.ts (shared TX/RX rendering), pace.ts, index.ts
│   ├── theme/
│   ├── pages/                       # terminals, kits, contracts, users, audit, settings,
│   │                                  dashboard, not-found, plus
│   │                                  terminal-drawer, terminal-constants,
│   │                                  kit-drawer, kit-constants,
│   │                                  asset-status-constants (the status vocabulary
│   │                                  both domains share, mirroring the backend's
│   │                                  shared/assetstatus package),
│   │                                  contract-drawer, inline-edit-cell,
│   │                                  catalog-page, catalog-sheet-page,
│   │                                  catalog-editor-page, catalog-editor-draft
│   │                                  (EditorDraft + blankDraft, split out so the
│   │                                  page stays a components-only module),
│   │                                  catalog-print-page,
│   │                                  catalog-compare-page, catalog-compare-print-page,
│   │                                  comms-library-page, comms-library-print-page,
│   │                                  catalog-compatibility-page,
│   │                                  catalog-compatibility-print-page,
│   │                                  nets-index-page, nets-page, nets-print-page, net-drawer,
│   │                                  pace-index-page, pace-section-page,
│   │                                  pace-editor-page, pace-print-page
│   ├── components/pace/             # NetsTable (the Nets Library table, shared with its
│   │                                  read-only print route), ChannelWheel (pure SVG render), wheel-geometry.ts
│   │                                  (testable dial maths), pace-constants.ts
│   │                                  (hasPaceCard + use-pace-sections), SectionPicker.tsx
│   │                                  (squadron chooser, shared by /pace and /nets),
│   │                                  SheetPreview.tsx (the sheet body itself, exported with
│   │                                  PAGE_W / PAGE_H, drawn by both the section and print pages),
│   │                                  emblem.ts (placeholderEmblem, kept out of SheetPreview
│   │                                  because react-refresh wants component-only modules),
│   │                                  use-pace-emblem.ts (reads the emblem through the API;
│   │                                  the stored blob URL is not browser-fetchable)
│   ├── routes/                      # router.tsx, protected-route.tsx, home-path.ts
│   │                                  (homePathFor / fallbackPathFor - where `/` and the
│   │                                  not-found button send each role)
│   └── test/
```

## Running it

```
compose.yaml                         # Dev base: backend image + postgres:16; frontend/dist bind-mounted
compose.dev.yaml                     # Dev overlay: Air hot reload, Vite proxied through :3001
compose.dev.entra.yaml               # Dev overlay: AUTH_ENABLED=true against your own Entra tenant
compose.selfhost.yaml                # Standalone: Dockerfile.prod + postgres:16, auth off, bound to
                                       127.0.0.1 by default. The way to run it without a cloud account
.env.selfhost.example                # The values compose.selfhost.yaml reads; copy to .env.selfhost
Dockerfile.prod                      # node build, go build, distroless. Built by compose.selfhost.yaml
                                       locally; release.yml would build it on a tag, but this copy cuts none
docs/self-hosting.md                 # First run, what auth-off means, exposing it safely, backups, upgrades
```

GitHub workflows in `.github/workflows/`: `ci.yml` (the PR gate), `security.yml` (weekly Trivy + govulncheck), `release.yml` (build + scan + push to GHCR on a `v*` tag). Deploying the image is not a workflow here; it is whoever runs the app pulling the new tag.

## Scripts

Every gate this repo has is one of these files. They are the reason a claim of "done" can be told apart
from a verified one, so they are worth knowing before adding a sixth way to check something.

```
scripts/
├── verify.mjs                       # THE verification command. Runs everything in the
│                                      AGENTS.md Verification section plus the five traps,
│                                      and writes .claude/.verify-receipt.json on success.
│                                      Called by hooks/pre-push and read by verify-gate.mjs.
│                                      --reuse-receipt runs only the two network-sensitive
│                                      steps when the receipt still matches the tree: 4.5s
│                                      instead of 1m33s. Any tree change falls back to full
├── ship-scope.mjs                   # Prints DOC_CHECKS=required or =skip for /ship step 0b,
│                                      so checks 7-11 are scoped to the diff. Always exits 0;
│                                      it is not a gate and cannot fail a push
├── preflight-versions.mjs           # 12 version-compatibility checks across go.mod, the
│                                      workflows, Dockerfile.dev, package.json and the compose files.
│                                      --release adds the 3 tag/CHANGELOG checks. Runs first
│                                      in verify.mjs because it compiles nothing
├── check-docs.mjs                   # Doc/code agreement: workflow inputs named in prose,
│                                      CI job lists, versions quoted in prose, relative link
│                                      targets, migration filenames. Exceptions need a reason
├── check-bundle.mjs                 # Builds the frontend and fails on a cycle in the emitted
│                                      chunk graph: the one step that reads build output
├── check-ui-tokens.mjs              # The frontend's page framework held to one definition:
│                                      the amber is the palette, the surface radius is a token,
│                                      no page declares its own HEAD_SX, the theme's font has an
│                                      @font-face, the tokens sheet loads globally, and every
│                                      routed page carries a title. Runs in verify.mjs as
│                                      `ui tokens` and in the CI preflight job. Exemptions carry
│                                      a written reason, same shape as check-docs
├── verify-deploy.mjs                # Proves a deploy is SERVING, not merely that the platform
│                                      accepted the restart. Run it after every deploy
├── check-csv-coverage.mjs           # Every domain appears in csv-manifest.json and its
│                                      declaration matches its registered routes
├── check-em-dash.mjs                # Local em dash gate (working tree)
├── check-em-dash-ci.mjs             # CI em dash gate - diffs merge-base..HEAD, COMMITTED
│                                      only, so an uncommitted fix looks like it did nothing
├── branch-guard.mjs                 # PreToolUse hook: denies Write/Edit while on main, and
│                                      denies a Bash command that would write to the repo.
│                                      Reads stay allowed, classified by lib/bash-guard.mjs.
│                                      Still one session's seatbelt - branch protection on the
│                                      remote is what actually makes the rule true
├── verify-gate.mjs                  # Stop hook: refuses to end a turn on frontend/backend/
│                                      scripts changes with no matching verify receipt
├── lint-plan.mjs                    # Rejects a handoff plan a smaller model cannot follow
├── plan-status.mjs                  # /execute-plan progress beacon. Carries no pid, by design
├── env-report.mjs                   # The /start banner: toolchain, container, gh account
├── seed-dev-assets.mjs             # Sample Terminals and Kits, 25 per model and per type by
│                                      default, across every section and status. Same guards and
│                                      same rules as seed-dev-nets: loopback plus an auth probe
│                                      before any write, never clobbers, every row named SEED
├── seed-dev-nets.mjs                # Sample Nets Library data. Three guards keep it local
├── setup-hooks.sh                   # Installs hooks/pre-push
├── hooks/pre-push                   # Calls verify.mjs --reuse-receipt. Not the source of
│                                      truth itself. .git/hooks/pre-push is a COPY, so editing
│                                      this changes nothing until setup-hooks.sh runs again
└── lib/                             # bash-guard.mjs, csv-coverage.mjs, em-dash.mjs,
                                      receipt.mjs, ship-scope.mjs, tree-digest.mjs (most with
                                      tests) - the shared halves, which is why `scripts` is its
                                      own CI job
```
