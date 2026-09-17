// Decides whether a verification receipt still speaks for the current tree.
//
// scripts/verify.mjs writes .claude/.verify-receipt.json on success and
// scripts/verify-gate.mjs already asks this question at Stop time, in
// milliseconds. The pre-push hook did not ask it at all: it called verify.mjs
// unconditionally, so every push paid a full run - measured at 2m13s - to
// recompute a result the Stop gate had just forced and written to disk. The
// digest is over file CONTENT rather than HEAD (see lib/tree-digest.mjs), so
// committing between the two does not invalidate anything, which means the
// ordinary verify -> commit -> push sequence paid twice every time.
//
// Pulled out as its own module rather than inlined for the same reason
// bash-guard, em-dash and ship-scope are: a decision that lets work skip a gate
// has to be unit testable in both directions. Reusing when it should not is the
// failure that matters, and it is silent.

/**
 * @param {unknown} receipt parsed .verify-receipt.json, or null if absent/unreadable
 * @param {string} currentDigest treeDigest() of the working tree right now
 * @returns {{ reuse: boolean, reason: string }}
 */
export function receiptDecision(receipt, currentDigest) {
  if (!receipt || typeof receipt !== 'object') {
    return { reuse: false, reason: 'no readable receipt' }
  }

  // Guarded explicitly because the obvious `receipt.digest === currentDigest`
  // reads as a match when BOTH are undefined. A receipt written by a future
  // version that renamed the field, or a truncated write, would then wave
  // every push through while looking exactly like a hit.
  if (typeof receipt.digest !== 'string' || receipt.digest.length === 0) {
    return { reuse: false, reason: 'receipt has no digest' }
  }

  if (typeof currentDigest !== 'string' || currentDigest.length === 0) {
    return { reuse: false, reason: 'the current tree digest could not be computed' }
  }

  if (receipt.digest !== currentDigest) {
    return { reuse: false, reason: 'the tree changed since verification last passed' }
  }

  return {
    reuse: true,
    reason: `verified ${receipt.timestamp ?? 'at an unrecorded time'} via ${receipt.backend ?? 'an unrecorded backend'}`,
  }
}
