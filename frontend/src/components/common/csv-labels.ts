import { CSV_COLUMNS, type CsvColumn } from '@/generated/csv-columns';

/**
 * Human labels for CSV column keys.
 *
 * These live here rather than in the generated manifest because they are UI
 * copy: "Assigned To" for `owner`, "Kit #" for `kit`, "BLACK" for a boolean
 * network flag. None of that is derivable from a database column name and none
 * of it belongs in Go.
 *
 * Membership and order come from the manifest, which the backend generates from
 * the same declaration the exporter reads. That is the half that used to drift.
 * A key with no entry here degrades to a humanised fallback rather than an empty
 * checkbox, which makes a missing label a cosmetic problem instead of a broken
 * picker. `csv-labels.test.ts` fails when a key has no entry, so it stays a
 * theoretical fallback.
 */
const LABELS: Record<string, string> = {
  id: 'ID',

  // Terminals and kits
  name: 'Name',
  model: 'Model',
  kit: 'Kit #',
  pim: 'PIM #',
  serial: 'Serial #',
  section: 'Section',
  status: 'Status',
  owner: 'Assigned To',
  owner_email: 'Owner Email',
  owner_phone: 'Owner Phone',
  pop_pin: 'PoP Pinned To',
  notes: 'Notes',
  tag: 'Tag',
  type: 'Type',
  black: 'BLACK',
  secret: 'SECRET',
  topsecret: 'TS',
  location: 'Location',

  // Reference libraries: waveforms, services, transports
  abbrev: 'Abbreviation',
  description: 'Description',
  kind: 'Kind',
  provider: 'Provider',

  // Platforms
  designation: 'Designation',
  popular_name: 'Popular Name',
  category: 'Category',
  operator: 'Operator',
  waveform_abbrevs: 'Waveforms',
  equipment_ids: 'Carried Equipment IDs',

  // Equipment catalog
  nomenclature: 'Nomenclature',
  terminal_type: 'Type',
  nickname: 'Nickname',
  make: 'Make',
  one_liner: 'One-liner',
  doc_number: 'Doc #',
  operational_mode: 'Operational Mode',
  photo_url: 'Photo URL',
  data: 'Datasheet (JSON)',

  // PACE channel wheels
  plan_label: 'Wheel',
  channel_number: 'Channel',
  net_name: 'Net Name',
  net_radio_type: 'Net Carried By',
  is_overridden: 'Overridden',
  label_override: 'Label Override',

  // Nets
  net_id: 'Channel #',
  radio_type: 'Radio',
  tx_freq: 'TX',
  rx_freq: 'RX',
  freq_unit: 'Unit',
  roip: 'ROIP',

  // Contracts
  title: 'Contract Title',
  company: 'Company',
  poc_name: 'POC Name',
  poc_email: 'POC Email',
  poc_phone: 'POC Phone',
  pop_start: 'Start Date',
  pop_end: 'End Date',
  execution_quarter: 'Quarter',
  fiscal_year: 'Fiscal Year',
  logform_number: 'Logform #',
  logform_url: 'Logform URL',

  // Server-owned, shared by every domain
  created_by: 'Created By',
  updated_by: 'Updated By',
  updated_at: 'Updated At',
  created_at: 'Created At',
};

/** Per-resource overrides, where one key wants different copy in two places. */
const RESOURCE_LABELS: Record<string, Record<string, string>> = {
  terminals: { name: 'Terminal Name' },
  kits: { name: 'Kit Name' },
  // A net's section column is the owning squadron, and it is export-only.
  nets: { name: 'Net Name', section: 'Squadron' },
  // PACE exports the wheel assignments only, so its section is the squadron the
  // card belongs to and radio_type is which wheel the row sits on.
  'pace-channels': { section: 'Squadron', radio_type: 'Radio' },
};

/** `owner_phone` -> `Owner Phone`. Last-resort fallback only. */
function humanise(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function labelFor(resource: string, key: string): string {
  return RESOURCE_LABELS[resource]?.[key] ?? LABELS[key] ?? humanise(key);
}

/**
 * Whether this key has copy written for it, as opposed to falling through to
 * `humanise`. Exists for the test that fails when a new backend column arrives
 * without a label - checking the label text cannot tell the two apart, because
 * plenty of correct labels (`Owner Email`) are exactly what humanise produces.
 */
export function hasExplicitLabel(resource: string, key: string): boolean {
  return RESOURCE_LABELS[resource]?.[key] !== undefined || LABELS[key] !== undefined;
}

export interface LabelledColumn {
  key: string;
  label: string;
  required: boolean;
  templatable: boolean;
}

/**
 * The columns a resource exports, in the backend's canonical order, with labels
 * applied. Throws for an unknown resource: that means the generated manifest and
 * the calling component disagree about what exists, which is a build-time
 * mistake and should not degrade into an empty dialog.
 */
export function columnsFor(resource: string): LabelledColumn[] {
  const domain = CSV_COLUMNS.find((d) => d.resource === resource);
  if (!domain) {
    throw new Error(
      `no CSV columns generated for "${resource}" - add it to backend/internal/csvregistry`,
    );
  }
  return domain.columns.map((c: CsvColumn) => ({
    key: c.key,
    label: labelFor(resource, c.key),
    required: c.required,
    templatable: c.templatable,
  }));
}
