import { describe, expect, it } from 'vitest';

import { CSV_COLUMNS } from '@/generated/csv-columns';
import { CSV_DOMAINS, CSV_DOMAIN_ORDER, withSection, type CsvResource } from './csv-domains';

// Pure data invariants. Cheap, and the guard against domain ten being wired up
// half way - a registry entry with no import path but an import button, a
// section-scoped path nobody substitutes, a resource the backend never heard of.
describe('CSV domain registry', () => {
  const entries = Object.values(CSV_DOMAINS);

  it('covers exactly what the backend generated', () => {
    const registry = entries.map((c) => c.resource).sort();
    const backend = CSV_COLUMNS.map((d) => d.resource).sort();
    expect(registry).toEqual(backend);
  });

  it('orders every domain exactly once', () => {
    expect([...CSV_DOMAIN_ORDER].sort()).toEqual(Object.keys(CSV_DOMAINS).sort());
    expect(new Set(CSV_DOMAIN_ORDER).size).toBe(CSV_DOMAIN_ORDER.length);
  });

  it('agrees with the backend about which domains accept an import', () => {
    // The frontend hiding an Import button the backend would have accepted is a
    // missing feature; showing one it would refuse is a 404 in the user's face.
    for (const domain of CSV_COLUMNS) {
      const config = CSV_DOMAINS[domain.resource as CsvResource];
      expect(Boolean(config.importPath), `${domain.resource} import path`).toBe(domain.import);
    }
  });

  it('gives every importable domain a template', () => {
    // A template exists to be filled in and uploaded. An import with no template
    // leaves the user guessing at the header row.
    for (const config of entries) {
      if (!config.importPath) continue;
      expect(config.templatePath, `${config.resource} has import but no template`).toBeTruthy();
    }
  });

  it('never offers a template for a domain that cannot import', () => {
    for (const config of entries) {
      if (config.importPath) continue;
      expect(config.templatePath, `${config.resource} templates into nowhere`).toBeUndefined();
    }
  });

  it('marks every path carrying :section as section-scoped', () => {
    for (const config of entries) {
      const paths = [config.exportPath, config.templatePath, config.importPath].filter(Boolean);
      const carries = paths.some((p) => p!.includes(':section'));
      // The template is shared across squadrons, so only export and import
      // carry the segment; sectionScoped means "this domain needs a squadron".
      const needsSection = [config.exportPath, config.importPath]
        .filter(Boolean)
        .some((p) => p!.includes(':section'));
      expect(Boolean(config.sectionScoped), `${config.resource}`).toBe(needsSection);
      if (!config.sectionScoped) expect(carries).toBe(false);
    }
  });

  it('substitutes and escapes the squadron', () => {
    expect(withSection('/api/v1/export/nets/:section', 'asqd')).toBe('/api/v1/export/nets/asqd');
    expect(withSection('/api/v1/export/nets/:section', 'a b')).toBe('/api/v1/export/nets/a%20b');
    // No section supplied leaves the template alone rather than producing a
    // path with a literal ":section" in it.
    expect(withSection('/api/v1/export/nets/:section', undefined)).toContain(':section');
  });

  it('splits the scoped domains between the radio and PACE gates', () => {
    // Getting this wrong either hides a control from someone who may use it, or
    // shows one whose request the server will refuse.
    //
    // Each dataset sits behind the flag matching its own route's role list, not
    // behind whichever flag its neighbours in the dialog use:
    //
    //   canWriteRadio - equipment and waveforms. Both admit rto on the server;
    //     equipment then narrows to radio records per row via ActorRadioOnly.
    //   canWritePace  - nets, pace-channels and transports. A transport is a
    //     path a PACE tier names, so it follows the card rather than the
    //     catalog; nothing in the equipment domain references transports.
    //     Platforms likewise: they are the input to a PACE across a joint force.
    const gated = (gate: string) =>
      entries.filter((c) => c.writeGate === gate).map((c) => c.resource).sort();

    expect(gated('canWriteRadio')).toEqual(['equipment', 'waveforms']);
    expect(gated('canWritePace')).toEqual(['nets', 'pace-channels', 'platforms', 'transports']);
  });
});
