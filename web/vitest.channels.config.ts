import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    server: {
      deps: {
        inline: [/@lobehub\/icons/, /@lobehub\/ui/, /@emoji-mart\/data/],
      },
    },
    include: [
      'src/features/channels/**/__tests__/channel-test-*.test.{ts,tsx}',
      'src/features/channels/__tests__/fetch-models-*.test.{ts,tsx}',
      'src/features/channels/__tests__/advanced-custom-editor.test.tsx',
      'src/features/channels/__tests__/balance-query-dialog.test.tsx',
      'src/features/channels/components/dialogs/__tests__/fetch-models-dialog-layout.test.tsx',
      'src/lib/__tests__/model-classification.test.ts',
      'src/stores/__tests__/fetch-model-preferences.test.ts',
      'src/features/system-settings/models/__tests__/channel-test-section.test.tsx',
    ],
    setupFiles: ['src/features/channels/__tests__/channel-test-setup.ts'],
    restoreMocks: true,
  },
})
