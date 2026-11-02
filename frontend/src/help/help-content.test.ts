import { describe, expect, it } from 'vitest';
// Vite's `?raw` suffix (declared for any specifier by vite/client, see
// vite-env.d.ts) pulls the file in as a plain string at transform time - no
// Node `fs` typings needed in a browser-targeted tsconfig.
import ROUTER_SOURCE from '../routes/router.tsx?raw';
import NAV_ITEMS_SOURCE from '../components/layouts/nav-items.tsx?raw';
import HELP_DIALOG_SOURCE from '../components/help/help-dialog.tsx?raw';
import USERS_PAGE_SOURCE from '../pages/users-page.tsx?raw';
import CATALOG_EDITOR_SOURCE from '../pages/catalog-editor-page.tsx?raw';
import TERMINALS_PAGE_SOURCE from '../pages/terminals-page.tsx?raw';
import KITS_PAGE_SOURCE from '../pages/kits-page.tsx?raw';
import OPERATIONS_PAGE_SOURCE from '../pages/operations-page.tsx?raw';
import SETTINGS_PAGE_SOURCE from '../pages/settings-page.tsx?raw';

import { HELP_GROUPS, type HelpTopic } from './help-content';
import { coverageReport, type RouteException } from './route-coverage';
import { ROLES } from '@/types/roles';

const ALL_TOPICS: HelpTopic[] = HELP_GROUPS.flatMap((g) => g.topics);

// ─── Route legality, derived from the router itself ────────────────────────
//
// Parsed out of the source text rather than imported as a module: `router.tsx`
// builds a real `createBrowserRouter` instance, and importing it would pull in
// every lazy-loaded page and MSAL for no benefit here. Reading the
// `path: '...'` literals is what keeps this check honest - a route added or
// removed there changes what this file accepts with no second list to keep in
// sync.

// Read out of the source for the same reason the router paths are: importing
// help-dialog.tsx would pull in MUI and every icon it draws, for one Set. The
// literal list is also exactly what the check is a claim about.
const BUTTON_STEPS: Set<string> = (() => {
  const block = HELP_DIALOG_SOURCE.match(/const BUTTON_STEPS = new Set\(\[([\s\S]*?)\]\)/);
  if (!block) {
    throw new Error(
      'help-content.test.ts could not find BUTTON_STEPS in help-dialog.tsx. If it was ' +
        'renamed or reshaped, update this parse - a silently empty set would make the ' +
        '"+" check pass by finding nothing.',
    );
  }
  return new Set([...block[1]!.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!));
})();

if (BUTTON_STEPS.size === 0) {
  throw new Error('help-content.test.ts parsed BUTTON_STEPS as empty, which cannot be right.');
}

const ROUTER_PATHS: string[] = [...ROUTER_SOURCE.matchAll(/path:\s*'([^']*)'/g)].map((m) => m[1]!);

if (ROUTER_PATHS.length === 0) {
  throw new Error('Could not find any `path:` entries in routes/router.tsx - the parser is broken.');
}

/** Strips a query string, then compares path segments, treating `:param` as a wildcard. */
function routeIsDeclared(route: string): boolean {
  const path = route.split('?')[0]!;
  const segments = path.split('/').filter((s) => s.length > 0);

  return ROUTER_PATHS.some((declared) => {
    if (declared === '*') return false; // the catch-all is not a real destination
    const declaredSegments = declared.split('/').filter((s) => s.length > 0);
    if (declaredSegments.length !== segments.length) return false;
    return declaredSegments.every((seg, i) => seg.startsWith(':') || seg === segments[i]);
  });
}

// ─── Nav paths, parsed the same way and for the same reason ────────────────
//
// `NAV_ITEMS` in layouts/nav-items.tsx is the list of pages with a button pointing at them.
// It bounds ROUTE_EXCEPTIONS below: a page in the nav is navigable by
// definition, so it can never be excused as `not-navigable`.

