# In-app help (the header `?`)

A `?` control in the header on every page, beside the share icon, opening an
FAQ dialog of short `X > Y > Z` navigation answers, and the current role made
visible beside the avatar.

It read "I need help!" and sat centred between the two clusters until an earlier release.
Centring made it move: the page picker sizes to its own label, so across the
nine labels the button drifted 26.7px (the picker has ten now, `NAV_ITEMS`). The fix was not to pin it but to stop
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
| `frontend/src/help/help-search.ts` | The word search: tokenize, stem, score and keep the best tier. Pure, tested in `help-search.test.ts`. |
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
  still appears in the FAQ inside two Stats topics (`stats-overview`,
  `stats-tiles`) and two roles topics,
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
  `?drawer=add` lands on the list with the drawer refused and nothing open - both
  worse than no button. But the topic
  itself always shows, with its `Who:` line, because "why can I not do this" is
  precisely the question the tool exists to answer. Filtering topics by role would
  answer it with an absence.

  **A gate is a claim about the route, and `REFUSALS` in `help-content.test.ts`
  is the list of routes that make it true.** Each entry names the flag its route
  refuses on and a literal from the page source that does the refusing, and the
  suite holds all three directions: a gated topic must route to an entry with
  the same flag, a topic routed to an entry must carry its gate, and every
  entry's evidence must still be in its page. The test used to name
  `/catalog/comms-library` alone as a route that refuses nobody, which is how
  five PACE topics kept a `canWritePace` gate on the `/nets` and `/pace`
  pickers - neither refuses anyone - and hid their button from every viewer.
  `/settings` is on the list because the section and tag topics are about the
  Sections or Tags tab, which render only for `canWrite`, and the page says
  so in words to anyone without it. A gate on a route that refuses on its
  query, such as `/terminals?drawer=add`, is keyed with the query; plain
  `/terminals` refuses nobody.
  `/settings?tab=organizations` is the case where the query refuses on a
  different flag than the page: the Organizations tab is drawn for every
  `canWritePace` role, so `edit-organization` carries `canWritePace` through
  its own entry rather than inheriting `canWrite` from `/settings`, which
  would hide its button from an rto or a planner who can use the tab.
  `/settings?tab=audit` is the same case on `isAdmin`: the audit log's one
  home is that tab, so `roles-admin-only` and `audit-filter` route there,
  and `/audit`, now only a redirect to it, is a `not-navigable` entry in
  `ROUTE_EXCEPTIONS` covered by `audit-filter`, as `/` is for its redirect.

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

  **The search mark is chrome too.** While a term is typed, `HighlightText` (in
  `components/common`) washes each occurrence of it in the question, the step
  chips and the note with `alpha(primary.main, 0.32)`. That is amber on a note,
  and it is not the thing the rule forbids: it appears only while the box holds
  a term, it marks the reader's own words rather than the author's tone, and
  it means exactly what the accordion arrow means - "the app is pointing at
  something", not "danger". A topic whose hit is not in its question says so
  after the question instead - `matched in the steps`, `matched in the note`
  or `matched a keyword` - because a row with nothing marked in a list of
  marked rows reads as a false positive. Opening the topic then shows the
  mark in the step chip or the note; keywords are never drawn.

  **Searching opens the matching groups and never the topics.** Opening every
  matching topic was tried and rejected the same day: a broad term such as
  `terminal` opened eight or nine answers at once and the list stopped being
  a list, which made the search less useful rather than more. The caption is
  what carries "why is this row here" on a closed topic.

  The nesting is what forces the distinction. Topic accordions render inside the
  group accordion's `AccordionDetails`, so an open group stacks its own chevron
  on top of five or six identical ones, and the single arrow that collapses the
  group is indistinguishable from the arrows that collapse one question. Both
  were a bare `<ExpandMoreIcon />` with no styling anywhere in the repo.

  `caution` is for a note about something destroyed or refused. Ten carry
  it: deleting a terminal and deleting a kit, deleting an organization (refused
  while an operation has it joined), deleting a section that still has
  terminals (whose note also covers the refusal while it has nets or a PACE
  card), why a net will not delete, why a net is missing from a channel (the
  card refuses to save a net outside its theater), why the last admin cannot
  be demoted, why a free-typed spec row cannot be compared, where CIR and
  MIR live (not in the Service Library), and why a check-in edit did not save
  (someone else saved that unit first). This paragraph said three for as long
  as five were live, so count with `grep -c "tone: 'caution'"` rather than
  trusting the number. If a new one is not clearly in that set, leave the
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

  If you add a token, add its `name`: the search resolves steps through
  `specFor().name` before indexing them, and without a name the topic stops
  being findable by the control's real words. Search is this dialog's primary
  affordance, so that failure is silent and total.

