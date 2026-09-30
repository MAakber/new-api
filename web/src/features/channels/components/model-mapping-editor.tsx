import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { JsonCodeEditor } from '@/components/json-code-editor'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { validateModelMappingJson } from '../lib/model-mapping-validation'

type ModelMappingEditorProps = {
  value: string
  onChange: (value: string) => void
  onValidityChange?: (valid: boolean) => void
  onBatchAdd?: () => void
  disabled?: boolean
  sourceModelOptions?: string[]
  targetModelOptions?: string[]
}

type MappingRow = { id: string; from: string; to: string }

function readMappingRows(value: string): MappingRow[] | null {
  if (!value.trim()) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    if (Object.values(parsed).some((item) => typeof item !== 'string')) {
      return null
    }
    return Object.entries(parsed).map(([from, to], index) => ({
      id: `saved-${index}`,
      from,
      to: String(to),
    }))
  } catch {
    return null
  }
}

function serializeMappingRows(rows: MappingRow[]): {
  value: string
  error?: string
} {
  const entries: Array<[string, string]> = []
  const names = new Set<string>()
  for (const row of rows) {
    const from = row.from.trim()
    const to = row.to.trim()
    if (!from && !to) continue
    if (!from || !to) {
      return {
        value: '',
        error: 'Both request and upstream model names are required',
      }
    }
    if (names.has(from)) {
      return {
        value: '',
        error: 'Duplicate source model mappings are not allowed',
      }
    }
    names.add(from)
    entries.push([from, to])
  }
  const value = entries.length
    ? JSON.stringify(Object.fromEntries(entries), null, 2)
    : ''
  return { value, error: validateModelMappingJson(value).error }
}