const NAV_PATHS: string[] = [...NAV_ITEMS_SOURCE.matchAll(/path:\s*'([^']*)'/g)].map((m) => m[1]!);
// `alsoMatches: ['/nets']` makes PACE's nav button light up on the nets pages,
// which makes /nets nav-reachable too. Parsed separately because it is not a
// `path:` key.
for (const m of NAV_ITEMS_SOURCE.matchAll(/alsoMatches:\s*\[([^\]]*)\]/g)) {
  for (const inner of m[1]!.matchAll(/'([^']*)'/g)) NAV_PATHS.push(inner[1]!);
}

if (NAV_PATHS.length === 0) {
  throw new Error('Could not find any `path:` entries in layouts/nav-items.tsx - the parser is broken.');
}

// ─── Routes knowingly left uncovered ───────────────────────────────────────
//
// Kept here, beside the check that enforces it, exactly where check-docs.mjs
// keeps its own exceptions map - a claim about a gap belongs next to the thing
// that would otherwise fail on it. Not in `help-content.ts`, which ships to the
// browser and would bundle prose about pages that have no help.
//
// Delete an entry to see what it was hiding; the failure it prints is the
// to-do list.

const ROUTE_EXCEPTIONS: Record<string, RouteException> = {
  // Same shape as '/': a redirect, not a page.
  '/audit': {
    kind: 'not-navigable',
    reason:
      'A redirect to /settings?tab=audit, kept so older docs and bookmarks that say "open /audit" stay ' +
      'true. Nothing renders here and it is no longer in the page picker.',
    coveredBy: 'audit-filter',
  },
  '/': {
    kind: 'not-navigable',
    reason:
      'HomeRedirect, not a page. It redirects to /dashboard, which is covered, ' +
      'and nothing ever renders here.',
  },
  '*': {
    kind: 'not-navigable',
    reason: 'The 404. Nobody goes looking for it, and the page carries its own way out.',
  },

  // The four print routes. Each is where a Print button lands, never a
  // destination: /catalog/compare/print opened cold renders a comparison of
  // nothing, so a "Take me there" button pointing here would be worse than no
  // button at all. The printing *task* is covered by the topic named below.
  '/catalog/compatibility/print': {
    kind: 'not-navigable',
    reason: 'The print view of the matrix already on screen; reached from Print on /catalog/compatibility.',
    coveredBy: 'print-compatibility',
  },
  '/catalog/compare/print': {
    kind: 'not-navigable',
    reason: 'The print view of a comparison already on screen; reached from Print / Save PDF on /catalog/compare.',
    coveredBy: 'print-compare',
  },
  '/catalog/:id/print': {
    kind: 'not-navigable',
    reason: 'The print view of one data sheet; reached from Print / Save PDF on that sheet.',
    coveredBy: 'print-data-sheet',
  },
  '/pace/:section/print': {
    kind: 'not-navigable',
    reason: 'The print view of one squadron’s comms card; reached from Print / Save PDF on that card.',
    coveredBy: 'print-pace-card',
  },
  '/nets/:section/print': {
    kind: 'not-navigable',
    reason: 'The read-only print view of one squadron’s nets for one radio; reached from Print / Save PDF on /nets/:section.',
    coveredBy: 'print-nets',
  },
  '/catalog/comms-library/print': {
    kind: 'not-navigable',
    reason: 'The read-only print view of one library tab; reached from Print / Save PDF on /catalog/comms-library.',
    coveredBy: 'print-comms-library',
  },
  '/operations/:id/print': {
    kind: 'not-navigable',
    reason: 'The print view of one operation’s phases, one page each; reached from Print / Save PDF on the operation’s Web view.',
    coveredBy: 'print-operation',
  },
  '/operations/:id/matrix/print': {
    kind: 'not-navigable',
    reason: 'The print view of one operation’s Matrix, All phases and then one page per phase; reached from Print / Save PDF on the operation’s Matrix view.',
    coveredBy: 'print-operation-matrix',
  },

  // The :param routes. A topic cannot target these without writing a concrete
  // key into the URL, and any key it wrote would be a guess about this
  // deployment - which is the defect invariant 14 exists to stop. Each is
  // reached by picking a row or a squadron from a page that IS covered.
  '/catalog/:id': {
    kind: 'not-navigable',
    reason: 'One record’s data sheet, opened by clicking that record in the catalog.',
    coveredBy: 'edit-catalog-card',
  },
  '/catalog/:id/edit': {
    kind: 'not-navigable',
    reason: 'The editor scoped to one record, opened by Edit on its sheet. /catalog/editor is the same screen with a picker.',
    coveredBy: 'add-catalog-record',
  },
  '/nets/:section': {
    kind: 'not-navigable',
    reason: 'One squadron’s nets, opened by picking that squadron at /nets.',
    coveredBy: 'edit-or-delete-net',
  },
  '/pace/:section': {
    kind: 'not-navigable',
    reason: 'One squadron’s comms card, opened by picking that squadron at /pace.',
    coveredBy: 'print-pace-card',
  },
  '/pace/:section/edit': {
    kind: 'not-navigable',
    reason: 'The card editor for one squadron, opened by Edit on that card.',
    coveredBy: 'assign-net-channel',
  },
  '/operations/:id': {
    kind: 'not-navigable',
    reason: 'One operation’s page, with its participants, opened by picking that operation at /operations.',
    coveredBy: 'join-operation',
  },

  // The one editorial decision in this map. Everything above is a statement
  // about the app; this is a statement about the FAQ, which is curated content
  // and not an obligation to cover every route. It is `no-topic-wanted` rather
  // than `deferred` because there is no issue and no intention to write one -
  // a tracking issue filed to satisfy this check would be a lie in a backlog.
  '/contracts': {
    kind: 'no-topic-wanted',
    reason:
      'Deliberate: the maintainer decided contracts are not in the FAQ. Not a gap and not deferred - ' +
      'there is no issue behind it, because no topic is intended. The page itself is unchanged and ' +
      'still in the header nav; only its FAQ entry is gone.',
  },
};

