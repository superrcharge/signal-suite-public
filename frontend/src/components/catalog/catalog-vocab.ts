/**
 * The controlled vocabularies the catalog editor offers, in the order it offers
 * them.
 *
 * These lived as page-private constants in `catalog-editor-page.tsx` until the
 * browse facets needed them too, and the ordering is the reason they had to
 * move rather than be retyped: bands read in *frequency* order, not
 * alphabetical, so a facet that sorted them itself would print C, HF, K, Ka, Ku
 * and be wrong in a way nobody would call a bug. One declaration, two readers -
 * the same argument `compare-params.ts` makes for itself.
 *
 * Note what these are NOT: a closed set. `operational_mode` is `TEXT[]` and
 * `orbit` is `TEXT`, so the database admits anything and CSV-imported rows
 * already carry values outside this file (`fixed`, `on the move`). These are
 * what the editor *offers*, which is why the facets derive their values from
 * the records on screen and use this list only to order them.
 */

export const SATCOM_BAND_OPTS = ['S', 'C', 'X', 'Ku', 'K', 'Ka'];
export const RADIO_BAND_OPTS = ['L', 'S', 'C', 'HF', 'UHF', 'VHF'];
export const ORBIT_OPTS = ['GEO', 'MEO', 'LEO'];
export const OPMODE_OPTS = ['COTM', 'COTP'];
