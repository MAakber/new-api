import { defineConfig } from 'vitest/config'

import channelsConfig from './vitest.channels.config.ts'

export default defineConfig({
  ...channelsConfig,
  test: {
    ...channelsConfig.test,
    include: [
      'src/features/usage-logs/components/__tests__/reject-reason.test.tsx',
      'src/features/auth/__tests__/*.test.ts',
      'src/features/auth/api.test.ts',
      'src/features/auth/lib/__tests__/*.test.ts',
      'src/features/auth/secure-verification/__tests__/*.test.{ts,tsx}',
      'src/features/auth/otp/__tests__/*.test.tsx',
      'src/features/channels/hooks/__tests__/channel-key-disclosure.test.tsx',
      'src/features/users/components/dialogs/__tests__/user-binding-dialog.test.tsx',
      'src/features/profile/__tests__/*.test.{ts,tsx}',
      'src/features/security/**/__tests__/*.test.tsx',
      'src/features/usage-logs/audit/__tests__/*.test.{ts,tsx}',
      'src/features/usage-logs/components/__tests__/log-type-filter.test.tsx',
      'src/features/usage-logs/components/__tests__/quota-adjustment.test.tsx',
      'src/features/users/components/__tests__/permissions.test.tsx',
      'src/hooks/__tests__/sidebar-config.test.tsx',
      'src/lib/__tests__/http-cache.test.ts',
      'src/lib/__tests__/session-hint.test.ts',
      'src/lib/__tests__/status-query.test.tsx',
      'src/features/chat/lib/__tests__/*.test.{ts,tsx}',
      'src/features/pricing/lib/__tests__/time-rule-expr.test.ts',
      'src/features/pricing/components/__tests__/model-perf-badge.test.tsx',
      'src/features/system-settings/models/__tests__/time-rule-editor.test.tsx',
      'src/features/auth/sign-in/**/__tests__/*.test.{ts,tsx}',
      'src/features/wallet/hooks/__tests__/*.test.{ts,tsx}',
      'src/features/wallet/components/__tests__/*.test.{ts,tsx}',
      'src/features/dashboard/components/overview/__tests__/*.test.{ts,tsx}',
      'src/features/playground/components/message/__tests__/*.test.{ts,tsx}',
      'src/components/ai-elements/__tests__/*.test.{ts,tsx}',
      'src/components/layout/components/__tests__/mobile-navigation.test.tsx',
      'src/routes/__tests__/*.test.{ts,tsx}',
    ],
  },
})
