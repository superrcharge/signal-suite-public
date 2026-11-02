import type { Role } from '@/types/roles';

/**
 * Static data for the in-app FAQ / help dialog.
 *
 * Every `steps` entry is copied verbatim from the component that renders it -
 * see the file:line table in the PR/commit that introduced this file for the
 * source of each label. Do not paraphrase a label when editing this file;
 * re-read the component instead.
 */
export interface HelpTopic {
  /** Stable kebab slug, unique across ALL groups. */
  id: string;
  /** e.g. "How do I add a SATCOM terminal?" */
  question: string;
  /**
   * Ordered UI labels; the component joins them with a chevron.
   *
   * Almost every entry is a literal on-screen label, copied from the component
   * that renders it. The exception is a step the reader has to choose rather
   * than click - "your squadron", "your record" - which is written in lower
   * case so it reads as a placeholder beside the literals. Those steps are not
   * optional decoration: a path that starts at the control instead of the page
   * assumes the reader already found the page, which is the one thing someone
   * opening this dialog has not done.
   *
   * Optional, because a "who can ..." question has no path to walk. Forcing one
   * produced a single-item step list that rendered as a bare page name and read
   * as an instruction to go there - which for the role questions was actively
   * wrong, since the answer is a fact about permissions, not a destination.
   */
  steps?: string[];
  /**
   * Renders the five roles and what each grants, from ROLE_OPTIONS, instead of
   * a step list. One topic uses this: "What can each role do?".
   */
  showRoleTable?: boolean;
  /** At most two sentences. Omit unless it prevents a real mistake. */
  note?: string;
  /**
   * How the note reads, not how loudly it shouts.
   *
   * Defaults to 'tip', which is the honest default: most notes here are a
   * handy extra ("you can also edit a cell in place"), not a hazard. Amber was
   * briefly applied to all 22 of them, and a warning colour on a helpful aside
   * tells the reader to brace for a problem that is not there - do that 22
   * times and the colour stops meaning anything, which costs you the five
   * notes where it genuinely matters.
   *
   * Use 'caution' only when the note says the reader cannot do something, or
   * cannot undo something.
   */
  tone?: 'tip' | 'caution';
  /** Who may perform it. 'all' = any signed-in user. */
  roles: Role[] | 'all';
  /** Destination for a "Take me there" button. */
  route?: string;
  /** Set only when following `route` without this permission lands on an error or a refusal. */
  gate?: 'canWrite' | 'canWriteRadio' | 'canWritePace' | 'isAdmin';
  /** Synonyms the question text misses: "dish", "radio", "squadron". */
  keywords?: string[];
}

export interface HelpGroup {
  id: string;
  title: string;
  topics: HelpTopic[];
}

/**
 * Group order mirrors the app's own page picker - Dashboard, Stats, Terminals,
 * Kits, Catalog, PACE, Operations, Contracts, Users, Settings - so the help list
 * and the nav teach the same shape and neither has to be learned twice. The
 * Operations group follows PACE and the Sections group (Settings) follows it.
 * Import & Export follows, being a header control rather than a page, and Using
 * Help after it, for the same reason.
 *
 * Contracts sits in the picker between PACE and Users and has no group here,
 * which is the one deliberate break in that mirroring. The FAQ is curated
 * content rather than an obligation to cover every route; the decision is
 * recorded as a `no-topic-wanted` exception in `help-content.test.ts`, because
 * the route-coverage check would otherwise read it as the kind of silent gap
 * it exists to catch.
 *
 * Comms Library sits directly after Equipment Catalog, which is where the
 * sidebar puts it. It is its own group rather than more topics in the catalog
 * group because the two answer different questions: the catalog group is about
 * one piece of equipment, and the library group is about the reference tables
 * every piece of equipment draws on.
 *
 * Roles & Access is deliberately last despite Users sitting mid-list in the
 * picker. It answers "why can I not do this", which is asked once and then
 * never again; the task groups above it are asked constantly. Ordering it by
 * the nav would put the least-repeated question at the top of the dialog.
 *
 * Order is not asserted anywhere, so it is a judgement call recorded here
 * rather than a constraint. Nothing breaks if it changes - it just stops
 * matching the nav, which is the only reason it is this way.
 */
