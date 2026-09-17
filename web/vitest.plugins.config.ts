import { defineConfig } from 'vitest/config'

import channelsConfig from './vitest.channels.config.ts'

export default defineConfig({
  ...channelsConfig,
  test: {
    ...channelsConfig.test,
    include: [
      'src/features/task-plugins/**/*.test.{ts,tsx}',
      'src/features/channels/components/__tests__/channel-type-badge.test.tsx',
      'src/features/channels/lib/__tests__/task-plugin-base-url.test.ts',
      'src/components/ui/__tests__/combobox.test.tsx',
    ],
  },
})
