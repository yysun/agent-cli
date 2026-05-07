// @ts-check
/**
 * Agent CLI Vitest Configuration
 *
 * Purpose:
 * - Keep unit and e2e tests deterministic for a small CLI-focused repository.
 *
 * Key features:
 * - Uses the Node test environment.
 * - Disables file-level parallelism so env and module-cache overrides stay isolated.
 *
 * Recent changes:
 * - 2026-05-07: Added Vitest configuration for targeted and end-to-end suites.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
  },
});