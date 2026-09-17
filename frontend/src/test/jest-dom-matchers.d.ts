// Bridges @testing-library/jest-dom's matchers onto vitest 5's Assertion type.
//
// jest-dom 7.0.1 is the newest release and still ships a one-parameter
// augmentation, `interface Assertion<T = any>`, in types/vitest.d.ts. vitest 5
// widened its own to `Assertion<R extends void | Promise<void> = void, T = unknown>`.
// TypeScript will not merge two declarations of the same interface that disagree
// on type-parameter count, so every jest-dom matcher silently vanished from the
// type of expect(...) and roughly a thousand assertions failed to compile.
//
// This declares the merge at vitest 5's arity instead. Delete it the moment
// jest-dom ships a release whose types/vitest.d.ts takes two parameters; the
// check in scripts/preflight-versions.mjs says when that happens.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// no-empty-object-type is disabled deliberately and cannot be satisfied here.
// An interface with no members of its own IS the mechanism of declaration
// merging: the body has to be empty for the supertype's members to be the whole
// contribution. jest-dom's own types/vitest.d.ts is written the same way.
/* eslint-disable @typescript-eslint/no-empty-object-type */
declare module 'vitest' {
  interface Assertion<R extends void | Promise<void> = void, T = unknown>
    extends TestingLibraryMatchers<T, R> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
/* eslint-enable @typescript-eslint/no-empty-object-type */
