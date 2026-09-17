import { describe, it, expect } from 'vitest';
import { deltaOkUnder, type Vision } from './color-metrics';
import {
  CO_RENDER,
  FLOORS,
  VISIONS,
  KNOWN_COLLISIONS,
  type Collision,
} from './co-occurrence';

/**
 * Walk every declared context and return each pair that fails its floor.
 *
 * Pairs are keyed by sorted name so the result is stable regardless of
 * declaration order, and a pair reachable from two contexts is reported once.
 */
function findCollisions(): Collision[] {
  const found = new Map<string, Collision>();

  for (const ctx of CO_RENDER) {
    const members: Array<[string, string]> = [];
    for (const [group, colors] of Object.entries(ctx.mutual)) {
      for (const [key, hex] of Object.entries(colors)) members.push([`${group}.${key}`, hex]);
    }

    const record = (an: string, av: string, bn: string, bv: string, vision: Vision) => {
      const delta = deltaOkUnder(av, bv, vision);
      if (delta >= FLOORS[vision]) return;
      const [a, b] = [an, bn].sort();
      const key = `${a}|${b}|${vision}`;
      if (!found.has(key)) {
        found.set(key, { a: a!, b: b!, vision, delta: Number(delta.toFixed(3)) });
      }
    };

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        for (const vision of VISIONS) {
          record(members[i]![0], members[i]![1], members[j]![0], members[j]![1], vision);
        }
      }
    }

    for (const [group, swatches] of Object.entries(ctx.against ?? {})) {
      for (const swatch of swatches) {
        for (const [name, hex] of members) {
          for (const vision of VISIONS) {
            record(`${group}:${swatch}`, swatch, name, hex, vision);
          }
        }
      }
    }
  }

  return [...found.values()].sort(
    (x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b) || x.vision.localeCompare(y.vision),
  );
}

const serialize = (c: Collision) => `${c.a} vs ${c.b} [${c.vision}]`;

describe('co-occurrence constraints', () => {
  // The point of the baseline: a NEW collision fails immediately, and a FIXED
  // collision also fails until it is removed from KNOWN_COLLISIONS, so the list
  // can only ever shrink deliberately.
  it('matches the recorded baseline exactly', () => {
    const actual = findCollisions().map(serialize);
    const expected = [...KNOWN_COLLISIONS].map(serialize).sort();
    expect(actual.sort()).toEqual(expected);
  });

  it('records an accurate distance for every known collision', () => {
    const actual = new Map(findCollisions().map((c) => [serialize(c), c.delta]));
    for (const known of KNOWN_COLLISIONS) {
      expect(actual.get(serialize(known))).toBeCloseTo(known.delta, 3);
    }
  });

  // Exact duplicates are a different class of problem from "a bit close": the
  // section picker literally offers the kit type badge colors, so a section can
  // be made indistinguishable from a kit type in the same table row.
  it('names the exact duplicates so they stay visible', () => {
    const exact = KNOWN_COLLISIONS.filter((c) => c.delta === 0 && c.vision === 'normal').map(serialize);
    expect(exact).toEqual([
      'kitType.atk vs sectionSwatch:#2dd4bf [normal]',
      'kitType.ifk vs sectionSwatch:#e879f9 [normal]',
      'kitType.remote vs sectionSwatch:#39d3f0 [normal]',
    ]);
  });

  it('keeps status and contract urgency out of the same context', () => {
    for (const ctx of CO_RENDER) {
      const groups = Object.keys(ctx.mutual);
      expect(groups.includes('status') && groups.includes('urgency')).toBe(false);
    }
  });
});