- **Search is by words, not by the typed phrase.** `help/help-search.ts`. It
  used to be one `includes` over the whole string, so "how do i add a net"
  found "How do I add a net?" and "how to add a net" found nothing - one
  filler word the stored text lacked, and the reader had to delete back to
  "net". 59 of the 93 questions start "How do I", so the shared words carry
  no signal. Now both the query and every field are reduced to words:
  lowercased, split on anything that is not a letter or digit, a short stop
  list dropped (how, do, i, to, a, the, can, what, who...), and one trailing
  `ing`/`ed`/`es`/`s` taken off when at least three letters remain, so
  "adding nets" and "add a net" meet in the middle. A query word matches a
  field word it is a **prefix** of, so "ne" finds "nets" while the reader is
  still typing. Fields weigh question 3, keywords 3, steps 2, note 1. A topic
  scores by distinct query words matched, then by the best field weight per
  word, and **only the best tier is shown**: the topics matching every word,
  or, when none do, those matching the most. Topics order by score within a
  group, groups by their best topic, source order as the tie-break. A query of
  nothing but stop words is no query: the whole list, nothing marked.
  `searchTopics` returns *which* field matched - the strongest, not the first
  checked - because the row draws the answer differently: a mark in the
  question for a question hit, a caption naming the field for the others.
  `keywords` are therefore **distinctive words the question lacks**, not
  phrases a reader has to type verbatim; a two-word keyword is two words.
  The marks follow the same rule through `splitOnTerms` in
  `components/common/split-on-term.ts`: each query word is marked where it
  begins a word, as the typed prefix, and adjacent words are separate marks.
  `splitOnTerm`, the whole-phrase splitter, stays for the other searches in
  the app, which still match the whole string.
  The reader's version of this paragraph is `search-help`, alone in the Using
  Help group after Import & Export, and the only topic that draws the `@help`
  token. Change its note when this behaviour changes.

- **The header controls the steps name are menus, not buttons.** Export, Template
  and Import live behind one share icon; Add Terminal, Add Kit, Add Net, the four
  Comms Library rows (Add Waveform, Add Service, Add Transport, Add Platform) and
  Add Operation behind one `+`. Both triggers are icon-only at every width, so
  they have no text label to quote - the steps name them by their tooltip
  (`Import and export`, `Add`), which is on-screen text and so keeps the
  literal-label rule intact. "Add Operation" is a word-only button and so sits in
  `BUTTON_STEPS`. There is no `@add-organization` token: organizations are added
  from the Join Operation wizard, whose "Add to library" is a word-only button in
  `BUTTON_STEPS` too, or from Add organization on the Settings page's
  Organizations tab. A token and a `+` row for them existed for part of
  2026-10-09 and were removed the same day.
  The Settings tabs that steps name, `Tags`, `Organizations` and `Audit log`, are in
  `BUTTON_STEPS` as well, because a tab is a button in the strip.

## The operations group

Fourteen topics, and each one's gate is
a claim `REFUSALS` or `ROUTE_EXCEPTIONS` in `help-content.test.ts` backs:

