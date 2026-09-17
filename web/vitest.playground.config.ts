import { defineConfig } from 'vitest/config'

import drawingConfig from './vitest.drawing.config.ts'

export default defineConfig({
  ...drawingConfig,
  test: {
    ...drawingConfig.test,
    include: ['src/features/playground/**/__tests__/*.test.{ts,tsx}'],
  },
})
