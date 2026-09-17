export type FloatingWindowKind = 'channel-editor'

export type FloatingWindowMode = 'create' | 'edit'

export type FloatingWindowRect = {
  x: number
  y: number
  width: number
  height: number
}

export type FloatingWindowViewport = {
  width: number
  height: number
}

export type FloatingWindowCloseCallback = (
  descriptor: FloatingWindowDescriptor
) => void

/**
 * A rendered floating-window instance. `identity` is stable only for window
 * kinds that intentionally support singleton behavior; create windows use
 * `null` so they can always be opened more than once.
 */
export type FloatingWindowDescriptor = {
  kind: FloatingWindowKind
  mode: FloatingWindowMode
  channelId: number | null
  title: string
  instanceId: string
  identity: string | null
  rect: FloatingWindowRect
  order: number
  onClose?: FloatingWindowCloseCallback
}

export type OpenFloatingWindowOptions = {
  kind: FloatingWindowKind
  mode: FloatingWindowMode
  channelId?: number | null
  title?: string
  rect?: FloatingWindowRect
  onClose?: FloatingWindowCloseCallback
}

export type OpenChannelEditorWindowOptions = Omit<
  OpenFloatingWindowOptions,
  'kind'
>
