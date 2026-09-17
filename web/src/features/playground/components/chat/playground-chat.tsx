import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import { Message } from '@/components/ai-elements/message'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  getChatMessageRenderState,
  getEditingMessageContent,
  getMessageAlignment,
  getPreviousUserMessage,
  isErrorMessage,
} from '../../lib'
import { selectMessageVersion } from '../../lib/message/message-run-utils'
import type {
  Message as MessageType,
  PlaygroundMessageLayoutMode,
} from '../../types'
import { MessageActions } from '../message/message-actions'
import { MessageErrorActions } from '../message/message-error-actions'
import { PlaygroundMessageContent } from '../message/playground-message-content'
import { PlaygroundMessageEditor } from '../message/playground-message-editor'
import { PlaygroundEmptyState } from './playground-empty-state'

const MAX_RENDERED_HISTORY_MESSAGES = 24

interface PlaygroundChatProps {
  messages: MessageType[]
  onCopyMessage?: (message: MessageType) => void
  onRegenerateMessage?: (message: MessageType) => void
  onEditMessage?: (message: MessageType) => void
  onDeleteMessage?: (message: MessageType) => void
  onSelectPrompt?: (prompt: string) => void
  isGenerating?: boolean
  isLoadingMessages?: boolean
  editingKey?: string | null
  onSaveEdit?: (newContent: string) => void
  onCancelEdit?: (open: boolean) => void
  onSaveEditAndSubmit?: (newContent: string) => void
  messageLayoutMode?: PlaygroundMessageLayoutMode
}

export function PlaygroundChat({
  messages,
  onCopyMessage,
  onRegenerateMessage,
  onEditMessage,
  onDeleteMessage,
  onSelectPrompt,
  isGenerating = false,
  isLoadingMessages = false,
  editingKey,
  onSaveEdit,
  onCancelEdit,
  onSaveEditAndSubmit,
  messageLayoutMode = 'alternating',
}: PlaygroundChatProps) {
  const { t } = useTranslation()
  const [editText, setEditText] = useState('')
  const [originalText, setOriginalText] = useState('')
  const [selectedVersions, setSelectedVersions] = useState<
    Record<string, string>
  >({})
  const [sourceMessageKeys, setSourceMessageKeys] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const visibleMessageOffset = Math.max(
    0,
    messages.length - MAX_RENDERED_HISTORY_MESSAGES
  )
  const visibleMessages = messages.slice(visibleMessageOffset)

  function handleToggleMessageSource(message: MessageType): void {
    setSourceMessageKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys)

      if (nextKeys.has(message.key)) {
        nextKeys.delete(message.key)
      } else {
        nextKeys.add(message.key)
      }

      return nextKeys
    })
  }

  useEffect(() => {
    if (!editingKey) return
    const content = getEditingMessageContent(messages, editingKey)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditText(content)

    setOriginalText(content)
  }, [editingKey, messages])

  let chatContent = visibleMessages.map((message, visibleMessageIndex) => {
    const messageIndex = visibleMessageOffset + visibleMessageIndex
    const { alwaysShowActions, isEditing } = getChatMessageRenderState(
      messages,
      message,
      messageIndex,
      editingKey
    )
    const displayed = selectMessageVersion(
      message,
      selectedVersions[message.key]
    )
    const isError = isErrorMessage(displayed)
    const previousUserMessage = isError
      ? getPreviousUserMessage(messages, messageIndex)
      : null
    const alignment = getMessageAlignment(message, messageLayoutMode)
    const isSourceVisible = sourceMessageKeys.has(message.key)

    return (
      <Message
        className='group flex-row-reverse py-2.5'
        from={message.from}
        key={message.key}
      >
        <div className='w-full min-w-0 flex-1 basis-full'>
          {isEditing ? (
            <PlaygroundMessageEditor
              editText={editText}
              message={message}
              onCancelEdit={onCancelEdit}
              onEditTextChange={setEditText}
              onSaveEdit={onSaveEdit}
              onSaveEditAndSubmit={onSaveEditAndSubmit}
              originalText={originalText}
            />
          ) : (
            <PlaygroundMessageContent
              alignment={alignment}
              actions={
                <MessageActions
                  message={displayed}
                  onCopy={onCopyMessage}
                  onRegenerate={
                    onRegenerateMessage
                      ? () => {
                          setSelectedVersions((current) => ({
                            ...current,
                            [message.key]: '',
                          }))
                          onRegenerateMessage(message)
                        }
                      : undefined
                  }
                  onToggleSource={handleToggleMessageSource}
                  onEdit={displayed === message ? onEditMessage : undefined}
                  onDelete={onDeleteMessage}
                  isSourceVisible={isSourceVisible}
                  isGenerating={isGenerating}
                  alwaysVisible={alwaysShowActions}
                  className='mt-1.5'
                />
              }
              isSourceVisible={isSourceVisible}
              message={displayed}
              versionSelector={
                message.versions.length > 1 ? (
                  <Select
                    value={displayed.versions[0].id}
                    disabled={isGenerating}
                    onValueChange={(value) => {
                      if (value) {
                        setSelectedVersions((current) => ({
                          ...current,
                          [message.key]: value,
                        }))
                      }
                    }}
                  >
                    <SelectTrigger
                      className='mt-2'
                      size='sm'
                      aria-label={t('Response version')}
                    >
                      <SelectValue>
                        {t('Version {{number}} of {{total}}', {
                          number:
                            message.versions.length -
                            message.versions.findIndex(
                              (version) =>
                                version.id === displayed.versions[0].id
                            ),
                          total: message.versions.length,
                        })}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {message.versions.map((version, index) => (
                        <SelectItem key={version.id} value={version.id}>
                          {t('Version {{number}} of {{total}}', {
                            number: message.versions.length - index,
                            total: message.versions.length,
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : undefined
              }
              errorActions={
                isError ? (
                  <MessageErrorActions
                    disabled={isGenerating}
                    onRetry={
                      onRegenerateMessage
                        ? () => onRegenerateMessage(message)
                        : undefined
                    }
                    onEditPrompt={
                      onEditMessage && previousUserMessage
                        ? () => onEditMessage(previousUserMessage)
                        : undefined
                    }
                    onDelete={
                      onDeleteMessage
                        ? () => onDeleteMessage(message)
                        : undefined
                    }
                  />
                ) : undefined
              }
              versionContent={displayed.versions[0].content}
            />
          )}
        </div>
      </Message>
    )
  })

  if (visibleMessages.length === 0 && onSelectPrompt) {
    chatContent = [
      <PlaygroundEmptyState key='empty' onSelectPrompt={onSelectPrompt} />,
    ]
  }

  if (isLoadingMessages) {
    chatContent = [
      <div
        className='text-muted-foreground flex min-h-[min(520px,calc(100svh-18rem))] items-center justify-center gap-2 text-sm'
        key='loading'
      >
        <Loader />
        <span>{t('Loading conversation...')}</span>
      </div>,
    ]
  }

  return (
    <Conversation>
      {/* Remove outer padding; apply padding to inner centered container to align with input */}
      <ConversationContent className='p-0'>
        <div className='mx-auto w-full max-w-4xl px-4 py-4'>{chatContent}</div>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}
