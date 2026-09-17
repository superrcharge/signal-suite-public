export { DataSheet } from './DataSheet';
export { DataSheetView } from './DataSheetView';
export { SectionBlock, BulletList } from './SectionBlock';
export { SpecTable } from './SpecTable';
export { StatusPill } from './StatusPill';
export { FeaturesBlock } from './FeaturesBlock';
export { AccessoriesList } from './AccessoriesList';
export { SwapBlock } from './SwapBlock';
export { StandardSpecsTable } from './StandardSpecsTable';
export { FrequencyTable } from './FrequencyTable';
export { CompatibilityMatrix } from './CompatibilityMatrix';
export { HeroBlock } from './HeroBlock';
export { BrowseGrid } from './BrowseGrid';
export { PhotoCropModal } from './PhotoCropModal';
export { EquipmentPhoto } from './EquipmentPhoto';
export { CompareMatrix, CellValue } from './CompareMatrix';
export { CompareSheet } from './CompareSheet';
export { CompareControls, CompareToggles } from './CompareControls';
export {
  DARK,
  INK,
  cmp,
  contrastRatio,
  paletteVars,
  type ComparePalette,
  type PaletteKey,
} from './compare-palette';
export {
  COMPARE_GROUPS,
  COMPARE_PARAMS,
  DEFAULT_PARAM_IDS,
  GROUP_LABELS,
  appliesToType,
  bandCompareParams,
  cellFor,
  paramIsVisible,
  paramsForSelection,
} from './compare-params';
export type { CompareCell, CompareGroup, CompareParam, CompareScope } from './compare-params';
export {
  FIT_PARAM,
  IDS_PARAM,
  PARAMS_PARAM,
  encodeIds,
  encodeParams,
  groupRows,
  hasStaleIds,
  resolveChosenIds,
  resolveParams,
  resolveSelection,
} from './compare-selection';
export type { CompareRowGroup } from './compare-selection';
export {
  FIT_FLOOR,
  FIT_TEXT_FLOOR,
  LABEL_COL,
  PAGE_H,
  PAGE_W,
  PRINT_MARGIN_IN,
  PRINT_PAGE_CSS,
  balanceColumns,
  compareDensity,
  fitScale,
  fitTextScale,
  paginateColumns,
  printDensity,
  seamIndices,
} from './compare-page-guides';
export type { ColumnPagination, CompareDensity } from './compare-page-guides';
export { PAGE_SAFETY, paginateRows } from './compare-pagination';
export type { PrintRowItem, RowPaginationInput } from './compare-pagination';
export { usePrintPagination } from './use-print-pagination';
export type { UsePrintPaginationArgs, UsePrintPaginationResult } from './use-print-pagination';

export { FacetSidebar } from './FacetSidebar';
export { CATALOG_RAIL_W } from './rail';
export { CATALOG_FACETS, WEIGHT_BUCKETS } from './facet-params';
export type { FacetKind, FacetSpec, FacetValue, RangeBucket } from './facet-params';
export {
  EMPTY_SELECTION,
  FACET_PREFIX,
  applyFacets,
  buildFacetModels,
  clearApplied,
  clearPaused,
  clearTerm,
  decodeFacets,
  describeTerm,
  partitionSelection,
  tabFacets,
  setRange,
  toggleNone,
  toggleValue,
  urlTermCount,
  writeFacets,
} from './facet-selection';
export type {
  FacetModel,
  FacetSelection,
  FacetTab,
  FacetTerm,
  PausedFacet,
  PausedTerm,
  SelectionSplit,
} from './facet-selection';
