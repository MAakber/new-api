import { readFileSync, readdirSync } from 'node:fs'

import { defineConfig } from 'vitest/config'

import channelsConfig from './vitest.channels.config.ts'

export default defineConfig({
  ...channelsConfig,
  test: {
    ...channelsConfig.test,
    // Existing node:test suites run through the isolated preservation runner.
    exclude: readdirSync(new URL('./src', import.meta.url), { recursive: true })
      .filter((file) => /\.test\.tsx?$/.test(file))
      .map((file) => `src/${file.replaceAll('\\', '/')}`)
      .filter((file) =>
        readFileSync(new URL(file, import.meta.url), 'utf8').includes(
          "from 'node:test'"
        )
      ),
    include: [
      'src/features/usage-logs/**/__tests__/*.test.{ts,tsx}',
      'src/features/redemption-codes/**/__tests__/*.test.{ts,tsx}',
      'src/features/keys/**/__tests__/*.test.{ts,tsx}',
      'src/features/users/components/__tests__/quota-display.test.tsx',
      'src/components/data-table/core/__tests__/pagination.test.tsx',
      'src/components/ui/__tests__/combobox.test.tsx',
      'src/components/ui/__tests__/portal-container.test.tsx',
    ],
  },
})
