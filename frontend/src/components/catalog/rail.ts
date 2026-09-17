/**
 * The width of the left rail on every catalog surface: the facet rail on
 * browse, the equipment list on the sheet and editor pages.
 *
 * One number on purpose. They were 232, 200 and 240, and the banner's
 * vertical rule, which sits on the rail's edge, moved between pages as a
 * reader went browse to sheet to editor. With one width the title block,
 * the rule and the rail all hold still across the transition. 240 because
 * it is the widest of the three, so nothing that fit before stops fitting.
 */
export const CATALOG_RAIL_W = 240;
