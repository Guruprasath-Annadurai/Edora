import { defineConfig } from 'vitest/config';
import path from 'path';
// Integration config for the Day-1 local mirror. Run only when the Docker mirror is up:
//   npx vitest run --config scripts/v5/day1/vitest.mirror.config.ts
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '../../../src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(__dirname, '../../../src/test/setup.ts')],
    include: [path.resolve(__dirname, '*.mirror.test.ts')],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
