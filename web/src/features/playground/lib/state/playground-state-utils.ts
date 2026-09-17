import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../constants'
import type { Message, ParameterEnabled, PlaygroundConfig } from '../../types'
import {
  loadConfig,
  loadMessages,
  loadParameterEnabled,
} from '../storage/storage'

export type MessageStateUpdater =
  | Message[]
  | ((previousMessages: Message[]) => Message[])

export function getInitialPlaygroundConfig(): PlaygroundConfig {
  const saved = loadConfig()
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    searchMode: saved.searchMode ?? (saved.webSearchEnabled ? 'mcp' : 'off'),
  }
}

export function getInitialParameterEnabled(): ParameterEnabled {
  return { ...DEFAULT_PARAMETER_ENABLED, ...loadParameterEnabled() }
}

export function getInitialMessages(): Message[] {
  return loadMessages() || []
}

export function applyMessageStateUpdate(
  previousMessages: Message[],
  updater: MessageStateUpdater
): Message[] {
  return typeof updater === 'function' ? updater(previousMessages) : updater
}