// ─── Routes that refuse, and the flag each refusal is keyed on ─────────────
//
// `gate` means "following `route` without this permission lands on an error
// or a refusal", so a gate is a claim about a ROUTE, and this map is the list
// of routes that make it true. Every gated topic must route to an entry here
// naming the same flag, and every topic routed to an entry must carry that
// gate - the two halves are the two defects this used to test one route at a
// time: /users handed to a viewer, and /catalog/comms-library hidden from an
// rto who could use it.
//
// Keyed by the route a topic writes, query included when the query is what
// refuses: /terminals is open to everyone, /terminals?drawer=add is not. A
// topic route matches its exact key, or failing that the key for its path.
//
// `evidence` is a literal the page source must contain, and it is the code
// that does the refusing. A map entry is otherwise a claim nothing checks, and
// the claim goes stale the day the page stops refusing - which is how five
// PACE topics were gated on pickers that had never refused anybody.

interface Refusal {
  gate: NonNullable<HelpTopic['gate']>;
  file: string;
  source: string;
  evidence: string;
  reason: string;
}

const REFUSALS: Record<string, Refusal> = {
  '/users': {
    gate: 'isAdmin',
    file: 'pages/users-page.tsx',
    source: USERS_PAGE_SOURCE,
    evidence: '{errorMessage}</Alert>',
    reason: 'GET /api/v1/users is admin-only, so any other role lands on the server\'s refusal in an error alert.',
  },
  // The audit log's one home since /audit became a redirect. Keyed with the
  // query because it refuses on a different flag than plain /settings.
  '/settings?tab=audit': {
    gate: 'isAdmin',
    file: 'pages/settings-page.tsx',
    source: SETTINGS_PAGE_SOURCE,
    evidence: 'audit: isAdmin,',
    reason:
      'The Audit log tab is not drawn without isAdmin, and a ?tab= the reader may not open falls back to the ' +
      'first tab they may; GET /api/v1/audit is admin-only underneath, and AuditLog turns its 403 into ' +
      '"The audit log is admin-only."',
  },
  '/catalog/editor': {
    gate: 'canWriteRadio',
    file: 'pages/catalog-editor-page.tsx',
    source: CATALOG_EDITOR_SOURCE,
    evidence: 'if (!canEditDraft) {',
    reason:
      'Without canWriteRadio the editor renders "You don\'t have permission to edit equipment." in place of the form. ' +
      'An rto is not refused here - it lands on a blank radio record - which is why the gate is canWriteRadio and not canWrite.',
  },
  '/terminals?drawer=add': {
    gate: 'canWrite',
    file: 'pages/terminals-page.tsx',
    source: TERMINALS_PAGE_SOURCE,
    evidence: 'const drawerOpen = canWrite &&',
    reason: 'The add drawer the query asks for is refused: a non-writer lands on the list with nothing open.',
  },
  '/kits?drawer=add': {
    gate: 'canWrite',
    file: 'pages/kits-page.tsx',
    source: KITS_PAGE_SOURCE,
    evidence: 'const drawerOpen = canWrite &&',
    reason: 'As for terminals: a non-writer lands on the kits list with no drawer.',
  },
  '/operations?drawer=add': {
    gate: 'canWritePace',
    file: 'pages/operations-page.tsx',
    source: OPERATIONS_PAGE_SOURCE,
    evidence: 'const drawerOpen = canWritePace &&',
    reason: 'As for terminals: a reader without canWritePace lands on the picker with no drawer.',
  },
  '/settings': {
    gate: 'canWrite',
    file: 'pages/settings-page.tsx',
    source: SETTINGS_PAGE_SOURCE,
    evidence: '{!canWrite && !isAdmin && (',
    reason:
      'Every settings topic is about the Sections or Tags panel, both rendered only for canWrite. Without it the page ' +
      'shows neither and says which access the reader has and to contact an admin, which is a refusal in words.',
  },
  // Keyed with its query because the query is what refuses on a different
  // flag: the page itself is canWrite's, but the Organizations tab is open
  // to every canWritePace role, so an rto or a planner must keep the button.
  '/settings?tab=organizations': {
    gate: 'canWritePace',
    file: 'pages/settings-page.tsx',
    source: SETTINGS_PAGE_SOURCE,
    evidence: 'organizations: canWritePace,',
    reason:
      'The Organizations tab is not drawn without canWritePace, and a ?tab= the reader may not open falls back to ' +
      'the first tab they may, so a viewer lands on the data panel beside the access alert.',
  },
};

