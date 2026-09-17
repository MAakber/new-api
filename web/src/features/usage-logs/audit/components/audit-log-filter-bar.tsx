import type { Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { Combobox } from '@/components/ui/combobox'

import { CompactDateTimeRangePicker } from '../../components/compact-date-time-range-picker'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from '../../components/logs-filter-toolbar'
import type { AuditFilters, AuditLog } from '../api'

function AuditFilterSelect(props: {
  label: string
  value: string
  options: { value: string; label: string; disabled?: boolean }[]
  onChange: (value: string) => void
}) {
  return (
    <LogsFilterField>
      <Combobox
        options={props.options}
        value={props.value}
        onValueChange={(value) => {
          if (value !== null) props.onChange(value)
        }}
        aria-label={props.label}
        className='w-full'
      />
    </LogsFilterField>
  )
}

export function AuditLogFilterBar(props: {
  table: Table<AuditLog>
  filters: AuditFilters
  onChange: (patch: Partial<AuditFilters>) => void
  scope: 'all' | 'self'
  accessOnly?: boolean
  tokenScope: string
  currentTokenRef?: string
  onTokenScopeChange: (value: string) => void
  isFetching: boolean
  onSearch: () => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const dateFilter = (
    <LogsFilterField wide>
      <CompactDateTimeRangePicker
        start={
          props.filters.start_timestamp === undefined
            ? undefined
            : new Date(props.filters.start_timestamp * 1000)
        }
        end={
          props.filters.end_timestamp === undefined
            ? undefined
            : new Date(props.filters.end_timestamp * 1000)
        }
        onChange={({ start, end }) =>
          props.onChange({
            start_timestamp: start
              ? Math.floor(start.getTime() / 1000)
              : undefined,
            end_timestamp: end ? Math.floor(end.getTime() / 1000) : undefined,
          })
        }
      />
    </LogsFilterField>
  )
  const mainFilters = (
    <>
      <AuditFilterSelect
        label={t('Result')}
        value={props.filters.success ?? 'all'}
        options={[
          { value: 'all', label: t('All results') },
          { value: 'true', label: t('Success') },
          { value: 'false', label: t('Failed') },
        ]}
        onChange={(value) =>
          props.onChange({ success: value === 'all' ? undefined : value })
        }
      />
      {props.accessOnly ? (
        <AuditFilterSelect
          label={t('Token scope')}
          value={props.tokenScope}
          options={[
            { value: 'all', label: t('All tokens') },
            {
              value: 'current',
              label: t('Current token'),
              disabled: !props.currentTokenRef,
            },
            {
              value: 'historical',
              label: t('Historical tokens'),
              disabled: props.currentTokenRef === undefined,
            },
          ]}
          onChange={props.onTokenScopeChange}
        />
      ) : (
        <AuditFilterSelect
          label={t('Category')}
          value={props.filters.category ?? 'all'}
          options={[
            { value: 'all', label: t('All categories') },
            { value: 'login', label: t('Login') },
            { value: 'security', label: t('Account security') },
            { value: 'operation', label: t('Operation audit') },
            { value: 'access_token', label: t('Access Token') },
          ]}
          onChange={(value) =>
            props.onChange({ category: value === 'all' ? undefined : value })
          }
        />
      )}
    </>
  )
  const advancedFilters =
    !props.accessOnly || props.scope === 'all' ? (
      <>
        {!props.accessOnly && (
          <>
            <LogsFilterField>
              <LogsFilterInput
                aria-label={t('Token identifier')}
                placeholder={t('Token identifier')}
                value={props.filters.token_ref ?? ''}
                onChange={(event) =>
                  props.onChange({ token_ref: event.target.value || undefined })
                }
              />
            </LogsFilterField>
            <LogsFilterField>
              <LogsFilterInput
                aria-label={t('Request ID')}
                placeholder={t('Request ID')}
                value={props.filters.request_id ?? ''}
                onChange={(event) =>
                  props.onChange({
                    request_id: event.target.value || undefined,
                  })
                }
              />
            </LogsFilterField>
          </>
        )}
        {props.scope === 'all' && (
          <LogsFilterField>
            <LogsFilterInput
              aria-label={t('Username')}
              placeholder={t('Username')}
              value={props.filters.username ?? ''}
              onChange={(event) =>
                props.onChange({ username: event.target.value || undefined })
              }
            />
          </LogsFilterField>
        )}
      </>
    ) : undefined
  const advancedCount = [
    props.filters.token_ref,
    props.filters.request_id,
    props.filters.username,
  ].filter(Boolean).length
  const filterCount =
    advancedCount +
    [
      props.filters.success,
      props.filters.category,
      props.tokenScope !== 'all',
    ].filter(Boolean).length
  const hasFilters =
    filterCount > 0 ||
    props.filters.start_timestamp !== undefined ||
    props.filters.end_timestamp !== undefined
  return (
    <LogsFilterToolbar
      table={props.table}
      primaryFilters={
        <>
          {dateFilter}
          {mainFilters}
        </>
      }
      advancedFilters={advancedFilters}
      mobilePinnedFilters={dateFilter}
      mobileFilters={
        <>
          {mainFilters}
          {advancedFilters}
        </>
      }
      mobileFilterCount={filterCount}
      advancedFilterCount={advancedCount}
      hasActiveFilters={hasFilters}
      hasAdvancedActiveFilters={advancedCount > 0}
      searchLoading={props.isFetching}
      onSearch={props.onSearch}
      onReset={props.onReset}
    />
  )
}
