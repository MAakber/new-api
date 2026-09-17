import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    include: ['src/features/playground/drawing/**/__tests__/*.test.{ts,tsx}'],
    setupFiles: ['src/features/playground/drawing/__tests__/setup.ts'],
    restoreMocks: true,
  },
})