function refusalFor(route: string): Refusal | undefined {
  return REFUSALS[route] ?? REFUSALS[route.split('?')[0]!];
}

/** At most two sentences, splitting on sentence-ending punctuation followed by whitespace. */
function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;
}

describe('HELP_GROUPS structure', () => {
  it('has unique group ids', () => {
    const ids = HELP_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique topic ids across every group', () => {
    const ids = ALL_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every topic a non-empty question', () => {
    for (const topic of ALL_TOPICS) {
      expect(topic.question.trim().length, `topic "${topic.id}" has an empty question`).toBeGreaterThan(0);
    }
  });

  // Every topic has to answer with SOMETHING. `steps` is optional so a
  // "who can ..." question is not forced into a one-item path, but the escape
  // hatch must not become a way to ship a question with no answer at all: a
  // topic answers with steps, with the role table, or with a note.
  it('gives every topic something to answer with', () => {
    for (const topic of ALL_TOPICS) {
      const answers = (topic.steps?.length ?? 0) > 0 || topic.showRoleTable === true || !!topic.note;
      expect(answers, `topic "${topic.id}" has no steps, no role table and no note`).toBe(true);
    }
  });

  it('never leaves an empty steps array', () => {
    for (const topic of ALL_TOPICS) {
      if (topic.steps === undefined) continue;
      expect(topic.steps.length, `topic "${topic.id}" has an empty steps array - omit the field instead`).toBeGreaterThan(0);
    }
  });

  // A note reading "you cannot do this" in the same styling as "here is a
  // handy extra" is how the caution colour stops being read at all. This does
  // not police which notes are cautions - that is a judgement - but it does
  // stop `tone` being set on a topic with no note to tone.
  it('only sets a tone on a topic that has a note', () => {
    for (const topic of ALL_TOPICS) {
      if (!topic.tone) continue;
      expect(topic.note, `topic "${topic.id}" sets a tone but has no note`).toBeTruthy();
    }
  });

  // Five live steps rendered as plain words because BUTTON_STEPS never gained
  // them: "+ SATCOM" and the four "+ Add ..." library buttons, one of which is
  // the label help.md uses as the example of this rule. `specFor` falls through
  // to kind: 'text' for anything in neither collection, so the failure is
  // silent - the step still reads, it just is not drawn as the button it names.
  //
  // A leading "+" is the one part of this that is mechanically decidable: a
  // step written that way is quoting a control, never prose. Nothing here can
  // catch a renamed button, and help.md says so outright.
  //
  // Written exceptions only, never a silent one - the same demand
  // csv-manifest.json makes of a "no". A "+" control that is not a button is a
  // real case, and it has to say so.
  const NOT_A_BUTTON: Record<string, string> = {
    '+ Add new kind…':
      'An <option> inside the Kind <select>, not a button: the add entry of the shared ' +
      'VocabField (components/shf-form/VocabField.tsx), which TransportLibraryPane passes ' +
      'this exact wording to as `addLabel`. The topic\'s own note calls it "the last entry ' +
      'in the Kind dropdown", so drawing it with button chrome would name the wrong kind of ' +
      'control. The wording is a prop rather than a constant precisely so this key stays ' +
      'valid - generalising it would fail this test complaining about something else.',
  };

  it('draws every "+" step as a button rather than as words', () => {
    for (const topic of ALL_TOPICS) {
      for (const step of topic.steps ?? []) {
        if (!step.startsWith('+ ')) continue;
        if (NOT_A_BUTTON[step]) continue;
        expect(
          BUTTON_STEPS.has(step),
          `topic "${topic.id}" has the step "${step}", which names an on-screen button ` +
            'but is missing from BUTTON_STEPS in help-dialog.tsx, so it renders as plain text',
        ).toBe(true);
      }
    }
  });

  it('never lets a step contain a ">" character', () => {
    for (const topic of ALL_TOPICS) {
      for (const step of topic.steps ?? []) {
        expect(step.includes('>'), `topic "${topic.id}" has a step containing ">": "${step}"`).toBe(false);
      }
    }
  });

  // The defect this replaced: "What can each role do?" routed every reader to
  // /users, which is admin-only, so the topic most likely to be opened by
  // someone confused about their permissions handed a viewer a dead button.
  // It checked /users and /audit by name; REFUSALS now holds every route that
  // refuses, so a new one is covered by adding its entry.
  it('never routes an ungated topic at a page only some roles can open', () => {
    for (const topic of ALL_TOPICS) {
      if (!topic.route) continue;
      const refusal = refusalFor(topic.route);
      if (!refusal) continue;
      expect(
        topic.gate,
        `topic "${topic.id}" routes to "${topic.route}", which refuses a reader without ` +
          `${refusal.gate}, but does not carry gate: '${refusal.gate}'`,
      ).toBe(refusal.gate);
    }
  });

  /**
   * The other direction, and the one that actually bit. `gate` is documented as
   * "set only when following `route` without this permission lands on an error
   * or a refusal" - it suppresses the "Take me there" button and nothing else,
   * since `roles` is display-only. So a gate on a route that refuses nobody
   * withholds the button from a reader who would have been fine.
   *
   * The three Comms Library topics each carried one. Two of them have notes
   * addressed to an `rto` - "An RTO can browse the Service Library" - while a
   * `canWrite` gate hid the button from exactly that rto. The route is a read
   * surface whose panes hide their own write controls, so no gate belongs on it.
   *
   * This used to name /catalog/comms-library alone, which is how five PACE
   * topics kept a `canWritePace` gate on /nets and /pace - squadron pickers
   * that refuse nobody - and hid their button from every viewer. It now
   * accepts a gate only on a route REFUSALS says refuses for that same flag.
   */
  it('never gates a topic whose route refuses nobody', () => {
    for (const topic of ALL_TOPICS) {
      if (!topic.gate) continue;
      expect(topic.route, `topic "${topic.id}" has a gate but no route for it to guard`).toBeDefined();
      const refusal = refusalFor(topic.route!);
      expect(
        refusal?.gate,
        refusal
          ? `topic "${topic.id}" gates "${topic.route}" on ${topic.gate}, but that route refuses on ${refusal.gate}`
          : `topic "${topic.id}" gates "${topic.route}" on ${topic.gate}, and no entry in REFUSALS says that ` +
            'route refuses anyone - the button would be hidden from a reader who can use the page',
      ).toBe(topic.gate);
    }
  });

  // A REFUSALS entry is a claim about a page, so it has to be checked against
  // the page: its route must exist, and the code that refuses must still be in
  // the source. Without this, the map is a second list that drifts.
  it('backs every REFUSALS entry with a declared route and the code that refuses', () => {
    for (const [route, refusal] of Object.entries(REFUSALS)) {
      expect(routeIsDeclared(route), `REFUSALS names "${route}", which no path in routes/router.tsx matches`).toBe(true);
      expect(
        refusal.source.includes(refusal.evidence),
        `REFUSALS says "${route}" refuses without ${refusal.gate}, but ${refusal.file} no longer contains ` +
          `"${refusal.evidence}". If the page stopped refusing, drop the entry and the gates that relied on it.`,
      ).toBe(true);
      expect(refusal.reason.trim().length, `REFUSALS entry "${route}" has no reason`).toBeGreaterThan(0);
    }
  });

  it('keeps every roles entry a member of ROLES, when not "all"', () => {
    for (const topic of ALL_TOPICS) {
      if (topic.roles === 'all') continue;
      for (const role of topic.roles) {
        expect(ROLES.includes(role), `topic "${topic.id}" has an invalid role: "${role}"`).toBe(true);
      }
    }
  });

  it('keeps every note to at most two sentences', () => {
    for (const topic of ALL_TOPICS) {
      if (!topic.note) continue;
      expect(
        sentenceCount(topic.note),
        `topic "${topic.id}" note has more than two sentences: "${topic.note}"`,
      ).toBeLessThanOrEqual(2);
    }
  });

  // The reason this file exists: a route typo'd or removed from the router
  // must fail here, not surface as a dead "Take me there" button in the app.
  it('points every route at a path the router actually declares', () => {
    for (const topic of ALL_TOPICS) {
      if (!topic.route) continue;
      expect(
        routeIsDeclared(topic.route),
        `topic "${topic.id}" has route "${topic.route}", which no path in routes/router.tsx matches`,
      ).toBe(true);
    }
  });

  // ─── The converse, added because its absence let two nav pages ship with
  //     no help at all ───────────────────────────────────────────────────
  //
  // Read what this does and does not claim. Covered means "some topic routes
  // here", which is a FLOOR - no page in the app is entirely absent from the
  // FAQ - and never a ceiling. A topic targeting /catalog does not prove the
  // facet rail is explained. Only reading the topics settles that.
  //
  // The alternatives are worse: counting a text mention would have marked
  // /contracts covered on the strength of a *roles* topic naming "Add
  // Contract", and a `routes` field on HelpGroup would be a second route list,
  // which is the thing the raw-source parse exists to avoid. See
  // ./route-coverage.ts, whose fixtures hold both directions of every rule
  // below.
  it('covers or explicitly excepts every route the router declares', () => {
    const report = coverageReport({
      routerPaths: ROUTER_PATHS,
      navPaths: NAV_PATHS,
      topicRoutes: ALL_TOPICS.filter((t) => t.route).map((t) => ({ id: t.id, route: t.route! })),
      topicIds: ALL_TOPICS.map((t) => t.id),
      exceptions: ROUTE_EXCEPTIONS,
    });

    const { declared, covered, excepted } = report.counts;
    // Print the value verified, not the claim that it was - a check that says
    // only "pass" cannot be reviewed, and several of these would pass vacuously
    // against a regex that stopped matching after a reformat.
    console.log(
      [`help route coverage: ${declared} declared, ${covered} covered, ${excepted} excepted`, ...report.lines].join('\n'),
    );

    expect(report.problems, report.problems.join('\n')).toEqual([]);
    expect(covered + excepted, 'every declared route must be either covered or excepted').toBe(declared);
  });
});
