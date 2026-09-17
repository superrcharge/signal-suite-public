import { describe, expect, it } from 'vitest';
// Vite's `?raw` suffix (declared for any specifier by vite/client, see
// vite-env.d.ts) pulls the file in as a plain string at transform time - no
// Node `fs` typings needed in a browser-targeted tsconfig.
import ROUTER_SOURCE from '../routes/router.tsx?raw';
import HEADER_SOURCE from '../components/layouts/header.tsx?raw';
import HELP_DIALOG_SOURCE from '../components/help/help-dialog.tsx?raw';

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
// `navItems` in the header is the list of pages with a button pointing at them.
// It bounds ROUTE_EXCEPTIONS below: a page in the nav is navigable by
// definition, so it can never be excused as `not-navigable`.

const NAV_PATHS: string[] = [...HEADER_SOURCE.matchAll(/path:\s*'([^']*)'/g)].map((m) => m[1]!);
// `alsoMatches: ['/nets']` makes PACE's nav button light up on the nets pages,
// which makes /nets nav-reachable too. Parsed separately because it is not a
// `path:` key.
for (const m of HEADER_SOURCE.matchAll(/alsoMatches:\s*\[([^\]]*)\]/g)) {
  for (const inner of m[1]!.matchAll(/'([^']*)'/g)) NAV_PATHS.push(inner[1]!);
}

if (NAV_PATHS.length === 0) {
  throw new Error('Could not find any `path:` entries in layouts/header.tsx - the parser is broken.');
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
  '/': {
    kind: 'not-navigable',
    reason:
      'HomeRedirect, not a page. It resolves by role to /terminals or /pace, both of which are covered, ' +
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
  it('never routes an ungated topic at a page only some roles can open', () => {
    const ADMIN_ONLY = ['/users', '/audit'];
    for (const topic of ALL_TOPICS) {
      if (!topic.route) continue;
      const adminOnly = ADMIN_ONLY.some((p) => topic.route!.split('?')[0] === p);
      if (!adminOnly) continue;
      expect(
        topic.gate,
        `topic "${topic.id}" routes to the admin-only "${topic.route}" without gate: 'isAdmin'`,
      ).toBe('isAdmin');
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
   */
  it('never gates a topic whose route refuses nobody', () => {
    const OPEN_ROUTES = ['/catalog/comms-library'];
    for (const topic of ALL_TOPICS) {
      if (!topic.route) continue;
      const open = OPEN_ROUTES.some((p) => topic.route!.split('?')[0] === p);
      if (!open) continue;
      expect(
        topic.gate,
        `topic "${topic.id}" gates "${topic.route}", which any authenticated user can open - `
          + 'the button would be hidden from a reader who can use the page',
      ).toBeUndefined();
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
