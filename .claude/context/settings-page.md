# Settings page

`/settings` is the one discovery point for app-level controls. Everything in here **also** has an in-context shortcut (sidebar section pencil, header Export button, direct `/audit` URL) - Settings collects them in one place for users who don't know to look elsewhere.

## Panels (role-gated)

| Panel | Visible to | What it does |
|---|---|---|
| Sections | admin + editor | Table of all sections (label / key / color) with a pencil that opens `SectionEditDialog` |
| Tags | admin + editor | Table of every tag in the system - the `tags` catalog is populated by terminal saves as well as by this panel, so a tag typed in a drawer appears here. Columns: Name, Used by (`N terminals`, `0 terminals` for an unused one), actions. Add (TextField + Enter) or delete (trash icon to a confirm dialog that names the affected count). Delete removes the tag from all terminals and audits each one. Uses `useTags`, `useCreateTag`, `useDeleteTag` from `tag-service.ts`. Covered by `settings-page.test.tsx`. |
| CSV catalogue | any auth user | `CsvCatalogue` - one row per dataset, generated from the CSV registry, with Export, Template and Import per row. Import is write-gated; Export and Template are not, since both are reads and the backend serves templates without auth. |
| Audit log | admin | Link that navigates to `/audit` |

Viewers see only the CSV catalogue plus an info alert explaining their access level.

The catalogue is the locked single-domain case, and the only remaining `CsvToolbar` consumer.
Everywhere else, CSV lives in the app header via `CsvHeaderControls` - see the "CSV controls
live in the header, not on pages" section of `AGENTS.md` before adding a control to a page.

## Implementation notes

The page does **not** duplicate feature logic - every panel is a thin wrapper around existing components. Changing the section management or CSV flow means editing `SectionEditDialog` / `CsvCatalogue`, not this page.
