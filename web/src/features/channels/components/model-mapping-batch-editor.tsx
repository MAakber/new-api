import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/multi-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  deriveModelMappingPairs,
  mergeModelMappingPairs,
  type ModelMappingDirection,
  type ModelMappingRule,
} from '../lib/model-mapping-rules'
import { validateModelMappingJson } from '../lib/model-mapping-validation'
import { detectModelNamingPatterns } from '../lib/model-naming-patterns'

type ModelMappingBatchEditorProps = {
  value: string
  channelModels: string[]
  upstreamModels: string[]
  disabled?: boolean
  onApply: (value: string) => void
  onCancel: () => void
}

export function ModelMappingBatchEditor(props: ModelMappingBatchEditorProps) {
  const { t } = useTranslation()
  const id = useId()
  const [direction, setDirection] = useState<ModelMappingDirection>('upstream')
  const [selected, setSelected] = useState<string[]>([])
  const [ruleType, setRuleType] =
    useState<ModelMappingRule['type']>('strip-suffix')
  const [affix, setAffix] = useState('')
  const [find, setFind] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  let rule: ModelMappingRule
  if (ruleType === 'strip-prefix' || ruleType === 'strip-suffix') {
    rule = { type: ruleType, values: affix }
  } else if (ruleType === 'add-prefix' || ruleType === 'add-suffix') {
    rule = { type: ruleType, value: affix }
  } else rule = { type: 'replace', find, replaceWith }
  const derivation = deriveModelMappingPairs(selected, direction, rule)
  const existing = new Map<string, string>(
    Object.entries(JSON.parse(props.value.trim() || '{}'))
  )
  const changed = derivation.pairs.filter(
    (pair) => existing.get(pair.from) !== pair.to
  )
  const conflicts = changed.filter((pair) => existing.has(pair.from))
  const pairs = changed.filter((pair) => overwrite || !existing.has(pair.from))
  const merged = mergeModelMappingPairs(props.value, pairs)
  const error =
    merged === null
      ? 'Invalid model mapping'
      : validateModelMappingJson(merged).error
  const candidates =
    direction === 'upstream' ? props.upstreamModels : props.channelModels
  const hasRule = ruleType === 'replace' ? Boolean(find) : Boolean(affix.trim())
  const suggestions = detectModelNamingPatterns(
    props.upstreamModels,
    props.channelModels
  )

  return (
    <section className='space-y-4' aria-label={t('Batch add mappings')}>
      {suggestions.length > 0 && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-xs'>
            {t('Suggested rules')}
          </span>
          {suggestions.map((suggestion) => {
            let label = t('Replace text')
            if (suggestion.rule.type === 'strip-suffix') {
              label = `${t('Strip suffix')}: ${suggestion.rule.values}`
            }
            if (suggestion.rule.type === 'strip-prefix') {
              label = `${t('Strip prefix')}: ${suggestion.rule.values}`
            }
            if (suggestion.rule.type === 'replace') {
              label = `${suggestion.rule.find} → ${suggestion.rule.replaceWith}`
            }
            return (
              <Button
                key={suggestion.id}
                type='button'
                variant='outline'
                size='sm'
                disabled={props.disabled}
                onClick={() => {
                  setDirection('upstream')
                  setSelected(suggestion.models)
                  setRuleType(suggestion.rule.type)
                  if ('values' in suggestion.rule) {
                    setAffix(suggestion.rule.values)
                  }
                  if (suggestion.rule.type === 'replace') {
                    setFind(suggestion.rule.find)
                    setReplaceWith(suggestion.rule.replaceWith)
                  }
                }}
              >
                {label}
              </Button>
            )
          })}
        </div>
      )}
      <div className='space-y-2'>
        <Label htmlFor={`${id}-direction`}>
          {t('What do you want to change?')}
        </Label>
        <Combobox
          id={`${id}-direction`}
          value={direction}
          disabled={props.disabled}
          options={[
            { value: 'upstream', label: t('Create aliases for users') },
            { value: 'request', label: t('Change upstream model names') },
          ]}
          onValueChange={(value) => {
            if (value !== 'upstream' && value !== 'request') return
            setDirection(value)
            setSelected([])
            setRuleType(value === 'upstream' ? 'strip-suffix' : 'add-suffix')
            setAffix('')
          }}
        />
        <p className='text-muted-foreground text-xs'>
          {direction === 'upstream'
            ? t('Keep upstream names; choose what users call.')
            : t('Keep the names users call; change what is sent upstream.')}
        </p>
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${id}-models`}>{t('Select models')}</Label>
        <MultiSelect
          id={`${id}-models`}
          aria-label={t('Select models')}
          disabled={props.disabled}
          options={[...new Set(candidates)].map((value) => ({
            value,
            label: value,
          }))}
          selected={selected}
          onChange={setSelected}
          allowCreate
          maxVisibleChips={8}
        />
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-2'>
          <Label htmlFor={`${id}-rule`}>{t('Naming rule')}</Label>
          <Combobox
            id={`${id}-rule`}
            value={ruleType}
            disabled={props.disabled}
            options={[
              { value: 'strip-suffix', label: t('Strip suffix') },
              { value: 'strip-prefix', label: t('Strip prefix') },
              { value: 'add-suffix', label: t('Add suffix') },
              { value: 'add-prefix', label: t('Add prefix') },
              { value: 'replace', label: t('Replace text') },
            ]}
            onValueChange={(value) => {
              if (
                value === 'strip-suffix' ||
                value === 'strip-prefix' ||
                value === 'add-suffix' ||
                value === 'add-prefix' ||
                value === 'replace'
              ) {
                setRuleType(value)
              }
            }}
          />
        </div>
        {ruleType === 'replace' ? (
          <div className='space-y-2'>
            <Label htmlFor={`${id}-find`}>{t('Find text')}</Label>
            <Input
              id={`${id}-find`}
              value={find}
              onChange={(event) => setFind(event.target.value)}
              disabled={props.disabled}
            />
            <Label htmlFor={`${id}-replace`}>{t('Replace with')}</Label>
            <Input
              id={`${id}-replace`}
              value={replaceWith}
              onChange={(event) => setReplaceWith(event.target.value)}
              disabled={props.disabled}
            />
          </div>
        ) : (
          <div className='space-y-2'>
            <Label htmlFor={`${id}-affix`}>{t('Prefix or suffix')}</Label>
            <Input
              id={`${id}-affix`}
              value={affix}
              onChange={(event) => setAffix(event.target.value)}
              disabled={props.disabled}
            />
            {(ruleType === 'strip-prefix' || ruleType === 'strip-suffix') && (
              <p className='text-muted-foreground text-xs'>
                {t('Separate multiple prefixes or suffixes with commas.')}
              </p>
            )}
          </div>
        )}
      </div>
      <div className='space-y-2' aria-label={t('Mapping preview')}>
        <p className='text-sm font-medium'>
          {t('Request Model Name')} → {t('Upstream Model Name')}
        </p>
        <div className='max-h-60 space-y-1 overflow-y-auto rounded-lg border p-3 font-mono text-xs'>
          {derivation.pairs.map((pair) => (
            <div key={pair.from} className='break-all'>
              {pair.from} → {pair.to}
              {existing.has(pair.from) && (
                <span className='text-muted-foreground'>
                  {' '}
                  ({t('Current')}: {existing.get(pair.from)})
                </span>
              )}
            </div>
          ))}
          {derivation.pairs.length === 0 && (
            <p className='text-muted-foreground'>
              {t('Select models and a rule to preview mappings.')}
            </p>
          )}
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('{{count}} model(s) unchanged', {
            count:
              derivation.unchanged.length +
              derivation.pairs.length -
              changed.length,
          })}
        </p>
      </div>
      {derivation.conflicts.length > 0 && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              'Several upstream models produce the same request name. Adjust the selection or rule.'
            )}{' '}
            {derivation.conflicts.join(', ')}
          </AlertDescription>
        </Alert>
      )}
      {conflicts.length > 0 && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm'>
            {t('Existing mappings are kept unless you choose to replace them.')}
          </p>
          <Label className='flex items-center gap-2'>
            <Checkbox
              checked={overwrite}
              onCheckedChange={setOverwrite}
              disabled={props.disabled}
            />
            {t('Replace {{count}} existing mapping(s)', {
              count: conflicts.length,
            })}
          </Label>
        </div>
      )}
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
      <div className='flex flex-wrap justify-end gap-2'>
        <Button type='button' variant='outline' onClick={props.onCancel}>
          {t('Back to mappings')}
        </Button>
        <Button
          type='button'
          disabled={
            props.disabled ||
            !hasRule ||
            !pairs.length ||
            Boolean(error) ||
            derivation.conflicts.length > 0
          }
          onClick={() => {
            if (merged !== null && !error) props.onApply(merged)
          }}
        >
          {t('Add {{count}} mapping(s)', { count: pairs.length })}
        </Button>
      </div>
    </section>
  )
}
