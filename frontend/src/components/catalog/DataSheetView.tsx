import type { Equipment, EquipmentData } from '@/types';
import { DataSheet } from './DataSheet';
import { HeroBlock } from './HeroBlock';
import { SectionBlock } from './SectionBlock';
import { SpecTable } from './SpecTable';
import { SwapBlock } from './SwapBlock';
import { StandardSpecsTable } from './StandardSpecsTable';
import { FrequencyTable } from './FrequencyTable';
import { CompatibilityMatrix } from './CompatibilityMatrix';
import { FeaturesBlock } from './FeaturesBlock';
import { AccessoriesList } from './AccessoriesList';
import { EMPTY_VALUE } from '@/utils';

function buildDocNumber(eq: Equipment): string {
  if (eq.doc_number) return eq.doc_number;
  const prefix = eq.terminal_type === 'radio' ? 'SIG-RTO-' : 'SIG-SAT-';
  return prefix + (eq.id ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

interface DataSheetViewProps {
  equipment: Equipment;
  showPageBreak?: boolean;
  pageBreakAt?: number;
  /** See DataSheet's `elevated`. Only the editor's Live Preview sets it. */
  elevated?: boolean;
}

export function DataSheetView({ equipment: eq, showPageBreak = false, pageBreakAt, elevated = false }: DataSheetViewProps) {
  const data = eq.data ?? ({} as EquipmentData);
  const isRadio = eq.terminal_type === 'radio';

  const opModeRows = isRadio ? [] : [{
    label: 'Operational Mode',
    value: Array.isArray(eq.operational_mode) ? eq.operational_mode.join(' + ') : (eq.operational_mode ?? EMPTY_VALUE),
  }];
  const rfRows = [...opModeRows, ...(data.rf_specs ?? [])];

  const today = new Date().toLocaleDateString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).toUpperCase();

  return (
    <DataSheet docNumber={buildDocNumber(eq)} date={today} page="1 of 1" showPageBreak={showPageBreak} pageBreakAt={pageBreakAt} elevated={elevated}>
      <HeroBlock
        equipmentId={eq.photo_url ? eq.id : undefined}
        photoUrl={eq.photo_url}
        nomenclature={eq.nomenclature}
        nickname={eq.nickname}
        oneLiner={eq.one_liner}
        make={eq.make}
        operationalMode={eq.operational_mode}
        services={data.services}
        waveforms={data.waveforms}
        terminalType={eq.terminal_type}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: '6px 28px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionBlock title="Physical Specifications" hideDivider>
            <StandardSpecsTable standardSpecs={data.standard_specs} terminalType={eq.terminal_type} />
            {data.physical_specs && data.physical_specs.length > 0 && (
              <div style={{ marginTop: 6 }}><SpecTable rows={data.physical_specs} borderSide="none" /></div>
            )}
          </SectionBlock>
          <div style={{ paddingTop: 6 }}><SwapBlock swap={data.swap} /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionBlock title="RF Specifications" hideDivider>
            <FrequencyTable bands={data.bands} terminalType={eq.terminal_type} />
          </SectionBlock>
          {rfRows.length > 0 && (
            <div style={{ paddingTop: 6 }}><SpecTable rows={rfRows} borderSide="bottom" /></div>
          )}
        </div>
      </div>

      {isRadio && (
        <div style={{ padding: '10px 28px 0' }}>
          <SectionBlock title="Waveform / Radio Compatibility" hideDivider>
            <CompatibilityMatrix
              waveforms={data.waveforms}
              comparisons={data.compatibility?.comparisons}
            />
          </SectionBlock>
        </div>
      )}

      {data.features && data.features.length > 0 && (
        <div style={{ padding: '10px 28px 0' }}>
          <SectionBlock title="Features" hideDivider>
            <FeaturesBlock features={data.features} />
          </SectionBlock>
        </div>
      )}

      {isRadio && (
        <div style={{ padding: '10px 28px 0' }}>
          <SectionBlock title="Recommended Accessories" hideDivider>
            <AccessoriesList accessories={data.accessories} />
          </SectionBlock>
        </div>
      )}

      <div style={{ padding: '10px 28px 40px' }}>
        <SectionBlock title="Use Cases" hideDivider>
          {data.use_cases ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)', margin: 0 }}>
              {data.use_cases}
            </p>
          ) : (
            <div style={{
              border: '1px dashed var(--border-soft)',
              background: 'rgba(0,0,0,0.02)',
              padding: '16px 18px',
              fontFamily: 'var(--font-body)', fontSize: 13.5,
              color: 'var(--fg-3)', fontStyle: 'italic', lineHeight: 1.5,
            }}>
              Mission profiles, deployment scenarios, and common configurations for this terminal.
              {' '}<strong style={{ color: 'var(--fg-2)', fontStyle: 'normal' }}>[ Awaiting input ]</strong>
            </div>
          )}
        </SectionBlock>
      </div>
    </DataSheet>
  );
}
