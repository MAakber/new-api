/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
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
      'src/features/channels/components/dialogs/__tests__/fetch-models-dialog-layout.test.tsx',
      'src/lib/__tests__/model-classification.test.ts',
      'src/stores/__tests__/fetch-model-preferences.test.ts',
      'src/features/system-settings/models/__tests__/channel-test-section.test.tsx',
    ],
    setupFiles: ['src/features/channels/__tests__/channel-test-setup.ts'],
    restoreMocks: true,
  },
})
