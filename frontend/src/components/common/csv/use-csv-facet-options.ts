import { useMemo } from 'react';

import { hasPaceCard } from '@/components/pace/pace-constants';
import { useContractFiscalYears, useSections } from '@/services';
import {
  CSV_KIT_TYPE_OPTIONS,
  CSV_MODEL_OPTIONS,
  CSV_STATUS_OPTIONS,
  type CsvFacetOption,
  type CsvFacetParam,
} from './csv-domains';

export interface CsvFacetOptions {
  /** Options per query parameter, which is what the facet checklists render. */
  byParam: Record<CsvFacetParam, CsvFacetOption[]>;
  /** Every section. This is the squadron list Nets accepts. */
  sections: CsvFacetOption[];
  /**
   * The subset that runs a PACE card.
   *
   * Two lists, not one, because the two section-scoped domains accept different
   * ones: `radionet` only checks that the section exists, while a PACE export
   * for a squadron with no card has nothing to return. Offering one list for
   * both would put squadrons in the PACE dropdown whose download is empty.
   */
  paceSections: CsvFacetOption[];
}

/**
 * Resolves every facet vocabulary the dialog can need.
 *
 * No-arg on purpose. The dialog now shows several datasets at once, so it cannot
 * know which facets it needs before rendering them - and resolving per-dataset
 * would mean a hook whose work changes as datasets are ticked. Both queries are
 * already cached by the pages that use them, so this costs a cache read, and the
 * dialog is only mounted while open.
 */
export function useCsvFacetOptions(): CsvFacetOptions {
  const { data: sectionsData } = useSections();
  const { data: fiscalYearsData } = useContractFiscalYears();

  return useMemo(() => {
    const toOption = (s: { key: string; label: string; color: string }): CsvFacetOption => ({
      value: s.key,
      label: s.label,
      color: s.color,
    });
    const all = sectionsData ?? [];
    const sections = all.map(toOption);

    return {
      byParam: {
        sections,
        statuses: CSV_STATUS_OPTIONS,
        models: CSV_MODEL_OPTIONS,
        types: CSV_KIT_TYPE_OPTIONS,
        fy: (fiscalYearsData ?? []).map((fy) => ({ value: fy, label: fy })),
      },
      sections,
      paceSections: all.filter(hasPaceCard).map(toOption),
    };
  }, [sectionsData, fiscalYearsData]);
}
