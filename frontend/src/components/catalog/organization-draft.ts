import type { Branch, CreateOrganizationRequest, Organization, UpdateOrganizationRequest } from '@/types';

/**
 * The organization form's working copy, and the one place its validation and
 * request shapes live. Two surfaces draw the form: the Join Operation wizard's
 * Add to library and the Settings page's Organizations tab. Both read these
 * helpers, so they cannot disagree about what a complete draft is or what is
 * sent.
 */
export interface OrganizationDraft {
  key: string;
  name: string;
  short_label: string;
  branch: Branch | '';
  color: string;
  section_key: string;
  notes: string;
}

export const EMPTY_ORGANIZATION_DRAFT: OrganizationDraft = {
  key: '', name: '', short_label: '', branch: '', color: '', section_key: '', notes: '',
};

export const slugOf = (key: string) => key.trim().toLowerCase();

/** Mirrors `keyPattern` in organization/model.go, so the form does not discover the rule on Save. */
export const ORGANIZATION_KEY_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

/**
 * Whether the draft can be saved. Add needs a valid key and a name; Edit
 * needs only the name, because the key is the identity and is not sent.
 */
export function organizationDraftComplete(draft: OrganizationDraft, mode: 'add' | 'edit'): boolean {
  const named = draft.name.trim() !== '';
  return mode === 'edit' ? named : named && ORGANIZATION_KEY_PATTERN.test(slugOf(draft.key));
}

/** A stored organization as the form's working copy, for Edit. */
export function organizationDraftOf(o: Organization): OrganizationDraft {
  return {
    key: o.key,
    name: o.name,
    short_label: o.short_label,
    branch: o.branch,
    color: o.color,
    section_key: o.section_key,
    notes: o.notes,
  };
}

/** The POST body for a new organization. */
export function createOrganizationRequestOf(draft: OrganizationDraft): CreateOrganizationRequest {
  return { key: slugOf(draft.key), ...updateOrganizationRequestOf(draft) };
}

/**
 * The PATCH body. Every field is sent, blank included, so clearing a branch,
 * a colour or a section link on Edit reaches the server rather than being
 * read as "unchanged".
 */
export function updateOrganizationRequestOf(draft: OrganizationDraft): Required<UpdateOrganizationRequest> {
  return {
    name: draft.name.trim(),
    short_label: draft.short_label.trim(),
    branch: draft.branch,
    color: draft.color,
    section_key: draft.section_key,
    notes: draft.notes.trim(),
  };
}
