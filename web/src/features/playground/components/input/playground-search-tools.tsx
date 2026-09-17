import { useQuery } from '@tanstack/react-query'
import { GlobeIcon, WrenchIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { MultiSelect } from '@/components/multi-select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getAvailableMCPTools, MCP_QUERY_KEYS } from '@/features/mcp/api'
import { cn } from '@/lib/utils'

import type { PlaygroundConfig, SearchMode } from '../../types'

type Props = {
  config: PlaygroundConfig
  disabled?: boolean
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
}

export function PlaygroundSearchTools(props: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const tools = useQuery({
    queryKey: MCP_QUERY_KEYS.tools,
    queryFn: getAvailableMCPTools,
    staleTime: 30_000,
  })
  const mode =
    props.config.searchMode ?? (props.config.webSearchEnabled ? 'mcp' : 'off')
  const labels: Record<SearchMode, string> = {
    off: t('Search off'),
    mcp: t('MCP search'),
    native: t('Model native search'),
  }
  const selected = props.config.mcpTools ?? []

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <PromptInputButton
                    disabled={props.disabled}
                    aria-label={`${t('Search mode')}: ${labels[mode]}`}
                    className={cn(
                      mode !== 'off' && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <GlobeIcon aria-hidden='true' size={16} />
                    {mode !== 'off' && (
                      <span className='max-w-28 truncate text-xs'>
                        {labels[mode]}
                      </span>
                    )}
                  </PromptInputButton>
                }
              />
            }
          />
          <TooltipContent>{labels[mode]}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent className='w-56' align='start'>
          <DropdownMenuRadioGroup
            value={mode}
            onValueChange={(value) => {
              props.onConfigChange('searchMode', value as SearchMode)
              props.onConfigChange('webSearchEnabled', value === 'mcp')
            }}
          >
            <DropdownMenuRadioItem value='off'>
              {labels.off}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='mcp'>
              {labels.mcp}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='native'>
              {labels.native}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <PromptInputButton
                    disabled={props.disabled}
                    aria-label={t('MCP tools')}
                    className={cn(
                      selected.length > 0 && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <WrenchIcon aria-hidden='true' size={16} />
                    {selected.length > 0 && (
                      <span className='text-xs tabular-nums'>
                        {selected.length}
                      </span>
                    )}
                  </PromptInputButton>
                }
              />
            }
          />
          <TooltipContent>{t('MCP tools')}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align='start'
          className='w-80 max-w-[calc(100vw-2rem)] space-y-3'
        >
          <Label htmlFor='playground-mcp-tools'>{t('MCP tools')}</Label>
          {tools.isPending && <LoadingState size='sm' />}
          {tools.isError && (
            <ErrorState
              className='min-h-24'
              onRetry={() => void tools.refetch()}
            />
          )}
          {tools.isSuccess && (
            <MultiSelect
              id='playground-mcp-tools'
              placeholder={t('MCP tools')}
              options={tools.data.map((tool) => ({
                label: `${tool.server_name} · ${tool.name}`,
                value: tool.id,
              }))}
              selected={selected}
              onChange={(values) => props.onConfigChange('mcpTools', values)}
              maxVisibleChips={3}
              disabled={props.disabled}
              emptyText={
                tools.data.length === 0
                  ? t(
                      'No MCP tools are available. Ask an administrator to configure MCP services.'
                    )
                  : undefined
              }
            />
          )}
        </PopoverContent>
      </Popover>
    </>
  )
}