| Topic | Route | Gate | Why |
|---|---|---|---|
| `add-operation` | `/operations?drawer=add` | `canWritePace` | `operations-page.tsx` refuses the drawer to a reader without the flag, and `REFUSALS` holds the `const drawerOpen = canWritePace &&` line as evidence |
| `edit-operation` | `/operations` | none | Edit in the operation banner opens the same drawer in edit mode, where Phases and Locations appear (add mode shows neither), and Delete with its "Delete operation?" confirmation. Written for `canWritePace` roles but ungated, because the operation page refuses nobody and the test fails a gate on a route that refuses nobody; the banner simply draws no Edit without the flag |
| `add-organization` | `/operations` | none | the steps walk the Join Operation wizard to its "Add to library"; same picker route and same reasoning as `join-operation`, whose wizard is hidden from a reader without `canWritePace`. The note names Add organization on the Settings page's Organizations tab as the other way in, and that tab as where an organization is edited or deleted |
| `edit-organization` | `/settings?tab=organizations` | `canWritePace` | `caution`. Steps `Settings`, `Organizations`, `Edit organization`, `Save`; the note covers the row pencil, Delete with its "Delete organization?" confirmation, and Delete being off while an operation has the organization joined. Its own `REFUSALS` entry, keyed with the query, holds `organizations: canWritePace,` from `settings-page.tsx` as evidence, because plain `/settings` refuses on `canWrite` |
| `join-operation` | `/operations` | none | the operation page refuses nobody, and the wizard never opens for a reader without `canWritePace`. Replaced `check-in-participant` on 2026-10-09 when the pane-based check-in gave way to the wizard. It routes to the picker rather than to `/operations/:id`, because a help route may encode the app's structure and never its data - the same rule that moved the PACE topics off `asqd`. Its steps name `Join Operation`, which is a button on the Participants popup and on the empty Loadout view, not in the banner |
| `participant-edit-conflict` | `/operations` | none | `caution`. The wizard's Save in edit mode carries the row's `updated_at`, and the server refuses a stale one with 409 `PARTICIPANT_STALE` ("this check-in was changed by someone else; reload it and try again"). The wizard shows that in its error alert and stays open on the picks; the note says to close it and reopen Edit, because `useUpdateParticipantById` invalidates the cached operation on that code, so the reopened wizard reads the current row (before that it resent the same stale `updated_at` until a page reload) |
| `participants-list` | `/operations` | none | the roster is a read, and a reader sees it without the Edit, Remove and Join Operation controls. Same picker route, for the same reason |
| `post-rfi` | `/operations` | none | the RFI popup opens for every role and only its Post RFI, Reply and Resolve are write-gated inside it, so the route refuses nobody. Steps `Operations`, `the operation`, `RFIs`, `Post RFI`; the note says the poster picks which unit they are asking as, and that only they can resolve it. Added 2026-10-30 with the RFI board |
| `answer-rfi` | `/operations` | none | `roles: 'all'`, because reading a thread is for every role; the steps name `Reply` and `Resolve`, which a reader simply does not see. Same popup, same reasoning |
| `operation-loadout-view` | `/operations` | none | one unit's tab: Platforms, Equipment, Transports, the By phase table (Location, Tier select, Must talk) and POC, from `participant-board.tsx`. A read for every role; Edit on the tab and the empty view's Join Operation button are write-gated inside it, and a reader sees "No one has joined yet." instead |
| `operation-matrix-view` | `/operations` | none | the Matrix view is a read drawn for every role. Added 2026-10-09 with the view switch on the operation page; same picker route, for the same reason |
| `operation-web-view` | `/operations` | none | the phase picture is a read drawn for every role. Only the View plan chip is write-gated, inside the view: it reads Hide plan while the plan panel (Tier select, Locations, Must talk, Save) is open |
| `print-operation` | `/operations` | none | Print / Save PDF and the share menu on the Web view: one landscape page per phase, and the native `.pptx` deck. Steps `Operations`, `the operation`, `Web`, `Print / Save PDF`. Both controls are reads, drawn for every role |
| `print-operation-matrix` | `/operations` | none | the same two controls on the Matrix view, the grid as an editable PowerPoint table in the `.pptx`. Steps `Operations`, `the operation`, `Matrix`, `Print / Save PDF`. The toolbar's phase chips on the print page print one scope at a time |

`/operations/:id` carries a `not-navigable` entry in `ROUTE_EXCEPTIONS`, covered by
`join-operation`: it is reached by picking an operation, not from any nav.
The two print routes carry one each for the same reason: `/operations/:id/print` is covered by `print-operation` and `/operations/:id/matrix/print` by `print-operation-matrix`, each reached from Print / Save PDF on its view, never from a nav.
They route to the picker, not to a route that encodes an operation's id.

The `join-operation` note and keywords were widened on 2026-10-09 for the platform step: step 2 declares the platforms an organization brings before its radios and is skipped when dismounted, and the keywords gained `platform`, `platforms`, `dismounted`, `airframe`, `vessel` and `vehicle`.
The wizard has since grown to eight steps (Organization, Platform, Equipment, Gear & phases, Transports, Comms links, Contact, Review), and its chrome was simplified: its title is one centred line ("Joining {name}" or "Editing {organization} - {name}"), steps carry no headings or captions, and the banner's view chips are Loadout, Matrix and Web.
The topics' route, gate and steps did not change with either.

The step labels that draw as buttons are in `BUTTON_STEPS` in `help-dialog.tsx`: `Print / Save PDF`, `Add Operation`, `Participants`, `Join Operation`, `Join`, `Other`, `Add to library`, the three view chips `Loadout`, `Matrix` and `Web`, and `Remove`, among others.
The topics for the views themselves are keyed to the view chips by `steps`, so a renamed chip is a content change in the same commit, as the label rule above says.

The `roles-write-assets` topic names the four Comms Library rows and Add Operation,
so a change to the `+` menu's rows is a content change in the same commit, as the
label rule above says.

## Role display

A user has exactly one role: `user/service.go` replaces the array
(`target.Roles = []string{req.Role}`), so multi-role is a schema capability with
no path to reach it. The chip therefore shows one badge and the account menu one
description - no plural heading.
The `roles-where-shown` topic ("Where do I see my role?") points the reader at
both, so moving the chip or the menu's description is a content change in the
same commit.

The rendering still maps over `user.roles` rather than the `role` field, because
that costs one line and degrades correctly on the array the API did not write. See
the `hasRole` comment in `contexts/auth-context.tsx` for the incident: permissions
scan the whole slice while `role` is `roles[0]`, so an admin whose array began
with a legacy pre-RBAC value or an Entra group name kept every admin power and
displayed as something else.
