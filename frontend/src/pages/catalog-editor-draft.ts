import type {
  EquipmentService, EquipmentWaveform, CompatibilityComparison,
  EquipmentBand, SpecRow, EquipmentSwap, EquipmentFeature, TerminalType,
} from '@/types';

/**
 * The editor's working copy of an equipment record, and the factory for a blank
 * one.
 *
 * Split out of `catalog-editor-page.tsx` rather than exported from it. The page
 * exports components, and `react-refresh/only-export-components` fails a mixed
 * module - Fast Refresh cannot tell which exports are components, so it
 * full-reloads instead of preserving state. The lint is a warning and this repo
 * runs `--max-warnings 0`, so there was no third option of leaving it.
 *
 * It earns the move on its own terms too: this is the shape the form edits and
 * the shape the save path converts back, with no React in it, and a test that
 * renders `EquipmentFormPane` directly needs a valid draft without rendering
 * the page that would otherwise build one.
 */
export interface EditorDraft {
  id: string;
  nomenclature: string;
  nickname: string;
  one_liner: string;
  doc_number: string;
  photo_url: string;
  make: string;
  terminal_type: TerminalType;
  operational_mode: string[];
  services: EquipmentService[];
  waveforms: EquipmentWaveform[];
  compat_comparisons: CompatibilityComparison[];
  bands: EquipmentBand[];
  standard_specs: Record<string, unknown>;
  physical_specs: SpecRow[];
  rf_specs: SpecRow[];
  swap: EquipmentSwap;
  features: EquipmentFeature[];
  accessories: string;
  use_cases: string;
}

export function blankDraft(type: TerminalType = 'satcom'): EditorDraft {
  const id = 'new-' + Math.random().toString(36).slice(2, 7);
  const standard_specs: Record<string, unknown> = type === 'radio'
    ? { antennaType: '', transmitPower: null, crypto: '', range: null }
    : { antennaType: '', reflector: '', modem: '', orbit: '', bucTransmitPower: null, windTolerance: null, altPntAvailable: null };
  return {
    id, nomenclature: 'New Terminal', nickname: '', one_liner: '',
    doc_number: '', photo_url: '', make: '',
    terminal_type: type, operational_mode: [],
    services: [], waveforms: [], compat_comparisons: [],
    bands: [], standard_specs,
    physical_specs: [], rf_specs: [],
    swap: { size: {}, weight: undefined, power: '' },
    features: [], accessories: '', use_cases: '',
  };
}
