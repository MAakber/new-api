import { defineConfig } from 'vitest/config'

import channelsConfig from './vitest.channels.config.ts'

export default defineConfig({
  ...channelsConfig,
  test: {
    ...channelsConfig.test,
    include: [
      'src/components/ui/__tests__/combobox.test.tsx',
      'src/features/model-pricing/__tests__/*.test.{ts,tsx}',
      'src/features/models/__tests__/*.test.{ts,tsx}',
      'src/features/pricing/__tests__/*.test.{ts,tsx}',
      'src/features/pricing/lib/__tests__/*.test.{ts,tsx}',
      'src/features/system-settings/models/__tests__/visual-billing-editor.test.tsx',
      'src/features/system-settings/models/__tests__/request-simulation.test.tsx',
      'src/features/system-settings/models/__tests__/time-rule-editor.test.tsx',
      'src/features/system-settings/__tests__/pricing-sync.test.tsx',
      'src/features/system-settings/models/__tests__/task-pricing-copy.test.tsx',
      'src/features/usage-logs/components/__tests__/detail-preview.test.tsx',
      'src/lib/__tests__/localized-text.test.ts',
    ],
  },
})
