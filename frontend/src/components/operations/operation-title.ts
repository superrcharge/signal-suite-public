import type { Operation } from '@/types';

/**
 * The picker tile's label, and only the tile's: the acronym itself (`OMS`)
 * when one is set, else the full name, with the tile showing the full name
 * beneath. Every other surface - the sidebar row, the page title, the roster
 * and wizard titles - names the operation by `name`, since a reader who
 * arrived by a link has not seen the tile that pairs the acronym with it.
 */
export function operationTitle(op: Pick<Operation, 'name' | 'acronym'>): string {
  return op.acronym ? op.acronym : op.name;
}

/**
 * The name as the picker tile shows it beneath the dot: `name` with one
 * leading word "Operation" dropped, so "Operation Matrix Smoke" reads
 * "Matrix Smoke" under a tile that already says it is an operation. A name
 * without that word is returned unchanged.
 */
export function operationDisplayName(op: Pick<Operation, 'name'>): string {
  return op.name.replace(/^\s*operation\s+/i, '').trim();
}
