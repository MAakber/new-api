import {
  DEFAULT_QUOTA_WARNING_THRESHOLD,
  NOTIFICATION_METHODS,
} from '../constants'
import type { NotifyType, UpdateUserSettingsRequest } from '../types'
import { parseUserSettings } from './format'

export function normalizeUserSettings(
  setting?: string
): Required<UpdateUserSettingsRequest> & { notify_type: NotifyType } {
  const parsed = parseUserSettings(setting)
  const notifyType =
    NOTIFICATION_METHODS.find((method) => method.value === parsed.notify_type)
      ?.value ?? 'email'
  return {
    notify_type: notifyType,
    quota_warning_threshold:
      parsed.quota_warning_threshold ?? DEFAULT_QUOTA_WARNING_THRESHOLD,
    notification_email: parsed.notification_email ?? '',
    webhook_url: parsed.webhook_url ?? '',
    webhook_secret: parsed.webhook_secret ?? '',
    bark_url: parsed.bark_url ?? '',
    gotify_url: parsed.gotify_url ?? '',
    gotify_token: parsed.gotify_token ?? '',
    gotify_priority: parsed.gotify_priority ?? 5,
    accept_unset_model_ratio_model:
      parsed.accept_unset_model_ratio_model || false,
    upstream_model_update_notify_enabled:
      parsed.upstream_model_update_notify_enabled || false,
  }
}
