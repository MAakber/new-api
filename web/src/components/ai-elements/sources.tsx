'use client'

import { BookIcon, ChevronDownIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type SourcesProps = ComponentProps<'div'>

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible
    className={cn('not-prose text-primary mb-4 text-xs', className)}
    {...props}
  />
)

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number
}

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => {
  const { t } = useTranslation()
  return (
    <CollapsibleTrigger
      className={cn('flex items-center gap-2', className)}
      {...props}
    >
      {children ?? (
        <>
          <p className='font-medium'>
            {t('Used')} {count} {t('sources')}
          </p>
          <ChevronDownIcon className='h-4 w-4' />
        </>
      )}
    </CollapsibleTrigger>
  )
}

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>

export const SourcesContent = ({
  className,
  ...props
}: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      // Keep the source list on the same left edge as the trigger label, so the
      // label and its entries read as one block instead of drifting apart.
      'mt-2 flex w-fit max-w-full min-w-0 flex-col gap-2',
      'data-closed:fade-out-0 data-closed:slide-out-to-top-2 data-open:slide-in-from-top-2 data-closed:animate-out data-open:animate-in outline-none',
      className
    )}
    {...props}
  />
)

export type SourceProps = ComponentProps<'a'>

export const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    className='flex items-center gap-2'
    href={href}
    rel='noreferrer'
    target='_blank'
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className='h-4 w-4' />
        <span className='block font-medium'>{title}</span>
      </>
    )}
  </a>
)
