import type { Participant } from '@/types';

/** The row's name wherever it is shown: the short label when it has one, else the full name. */
export function participantLabel(p: Participant): string {
  return p.organization.short_label || p.organization.name;
}

/**
 * The full name to show beside the label, or '' when it would only repeat it:
 * a short label that is the name itself reads "BROWN BROWN" once both are
 * uppercased. Only a real abbreviation, "TF KILO" over "Task Force Kilo",
 * earns the second line.
 */
export function participantSubName(p: Participant): string {
  const { name, short_label: short } = p.organization;
  if (!short || name.trim().toLowerCase() === short.trim().toLowerCase()) return '';
  return name;
}
