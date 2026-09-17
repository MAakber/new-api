import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type PluginModelListProps = {
  models: string[]
  collapsedLabel?: string
  maxVisible?: number
}

/** Model lists remain available to touch and keyboard users, even on narrow screens. */
export function PluginModelList(props: PluginModelListProps) {
  const { t } = useTranslation()
  if (props.collapsedLabel) {
    return (
      <Popover>
        <PopoverTrigger render={<Button variant='outline' size='xs' />}>
          {props.collapsedLabel}
        </PopoverTrigger>
        <PopoverContent
          aria-label={props.collapsedLabel}
          className='max-h-64 max-w-[calc(100vw-2rem)] overflow-y-auto'
        >
          <p className='mb-2 text-sm font-medium'>{props.collapsedLabel}</p>
          <ul className='space-y-1 font-mono text-xs'>
            {props.models.map((model) => (
              <li key={model} className='break-all'>
                {model}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    )
  }
  const visible = props.models.slice(0, props.maxVisible ?? 6)
  const hidden = props.models.slice(props.maxVisible ?? 6)
  return (
    <div className='min-w-0 space-y-2'>
      {visible.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {visible.map((model) => (
            <Badge
              key={model}
              variant='secondary'
              className='h-auto max-w-full rounded-md font-mono font-normal break-all whitespace-normal'
            >
              {model}
            </Badge>
          ))}
        </div>
      )}
      {hidden.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                variant='ghost'
                size='sm'
                className='h-auto max-w-full gap-1 px-1 py-1 text-xs whitespace-normal'
              />
            }
          >
            {props.collapsedLabel ??
              t('More models ({{count}})', { count: hidden.length })}
            <ChevronDown className='size-3 shrink-0' aria-hidden='true' />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className='flex flex-wrap gap-1.5 pt-2'>
              {hidden.map((model) => (
                <Badge
                  key={model}
                  variant='secondary'
                  className='h-auto max-w-full rounded-md font-mono font-normal break-all whitespace-normal'
                >
                  {model}
                </Badge>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
