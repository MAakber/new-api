import { Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getLobeIcon } from '@/lib/lobe-icon'
import { classifyModel } from '@/lib/model-classification'
import { cn } from '@/lib/utils'

interface ModelBadgeProps {
  modelName: string
  actualModel?: string
  className?: string
  wrapText?: boolean
  onInspect?: () => void
}

function ModelBadgeContent(props: ModelBadgeProps) {
  const { provider } = classifyModel(props.modelName)

  return (
    <StatusBadge
      copyText={props.modelName}
      copyable={!props.onInspect}
      size='sm'
      showDot={!provider}
      autoColor={provider ? undefined : props.modelName}
      className={cn(
        'border-border/60 bg-muted/30 h-6 max-w-none gap-1.5 rounded-md border px-2 [font-family:var(--font-body)]',
        provider && 'text-foreground',
        props.wrapText && 'h-auto min-h-6 max-w-full py-0.5 whitespace-normal',
        props.className
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1.5',
          props.wrapText ? 'max-w-full min-w-0' : 'max-w-none'
        )}
      >
        {provider && (
          <span
            className='flex h-[18px] w-[18px] shrink-0 items-center justify-center'
            title={provider.label}
            aria-label={provider.label}
          >
            {getLobeIcon(provider.icon, 18)}
          </span>
        )}
        <span
          className={
            props.wrapText
              ? 'line-clamp-2 [overflow-wrap:anywhere]'
              : 'whitespace-nowrap'
          }
        >
          {props.modelName}
        </span>
      </span>
    </StatusBadge>
  )
}

export function ModelBadge(props: ModelBadgeProps) {
  const { t } = useTranslation()

  if (props.onInspect) {
    return (
      <Button
        variant='ghost'
        aria-label={`${t('Model')}: ${props.modelName}`}
        aria-haspopup='dialog'
        onClick={props.onInspect}
        className='h-auto min-h-8 max-w-full min-w-0 justify-start gap-1 px-0 py-0 text-left font-normal whitespace-normal'
      >
        <ModelBadgeContent {...props} />
        {props.actualModel && (
          <Route className='text-muted-foreground size-3 shrink-0' />
        )}
      </Button>
    )
  }

  if (!props.actualModel) {
    return <ModelBadgeContent {...props} />
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type='button' className='inline-flex items-center gap-1' />
        }
      >
        <ModelBadgeContent {...props} />
        <Route className='text-muted-foreground size-3 shrink-0' />
      </PopoverTrigger>
      <PopoverContent className='w-72'>
        <div className='space-y-2'>
          <div className='flex items-start justify-between gap-3'>
            <span className='text-muted-foreground text-xs'>
              {t('Request Model:')}
            </span>
            <span className='truncate font-mono text-xs font-medium'>
              {props.modelName}
            </span>
          </div>
          <div className='flex items-start justify-between gap-3'>
            <span className='text-muted-foreground text-xs'>
              {t('Actual Model:')}
            </span>
            <span className='truncate font-mono text-xs font-medium'>
              {props.actualModel}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
