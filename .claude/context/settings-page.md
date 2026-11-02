# Settings page

`/settings` is the one discovery point for app-level controls. Everything in here **also** has an in-context shortcut (sidebar section pencil, header Export button) - Settings collects them in one place for users who don't know to look elsewhere.
The exception is editing and deleting an organization, which happens only on the Organizations tab; adding one is also in the Join Operation wizard.
The other exception is the audit log, whose one home is the Audit log tab: `/audit` only redirects to `/settings?tab=audit`, and the page picker has no Audit Log row.

## Tabs

The page is one tab per panel, in this order: Sections, Tags, Organizations, Import/Export, Audit log.
The Import/Export tab and its panel were titled "Data import and export" until 2026-10-13; the tab id stayed `data` until 2026-10-14, when it became `import-export` so the URL says what the tab says.
It used to be one scroll of panels, which at 1280x720 was 1947px of content in a 656px view.
The strip uses `folderTabsSx` from `components/common/folder-tabs-sx.ts`, the one folder-tab style shared with the Nets page and the operation Loadout, and the open panel is its `tabpanel` with square top corners so the open tab sits on it.

- **The open tab is in the URL** as `?tab=<id>`, with ids `sections`, `tags`, `organizations`, `import-export` and `audit`, through `useSearchParams`, so a reload keeps it and a link (a help topic's "Take me there") can open one directly.
- **A tab the reader cannot use is not drawn at all**, rather than drawn and refused. Each tab keeps the gate its panel had before the tabs.
- **A missing, unknown or forbidden `tab` falls back** to the first tab the reader may open, without throwing.
- **With only one tab left the strip is hidden** and that panel renders alone. Today that is a viewer, who sees only Import/Export and the info alert.
- Only the open tab's panel is mounted, so a test of one panel opens its tab through the URL (`renderTab` in `settings-page.test.tsx`).

## Panels (role-gated)

| Panel | Visible to | What it does |
|---|---|---|
| Sections | admin + editor | Table of all sections (label / key / color) with a pencil that opens `SectionEditDialog` |
| Organizations | admin, editor, rto, planner (`canWritePace`) | The Organization Library. One row per organization: colour swatch, short label, name, branch, Used by (`N operations`, `0 operations`, `1 operation`, from the list's `operation_count`), a pencil and a delete icon. Add organization and the pencil open `OrganizationEditDialog` (`components/operations/organization-edit-dialog.tsx`), which draws `OrganizationFields` and saves through `useCreateOrganization` / `useUpdateOrganization`, keeping server errors in the dialog. Delete opens a "Delete organization?" confirmation calling `useDeleteOrganization`; the icon is disabled while `operation_count > 0`, its tooltip naming the count, and a 409 that happens anyway (a race) shows in the confirmation. The gate matches the API's writer set for organizations, which is PACE's. |
| Tags | admin + editor | Table of every tag in the system - the `tags` catalog is populated by terminal saves as well as by this panel, so a tag typed in a drawer appears here. Columns: Name, Used by (`N terminals`, `0 terminals` for an unused one), actions. Add (TextField + Enter) or delete (trash icon to a confirm dialog that names the affected count). Delete removes the tag from all terminals and audits each one. Uses `useTags`, `useCreateTag`, `useDeleteTag` from `tag-service.ts`. Covered by `settings-page.test.tsx`. |
| CSV catalogue | any auth user | `CsvCatalogue` - one row per dataset, generated from the CSV registry, with Export, Template and Import per row. Import is write-gated; Export and Template are not, since both are reads and the backend serves templates without auth. |
| Audit log | admin | The audit log itself, inline: `AuditLog` from `pages/audit-page.tsx` (filters, table, expandable diffs, paging), the one implementation, in a tabpanel rather than a `Panel` because it brings its own filter bar and table panels. Its filters are local state, so they never touch `?tab=`. |

Viewers see only the CSV catalogue plus an info alert explaining their access level.
An rto or a planner sees the Organizations and Data tabs, plus the same alert, which names their role and says it does not manage sections or tags.

The catalogue is the locked single-domain case, and the only remaining `CsvToolbar` consumer.
Everywhere else, CSV lives in the app header via `CsvHeaderControls` - see the "CSV controls
live in the header, not on pages" section of `AGENTS.md` before adding a control to a page.

## Implementation notes

The page does **not** duplicate feature logic - every panel is a thin wrapper around existing components. Changing the section management, CSV or audit log flow means editing `SectionEditDialog` / `CsvCatalogue` / `AuditLog`, not this page.
The same holds for organizations: the form is `OrganizationFields`, and what a complete draft is and what Add and Edit send live in `components/catalog/organization-draft.ts` (`organizationDraftComplete`, `organizationDraftOf`, `createOrganizationRequestOf`, `updateOrganizationRequestOf`, `ORGANIZATION_KEY_PATTERN`), which the Join Operation wizard's Add to library reads too.
