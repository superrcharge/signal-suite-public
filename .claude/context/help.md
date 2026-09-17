# In-app help (the header `?`)

A `?` control in the header on every page, beside the share icon, opening an
FAQ dialog of short `X > Y > Z` navigation answers, and the current role made
visible beside the avatar.

It read "I need help!" and sat centred between the two clusters until an earlier release.
Centring made it move: the page picker sizes to its own label, so across the
nine labels the button drifted 26.7px. The fix was not to pin it but to stop
centring it - the Catalog routes centre their own PRINT / SAVE PDF on the page
below, so a centred header control stacked two unrelated centred controls on one
axis. `aria-label` is still "I need help!", which is the name every test and
every other document uses.

It exists because nine domains, five pages and five roles had no self-explanation
anywhere in the product. Nets live under PACE, the four reference libraries are
on a route of their own rather than on the page that consumes them, the catalog
editor is reached from the sidebar rather than from a card, and Import is hidden
from a viewer rather than broken. (Transports were the sharpest case when this
was written - no browse surface at all - which `/catalog/comms-library` has since
closed.) Every one of those answers was
already written down - in `.claude/context/domains/*.md`, which no operator will
ever open.

## Where things are

| File | What |
|---|---|
| `frontend/src/help/help-content.ts` | Every question and answer. Pure data, no React. |
| `frontend/src/help/help-content.test.ts` | Holds the content to the app - see below. |
| `frontend/src/help/route-coverage.ts` | Which routes the FAQ covers, and the written reason for each one it does not. |
| `frontend/src/help/route-coverage.test.ts` | Fails when a route appears in the router with no topic and no reason. |
| `frontend/src/components/help/help-button.tsx` | The header control and the dialog mount. |
| `frontend/src/components/help/help-dialog.tsx` | Search, groups, accordions, "Take me there". |
| `frontend/src/types/role-meta.ts` | `ROLE_OPTIONS`, `roleStyle`, `roleLabel`, `roleDescription`. |
| `frontend/src/components/common/role-badge.tsx` | The role pill, shared by the Users page and the header. |

## Three things to know before touching it

- **No `@/services` hook in the button.** Two dozen test files mock that module
  with a closed object, and the header renders inside `MainLayout` in every one of
  them, so a service hook added here fails all of them at once as a spray of
  unrelated-looking failures. This is the same constraint `csv-header-controls.tsx`
  carries and for the same reason. `useAuth`, `useNavigate` and `useLocation` are
  not from `@/services`; the dialog mounts on click, so anything it needs is fine.
  The authority on the mock list is `checkServiceMocks` in `scripts/verify.mjs`,
  which reads the hook list out of the layout sources at runtime - never a number
  written in prose here.

- **A label change in the app is a content change in the same commit.** The steps
  name literal on-screen controls: `Print / Save PDF`, `+ Add to Waveform Library`,
  `Save Section`. Prose that names a control it cannot find is the same failure
  class the docs checker exists for, except this copy ships to an operator who
  will click what it says. `help-content.test.ts` catches the half of this that is
  statically checkable, and nothing catches a renamed button but reading it.

- **Route coverage is checked in both directions, and only one of them is a
  strong claim.** Every topic `route` must resolve to a path the router declares
  (a dead "Take me there" fails the suite), and every path the router declares
  must be covered by some topic or carry a written exception in
  `ROUTE_EXCEPTIONS`. The second direction is a **floor** - "no page is entirely
  absent from the FAQ" - never a ceiling: a topic targeting `/catalog` does not
  prove the facet rail is explained, and only reading the topics settles that.
  Its absence is how `/dashboard` and `/contracts`, both nav pages, shipped with
  no help of any kind. A page in the header nav may be `deferred` with an issue
  number but never excused as `not-navigable`, which is what stops the exception
  list becoming somewhere to bury a real gap. The rules live in
  `help/route-coverage.ts` as a pure function, with fixtures in
  `route-coverage.test.ts` holding both directions of each one, so the negative
  case stays runnable instead of being performed once and described in a commit
  message.

- **There are three exception kinds, and only two of them are claims the check
  can falsify.** `not-navigable` says nobody navigates there, which the nav
  parse can contradict - so a nav page may never use it. `deferred` says a
  topic is coming, which the `#NNN` rule ties to something trackable.
  `no-topic-wanted` says the maintainer decided the page is not in the FAQ, and
  nothing here can check intent, so the only rule it carries is that the reason
  is not blank.

  That third kind exists because `/contracts` needed it. The Contracts group
  was written and then deliberately removed: the FAQ is curated content, not an
  obligation to cover every route. The two kinds that already existed would
  both have recorded something false - `not-navigable` is contradicted by the
  page sitting in the header nav, and `deferred` would have required an issue
  number for work nobody intends to do, which is how a backlog fills with
  tickets that can never close.

  **Use it for a decision, never for "we have not got to it yet."** That case
  is what `deferred` is for, and the two are distinguishable only by the reason
  somebody wrote, which is why the reason is mandatory. The word "contracts"
  still appears in the FAQ inside a dashboard topic and two roles topics,
  because those are accurate about a page that exists; a text-mention rule
  would read those as coverage and make the decision indistinguishable from an
  oversight, which is exactly the alternative `route-coverage.ts` rejects.

