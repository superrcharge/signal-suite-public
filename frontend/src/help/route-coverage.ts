/**
 * Router -> help coverage, as a pure function.
 *
 * `help-content.test.ts` already holds the other direction: every topic `route`
 * must resolve to a path the router declares. Nothing held the converse, so a
 * page could ship with no FAQ entry of any kind and every gate stayed green -
 * which is how /dashboard and /contracts sat uncovered for as long as the
 * dialog has existed.
 *
 * WHAT THIS CHECK IS, EXACTLY. A route is "covered" when at least one topic
 * routes to it. That is a floor - "no page in this app is entirely absent from
 * the FAQ" - and it is never a ceiling. A topic targeting /catalog does not
 * prove the facet rail is explained; only a person reading the topics can say
 * that. The header of `help-content.test.ts` repeats this so nobody reads a
 * green run as "the help is complete".
 *
 * Two weaker signals were considered and rejected, because both are worse than
 * no check at all:
 *
 *   - Counting a TEXT MENTION of the page. /contracts is named today inside
 *     `roles-write-assets`'s note, which is a *roles* topic. Counting that
 *     would have marked Contracts covered while the FAQ held no contracts task
 *     whatsoever. A signal that passes the real gap manufactures confidence.
 *     That is not hypothetical any more: the Contracts group was deliberately
 *     removed, so /contracts carries a `no-topic-wanted` exception and those
 *     roles-topic mentions are once again the only place the word appears.
 *     Under a text-mention rule the page would read as covered by accident,
 *     and the deliberate decision would be indistinguishable from an oversight.
 *   - A `routes: string[]` field on `HelpGroup`. That is a second route list,
 *     which is the exact thing the raw-source parse of router.tsx exists to
 *     avoid.
 *
 * This module is deliberately pure and imports neither the help data nor the
 * router. Nothing in the app imports it, so it never reaches the bundle; the
 * point is that the negative direction is testable as fixtures, permanently,
 * rather than as a ritual someone performed once in a commit message. Same
 * shape as `scripts/lib/ship-scope.mjs` and `scripts/lib/bash-guard.mjs`.
 */

/** A route knowingly left uncovered, with the reason written down. */
export type RouteException =
  | {
      /**
       * Nobody navigates here as a destination - it is where a button lands.
       * `coveredBy` names the topic that documents the task, when one exists.
       */
      kind: 'not-navigable';
      reason: string;
      coveredBy?: string;
    }
  | {
      /** A real gap with an issue behind it. `reason` must start with #NNN. */
      kind: 'deferred';
      reason: string;
    }
  | {
      /**
       * The maintainer decided this page gets no FAQ entry.
       *
       * Distinct from `deferred`, which promises a topic that an issue is
       * tracking: here there is no issue, because no topic is intended, and
       * filing one to satisfy the check would record an intent nobody holds.
       * Distinct from `not-navigable`, which is a claim about the app that
       * this function can falsify by reading the nav - editorial intent is
       * not falsifiable from here, so the nav rule below does not apply.
       *
       * That makes it the one kind reachable only on purpose. What the check
       * can still demand is that the decision was written down, so a blank
       * reason is a failure. The entry lives in `help-content.test.ts` beside
       * the check, not in `help-content.ts`, which ships to the browser.
       */
      kind: 'no-topic-wanted';
      reason: string;
    };

export interface CoverageInput {
  /** Router paths, in declaration order. Order matters - see `attribute`. */
  routerPaths: string[];
  /** Paths reachable from the header nav. A nav path may never be permanent. */
  navPaths: string[];
  /** Every topic's `route`, keyed by topic id. Topics without one are omitted. */
  topicRoutes: { id: string; route: string }[];
  /** Every topic id, for validating `coveredBy`. */
  topicIds: string[];
  exceptions: Record<string, RouteException>;
}

export interface CoverageReport {
  ok: boolean;
  /** Human-readable attribution, one line per route. Printed by the caller. */
  lines: string[];
  /** Every failure, each naming the route it is about. */
  problems: string[];
  counts: { declared: number; covered: number; excepted: number };
}

/** `/terminals?drawer=add` -> `/terminals`. */
function stripQuery(route: string): string {
  const q = route.indexOf('?');
  return q === -1 ? route : route.slice(0, q);
}

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/**
 * Does `route` match `path`, and did it need a `:param` to do so?
 *
 * The existing `routeIsDeclared` answers only the first half, which is right
 * for legality and wrong here. Attribution has to know whether a match was
 * literal, because `/catalog/compare` matches both `/catalog/compare` and
 * `/catalog/:id` - crediting the second would let a topic about comparing
 * satisfy the requirement that the equipment sheet be documented.
 */
function matchKind(route: string, path: string): 'literal' | 'param' | null {
  if (path === '*') return null;
  const r = segments(stripQuery(route));
  const p = segments(path);
  if (r.length !== p.length) return null;
  let usedParam = false;
  for (let i = 0; i < p.length; i++) {
    if (p[i]?.startsWith(':')) {
      usedParam = true;
      continue;
    }
    if (p[i] !== r[i]) return null;
  }
  return usedParam ? 'param' : 'literal';
}

