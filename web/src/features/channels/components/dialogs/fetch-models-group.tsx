/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  ArrowDown01Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import type { FetchedModelGroup } from '../../hooks/use-fetch-models'

interface FetchModelsGroupProps {
  group: FetchedModelGroup
  selected: ReadonlySet<string>
  onToggle: (models: readonly string[], checked: boolean) => void
  disabled: boolean
}

export function FetchModelsGroup(props: FetchModelsGroupProps) {
  const { t } = useTranslation()
  const instanceId = useId()
  const [open, setOpen] = useState(true)
  const vendor = props.group.provider?.name ?? t('Other')
  const selectedCount = props.group.models.filter((model) =>
    props.selected.has(model.id)
  ).length
  const allSelected = selectedCount === props.group.models.length
  const someSelected = selectedCount > 0 && !allSelected

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className='min-w-0 rounded-xl border'
    >
      <div className='bg-muted/30 flex min-w-0 items-center gap-3 rounded-xl px-3 py-1'>
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          disabled={props.disabled}
          aria-label={t('Select visible {{vendor}} models', { vendor })}
          onCheckedChange={(checked) =>
            props.onToggle(
              props.group.models.map((model) => model.id),
              checked
            )
          }
          className='data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-indeterminate:before:h-0.5 data-indeterminate:before:w-2 data-indeterminate:before:rounded-full data-indeterminate:before:bg-current data-indeterminate:[&_[data-slot=checkbox-indicator]]:hidden'
        />
        <CollapsibleTrigger className='focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 text-start outline-none focus-visible:ring-2'>
          {props.group.provider && (
            <span
              className='flex size-5 shrink-0 items-center justify-center'
              aria-hidden='true'
            >
              {getLobeIcon(props.group.provider.icon, 18)}
            </span>
          )}
          <span className='min-w-0 font-medium break-words'>{vendor}</span>
          <Badge variant='secondary' className='tabular-nums'>
            {props.group.models.length}
          </Badge>
          <span className='text-muted-foreground ml-auto shrink-0 text-xs tabular-nums'>
            {t('{{selected}} / {{total}} selected', {
              selected: selectedCount,
              total: props.group.models.length,
            })}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            aria-hidden='true'
            className={cn(
              'size-4 shrink-0 transition-transform motion-reduce:transition-none',
              !open && '-rotate-90'
            )}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className='min-w-0'>
        <div className='grid min-w-0 grid-cols-1 gap-1 p-2 md:grid-cols-2'>
          {props.group.models.map((model) => {
            const checkboxId = `${instanceId}-${model.id}`
            return (
              <div
                key={model.id}
                className='hover:bg-muted/40 flex min-w-0 items-start gap-2 rounded-lg px-2 py-2'
              >
                <Checkbox
                  id={checkboxId}
                  checked={props.selected.has(model.id)}
                  disabled={props.disabled}
                  onCheckedChange={(checked) =>
                    props.onToggle([model.id], checked)
                  }
                  className='mt-0.5'
                />
                <Label
                  htmlFor={checkboxId}
                  className='min-w-0 flex-1 cursor-pointer text-sm leading-5 font-normal break-all'
                >
                  {model.id}
                </Label>
                {model.redirectOnly && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant='ghost'
                          size='icon-xs'
                          aria-label={t('Model redirect: {{model}}', {
                            model: model.id,
                          })}
                        />
                      }
                    >
                      <HugeiconsIcon
                        icon={InformationCircleIcon}
                        aria-hidden='true'
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('From model redirect, not yet added to models list')}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
