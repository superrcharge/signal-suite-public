import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/utils';
import type { Participant, Phase, Site } from '@/types';
import { column, model, row, source } from './interop-fixtures';
import { layoutPhase } from './phase-layout';
import { PhasePicture } from './phase-picture';
import { phaseRequirements } from './phase-plan-model';

// The engine is built from the chunk's default export. The first build fails,
// the way a chunk that did not arrive fails, and every one after it is the
// real engine: what `engine()` must do with the failure is the question.
const chunk = vi.hoisted(() => ({ failNext: true, builds: 0 }));
vi.mock('elkjs/lib/elk.bundled.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('elkjs/lib/elk.bundled.js')>();
  class Flaky {
    private readonly inner: InstanceType<typeof real.default>;
    constructor() {
      chunk.builds += 1;
      if (chunk.failNext) {
        chunk.failNext = false;
        throw new Error('Outdated Optimize Dep');
      }
      this.inner = new real.default();
    }
    layout(graph: Parameters<InstanceType<typeof real.default>['layout']>[0]) {
      return this.inner.layout(graph);
    }
  }
  return { default: Flaky };
});

const a1 = source('row-a', 'equipment', 'a1', 'A1');
const b1 = source('row-b', 'equipment', 'b1', 'B1');
const MODEL = model([column('a', '#2E7D32', 'USA', [a1]), column('b', '', '', [b1])], [
  row('waveform', 'x', 'X', '', [[a1], [b1]]),
], 'ph1');
const SITES: Site[] = [{ id: 's1', operation_id: 'op-1', position: 0, name: 'ISB' }];
const unit = (key: string): Participant => ({
  id: `row-${key}`, operation_id: 'op-1', organization_key: key,
  organization: { key, name: `${key} org`, short_label: key.toUpperCase(), branch: 'USA', color: '', adhoc: false },
  platform_ids: [], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: {}, poc_name: '', poc_phone: '', poc_email: '', notes: '',
  created_by: '', updated_by: '', created_at: '', updated_at: '',
});
const PHASE: Phase = {
  id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I',
  supported_participant_id: null,
  placements: { 'row-a': 's1', 'row-b': 's1' },
  requirements: [{ id: 'r0', a: 'row-a', b: 'row-b' }],
};

describe('the layout engine when its chunk fails to load', () => {
  it('says why the picture could not be laid out, then lays it out on the next ask', async () => {
    const entries = phaseRequirements(PHASE, MODEL, ['a', 'b'].map(unit));
    render(<PhasePicture model={MODEL} phase={PHASE} sites={SITES} entries={entries} />);
    // The state element is there from the first render, saying it is laying out; the reason arrives with the failure.
    const reason = await screen.findByTestId('phase-layout-reason');
    expect(reason).toHaveTextContent('Outdated Optimize Dep');
    expect(screen.getByTestId('phase-layout-state')).toHaveTextContent('Could not lay out the picture. Reload the page to try again.');
    expect(chunk.builds).toBe(1);

    // The failure was not kept: the next layout builds the engine again and gets one.
    const input = { locations: [{ id: 's1', name: 'ISB', unitIds: ['row-a', 'row-b'] }], units: [
      { id: 'row-a', label: 'A', branch: 'USA', assetLines: 1, supported: false },
      { id: 'row-b', label: 'B', branch: '', assetLines: 1, supported: false },
    ], requirements: [{ id: 'r0', a: 'row-a', b: 'row-b', status: 'direct' as const, text: 'X' }] };
    const laid = await layoutPhase(input, { width: 1200 });
    expect(laid.cards.map((c) => c.id).sort()).toEqual(['row-a', 'row-b']);
    expect(chunk.builds).toBe(2);
  });
});
