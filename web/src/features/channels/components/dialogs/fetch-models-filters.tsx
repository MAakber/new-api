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
import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MODEL_TYPES, type ModelType } from '@/lib/model-classification'

interface FetchModelsFiltersProps {
  types: ModelType[]
  counts: Record<ModelType | 'all', number>
  onTypesChange: (types: ModelType[]) => void
  search: string
  onSearchChange: (value: string) => void
  onClear: () => void
}

export function FetchModelsFilters(props: FetchModelsFiltersProps) {
  const { t } = useTranslation()
  const searchId = useId()
  const allSelected = props.types.length === 0
  const options: { value: ModelType | 'all'; label: string }[] = [
    { value: 'all', label: t('All') },
    { value: 'chat', label: t('Chat') },
    { value: 'image', label: t('Image generation') },
    { value: 'video', label: t('Video') },
    { value: 'audio', label: t('Audio') },
    { value: 'embedding', label: t('Embeddings') },
    { value: 'rerank', label: t('Rerank') },
    { value: 'other', label: t('Other') },
  ]

  return (
    <div
      data-slot='fetch-models-filters'
      className='flex shrink-0 flex-col gap-3'
    >
      <div className='min-w-0 overflow-x-auto px-1 pb-1 md:overflow-visible'>
        <ToggleGroup
          multiple
          value={allSelected ? ['all'] : props.types}
          onValueChange={(values) => {
            if (!allSelected && values.includes('all')) {
              props.onTypesChange([])
            } else {
              props.onTypesChange(
                MODEL_TYPES.filter((type) => values.includes(type))
              )
            }
          }}
          aria-label={t('Model types')}
          variant='outline'
          size='sm'
          spacing={1}
          className='min-w-max flex-nowrap md:min-w-0 md:flex-wrap'
        >
          {options.map((option) => {
            const pressed =
              option.value === 'all'
                ? allSelected
                : props.types.includes(option.value)
            return (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                aria-label={t('{{type}}: {{count}} models', {
                  type: option.label,
                  count: props.counts[option.value],
                })}
                className='aria-pressed:border-primary/40 aria-pressed:bg-primary/10 aria-pressed:text-primary gap-2'
              >
                {option.label}
                <Badge
                  variant={pressed ? 'default' : 'secondary'}
                  className='h-4 min-w-4 px-1 text-[10px] tabular-nums'
                  aria-hidden='true'
                >
                  {props.counts[option.value]}
                </Badge>
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>
      <div className='flex min-w-0 items-center gap-2 px-1'>
        <div className='relative min-w-0 flex-1'>
          <Label htmlFor={searchId} className='sr-only'>
            {t('Search models')}
          </Label>
          <HugeiconsIcon
            icon={Search01Icon}
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'
            aria-hidden='true'
          />
          <Input
            id={searchId}
            placeholder={t('Search models...')}
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            className='pl-9'
          />
        </div>
        {(props.search || !allSelected) && (
          <Button variant='ghost' size='sm' onClick={props.onClear}>
            {t('Clear filters')}
          </Button>
        )}
      </div>
    </div>
  )
}
