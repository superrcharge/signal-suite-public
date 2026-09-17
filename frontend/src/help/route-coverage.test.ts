import { describe, it, expect } from 'vitest';

import { attribute, coverageReport, type CoverageInput, type RouteException } from './route-coverage';

/**
 * The negative direction, permanently runnable.
 *
 * AGENTS.md records that the version preflight's checks "were verified by
 * reintroducing the real failure" - a ritual nobody repeats, and a check that
 * has never failed has not been shown to work. These fixtures are how a
 * maintainer confirms this one still goes red without breaking the real help
 * content to find out:
 *
 *   npx vitest run src/help/route-coverage.test.ts
 *
 * Every case below that expects `ok: false` is the check working.
 */

const BASE: CoverageInput = {
  routerPaths: ['/terminals', '/catalog', '/catalog/compare', '/catalog/:id', '*'],
  navPaths: ['/terminals', '/catalog'],
  topicRoutes: [
    { id: 'add-terminal', route: '/terminals?drawer=add' },
    { id: 'browse', route: '/catalog' },
    { id: 'compare', route: '/catalog/compare' },
  ],
  topicIds: ['add-terminal', 'browse', 'compare'],
  exceptions: {
    '/catalog/:id': { kind: 'not-navigable', reason: 'Opened by clicking a record.', coveredBy: 'browse' },
    '*': { kind: 'not-navigable', reason: 'The 404.' },
  },
};

function withInput(patch: Partial<CoverageInput>): CoverageInput {
  return { ...BASE, ...patch };
}

function withException(path: string, exc: RouteException): CoverageInput {
  return withInput({ exceptions: { ...BASE.exceptions, [path]: exc } });
}

describe('coverageReport - the passing shape', () => {
  it('accepts a fully covered fixture and counts every declared path', () => {
    const r = coverageReport(BASE);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    // Verified as a total rather than as the absence of failures, so a regex
    // that stopped matching cannot pass by reporting nothing.
    expect(r.counts.covered + r.counts.excepted).toBe(r.counts.declared);
    expect(r.counts).toEqual({ declared: 5, covered: 3, excepted: 2 });
  });

  it('attributes each route to the topics covering it', () => {
    const r = coverageReport(BASE);
    expect(r.lines.some((l) => l.includes('/terminals') && l.includes('add-terminal'))).toBe(true);
    expect(r.lines.some((l) => l.includes('/catalog/compare') && l.includes('compare'))).toBe(true);
  });

  it('prints the reason for an excepted route, so a reader sees the claim', () => {
    const r = coverageReport(BASE);
    expect(r.lines.some((l) => l.includes('excepted') && l.includes('Opened by clicking a record.'))).toBe(true);
    expect(r.lines.some((l) => l.includes('task covered by browse'))).toBe(true);
  });

  it('strips a query string before matching', () => {
    // add-terminal routes to /terminals?drawer=add and must still credit /terminals.
    expect(attribute('/terminals?drawer=add', BASE.routerPaths)).toEqual({ path: '/terminals', kind: 'literal' });
  });

  it('attributes to the FIRST declared match, not any match', () => {
    // /catalog/compare also matches /catalog/:id. Declaration order decides,
    // the same way the router's own ordering comments do.
    expect(attribute('/catalog/compare', BASE.routerPaths)).toEqual({ path: '/catalog/compare', kind: 'literal' });
  });
});

