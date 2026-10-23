// jest-dom 7 extends Vitest's `Assertion`, which Vitest 5 no longer merges into `expect()`.
// Vitest 5 merges custom matchers through `Matchers`, so add them there.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  interface Matchers<T = any> extends TestingLibraryMatchers<any, T> {}
}