export const HELP_GROUPS: HelpGroup[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    topics: [
      {
        id: 'dashboard-overview',
        question: 'What is on the Dashboard?',
        steps: ['Dashboard'],
        note: 'One tile for each page you can open, in the same order as the page menu, so what you see depends on your role, and clicking a tile opens that page. The Signal Suite mark at the top right brings you back here from anywhere.',
        roles: 'all',
        route: '/dashboard',
        keywords: ['home page', 'landing page', 'start', 'tiles', 'Signal Suite'],
      },
    ],
  },
  {
    id: 'stats',
    title: 'Stats',
    topics: [
      {
        id: 'stats-overview',
        question: 'What is on the Stats page?',
        steps: ['Stats'],
        note: 'Terminals and kits counted by status, by type and by section, plus Catalog tiles for SATCOM, Radios and Waveforms. Admin and editor also see a Contracts panel, whose tiles count what expires within 30, 60 and 90 days.',
        roles: 'all',
        route: '/stats',
        keywords: ['counts', 'totals', 'summary', 'expiring', 'by section', 'catalog', 'contracts'],
      },
      {
        id: 'stats-tiles',
        question: 'Can I click a number on the Stats page?',
        steps: ['Stats', 'a tile'],
        note: 'Every tile is a link. Terminal, kit and catalog tiles open their list already filtered - Available under Terminals shows only those - while Waveforms opens the Comms Library and the contract tiles open the Contracts page, both unfiltered.',
        roles: 'all',
        route: '/stats',
        keywords: ['drill down', 'filtered list', 'tile', 'stat'],
      },
    ],
  },
  {
    id: 'terminals',
    title: 'Terminals & Kits',
    topics: [
      {
        id: 'add-terminal',
        question: 'How do I add a SATCOM terminal?',
        steps: ['@add', '@add-terminal', 'Terminal Name', 'Add Terminal'],
        roles: ['admin', 'editor'],
        route: '/terminals?drawer=add',
        gate: 'canWrite',
        keywords: ['new terminal', 'dish', 'satcom'],
      },
      {
        id: 'edit-terminal',
        question: 'How do I edit a terminal?',
        steps: ['Terminals', 'Edit terminal', 'Save Changes'],
        note: 'You can also click directly into any cell in the table to edit it inline - Enter saves, Escape cancels.',
        roles: ['admin', 'editor'],
        route: '/terminals',
        keywords: ['pencil', 'inline edit', 'update terminal'],
      },
      {
        id: 'delete-terminal',
        question: 'How do I delete a terminal?',
        steps: ['Terminals', 'Edit terminal', 'Delete', 'Delete'],
        note: 'The second Delete confirms the action in a "Delete terminal?" dialog - this cannot be undone.',
        tone: 'caution',
        roles: ['admin', 'editor'],
        route: '/terminals',
        keywords: ['remove terminal'],
      },
      {
        id: 'add-note-terminal',
        question: 'How do I add a note to a terminal?',
        steps: ['Terminals', 'Notes', 'Save Changes'],
        note: 'Click the Notes cell in the table - it opens the edit drawer with the Notes field already focused.',
        roles: ['admin', 'editor'],
        route: '/terminals',
        keywords: ['comment', 'annotation'],
      },
      {
        id: 'add-kit',
        question: 'How do I add a kit?',
        steps: ['@add', '@add-kit', 'Kit Name', 'Add Kit'],
        roles: ['admin', 'editor'],
        route: '/kits?drawer=add',
        gate: 'canWrite',
        keywords: ['new kit', 'remote kit', 'ifk', 'atk'],
      },
      {
        id: 'edit-kit',
        question: 'How do I edit a kit?',
        steps: ['Kits', 'Edit kit', 'Save Changes'],
        note: 'Like terminals, you can also click directly into a cell in the table to edit it inline.',
        roles: ['admin', 'editor'],
        route: '/kits',
        keywords: ['pencil', 'update kit'],
      },
      {
        id: 'kit-networks',
        question: 'What do the BLACK, SECRET, and TS checkboxes mean?',
        steps: ['Kits', 'Edit kit', 'Networks'],
        note: 'The three are independent - a kit can be on any combination of them, or none. Ticking one does not untick the others.',
        roles: ['admin', 'editor'],
        route: '/kits',
        keywords: ['black network', 'secret', 'topsecret', 'classification', 'kit type'],
      },
      {
        id: 'delete-kit',
        question: 'How do I delete a kit?',
        steps: ['Kits', 'Edit kit', 'Delete', 'Delete'],
        note: 'The second Delete confirms the action in a "Delete kit?" dialog - this cannot be undone.',
        tone: 'caution',
        roles: ['admin', 'editor'],
        route: '/kits',
        keywords: ['remove kit'],
      },
      {
        id: 'filter-terminals-kits',
        question: 'How do I narrow the terminals or kits list?',
        steps: ['Terminals', 'Available'],
        note: 'Type in the search box, click a count in the strip across the top such as Available to show only that status, or pick a model (a kit type on Kits) in the toolbar. The sidebar does the same from any page: a model under Starshield, Paradigm or OneWeb, Remote, IFK or ATK under Kits:, and a squadron under By Section:, which keeps its filter when you switch between Terminals and Kits.',
        roles: 'all',
        route: '/terminals',
        keywords: ['search', 'filter', 'status', 'model', 'variant', 'kit type', 'by section', 'section filter', 'sidebar', 'mini', 'hp', 'hornet', 'ragno', 'remote', 'ifk', 'atk'],
      },
      {
        id: 'tag-terminal',
        question: 'How do I tag terminals for an operation?',
        steps: ['Terminals', 'Edit terminal', 'Tag', 'Save Changes'],
        note: 'Pick an existing tag or type a new one - a terminal carries one tag, and clearing the box removes it. Once any terminal carries a tag, a tag filter joins the toolbar on the Terminals page.',
        roles: ['admin', 'editor'],
        route: '/terminals',
        keywords: ['tag', 'label', 'operation', 'group terminals', 'tag filter'],
      },
      {
        id: 'manage-tags',
        question: 'How do I create or delete a tag?',
        steps: ['Settings', 'Tags', 'New tag name', 'Add tag'],
        note: 'The Tags panel lists every tag in the system, including ones typed straight onto a terminal, with how many terminals use each. Deleting one removes it from all of them, and the confirmation says how many that is.',
        roles: ['admin', 'editor'],
        // The Tags tab, not the page: Settings opens on Sections for these roles.
        route: '/settings?tab=tags',
        gate: 'canWrite',
        keywords: ['tag', 'tags panel', 'delete tag', 'new tag', 'operation'],
      },
    ],
  },
  {
    id: 'catalog',
    title: 'Equipment Catalog',
    topics: [
      {
        id: 'filter-catalog',
        question: 'How do I narrow the catalog down?',
        steps: ['Catalog', 'Filters', 'a heading', 'a value'],
        note: 'Every heading starts closed, and each value carries the number of records it would leave you. The same Filters tile is what closes the rail again.',
        roles: 'all',
        route: '/catalog',
        keywords: ['filter', 'facet', 'narrow', 'search catalog', 'band', 'manufacturer', 'refine'],
      },
      {
        id: 'filter-not-specified',
        question: 'How do I find records that are missing a value?',
        steps: ['Catalog', 'Filters', 'a heading', 'Not specified'],
        note: 'Every heading ends with a counted Not specified toggle, which is the fastest way to find the catalog gaps worth filling in.',
        roles: 'all',
        route: '/catalog',
        keywords: ['blank', 'empty field', 'missing data', 'not specified', 'gaps'],
      },
      {
        id: 'share-filtered-catalog',
        question: 'Can I share a filtered catalog with someone?',
        steps: ['Catalog', 'Filters', 'a value', 'copy the address bar'],
        note: 'Filters live in the address, so the link you paste opens the same narrowed catalog for whoever you send it to. Clear (n) in the rail header drops the ones this tab is applying.',
        roles: 'all',
        route: '/catalog',
        keywords: ['share link', 'bookmark', 'url', 'send', 'clear filters'],
      },
      {
        id: 'paused-filters',
        question: 'Why does the catalog say a filter is held for another tab?',
        steps: ['Catalog', 'Filters', 'Held for the RADIO tab'],
        note: 'A waveform filter cannot be asked of a SATCOM terminal, so switching tabs holds it at the top of the rail rather than applying it, and switching back restores it. Each held filter is a chip whose cross drops it, and Clear paused (n) drops them all once more than one is held.',
        roles: 'all',
        route: '/catalog',
        keywords: ['paused', 'held filter', 'held for another tab', 'clear paused', 'not filtering', 'tab', 'why no results'],
      },
      {
        id: 'add-catalog-record',
        question: 'How do I add a record to the catalog?',
        steps: ['Catalog', 'Editor', '+ SATCOM', 'Create'],
        note: 'The rail carries + SATCOM and + RADIO. An RTO sees + RADIO alone and lands on a blank radio record, since only radio equipment is editable by that role.',
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog/editor',
        gate: 'canWriteRadio',
        keywords: ['new equipment', 'new terminal spec', '+ RADIO'],
      },
      {
        id: 'edit-catalog-card',
        question: 'How do I edit a catalog card?',
        steps: ['Catalog', 'your record', 'Edit'],
        note: 'Click any equipment card to open its sheet, then use Edit - or open the editor directly and pick a record from the rail. An RTO can edit radio records only, so a SATCOM sheet shows no Edit and a SATCOM record in the editor shows a refusal.',
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog',
        keywords: ['update spec sheet', 'equipment card'],
      },
      {
        id: 'upload-photo',
        question: 'How do I upload a photo for a piece of equipment?',
        steps: ['Catalog', 'Editor', 'your record', 'Photo', 'Upload Photo'],
        note: 'Save the record first, then upload - the Photo controls appear once the item has been added to the catalog. Once it has a photo, the same button reads Replace Photo.',
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog/editor',
        gate: 'canWriteRadio',
        keywords: ['equipment image', 'crop photo'],
      },
      {
        id: 'remove-photo',
        question: 'How do I remove a photo from a piece of equipment?',
        steps: ['Catalog', 'Editor', 'your record', 'Photo', 'Remove photo'],
        note: 'Remove photo is the small red × on the corner of the photo, shown once a record has one. It asks first, because the image is deleted rather than hidden: to get it back, upload it again.',
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog/editor',
        gate: 'canWriteRadio',
        keywords: ['delete photo', 'clear equipment image'],
      },
      {
        id: 'print-data-sheet',
        question: 'How do I print a data sheet?',
        steps: ['Catalog', 'your record', 'Print / Save PDF'],
        note: 'The export menu beside Print / Save PDF offers a .png, copy to clipboard, and a PowerPoint slide of the sheet.',
        roles: 'all',
        route: '/catalog',
        keywords: ['spec sheet pdf', 'equipment printout'],
      },
      {
        id: 'compare-equipment',
        question: 'How do I compare equipment side by side?',
        steps: ['Catalog', 'Compare', 'pick equipment', 'Parameters'],
        note: 'A blank cell means the field applies but nobody filled it in - a catalog gap you can close. A lowercase n/a means the parameter does not exist for that kind of equipment, and the comparison lives in the URL, so it can be bookmarked or shared.',
        roles: 'all',
        route: '/catalog/compare',
        keywords: ['side by side', 'matrix', 'versus', 'n/a'],
      },
      {
        id: 'compare-pick-equipment',
        question: 'How do I choose what goes into a comparison?',
        steps: ['Compare', 'Equipment', 'SATCOM', 'ALL'],
        note: 'Pick records one at a time, or ALL at the start of the SATCOM or Radio row for the whole group - there is no limit, and SATCOM and radio can sit side by side. Columns appear in the order you add them, and the small cross on a column header drops it again.',
        roles: 'all',
        route: '/catalog/compare',
        keywords: ['add column', 'remove column', 'pick records', 'all satcom', 'all radio', 'column order'],
      },
      {
        id: 'compare-default-rows',
        question: 'Why does my comparison not show frequencies?',
        steps: ['Compare', 'Parameters', 'Frequencies'],
        note: 'A new comparison opens on Identification, Standard Specs and Size / Weight / Power. Frequencies, Waveforms and Services are each one click away in the same panel.',
        roles: 'all',
        route: '/catalog/compare',
        keywords: ['missing rows', 'bands', 'eirp', 'add parameters', 'default'],
      },
      {
        id: 'compare-missing-specs',
        question: 'Why is one of my spec rows missing from Compare and Filters?',
        steps: ['Catalog', 'Editor', 'your record'],
        note: 'The additional physical and RF spec rows in sections 07 and 08 are typed in freehand per record, so no two records share a key to line them up on. Only the numbered fields above them can be compared or filtered.',
        tone: 'caution',
        roles: 'all',
        route: '/catalog',
        keywords: ['missing row', 'custom spec', 'free text', 'additional specs', 'cannot compare'],
      },
      {
        id: 'print-compare',
        question: 'How do I print or share a comparison?',
        steps: ['Compare', 'Print / Save PDF', 'Paper / Dark', 'Print / Save PDF'],
        note: 'Paper is an ink-on-white palette for a physical printer; Dark matches the screen and suits a PDF you save to share digitally. The PNG, copy and slide export beside it always stay dark, the red dashed guides on the live page mark the exact printed page breaks, and Fit to one page shrinks the printed sheet, columns and rows together, down to 70%, so it prints on one page when it can; the compare page shows the resulting page count beside the toggle.',
        roles: 'all',
        route: '/catalog/compare',
        keywords: ['print comparison', 'save pdf', 'paper', 'dark', 'page guides'],
      },
    ],
  },
  {
    id: 'comms-library',
    title: 'Comms Library',
    topics: [
      {
        id: 'comms-library-what',
        question: 'What is the Comms Library?',
        steps: ['Comms Library', 'Waveforms'],
        note: "Four global reference tables - Waveforms, Services, Transports and Platforms - picked from the chips at the top. This is not the Nets Library, which holds one squadron's nets and lives under PACE, and the organizations that join an operation are kept in Settings, Organizations rather than here.",
        roles: 'all',
        route: '/catalog/comms-library',
        keywords: ['rf library', 'reference', 'global', 'waveforms', 'services', 'transports', 'platforms', 'what is'],
      },
      {
        id: 'comms-library-moved',
        question: 'Where did the Waveforms and Services tabs on the catalog go?',
        steps: ['Comms Library'],
        note: 'They moved out of the catalog browse tabs into the Comms Library, which is where Transports and Platforms joined them. An old link to the catalog tabs still works and brings you here.',
        roles: 'all',
        route: '/catalog/comms-library',
        keywords: ['moved', 'missing tab', 'waveforms tab', 'services tab', 'gone', 'old link'],
      },
      {
        id: 'add-waveform',
        question: 'How do I add a waveform?',
        steps: ['@add', '@add-waveform', '+ Add a waveform', '+ Add to Waveform Library'],
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog/comms-library',
        // No gate. `gate` means "following this route without the permission
        // lands on an error or a refusal", and the Comms Library refuses
        // nobody - it is a read surface whose panes hide their own write
        // controls. Gating it here would withhold the button from the very
        // reader the note is addressing. `roles` still says who may write.
        keywords: ['radio waveform', 'waveform library'],
      },
      {
        id: 'add-service',
        question: 'How do I add a service?',
        steps: ['@add', '@add-service', '+ Add a service', '+ Add to Service Library'],
        note: 'An RTO can browse the Service Library, but the create and edit controls are for admin and editor only.',
        roles: ['admin', 'editor'],
        route: '/catalog/comms-library?lib=services',
        // No gate - see add-waveform. This topic's note speaks directly to an
        // rto ("An RTO can browse the Service Library"), and a `canWrite` gate
        // hid the button from exactly that reader.
        //
        // 'cir mir' deliberately does NOT appear here. It used to, which made
        // a search for the one thing readers actually hunt for land on the
        // library - the one screen that does not hold it. It belongs to
        // `where-cir-mir`, which answers the question instead of hosting it.
        keywords: ['satcom service', 'service library'],
      },
      {
        id: 'add-transport',
        question: 'How do I add a transport?',
        steps: ['@add', '@add-transport', '+ Add a transport', '+ Add to Transport Library'],
        note: 'A transport is a non-SATCOM path a PACE tier can name, so anyone who builds PACE cards can add one. Only a viewer is left reading it.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library?lib=transports',
        // No gate - see add-waveform.
        keywords: ['fibre', 'cellular', 'manet', 'hf', 'transport library'],
      },
      {
        id: 'transport-kind',
        question: 'How do I add a transport kind that is not in the list?',
        steps: ['Comms Library', 'Transports', '+ Add a transport', 'Kind', '+ Add new kind…'],
        note: 'The last entry in the Kind dropdown swaps it for a free-text box, so a path nobody has named yet does not need a code change.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library?lib=transports',
        keywords: ['new kind', 'custom kind', 'fibre', 'cellular', 'manet', 'other', 'dropdown'],
      },
      {
        id: 'add-platform',
        question: 'How do I add an aircraft, ship or ground station?',
        steps: ['@add', '@add-platform', '+ Add a platform', '+ Add to Platform Library'],
        note: "A platform is someone else's asset - an F-35, a DDG, a ground station - entered once so it can be a column in the compatibility matrix. Toggle every branch that operates it (OGA is another government agency), then tick the waveforms it carries, the catalog radios it carries, or both: a carried radio's waveforms follow its catalog record, so editing the radio updates the matrix.",
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library?lib=platforms',
        // No gate - see add-waveform.
        keywords: ['platform', 'aircraft', 'ship', 'airframe', 'ground station', 'type', 'platform library', 'category', 'branch', 'service', 'oga', 'army', 'navy', 'air force', 'marines', 'space force', 'coast guard'],
      },
      {
        id: 'library-owner',
        question: 'How do I record who owns a service or transport provider?',
        steps: ['Comms Library', 'Services', 'your entry', 'Owned by', 'Country', 'Save'],
        note: 'Services and Transports both carry Owned by and Country, so a commercial or foreign provider is named on the row beside its name. Both are optional free text, and the search box matches them too.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library?lib=services',
        // No gate - see add-waveform. Services admit admin and editor only,
        // transports every role but viewer; the union is the honest Who line.
        keywords: ['owner', 'owned by', 'country', 'provider', 'foreign', 'commercial', 'nationality'],
      },
      {
        id: 'filter-platforms',
        question: 'How do I find a platform in a long Platform Library?',
        steps: ['Comms Library', 'Platforms', 'Category', 'Type'],
        note: 'The Category row filters by operating branch and the Type row by kind of platform, each chip carrying its count; pick several in a row for any of them, and Clear drops the chips. The Search platforms box beside the count narrows the list by text on top of that.',
        roles: 'all',
        route: '/catalog/comms-library?lib=platforms',
        keywords: ['filter platforms', 'search platforms', 'branch', 'category', 'type', 'aircraft', 'ship', 'narrow'],
      },
      {
        id: 'compatibility-matrix',
        question: 'How do I see which assets are compatible?',
        steps: ['Compatibility', 'Columns'],
        note: "Narrow by any number of branches and types under Filters, then pick columns from Columns, grouped by branch, or Select all, and read across a waveform's row to see which of them support it. A platform supports a waveform whether it lists it directly or carries a radio that does.",
        roles: 'all',
        route: '/catalog/compatibility',
        keywords: ['compatibility', 'matrix', 'interoperability', 'crossover', 'common waveform', 'joint force', 'pace', 'service', 'branch', 'category', 'filter'],
      },
      {
        id: 'compatibility-checks',
        question: 'What do the coloured checks in the compatibility matrix mean?',
        steps: ['Compatibility'],
        note: 'Each branch has its own colour, matching its chip in the column header, and a platform operated by two branches draws two checks on every waveform it supports, one per branch - filter to one branch and only that check is drawn. A catalog radio belongs to no branch and draws a plain check, and the key beneath the matrix names every colour on screen.',
        roles: 'all',
        route: '/catalog/compatibility',
        keywords: ['colour', 'color', 'check', 'tick', 'two checks', 'legend', 'key', 'branch colour', 'joint'],
      },
      {
        id: 'compatibility-hide-empty',
        question: 'How do I hide waveforms nothing in the matrix supports?',
        steps: ['Compatibility', 'Hide empty rows'],
        note: 'It drops every waveform row with no check in the columns on screen, and pressing it again brings them back. The printout always leaves those rows off.',
        roles: 'all',
        route: '/catalog/compatibility',
        keywords: ['empty rows', 'hide rows', 'unsupported', 'shorter matrix', 'blank rows'],
      },
      {
        id: 'print-compatibility',
        question: 'How do I print the compatibility matrix?',
        steps: ['Compatibility', 'Print / Save PDF', 'Print / Save PDF'],
        note: 'Print / Save PDF previews the pages it will print from the branches, types and columns on screen, empty rows left off, continuing across and down pages as needed; Fit to one page, beside it, shrinks the sheet onto one page when it can, and the page count says how many it will take. The share icon saves the matrix as a slide, a copied image or a .png instead.',
        roles: 'all',
        route: '/catalog/compatibility',
        keywords: ['print matrix', 'save pdf', 'compatibility sheet', 'powerpoint', 'png', 'share', 'fit to one page', 'pages'],
      },
      {
        id: 'print-comms-library',
        question: 'How do I print or share a library?',
        steps: ['Comms Library', 'Print / Save PDF', 'Print / Save PDF'],
        note: 'Print / Save PDF opens a read-only view of the open library, with no add form and no pencils, ready for the print dialog; the share icon beside it saves the table as a slide, a copied image or a .png. For ink-on-white, the CSV export in the header prints better.',
        roles: 'all',
        route: '/catalog/comms-library',
        keywords: ['print library', 'print waveforms', 'print services', 'print transports', 'print platforms', 'save pdf', 'share library'],
      },
      {
        id: 'edit-library-entry',
        question: 'How do I edit or remove a library entry?',
        steps: ['Comms Library', 'a library', 'your entry'],
        note: 'The pencil on a row, or a click anywhere on it, edits it in place; the red cross removes it after a confirm. Who sees them depends on the library: waveforms admin, editor and RTO, services admin and editor, and transports and platforms every role but viewer.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library',
        // No gate - see add-waveform. No one roles list is true of all four
        // libraries, so the note names them per library and `roles` is the union.
        keywords: ['delete waveform', 'delete service', 'delete transport', 'delete platform', 'edit waveform', 'rename', 'remove', 'pencil'],
      },
      {
        id: 'library-entry-in-use',
        question: 'What happens to records when I remove or rename a library entry?',
        steps: ['Comms Library', 'a library', 'your entry'],
        note: 'Removing a service, transport or platform leaves the equipment records and PACE cards using it as they are, but a waveform that a catalog radio or a platform still carries cannot be removed - its row shows the count and names. Renaming a waveform abbrev carries the new spelling onto every record that used the old one.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library',
        keywords: ['in use', 'safe to delete', 'rename abbrev', 'cannot remove waveform', 'carried by'],
      },
      {
        id: 'where-cir-mir',
        question: 'Where do I set CIR and MIR?',
        steps: ['Catalog', 'Editor', 'your record', 'Services Available'],
        note: 'Not in the Service Library - rates are per terminal, so they live on the service rows of that record in the editor. Best Effort (no committed CIR/MIR) clears and disables the four rate fields.',
        tone: 'caution',
        // Not rto: CIR/MIR rows are on SATCOM records, which an rto cannot edit.
        // The gate stays canWriteRadio because it describes the ROUTE - the
        // editor refuses a viewer or planner outright - not this task.
        roles: ['admin', 'editor'],
        route: '/catalog/editor',
        gate: 'canWriteRadio',
        keywords: ['cir mir', 'cir', 'mir', 'bandwidth', 'committed rate', 'best effort', 'mbps', 'data rate'],
      },
    ],
  },
  {
    id: 'pace',
    title: 'Nets & PACE',
    topics: [
      {
        id: 'add-net',
        question: 'How do I add a net?',
        steps: ['@add', '@add-net', 'your squadron'],
        note: 'The drawer opens where you are, with Squadron as its first field, pre-selected when the page belongs to one. Create lands on that squadron\'s library with the new net on screen.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/nets',
        // No gate, for the add-waveform reason: /nets and /pace are squadron
        // pickers that refuse nobody, and the pages behind them hide their own
        // write controls. The same holds for every topic below routed there.
        keywords: ['new channel', 'radio net', 'jem', 'mpu5'],
      },
      {
        id: 'edit-or-delete-net',
        question: 'How do I edit or delete a net?',
        steps: ['PACE', 'Nets Library', 'your squadron', 'Edit net', 'Save Changes'],
        note: 'A confirmation appears before anything is removed, so a misclick costs nothing.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/nets',
        keywords: ['remove net', 'update net', 'delete net'],
      },
      {
        id: 'print-nets',
        question: 'How do I print or share a squadron\'s nets?',
        steps: ['Nets Library', 'Print / Save PDF', 'Print / Save PDF'],
        note: 'Print / Save PDF opens a read-only view of the radio tab you had open, ready for the print dialog; the share icon beside it saves the table as a slide, a copied image or a .png. The CSV export in the header is the better print for ink-on-white.',
        roles: 'all',
        route: '/nets',
        keywords: ['print nets', 'print net list', 'save pdf', 'share nets', 'nets slide'],
      },
      {
        id: 'assign-net-channel',
        question: 'How do I assign a net to a channel?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'JEM channels', 'Save'],
        note: "Pick a net from a channel's dropdown. Once one is assigned, TX and RX override fields appear beneath it.",
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        keywords: ['channel wheel', 'radio', 'mpu5 channels'],
      },
      {
        id: 'set-pace-options',
        question: 'How do I set the P/A/C/E options?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'PACE options', 'Source', 'Save'],
        note: 'Each tier - Primary, Alternate, Contingency, Emergency - picks one source (equipment, transport, or a custom label) plus a free-text Detail line.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        keywords: ['primary alternate contingency emergency', 'tiers', 'pace tiles'],
      },
      {
        id: 'upload-emblem',
        question: 'How do I upload a squadron emblem?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'Squadron emblem', 'Upload'],
        note: 'Choosing the file opens Crop Emblem, whose round window is exactly what the wheel hub shows: zoom, drag, and pick a Black or White background to fill the circle around a logo on a square. It uploads on Apply Crop with an Emblem uploaded message and no Save, and belongs to the squadron, so its CONUS and OCONUS cards both show it.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        keywords: ['squadron patch', 'logo', 'card header', 'crop emblem', 'zoom', 'circle', 'background'],
      },
      {
        id: 'remove-emblem',
        question: 'How do I remove a squadron emblem?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'Squadron emblem', 'Remove'],
        note: 'Remove sits beside the current emblem and takes effect at once, with an Emblem removed message and no Save needed. Both the CONUS and OCONUS cards lose it.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        keywords: ['delete emblem', 'clear patch', 'remove logo'],
      },
      {
        id: 'pace-hide-preview',
        question: 'How do I give the card editor more room?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'Hide Preview'],
        note: 'Hide Preview folds away the live card beside the form, and the same button, now reading Show Preview, brings it back.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        keywords: ['preview', 'show preview', 'live card', 'wider form', 'more space'],
      },
      {
        id: 'print-pace-card',
        question: 'How do I print a PACE card?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Print / Save PDF', 'Print / Save PDF'],
        roles: 'all',
        route: '/pace',
        keywords: ['pdf', 'comms card', 'wheel printout'],
      },
      {
        id: 'switch-theater',
        question: 'Where is the OCONUS version of a card or nets list?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'OCONUS'],
        note: 'The same CONUS / OCONUS switch is on the Nets Library, and Edit opens the card you are looking at.',
        roles: 'all',
        route: '/pace',
        keywords: ['oconus', 'conus', 'theater', 'overseas', 'deployed', 'home station'],
      },
      {
        id: 'net-theater-radio',
        question: 'How do I use one net in both theaters, or on both radios?',
        steps: ['PACE', 'Nets Library', 'your squadron', 'Edit net', 'Theater', 'Both', 'Save Changes'],
        note: 'Theater (CONUS, OCONUS or Both) decides which list and which card a net appears on, and Carried by (JEM, MPU5 or Both) does the same for the two wheels, so a shared net is entered once. A new net starts in the theater the page is showing.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/nets',
        keywords: ['theater', 'carried by', 'both', 'conus', 'oconus', 'jem', 'mpu5', 'shared net'],
      },
      {
        id: 'net-missing-from-channel',
        question: "Why is a net missing from a channel's dropdown?",
        steps: ['PACE', 'Nets Library', 'your squadron', 'Edit net', 'Carried by'],
        note: "A channel offers only the squadron's nets that its radio carries and that serve the card's theater, so check Carried by and Theater on the net. A net moved to the other theater after it was assigned stops the card saving, with a message that it is outside the card's theater, until that channel is changed.",
        tone: 'caution',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/nets',
        keywords: ['missing net', 'net not listed', 'dropdown empty', 'wrong theater', 'wrong radio', 'outside its theater', 'cannot save card'],
      },
      {
        id: 'pace-changed-marks',
        question: 'How do I show what changed on a revised comms card?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'the tick beside a field', 'Save'],
        note: 'A ticked value prints red on the card, the print sheet and both exports, so whoever receives the revised card can see what moved; the marks are set by hand, not worked out by comparing saves. Type a label such as v2 in Version to print it after the date, and use Clear all marks to start the next revision.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        keywords: ['changed', 'red', 'version label', 'revision', 'what moved', 'clear all marks'],
      },
      {
        id: 'net-wont-delete',
        question: 'Why won\'t a net delete?',
        steps: ['PACE', 'Nets Library', 'your squadron', 'Delete net'],
        note: "The net is assigned to a channel on a squadron's wheel, and the error names which one. Unassign it from that wheel first.",
        tone: 'caution',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/nets',
        keywords: ['delete blocked', 'wheel conflict', 'net in use'],
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    topics: [
      {
        id: 'add-operation',
        question: 'How do I add an operation?',
        steps: ['Operations', 'Add Operation'],
        note: 'Give it a name and, if you like, an acronym and notes; there are no dates, because operations are fluid, and the same drawer, opened again with Edit, holds its Phases (Phase I to IV to begin with) and its Locations, the places units sit, such as ISB, FSB or MSS. It then appears as a tile on the Operations page and as a row under Operations in the sidebar.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/operations?drawer=add',
        gate: 'canWritePace',
        keywords: ['new operation', 'exercise', 'event', 'participants', 'phases', 'locations', 'acronym'],
      },
      {
        id: 'edit-operation',
        question: 'How do I edit or delete an operation?',
        steps: ['Operations', 'the operation', 'Edit'],
        note: 'Edit in the operation\'s banner opens its drawer, where you change the name, acronym and notes, use Add phase and Add location, and take one out with its X, which asks first ("Remove phase?" says its asset marks go with it, "Remove location?" that its units fall under No location) and takes effect when you Save. Delete, at the bottom left, asks "Delete operation?" and then removes the operation and its participants for good.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/operations',
        // No gate: the operation page refuses nobody, so a canWritePace gate
        // here would fail "never gates a topic whose route refuses nobody";
        // the banner simply has no Edit for a reader without the flag.
        keywords: ['rename', 'delete operation', 'add phase', 'remove phase', 'reorder', 'add location', 'remove location', 'acronym', 'notes'],
      },
      {
        id: 'add-organization',
        question: 'How do I add an organization that can check in to an operation?',
        steps: ['Operations', 'the operation', 'Participants', 'Join Operation', 'Add to library'],
        note: 'The wizard lists the organizations already in the library, Other names a one-off partner on this operation alone, and Add to library creates a new organization every operation can then pick; Add organization in Settings, Organizations is the other place to add one, and the Import and export control in the header opens with Organizations already chosen there. The key is a lowercase slug that never changes, the name, short label, branch and colour are what an operation shows for it (the section link is stored, not shown), and editing or deleting one is in Settings, Organizations.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/operations',
        // No gate - see join-operation: the operation page refuses nobody,
        // and the Participants popup hides Join Operation from a reader
        // without the flag.
        keywords: ['organization', 'organisation', 'squadron', 'unit', 'agency', 'participant', 'check in', 'add to library'],
      },
      {
        id: 'edit-organization',
        question: 'How do I edit or delete an organization?',
        steps: ['Settings', 'Organizations', 'Edit organization', 'Save'],
        note: 'The pencil on an organization\'s row opens the Add to library form with its key fixed, and Delete asks "Delete organization?" before removing it from the library for good. Delete is off while an operation has the organization joined, and its tooltip says how many, so remove it from those operations first.',
        tone: 'caution',
        roles: ['admin', 'editor', 'rto', 'planner'],
        // The tab, not the page: Settings opens on Sections for an admin or
        // editor. Gated because a reader without canWritePace has no
        // Organizations tab and lands on the data panel instead.
        route: '/settings?tab=organizations',
        gate: 'canWritePace',
        keywords: ['edit organization', 'delete organization', 'rename organization', 'remove organization', 'library'],
      },
      {
        id: 'join-operation',
        question: 'How does an organization join an operation?',
        steps: ['Operations', 'the operation', 'Participants', 'Join Operation'],
        note: 'Open Participants and choose Join Operation, or use the prompt on an empty Loadout; step 1, naming the organization, is enough to join, and anything else can be added later from Participants, where Edit reopens the same steps. Step 2 declares the platforms it brings before the radios (skipped when dismounted), step 3 picks equipment, step 4 sets the phases each platform and piece of equipment is in, step 5 picks transports and their phases, and step 6 sets, phase by phase, where the unit sits and who it must talk to, with the live status; contact and review close it.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/operations',
        // No gate: the operation page refuses nobody, and the Participants
        // popup hides Join Operation from a reader without canWritePace.
        keywords: ['join', 'check in', 'check-in', 'participant', 'participants', 'organization', 'squadron', 'other', 'ad hoc', 'poc', 'point of contact', 'terminals', 'radios', 'wizard', 'platform', 'platforms', 'dismounted', 'airframe', 'vessel', 'vehicle', 'phase', 'location', 'must talk', 'requirement'],
      },
      {
        id: 'participant-edit-conflict',
        question: 'Why did my check-in edit not save?',
        steps: ['Operations', 'the operation', 'Participants'],
        note: 'Someone else saved that unit while you had it open, so Save is refused with "this check-in was changed by someone else; reload it and try again" in red above the buttons, and the wizard stays open on your picks. Note what you changed, close the wizard, then open the unit with Edit in Participants again: it now shows their version, and your changes go on top of it.',
        tone: 'caution',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/operations',
        // No gate, as for join-operation: the operation page refuses nobody.
        keywords: ['conflict', 'someone else', 'changed', 'reload', 'stale', 'not saved', 'refused', 'error', 'save'],
      },
      {
        id: 'participants-list',
        question: 'Who has joined an operation?',
        steps: ['Operations', 'the operation', 'Participants'],
        note: 'The count is on the button, and the list shows each organization with what it brought and its POC; a row opens that unit\'s tab in Loadout, which says the same thing in full, and Matrix says it by waveform. Remove, the X beside Edit, asks first and then takes the organization out of the operation along with its phase marks, placements and requirements.',
        roles: 'all',
        route: '/operations',
        // No gate: the list is a read, and a reader sees it without the
        // Edit and Join Operation controls.
        keywords: ['participants', 'who joined', 'joined', 'organizations', 'list', 'count', 'poc', 'edit participant', 'remove', 'loadout', 'tabs'],
      },
      {
        id: 'post-rfi',
        question: 'How do I raise an RFI to the other units?',
        steps: ['Operations', 'the operation', 'RFIs', 'Post RFI'],
        note: 'Pick which unit you are asking as, write the question and press Post; the button on the banner then shows how many are open. Only you can resolve an RFI you posted.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/operations',
        // No gate: the operation page refuses nobody.
        keywords: ['rfi', 'request for information', 'question', 'ask', 'post', 'raise', 'asking as', 'unit'],
      },
      {
        id: 'answer-rfi',
        question: 'How do I answer or close an RFI?',
        steps: ['Operations', 'the operation', 'RFIs', 'Reply', 'Resolve'],
        note: 'Reply adds to the thread under the question, and Resolve, shown only to whoever posted it, moves it into Resolved at the bottom of the list. Everyone can read the list; Reply and Resolve need a writer role.',
        roles: 'all',
        route: '/operations',
        // No gate: reading is open to every role, and a reader simply
        // does not see Reply or Resolve.
        keywords: ['rfi', 'reply', 'answer', 'resolve', 'close', 'resolved', 'thread', 'comment', 'request for information'],
      },
      {
        id: 'operation-loadout-view',
        question: 'What does a unit\'s tab in Loadout show?',
        steps: ['Operations', 'the operation', 'Loadout'],
        note: 'Each unit that joined has a tab listing its Platforms, Equipment and Transports, then By phase, a row per phase with its Location, a TIER SELECT mark where that phase supports it, and who it Must talk to, then its POC. Before anyone has joined, a writer sees a Join Operation button in its place and everyone else sees "No one has joined yet."',
        roles: 'all',
        route: '/operations',
        // No gate: the tabs are a read, drawn for every role; Edit on a tab
        // and the empty view's Join Operation are write-gated inside it.
        keywords: ['loadout', 'tab', 'unit', 'by phase', 'location', 'tier select', 'must talk', 'poc', 'point of contact', 'platforms', 'equipment', 'transports', 'empty', 'no one has joined'],
      },
      {
        id: 'operation-matrix-view',
        question: 'Who can talk to whom in an operation?',
        steps: ['Operations', 'the operation', 'Matrix'],
        note: 'One column per organization that joined, one row per waveform, SATCOM service or transport any of them brings, and a cell naming the assets that provide it, so it answers what everyone could talk on rather than who must; open a column to split it into one per asset, and use the phase buttons to see one phase or All phases. Loadout switches back to the tabs, and the Equipment Catalog\'s Compatibility matrix is the wider comparison with platforms and catalog radios.',
        roles: 'all',
        route: '/operations',
        // No gate: the matrix is a read, drawn for every role.
        keywords: ['matrix', 'compatibility', 'who can talk', 'interoperability', 'common waveform', 'loadout', 'view', 'operation matrix', 'columns', 'phase'],
      },
      {
        id: 'operation-web-view',
        question: 'How do I see who must talk to whom in a phase?',
        steps: ['Operations', 'the operation', 'Web'],
        note: 'Web draws one phase at a time: locations as boxes holding each organization\'s card, and a line for every pair that must talk, green for Direct (a shared waveform, service or transport in that phase), amber dashed for Relay (only through other units) and red for No link, with the Tier select, the unit that phase supports, edged in amber. Show narrows it to All, the Gaps or Focus on one unit, and View plan, for those who can edit, opens the phase\'s plan beside it (the chip then reads Hide plan), whose Tier select, Locations and Must talk sections set the supported unit, where each unit sits and who must talk to whom, kept together by one Save.',
        roles: 'all',
        route: '/operations',
        // No gate: the picture is a read, drawn for every role; only the
        // View plan chip is write-gated, inside it.
        keywords: ['web', 'phase', 'tier select', 'must talk', 'requirement', 'direct', 'relay', 'no link', 'gaps', 'focus', 'location', 'plan', 'who must talk', 'hide plan'],
      },
      {
        id: 'print-operation',
        question: 'How do I print or share an operation\'s phases?',
        steps: ['Operations', 'the operation', 'Web', 'Print / Save PDF'],
        note: 'Print / Save PDF opens one landscape page per phase, drawn in the Show mode and on the unit you had chosen, and the phase buttons above the pages print one phase alone. The share icon beside it saves the whole deck as a .pptx, one slide per phase in the Show mode on screen, where each unit and line is a PowerPoint shape and a line follows its unit when you drag it, or the phase on screen as a copied image or a .png.',
        roles: 'all',
        route: '/operations',
        keywords: ['print operation', 'save pdf', 'share operation', 'phase slides', 'pptx', 'powerpoint', 'deck', 'web view'],
      },
      {
        id: 'print-operation-matrix',
        question: 'How do I print or share an operation\'s Matrix?',
        steps: ['Operations', 'the operation', 'Matrix', 'Print / Save PDF'],
        note: 'Print / Save PDF opens on the phase, or All phases, that the Matrix was showing and the phase buttons above the pages switch to another, a grid too wide or too tall for a page carrying on to the next under the same header. The share icon beside it saves what the Matrix is showing as a .pptx, where the grid is a PowerPoint table you can edit, or the grid on screen, with any organization you opened, as a copied image or a .png.',
        roles: 'all',
        route: '/operations',
        keywords: ['print matrix', 'matrix pdf', 'share matrix', 'matrix slides', 'matrix pptx', 'powerpoint', 'table', 'deck', 'matrix view', 'all phases'],
      },
    ],
  },
  {
    id: 'sections',
    title: 'Sections',
    topics: [
      {
        id: 'create-section-inline',
        question: 'How do I create a section without leaving the terminal or kit drawer?',
        steps: ['@add', '@add-terminal', 'Section', 'Create section…', 'Section Name', 'Save Section'],
        roles: ['admin', 'editor'],
        route: '/terminals?drawer=add',
        gate: 'canWrite',
        keywords: ['new section', 'squadron'],
      },
      {
        id: 'edit-recolor-section',
        question: 'How do I rename or recolor a section?',
        steps: ['Settings', 'Edit section', 'Color', 'Save'],
        note: "Two entry points reach the same dialog: the Sections panel in Settings, and the pencil that appears when you hover a section under the sidebar's By Section: group.",
        roles: ['admin', 'editor'],
        route: '/settings',
        gate: 'canWrite',
        keywords: ['rename section', 'recolor', 'sidebar pencil'],
      },
      {
        id: 'delete-section-in-use',
        question: 'What happens when I delete a section that still has terminals in it?',
        steps: ['Settings', 'Edit section', 'Delete', 'Move terminals to', 'Move terminals & delete'],
        note: 'A section that still has nets or a saved PACE card is refused outright, with a message naming what is there - that planning is never moved to another section, so delete or move it first. Otherwise the dialog swaps to a reassignment prompt: pick another section for the terminals and kits, or leave Move terminals to on None and the button reads Clear terminals & delete.',
        tone: 'caution',
        roles: ['admin', 'editor'],
        route: '/settings',
        gate: 'canWrite',
        keywords: ['reassign terminals', 'section in use', 'refused', 'nets', 'pace card'],
      },
      {
        id: 'section-pace-card',
        question: 'How do I give a section a PACE card?',
        steps: ['Settings', 'Edit section', 'PACE squadron', 'Save'],
        note: 'Turning this switch on is what gives the section its own Nets library and a JEM/MPU5 comms card for CONUS and another for OCONUS.',
        roles: ['admin', 'editor'],
        route: '/settings',
        gate: 'canWrite',
        keywords: ['squadron', 'enable pace', 'nets library', 'wheel'],
      },
    ],
  },
  {
    id: 'csv',
    title: 'Import & Export',
    topics: [
      {
        id: 'export-data',
        question: 'How do I export data?',
        steps: ['@share', '@export', 'Download CSV'],
        roles: 'all',
        keywords: ['csv download', 'download data'],
      },
      {
        id: 'import-data',
        question: 'How do I import data?',
        steps: ['@share', '@import'],
        note: 'One file loads into one list at a time. Download the Template first to see the exact columns it expects.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        keywords: ['csv upload', 'bulk import'],
      },
      {
        id: 'settings-import-export',
        question: 'What is the Import/Export tab in Settings?',
        steps: ['Settings', 'Import/Export', 'Export'],
        note: 'It lists every dataset that is not tied to a squadron, one row each, with its own Export, Template and Import buttons, so you do not pick a dataset first. Nets and PACE channels are not listed there, because the Import and export control in the header asks which squadron.',
        roles: 'all',
        // No route: plain /settings refuses a reader without canWrite and
        // this tab is open to every role, so a gated button would hide it
        // from the viewers who can use it and an ungated one is refused.
        keywords: ['settings', 'csv', 'every dataset', 'one row', 'organizations csv'],
      },
      {
        id: 'import-choose-file',
        question: 'How do I load a filled-in CSV?',
        steps: ['@share', '@import', 'Dataset', 'Choose file'],
        note: 'Dataset lists only what your role can import into, and Nets also asks for a Squadron, since its rows load into the one you pick. The file uploads as soon as you choose it; a clean file closes with a message saying how many rows came in.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        keywords: ['upload csv', 'import file', 'dataset', 'squadron', 'nets import'],
      },
      {
        id: 'import-skipped-rows',
        question: 'Why were some rows skipped on import?',
        steps: ['@share', '@import', 'Choose file', 'Copy report'],
        note: 'The report lists every skipped row by row number and name with its reason, and everything not listed was imported, so a second file should carry only the rows you corrected. If every skipped row is one of the template\'s EXAMPLE rows, delete those from your file.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        keywords: ['rejected rows', 'skipped rows', 'import errors', 'failed rows', 'example rows', 'copy report'],
      },
      {
        id: 'import-hidden-viewer',
        question: "Why don't I see the Import button?",
        steps: ['@share', '@template'],
        note: 'A viewer cannot change data, so the menu offers no Import. Template is still there for everyone, so you can always see which columns a file needs.',
        roles: 'all',
        keywords: ['viewer permissions', 'missing button', 'template only'],
      },
    ],
  },
  {
    // The header's own ? control, a header control like Import & Export and
    // so placed after it.
    id: 'help',
    title: 'Using Help',
    topics: [
      {
        id: 'search-help',
        question: 'How do I search the help?',
        steps: ['@help', 'Search help...'],
        note: 'Type the words you mean, in any order and even half typed, rather than a whole question: only the topics matching the most of your words are shown, best first, and each of your words is marked where it appears. A topic whose match is not in its question says matched in the steps, matched in the note or matched a keyword, so open it to find the mark.',
        roles: 'all',
        keywords: ['find', 'search', 'words', 'ranked', 'best match', 'highlight', 'marked', 'faq', 'question'],
      },
    ],
  },
  {
    id: 'roles',
    title: 'Roles & Access',
    topics: [
      {
        id: 'roles-overview',
        question: 'What can each role do?',
        // No route on purpose. This used to point at /users, which is admin-only,
        // so the one topic most likely to be opened by someone confused about
        // their permissions handed a viewer a button to a page that errors. The
        // answer is rendered here instead, where every role can read it.
        showRoleTable: true,
        roles: 'all',
        keywords: ['permissions', 'access levels', 'admin', 'editor', 'viewer', 'rto', 'planner', 'privileges'],
      },
      {
        id: 'roles-where-shown',
        question: 'Where do I see my role?',
        note: 'Your role is the coloured badge just left of your avatar in the header, on every page. Click the avatar for the account menu, which shows the same badge under your name and email with a line on what that role can do.',
        roles: 'all',
        keywords: ['badge', 'chip', 'avatar', 'account menu', 'header', 'permissions', 'which role', 'access'],
      },
      {
        id: 'roles-write-assets',
        question: 'Who can add or edit terminals, kits, and contracts?',
        note: 'Admin and editor. Add Terminal and Add Kit sit in the + in the app header beside Add Net, the four Comms Library rows and Add Operation, each shown to the roles that can write it; Add Contract is the exception, a button on the Contracts page itself.',
        roles: ['admin', 'editor'],
        keywords: ['write access', 'add terminal', 'add kit', 'add contract', 'inventory'],
      },
      {
        id: 'roles-catalog-edit',
        question: 'Who can edit the equipment catalog?',
        note: 'Admin and editor can open and save any record. An RTO can open and save only radio records - a SATCOM record shows a permission message instead.',
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog/editor',
        gate: 'canWriteRadio',
        keywords: ['equipment permissions', 'radio', 'satcom', 'rto'],
      },
      {
        id: 'roles-pace-write',
        question: 'Who can write nets and PACE cards?',
        note: 'Admin, editor, RTO and planner all write nets and PACE cards, the transports and platforms a card plans around, and operations with the organizations that join them. Planner writes nothing beyond those, and reads everything else.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        keywords: ['nets permissions', 'channels', 'planner', 'operations', 'organizations'],
      },
      {
        id: 'roles-admin-only',
        question: 'Who can manage users and read the audit log?',
        note: 'Admin only. Users is offered in the page menu and Audit log as a Settings tab to an admin alone, and opening Users by URL as anyone else shows a plain refusal rather than a blank page, so the boundary is visible.',
        roles: ['admin'],
        route: '/settings?tab=audit',
        gate: 'isAdmin',
        keywords: ['user management', 'audit log', 'admin only', 'history'],
      },
      {
        id: 'roles-change-role',
        question: "How do I change someone's role?",
        steps: ['Users'],
        note: "Click a user's role badge in the table to open the role menu. You cannot change your own role - the control is disabled on your own row.",
        roles: ['admin'],
        route: '/users',
        gate: 'isAdmin',
        keywords: ['promote', 'demote', 'permissions'],
      },
      {
        id: 'roles-last-admin',
        question: 'Why can I not demote the last admin?',
        steps: ['Users'],
        note: 'The app always keeps one admin, so demoting the only one is refused with a message to promote another user to admin first. Nobody can change their own role either, so to hand over, promote the new admin and have them change yours.',
        tone: 'caution',
        roles: ['admin'],
        route: '/users',
        gate: 'isAdmin',
        keywords: ['last admin', 'only admin', 'hand over', 'demote admin', 'refused'],
      },
      {
        id: 'audit-filter',
        question: 'How do I find who changed a record, and when?',
        steps: ['Settings', 'Audit log', 'Resource', 'Action'],
        note: 'Resource narrows the log to one kind of record, from Terminals to PACE cards and Users, and Action to Create, Update, Delete or Role change; the two combine. Newest entries come first.',
        roles: ['admin'],
        // The tab, not /audit: that route only redirects here now.
        route: '/settings?tab=audit',
        gate: 'isAdmin',
        keywords: ['audit filter', 'history', 'who changed', 'role change', 'resource', 'action'],
      },
      {
        id: 'roles-planner-nav',
        question: "Why don't I see Terminals and Kits in the nav?",
        note: 'The Terminals and Kits trackers are kept by admin and editor, so for viewer, RTO and planner the page menu, the Dashboard and the sidebar leave them out, along with By Section. Reads are still open underneath - this hides the nav entry, it does not deny anything.',
        roles: 'all',
        keywords: ['planner view', 'hidden nav', 'missing menu items'],
      },
      {
        id: 'roles-contracts-nav',
        question: "Why don't I see Contracts?",
        note: 'Contracts are internal, so only admin and editor see the sidebar group, the page-menu entry and the Stats panel. Reads are still open underneath - this hides the nav, it does not deny anything.',
        roles: ['admin', 'editor'],
        keywords: ['contracts hidden', 'missing contracts', 'internal only', 'hidden nav'],
      },
    ],
  },
];