describe('coverageReport - the failures it must catch', () => {
  it('fails a declared path with no topic and no exception, naming it', () => {
    const r = coverageReport(withInput({ routerPaths: [...BASE.routerPaths, '/dashboard'] }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('/dashboard'))).toBe(true);
  });

  it('passes that same path once it carries an exception', () => {
    const r = coverageReport(
      withInput({
        routerPaths: [...BASE.routerPaths, '/legacy'],
        exceptions: { ...BASE.exceptions, '/legacy': { kind: 'not-navigable', reason: 'A redirect, not a page.' } },
      }),
    );
    expect(r.problems).toEqual([]);
    expect(r.lines.some((l) => l.includes('A redirect, not a page.'))).toBe(true);
  });

  it('fails a deferred exception whose reason carries no issue number', () => {
    const r = coverageReport(withException('/catalog/:id', { kind: 'deferred', reason: 'we will get to it' }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('#NNN'))).toBe(true);
  });

  it('accepts a deferred exception that names one', () => {
    const r = coverageReport(withException('/catalog/:id', { kind: 'deferred', reason: '#412 - sheet topics pending.' }));
    expect(r.problems).toEqual([]);
  });

  it('fails an exception on a route that is actually covered - it is stale', () => {
    const r = coverageReport(withException('/catalog', { kind: 'not-navigable', reason: 'unreachable' }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('stale'))).toBe(true);
  });

  it('fails an exception keyed to a route the router no longer declares', () => {
    const r = coverageReport(withException('/removed-page', { kind: 'not-navigable', reason: 'gone' }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('no longer declares'))).toBe(true);
  });

  it('fails a not-navigable exception on a path that is in the header nav', () => {
    // The rule that stops /dashboard and /contracts being buried here.
    const r = coverageReport(
      withInput({
        topicRoutes: [{ id: 'add-terminal', route: '/terminals?drawer=add' }, { id: 'compare', route: '/catalog/compare' }],
        exceptions: { ...BASE.exceptions, '/catalog': { kind: 'not-navigable', reason: 'nobody goes here' } },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('header nav'))).toBe(true);
  });

  it('allows a nav path to be deferred with an issue, since that is honest', () => {
    const r = coverageReport(
      withInput({
        topicRoutes: [{ id: 'add-terminal', route: '/terminals?drawer=add' }, { id: 'compare', route: '/catalog/compare' }],
        exceptions: { ...BASE.exceptions, '/catalog': { kind: 'deferred', reason: '#500 - catalog topics pending.' } },
      }),
    );
    expect(r.problems).toEqual([]);
  });

  // ─── no-topic-wanted: an editorial decision, not a gap ──────────────────
  //
  // The kind added when the Contracts group was deleted. The three rules
  // below are the whole contract: a nav path may use it (that is the point,
  // and it is exactly what `not-navigable` is forbidden from doing), the
  // reason may not be blank, and it is still subject to the stale and
  // undeclared checks like every other kind.

  it('allows a nav path to be no-topic-wanted, since a curated FAQ may skip a page', () => {
    const r = coverageReport(
      withInput({
        topicRoutes: [{ id: 'add-terminal', route: '/terminals?drawer=add' }, { id: 'compare', route: '/catalog/compare' }],
        exceptions: {
          ...BASE.exceptions,
          '/catalog': { kind: 'no-topic-wanted', reason: 'Deliberate - the maintainer decided this is not in the FAQ.' },
        },
      }),
    );
    expect(r.problems).toEqual([]);
  });

  it('fails a no-topic-wanted exception with a blank reason', () => {
    // The only thing this kind can be held to. Without it the entry is a bare
    // marker that reads identically to somebody having forgotten the topic.
    const r = coverageReport(
      withInput({
        topicRoutes: [{ id: 'add-terminal', route: '/terminals?drawer=add' }, { id: 'compare', route: '/catalog/compare' }],
        exceptions: { ...BASE.exceptions, '/catalog': { kind: 'no-topic-wanted', reason: '   ' } },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('no reason'))).toBe(true);
  });

  it('fails a no-topic-wanted exception on a route that is actually covered', () => {
    const r = coverageReport(
      withException('/catalog', { kind: 'no-topic-wanted', reason: 'Deliberately not in the FAQ.' }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('stale'))).toBe(true);
  });

  it('fails a no-topic-wanted exception keyed to a route the router no longer declares', () => {
    const r = coverageReport(
      withException('/removed-page', { kind: 'no-topic-wanted', reason: 'Deliberately not in the FAQ.' }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('no longer declares'))).toBe(true);
  });

  it('fails a coveredBy naming a topic id that does not exist', () => {
    const r = coverageReport(
      withException('/catalog/:id', { kind: 'not-navigable', reason: 'Opened by clicking.', coveredBy: 'no-such-topic' }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('no-such-topic'))).toBe(true);
  });

  it('fails a topic route that only matches by filling in a :param', () => {
    // This is the /nets/asqd defect: a section KEY in a help route. The key was
    // real and seeded, which is why nothing caught it - but sections are
    // user-managed, so the route breaks whenever a unit renames or deletes one.
    const r = coverageReport(
      withInput({
        topicRoutes: [...BASE.topicRoutes, { id: 'sheet', route: '/catalog/some-made-up-id' }],
        topicIds: [...BASE.topicIds, 'sheet'],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('sheet') && p.includes(':param'))).toBe(true);
  });

  it('throws when no router paths were parsed, rather than passing vacuously', () => {
    expect(() => coverageReport(withInput({ routerPaths: [] }))).toThrow(/router paths/);
  });

  it('throws when no nav paths were parsed', () => {
    expect(() => coverageReport(withInput({ navPaths: [] }))).toThrow(/nav paths/);
  });
});
