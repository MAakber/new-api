import { MoreHorizontalIcon, PaperclipIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PromptInputButton,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'

import { ATTACHMENT_ACTIONS, getAttachmentActionNotice } from '../../lib'
import type { ParameterEnabled, PlaygroundConfig } from '../../types'
import { PlaygroundParameterPanel } from './playground-parameter-panel'
import { PlaygroundSearchTools } from './playground-search-tools'

type PlaygroundInputToolsProps = {
  config: PlaygroundConfig
  disabled?: boolean
  hasMessages?: boolean
  onClearMessages?: () => void
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onParameterEnabledChange: (
    key: keyof ParameterEnabled,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
}

export function PlaygroundInputTools({
  config,
  disabled,
  hasMessages = false,
  onClearMessages,
  onConfigChange,
  onParameterEnabledChange,
  parameterEnabled,
}: PlaygroundInputToolsProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const handleFileAction = (action: string) => {
    const notice = getAttachmentActionNotice(action)
    toast.info(t(notice.title), {
      description: notice.description,
    })
  }

  const handleClearMessages = () => {
    onClearMessages?.()
    setClearConfirmOpen(false)
    toast.success(t('Conversation cleared'))
  }

  const tools = (
    <PromptInputTools className='bg-background/70 border-border/60 max-w-full flex-wrap rounded-lg border p-1 shadow-xs md:flex-nowrap'>
      <Tooltip>
        <DropdownMenu>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <PromptInputButton
                    aria-label={t('Attach')}
                    className='text-muted-foreground hover:text-foreground hover:bg-muted/70 font-medium'
                    disabled={disabled}
                    variant='ghost'
                  />
                }
              >
                <PaperclipIcon size={16} />
              </DropdownMenuTrigger>
            }
          />
          <TooltipContent>
            <p>{t('Attach')}</p>
          </TooltipContent>
          <DropdownMenuContent align='start'>
            {ATTACHMENT_ACTIONS.map(({ action, icon: Icon, label }) => (
              <DropdownMenuItem
                key={action}
                onClick={() => handleFileAction(action)}
              >
                <Icon className='mr-2' size={16} />
                {t(label)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Tooltip>

      <PlaygroundSearchTools
        config={config}
        disabled={disabled}
        onConfigChange={onConfigChange}
      />

      <PlaygroundParameterPanel
        config={config}
        disabled={disabled}
        onConfigChange={onConfigChange}
        onParameterEnabledChange={onParameterEnabledChange}
        parameterEnabled={parameterEnabled}
      />

      <Tooltip>
        <TooltipTrigger
          render={
            <PromptInputButton
              aria-label={t('Clear chat history')}
              className='text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-medium'
              disabled={disabled || !hasMessages || !onClearMessages}
              onClick={() => setClearConfirmOpen(true)}
              variant='ghost'
            >
              <Trash2Icon size={16} />
            </PromptInputButton>
          }
        />
        <TooltipContent>
          <p>{t('Clear chat history')}</p>
        </TooltipContent>
      </Tooltip>
    </PromptInputTools>
  )

  return (
    <>
      {isMobile ? (
        <Popover>
          <PopoverTrigger
            render={
              <PromptInputButton
                className='bg-background/70 border-border/60 text-muted-foreground hover:text-foreground border shadow-xs'
                disabled={disabled}
              >
                <MoreHorizontalIcon aria-hidden='true' size={16} />
                <span>{t('More')}</span>
              </PromptInputButton>
            }
          />
          <PopoverContent
            align='start'
            className='w-auto max-w-[calc(100vw-2rem)] p-0 ring-0'
            collisionPadding={16}
            side='top'
            sideOffset={8}
          >
            <PopoverTitle className='sr-only'>{t('Tools')}</PopoverTitle>
            {tools}
          </PopoverContent>
        </Popover>
      ) : (
        tools
      )}

      <ConfirmDialog
        destructive
        desc={t(
          'All playground messages saved in this browser will be removed. This cannot be undone.'
        )}
        confirmText={t('Clear')}
        handleConfirm={handleClearMessages}
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title={t('Clear chat history?')}
      />
    </>
  )
}
