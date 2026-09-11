import { defineConfig } from 'vitest/config'

import channelsConfig from './vitest.channels.config.ts'

export default defineConfig({
  ...channelsConfig,
  test: {
    ...channelsConfig.test,
    include: [
      'src/features/usage-logs/**/__tests__/*.test.{ts,tsx}',
      'src/features/redemption-codes/**/__tests__/*.test.{ts,tsx}',
      'src/features/keys/**/__tests__/*.test.{ts,tsx}',
      'src/features/users/components/__tests__/quota-display.test.tsx',
      'src/components/data-table/core/__tests__/pagination.test.tsx',
      'src/components/ui/__tests__/combobox.test.tsx',
    ],
  },
})
