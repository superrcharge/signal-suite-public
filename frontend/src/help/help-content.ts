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
   * briefly applied to every one of them, and a warning colour on a helpful
   * aside tells the reader to brace for a problem that is not there - do that
   * on every note and the colour stops meaning anything, which costs you the
   * few notes where it genuinely matters.
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
 * Group order mirrors the app's own page picker - Dashboard, Terminals, Kits,
 * Catalog, PACE, then Sections (the Settings page) - so the help list and the
 * nav teach the same shape and neither has to be learned twice. Import & Export
 * follows, being a header control rather than a page.
 *
 * Contracts sits in the picker between PACE and Users and has no group here,
 * which is the one deliberate break in that mirroring. The FAQ is curated
 * content rather than an obligation to cover every route; the decision is
 * recorded as a `no-topic-wanted` exception in `help-content.test.ts`, because
 * the route-coverage check would otherwise read it as the kind of silent gap
 * it exists to catch.
 *
 * Comms Library sits directly after Equipment Catalog. The sidebar nests it
 * inside the catalog group, between Editor and Compatibility; here it is its
 * own group because the two answer different questions: the catalog group is
 * about one piece of equipment, and the library group is about the reference
 * tables every piece of equipment draws on.
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
        question: 'What is on the dashboard?',
        steps: ['Dashboard'],
        note: 'Counts for terminals and kits, broken down by status and by family. Admins and editors also see contract tiles counting what expires within 30, 60 and 90 days.',
        roles: 'all',
        route: '/dashboard',
        keywords: ['home page', 'counts', 'totals', 'summary', 'expiring'],
      },
      {
        id: 'dashboard-tiles',
        question: 'Can I click a number on the dashboard?',
        steps: ['Dashboard', 'a tile'],
        note: 'Every count is a link to the list it counts, already filtered - clicking Available under Terminals opens the terminals list showing only those.',
        roles: 'all',
        route: '/dashboard',
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
        keywords: ['black network', 'secret', 'ts', 'top secret', 'classification', 'kit type'],
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
        question: 'Why does the catalog say a filter is paused?',
        steps: ['Catalog', 'Filters', 'Paused'],
        note: 'A waveform filter cannot be asked of a SATCOM terminal, so switching tabs holds it rather than applying it. It is kept, not dropped, so switching back restores it.',
        roles: 'all',
        route: '/catalog',
        keywords: ['paused', 'held filter', 'not filtering', 'tab', 'why no results'],
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
        note: 'Click any equipment card to open its sheet, then use Edit - or open the editor directly and pick a record from the rail. An RTO can edit radio records only, and sees a refusal on a SATCOM one.',
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog',
        keywords: ['update spec sheet', 'equipment card'],
      },
      {
        id: 'upload-photo',
        question: 'How do I upload a photo for a piece of equipment?',
        steps: ['Catalog', 'Editor', 'your record', 'Photo', 'Upload Photo'],
        note: 'Save the record first, then upload. The Photo controls appear once the item has been added to the catalog.',
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog/editor',
        gate: 'canWriteRadio',
        keywords: ['equipment image', 'crop photo'],
      },
      {
        id: 'print-data-sheet',
        question: 'How do I print a data sheet?',
        steps: ['Catalog', 'your record', 'Print / Save PDF'],
        note: 'The share icon beside Print / Save PDF offers a .png, copy to clipboard, and a PowerPoint slide of the sheet.',
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
        steps: ['Compare', 'Equipment (n)', 'SATCOM'],
        note: 'There is no limit, and SATCOM and radio can sit side by side. Columns appear in the order you add them, and the small cross on a column header drops it again.',
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
        note: 'Four global reference tables - Waveforms, Services, Transports and Platforms - picked from the chips at the top. This is not the Nets Library, which holds one squadron’s nets and lives under PACE.',
        roles: 'all',
        route: '/catalog/comms-library',
        keywords: ['rf library', 'reference', 'global', 'waveforms', 'services', 'transports', 'platforms', 'what is'],
      },
      {
        id: 'comms-library-moved',
        question: 'Where did the Waveforms and Services tabs on the catalog go?',
        steps: ['Comms Library'],
        note: 'They moved out of the catalog browse tabs into the Comms Library, which is where Transports joined them. An old link to the catalog tabs still works and brings you here.',
        roles: 'all',
        route: '/catalog/comms-library',
        keywords: ['moved', 'missing tab', 'waveforms tab', 'services tab', 'gone', 'old link'],
      },
      {
        id: 'add-waveform',
        question: 'How do I add a waveform?',
        steps: ['Comms Library', 'Waveforms', '+ Add to Waveform Library'],
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
        steps: ['Comms Library', 'Services', '+ Add to Service Library'],
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
        steps: ['Comms Library', 'Transports', '+ Add to Transport Library'],
        note: 'A transport is a non-SATCOM path a PACE tier can name, so anyone who builds PACE cards can add one. Only a viewer is left reading it.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library?lib=transports',
        // No gate - see add-waveform.
        keywords: ['fibre', 'cellular', 'manet', 'hf', 'transport library'],
      },
      {
        id: 'transport-kind',
        question: 'How do I add a transport kind that is not in the list?',
        steps: ['Comms Library', 'Transports', 'Kind', '+ Add new kind…'],
        note: 'The last entry in the Kind dropdown swaps it for a free-text box, so a path nobody has named yet does not need a code change.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library?lib=transports',
        keywords: ['new kind', 'custom kind', 'fibre', 'cellular', 'manet', 'other', 'dropdown'],
      },
      {
        id: 'add-platform',
        question: 'How do I add an aircraft, ship or coalition asset?',
        steps: ['Comms Library', 'Platforms', '+ Add to Platform Library'],
        note: 'A platform is someone else’s asset - an F-35, a DDG, a coalition vehicle - entered once so it can be a column in the compatibility matrix. Tick the waveforms it carries, the catalog radios it carries, or both: a carried radio’s waveforms follow its catalog record, so editing the radio updates the matrix.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/catalog/comms-library?lib=platforms',
        // No gate - see add-waveform.
        keywords: ['platform', 'aircraft', 'ship', 'airframe', 'coalition', 'joint', 'organic', 'platform library'],
      },
      {
        id: 'compatibility-matrix',
        question: 'How do I see which assets are compatible?',
        steps: ['Compatibility', 'Columns'],
        note: 'Filter by category with the chips and pick the assets you care about as columns, then read across a waveform’s row to see which of them support it. A platform supports a waveform whether it lists it directly or carries a radio that does.',
        roles: 'all',
        route: '/catalog/compatibility',
        keywords: ['compatibility', 'matrix', 'interoperability', 'crossover', 'common waveform', 'joint force', 'pace'],
      },
      {
        id: 'print-compatibility',
        question: 'How do I print the compatibility matrix?',
        steps: ['Compatibility', 'Print / Save PDF', 'Print / Save PDF'],
        note: 'Print / Save PDF opens a landscape preview of exactly the categories and columns you had on screen, with empty rows left off. The share icon beside it saves the matrix as a slide, a copied image or a .png instead.',
        roles: 'all',
        route: '/catalog/compatibility',
        keywords: ['print matrix', 'save pdf', 'compatibility sheet', 'powerpoint', 'png', 'share'],
      },
      {
        id: 'print-comms-library',
        question: 'How do I print or share a library?',
        steps: ['Comms Library', 'Print / Save PDF', 'Print / Save PDF'],
        note: 'Print / Save PDF opens a read-only view of the open library, with no add form and no pencils, ready for the print dialog; the share icon beside it saves the table as a slide, a copied image or a .png. For ink-on-white, a CSV from the header share menu (Export, then Download CSV) prints better.',
        roles: 'all',
        route: '/catalog/comms-library',
        keywords: ['print library', 'print waveforms', 'print services', 'print transports', 'print platforms', 'save pdf', 'share library'],
      },
      {
        id: 'edit-library-entry',
        question: 'How do I edit or remove a library entry?',
        steps: ['Comms Library', 'a library', 'your entry'],
        note: 'The pencil on a row edits it in place; the red cross removes it after a confirm. Removing a service, transport or platform leaves the equipment records and PACE cards using it as they are, but a waveform that a catalog radio or a platform still carries cannot be removed (its row shows the count and names), and renaming a waveform abbrev carries the new spelling onto every record that used the old one.',
        roles: ['admin', 'editor', 'rto'],
        route: '/catalog/comms-library',
        keywords: ['delete waveform', 'delete service', 'delete transport', 'rename', 'remove', 'safe to delete'],
      },
      {
        id: 'where-cir-mir',
        question: 'Where do I set CIR and MIR?',
        steps: ['Catalog', 'Editor', 'your record', 'Services Available'],
        note: 'Not in the Service Library - rates are per terminal, so they live on the service rows of that record in the editor. Best Effort (no committed CIR/MIR) clears and disables the four rate fields.',
        tone: 'caution',
        roles: ['admin', 'editor', 'rto'],
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
        note: 'Add Net always needs a squadron. If you are not already viewing one, it opens the Nets Library picker first.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/nets',
        gate: 'canWritePace',
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
        note: 'Print / Save PDF opens a read-only view of the radio tab you had open, ready for the print dialog; the share icon beside it saves the table as a slide, a copied image or a .png. A CSV from the header share menu (Export, then Download CSV) is the better print for ink-on-white.',
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
        gate: 'canWritePace',
        keywords: ['channel wheel', 'radio', 'mpu5 channels'],
      },
      {
        id: 'set-pace-options',
        question: 'How do I set the P/A/C/E options?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'PACE options', 'Source', 'Save'],
        note: 'Each tier - Primary, Alternate, Contingency, Emergency - picks one source (equipment, transport, or a custom label) plus a free-text Detail line.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        gate: 'canWritePace',
        keywords: ['primary alternate contingency emergency', 'tiers', 'pace tiles'],
      },
      {
        id: 'upload-emblem',
        question: 'How do I upload a squadron emblem?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'Squadron emblem', 'Upload', 'Save'],
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        gate: 'canWritePace',
        keywords: ['squadron patch', 'logo', 'card header'],
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
        id: 'pace-changed-marks',
        question: 'How do I show what changed on a revised comms card?',
        steps: ['PACE', 'JEM/MPU5 Wheels', 'your squadron', 'Edit', 'the tick beside a field', 'Save'],
        note: 'A ticked value prints red on the card, the print sheet and both exports, so whoever receives the revised card can see what moved; the marks are set by hand, not worked out by comparing saves. Type a label such as v2 in Version to print it after the date, and use Clear all marks to start the next revision.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        gate: 'canWritePace',
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
        keywords: ['rename section', 'recolor', 'sidebar pencil'],
      },
      {
        id: 'delete-section-in-use',
        question: 'What happens when I delete a section that still has terminals in it?',
        steps: ['Settings', 'Edit section', 'Delete', 'Move terminals to', 'Move terminals & delete'],
        note: 'A section that still has nets or a saved PACE card is refused outright, with a message naming what is there - that planning is never moved to another section, so delete or move it first. Otherwise the dialog swaps to a reassignment prompt: pick another section for the terminals and kits, or leave them sectionless.',
        tone: 'caution',
        roles: ['admin', 'editor'],
        route: '/settings',
        keywords: ['reassign terminals', 'section in use', 'refused', 'nets', 'pace card'],
      },
      {
        id: 'section-pace-card',
        question: 'How do I give a section a PACE card?',
        steps: ['Settings', 'Edit section', 'PACE squadron', 'Save'],
        note: 'Turning this switch on is what creates the section\'s own Nets library and JEM/MPU5 wheel.',
        roles: ['admin', 'editor'],
        route: '/settings',
        keywords: ['squadron', 'enable pace', 'nets library', 'wheel'],
      },
      {
        id: 'manage-tags',
        question: 'Where do I see or delete a tag?',
        steps: ['Settings', 'Tags', 'Delete tag'],
        note: 'Every tag in the system is listed with how many terminals carry it. Deleting a tag removes it from all of those terminals at once, after a confirm.',
        tone: 'caution',
        roles: ['admin', 'editor'],
        route: '/settings',
        keywords: ['tags', 'tag catalog', 'remove tag', 'label', 'terminal tags'],
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
        id: 'roles-write-assets',
        question: 'Who can add or edit terminals, kits, and contracts?',
        note: 'The + in the app header adds a terminal, a kit or a net from any page. Add Contract is the exception - it is a button on the Contracts page itself.',
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
        note: 'Admin, editor, RTO and planner all write nets and PACE cards. Planner exists for exactly this and writes nothing else.',
        roles: ['admin', 'editor', 'rto', 'planner'],
        route: '/pace',
        keywords: ['nets permissions', 'channels', 'planner'],
      },
      {
        id: 'roles-admin-only',
        question: 'Who can manage users and read the audit log?',
        note: 'Admin only. Neither page is offered in the page menu to any other role, and opening one by URL shows a plain refusal rather than a blank page, so the boundary is visible.',
        roles: ['admin'],
        route: '/audit',
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
        id: 'roles-planner-nav',
        question: "Why doesn't a planner see Terminals and Kits in the nav?",
        note: 'A planner writes nets and PACE cards and reads the catalog, so those surfaces stay out of the way. Reads are still open underneath - this hides the nav entry, it does not deny anything.',
        roles: 'all',
        keywords: ['planner view', 'hidden nav', 'missing menu items'],
      },
      {
        id: 'roles-contracts-nav',
        question: "Why don't I see Contracts?",
        note: 'Contracts are internal, so only admin and editor see the sidebar group, the page-menu entry and the Dashboard panel. Reads are still open underneath - this hides the nav, it does not deny anything.',
        roles: ['admin', 'editor'],
        keywords: ['contracts hidden', 'missing contracts', 'shf only', 'hidden nav'],
      },
    ],
  },
];
