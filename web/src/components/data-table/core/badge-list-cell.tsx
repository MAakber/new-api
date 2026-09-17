import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadgeList } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface BadgeListCellProps {
  items: React.ReactNode[]
  max?: number
  tooltipClassName?: string
  expandable?: boolean
  expandLabel?: string
}

/**
 * Table cell renderer for a list of badges with overflow tooltip.
 * Displays up to `max` badges inline; remaining items appear in a tooltip.
 * Applies -ml-1.5 to compensate for badge px-1.5 and align with column header.
 */
export function BadgeListCell({
  items,
  max = 2,
  tooltipClassName,
  expandable = false,
  expandLabel,
}: BadgeListCellProps) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return <span className='text-muted-foreground text-xs'>-</span>
  }

  const showTooltip = items.length > max

  if (expandable && showTooltip) {
    return (
      <div className='flex min-w-0 items-center gap-1'>
        <StatusBadgeList
          items={items.slice(0, max)}
          max={max}
          renderItem={(item) => item}
        />
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant='ghost'
                size='sm'
                className='h-6 shrink-0 px-1'
                aria-label={expandLabel ?? t('Show all tags')}
              />
            }
          >
            +{items.length - max}
          </PopoverTrigger>
          <PopoverContent className='max-h-64 overflow-auto'>
            <div className='flex flex-wrap gap-2'>{items}</div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<div className='-ml-1.5 max-w-full' />}>
          <StatusBadgeList
            items={items}
            max={max}
            renderItem={(item) => item}
          />
        </TooltipTrigger>
        {showTooltip && (
          <TooltipContent
            side='top'
            className={
              tooltipClassName ??
              'border-border bg-popover max-h-48 max-w-[320px] overflow-y-auto p-2'
            }
          >
            <div className='flex flex-wrap gap-1'>{items}</div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