- **A topic route may not fill in a `:param`.** Seven routes once wrote `asqd`
  into `/nets/:section` and `/pace/:section`. That key is real - it is seeded by
  `012_unhyphenate_squad_keys.sql` and named again by `036` - so those buttons
  work in a seeded database and the defect is not that they were broken on day
  one. It is that **sections are user-managed data**: a unit renames its
  squadrons, deletes one and reassigns its terminals, or starts from a clean
  database, and a help route holding a section key becomes a button to a
  squadron that is not there. Nothing would have reported it, because the older
  check treated `:param` as a wildcard and so accepted any key at all.
  Those topics point at the `/nets` and `/pace` pickers instead, which is step
  two of the path their own `steps` already describe - `PACE > Nets Library >
  your squadron`. The general rule the invariant enforces: a help route may
  encode the app's structure, never its data.

- **"Take me there" is gated, and the answer is not.** A topic carries an optional
  `gate`; when it fails the button is hidden and the topic still renders in full.
  A viewer following a link to `/users` lands on an error page, and one following
  `?drawer=add` gets a refusal banner - both worse than no button. But the topic
  itself always shows, with its `Who:` line, because "why can I not do this" is
  precisely the question the tool exists to answer. Filtering topics by role would
  answer it with an absence.

- **No note is coloured. `tone: 'caution'` renders italic, and the default is
  plain.** Amber was tried twice and lost twice. First on every note, where a
  warning colour on "you can also edit a cell in place" braces the reader for a
  problem that is not there. Then on roughly a third of them, which read as arbitrary white and
  yellow text - at that ratio a colour distinguishes nothing, and what it was marking
  was mostly *permissions*, the commonest kind of note here and the one the
  `Who:` chips already state a line below.

  The deciding reason is broader than the ratio: `--shf-amber` is this app's
  house accent - page banners, section headings, the wheel ring, the Add
  controls. A colour that already means "this is the app's own chrome" cannot
  also mean danger, however sparingly it is spent. **Emphasis here is
  typographic, never chromatic.**

  **That rule is about the content, not the chrome, and the accordion arrows are
  chrome.** The group headers' expand arrow is `--shf-amber` and the topic
  arrows are `text.disabled`, the same token the step separator chevrons use.
  Read against the paragraph above that is not an exception but the same
  argument: amber means "the app's own furniture", and an expand arrow is
  furniture, so spending it there says what it already says. What the rule
  forbids is amber on a *note*, where it would have to mean danger.

  The nesting is what forces the distinction. Topic accordions render inside the
  group accordion's `AccordionDetails`, so an open group stacks its own chevron
  on top of five or six identical ones, and the single arrow that collapses the
  group is indistinguishable from the arrows that collapse one question. Both
  were a bare `<ExpandMoreIcon />` with no styling anywhere in the repo.

  `caution` is for a note about something destroyed or refused: deleting a
  terminal, deleting a section that still has terminals (whose note also covers
  the refusal while it has nets or a PACE card), why a net will not delete, a
  comparison cell that cannot be filled, a rate that cannot be set where the
  reader expects, and deleting a tag off every terminal at once. If a new one
  is not clearly in that set, leave the
  default. Italic rather than an asterisk, which would promise a footnote this
  dialog does not have.

- **A note says what to do and what you will see. It never explains the data
  model.** "The record must be saved first - the upload control only appears
  once it has an ID" is a fact about a primary key wearing an instruction's
  clothes. It now reads "Save the record first, then upload." The same sweep
  took out "three independent booleans" and "deliberately not gated" - `boolean`
  and `gated` are words this codebase owns and the reader does not.

- **A step names something the reader can find, and if it has no words it is
  drawn instead.** `steps` entries beginning `@` are tokens resolved by
  `STEP_SPECS` in `help-dialog.tsx`, which draws the real icon component the
  header imports - so a step cannot drift from the control it depicts. This
  exists because "Import and export" is the share button's tooltip and appears
  nowhere on screen, so quoting it sent readers hunting for words that do not
  exist.

  Each step also declares what it *is*, and only a button gets a box: a menu row
  is its icon and label on no box, and a field label or a placeholder is plain
  words. **Bare strings default to plain text on purpose** - a real control left
  unstyled is merely plain, whereas a field label wrongly boxed is a lie about
  the UI.

  If you add a token, add its `name`: `matchesSearch` resolves steps through
  `specFor().name` before building its haystack, and without a name the topic
  stops being findable by the control's real words. Search is this dialog's
  primary affordance, so that failure is silent and total.

- **The header controls the steps name are menus, not buttons.** Export, Template
  and Import live behind one share icon; Add Terminal, Add Kit and Add Net behind
  one `+`. Both triggers are icon-only at every width, so they have no text label
  to quote - the steps name them by their tooltip (`Import and export`, `Add`),
  which is on-screen text and so keeps the literal-label rule intact.

## Role display

A user has exactly one role: `user/service.go` replaces the array
(`target.Roles = []string{req.Role}`), so multi-role is a schema capability with
no path to reach it. The chip therefore shows one badge and the account menu one
description - no plural heading.

The rendering still maps over `user.roles` rather than the `role` field, because
that costs one line and degrades correctly on the array the API did not write. See
the `hasRole` comment in `contexts/auth-context.tsx` for the incident: permissions
scan the whole slice while `role` is `roles[0]`, so an admin whose array began
with a legacy pre-RBAC value or an Entra group name kept every admin power and
displayed as something else.