/**
 * Which declared path a topic route belongs to.
 *
 * First match in router declaration order, never `.some()`. The router's own
 * comments already depend on that order ("Must precede `/pace/:section`"), so
 * reusing it here keeps one notion of precedence rather than inventing a
 * second. Returns the param-match too, so invariant 14 can reject it.
 */
export function attribute(
  route: string,
  routerPaths: string[],
): { path: string; kind: 'literal' | 'param' } | null {
  for (const path of routerPaths) {
    const kind = matchKind(route, path);
    if (kind) return { path, kind };
  }
  return null;
}

export function coverageReport(input: CoverageInput): CoverageReport {
  const { routerPaths, navPaths, topicRoutes, topicIds, exceptions } = input;

  // A raw-source regex that stops matching after a reformat would otherwise
  // leave this check passing vacuously while loudly claiming to have verified
  // something. Two such regexes feed this function, so it refuses both empties.
  if (routerPaths.length === 0) {
    throw new Error('route-coverage: no router paths were parsed - the regex has stopped matching');
  }
  if (navPaths.length === 0) {
    throw new Error('route-coverage: no nav paths were parsed - the regex has stopped matching');
  }

  const problems: string[] = [];
  const lines: string[] = [];
  const ids = new Set(topicIds);
  const nav = new Set(navPaths);

  // route -> the topics covering it, attributed to one declared path each.
  const coveredBy = new Map<string, string[]>();
  for (const { id, route } of topicRoutes) {
    const hit = attribute(route, routerPaths);
    if (!hit) continue; // invariant 12 already reports an undeclared route
    if (hit.kind === 'param') {
      // Invariant 14. A topic route may not lean on a :param, because the
      // value it writes there is DATA, not structure. `/nets/asqd` named a real
      // seeded section - and sections are user-managed, so a unit that renames
      // or deletes that squadron turns the button into a dead end with nothing
      // reporting it. A help route may encode the app's shape, never its rows.
      problems.push(
        `${id}: route "${route}" only matches "${hit.path}" by filling in a :param. ` +
          'Point it at a picker that needs no key.',
      );
      continue;
    }
    const list = coveredBy.get(hit.path) ?? [];
    list.push(id);
    coveredBy.set(hit.path, list);
  }

  const declaredSet = new Set(routerPaths);
  for (const [path, exc] of Object.entries(exceptions)) {
    if (!declaredSet.has(path)) {
      problems.push(`exception for "${path}" names a route the router no longer declares - delete it.`);
    }
    if (exc.kind === 'deferred' && !/^#\d+/.test(exc.reason)) {
      problems.push(`exception for "${path}" is deferred but its reason does not start with an issue number (#NNN).`);
    }
    if (exc.kind === 'no-topic-wanted' && exc.reason.trim() === '') {
      // The only thing this kind can be held to. It asserts a decision, which
      // nothing here can check - so the check is that the decision was stated
      // at all, rather than left as a bare kind somebody reads as an oversight.
      problems.push(`exception for "${path}" says no-topic-wanted but gives no reason. Write down the decision.`);
    }
    if (exc.kind === 'not-navigable') {
      if (exc.coveredBy !== undefined && !ids.has(exc.coveredBy)) {
        problems.push(`exception for "${path}" names coveredBy "${exc.coveredBy}", which is not a topic id.`);
      }
      if (nav.has(path)) {
        // The rule that stops the exception list becoming somewhere to bury a
        // real page: a path with a button in the header nav is navigable by
        // definition, so "nobody navigates here" is a claim the check can
        // falsify. Such a page may be `deferred` with an issue, never excused.
        problems.push(
          `exception for "${path}" says not-navigable, but it is in the header nav. ` +
            'Write the topic, or mark it deferred with an issue number.',
        );
      }
    }
  }

  let covered = 0;
  let excepted = 0;
  for (const path of routerPaths) {
    const topics = coveredBy.get(path) ?? [];
    const exc = exceptions[path];
    if (topics.length > 0 && exc) {
      problems.push(`"${path}" is both covered (${topics.join(', ')}) and excepted - the exception is stale, delete it.`);
    }
    if (topics.length > 0) {
      covered++;
      lines.push(`  ${path.padEnd(24)} ${topics.join(', ')}`);
    } else if (exc) {
      excepted++;
      const via = exc.kind === 'not-navigable' && exc.coveredBy ? ` (task covered by ${exc.coveredBy})` : '';
      lines.push(`  excepted ${path.padEnd(15)} ${exc.kind}${via}: ${exc.reason}`);
    } else {
      problems.push(`"${path}" has no help topic and no exception. Write one, or except it with a reason.`);
    }
  }

  return {
    ok: problems.length === 0,
    lines,
    problems,
    counts: { declared: routerPaths.length, covered, excepted },
  };
}