function ModelNameInput(props: {
  id: string
  label: string
  value: string
  options?: string[]
  placeholder: string
  disabled?: boolean
  invalid: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const options = [...new Set(props.options ?? [])]
  return (
    <Combobox
      items={options}
      value={props.value || null}
      inputValue={props.value}
      onInputValueChange={(value, details) => {
        if (details.reason === 'input-change') props.onChange(value)
      }}
      onValueChange={(value) => {
        if (value !== null) props.onChange(value)
      }}
      disabled={props.disabled}
    >
      <ComboboxInput
        id={props.id}
        aria-label={props.label}
        aria-invalid={props.invalid}
        placeholder={props.placeholder}
        disabled={props.disabled}
        triggerAriaLabel={props.label}
        className='w-full min-w-0'
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {t('Select a model or type a custom name')}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: string) => (
            <ComboboxItem key={option} value={option}>
              <span className='min-w-0 break-all'>{option}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

// Adapted from the upstream redirect editor: keep searchable rows and filtering,
// but own incomplete drafts and never serialize duplicate keys into a sentinel.
export function ModelMappingEditor(props: ModelMappingEditorProps) {
  const { t } = useTranslation()
  const id = useId()
  const [rows, setRows] = useState<MappingRow[]>(
    () => readMappingRows(props.value) ?? []
  )
  const [json, setJson] = useState(props.value)
  const [mode, setMode] = useState<'visual' | 'json'>(() =>
    validateModelMappingJson(props.value).valid ? 'visual' : 'json'
  )
  const [filter, setFilter] = useState('')
  const nextId = useRef(0)
  const pendingFocus = useRef<string | null>(null)
  const lastEmitted = useRef(props.value)
  const serialized = serializeMappingRows(rows)
  const error =
    mode === 'visual' ? serialized.error : validateModelMappingJson(json).error
  const valid = !error

  const syncExternalValue = useEffectEvent(() => {
    if (props.value === lastEmitted.current) return
    lastEmitted.current = props.value
    setJson(props.value)
    setRows(readMappingRows(props.value) ?? [])
    if (!validateModelMappingJson(props.value).valid) setMode('json')
  })
  useEffect(() => {
    syncExternalValue()
  }, [props.value])
  const reportValidity = useEffectEvent(() => props.onValidityChange?.(valid))
  useEffect(() => {
    reportValidity()
  }, [valid])
  useEffect(() => {
    if (!pendingFocus.current) return
    document.getElementById(pendingFocus.current)?.focus()
    pendingFocus.current = null
  }, [rows])

  const emit = (value: string) => {
    lastEmitted.current = value
    props.onChange(value)
  }
  const updateRows = (next: MappingRow[]) => {
    setRows(next)
    const result = serializeMappingRows(next)
    if (!result.error) {
      setJson(result.value)
      emit(result.value)
    }
  }
  const keyword = filter.trim().toLowerCase()
  const visibleRows = rows.filter(
    (row) =>
      !keyword ||
      row.from.toLowerCase().includes(keyword) ||
      row.to.toLowerCase().includes(keyword)
  )

  return (
    <Tabs
      value={mode}
      onValueChange={(next) => {
        if (
          props.disabled ||
          !valid ||
          (next !== 'visual' && next !== 'json')
        ) {
          return
        }
        if (next === 'visual') setRows(readMappingRows(json) ?? [])
        else setJson(serialized.value)
        setMode(next)
      }}
      className='gap-3'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <TabsList>
          <TabsTrigger
            value='visual'
            disabled={props.disabled || (mode === 'json' && !valid)}
          >
            {t('Visual')}
          </TabsTrigger>
          <TabsTrigger
            value='json'
            disabled={props.disabled || (mode === 'visual' && !valid)}
          >
            {t('JSON')}
          </TabsTrigger>
        </TabsList>
        {props.onBatchAdd && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={props.disabled || !valid}
            onClick={props.onBatchAdd}
          >
            {t('Batch Add')}
          </Button>
        )}
      </div>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
      <TabsContent value='visual' className='space-y-3'>
        {rows.length > 0 && (
          <Input
            aria-label={t('Filter mappings')}
            placeholder={t('Filter by model name')}
            value={filter}
            disabled={props.disabled}
            onChange={(event) => setFilter(event.target.value)}
          />
        )}
        {visibleRows.map((row) => (
          <div
            key={row.id}
            className='grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
          >
            <div className='col-start-1 min-w-0 space-y-1'>
              <label
                htmlFor={`${id}-${row.id}-from`}
                className='text-muted-foreground text-xs'
              >
                {t('Request Model Name')}
              </label>
              <ModelNameInput
                id={`${id}-${row.id}-from`}
                label={t('Request Model Name')}
                value={row.from}
                options={props.sourceModelOptions}
                placeholder='gpt-3.5-turbo'
                disabled={props.disabled}
                invalid={!valid}
                onChange={(from) =>
                  updateRows(
                    rows.map((item) =>
                      item.id === row.id ? { ...item, from } : item
                    )
                  )
                }
              />
            </div>
            <div className='col-start-1 min-w-0 space-y-1 sm:col-start-2'>
              <label
                htmlFor={`${id}-${row.id}-to`}
                className='text-muted-foreground text-xs'
              >
                {t('Upstream Model Name')}
              </label>
              <ModelNameInput
                id={`${id}-${row.id}-to`}
                label={t('Upstream Model Name')}
                value={row.to}
                options={props.targetModelOptions}
                placeholder='gpt-3.5-turbo-0125'
                disabled={props.disabled}
                invalid={!valid}
                onChange={(to) =>
                  updateRows(
                    rows.map((item) =>
                      item.id === row.id ? { ...item, to } : item
                    )
                  )
                }
              />
            </div>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='col-start-2 row-start-1 sm:col-start-3'
              aria-label={t('Delete mapping')}
              disabled={props.disabled}
              onClick={() =>
                updateRows(rows.filter((item) => item.id !== row.id))
              }
            >
              <HugeiconsIcon icon={Delete02Icon} aria-hidden='true' />
            </Button>
          </div>
        ))}
        {visibleRows.length === 0 && (
          <EmptyState
            className='min-h-24 p-3'
            title={
              rows.length
                ? t('No matching items')
                : t('No model mappings configured')
            }
            description={t(
              'Add a mapping to forward a request model to an upstream model.'
            )}
          />
        )}
        <Button
          type='button'
          variant='outline'
          className='w-full'
          disabled={props.disabled}
          onClick={() => {
            const rowId = `draft-${++nextId.current}`
            setFilter('')
            pendingFocus.current = `${id}-${rowId}-from`
            setRows([...rows, { id: rowId, from: '', to: '' }])
          }}
        >
          <HugeiconsIcon icon={Add01Icon} aria-hidden='true' />
          {t('Add Mapping')}
        </Button>
      </TabsContent>
      <TabsContent value='json' className='space-y-2'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'JSON keys are request model names; values are upstream model names.'
          )}
        </p>
        <JsonCodeEditor
          value={json}
          onChange={(value) => {
            setJson(value)
            emit(value)
          }}
          disabled={props.disabled}
          placeholder='{"request-model": "upstream-model"}'
          ariaLabel={t('Model Mapping')}
          aria-invalid={!valid}
        />
      </TabsContent>
    </Tabs>
  )
}
