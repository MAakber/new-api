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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'

import {
  AUTO_BAN_RULE_LABELS,
  type AutoBanRecord,
  type AutoBanRuleKey,
} from './auto-ban-types'

type AutoBanRecordsResponse = {
  success: boolean
  message: string
  data: {
    items: AutoBanRecord[]
    total: number
    page: number
    page_size: number
  }
}

const PAGE_SIZE = 20

const formatTime = (timestamp: number) => {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleString()
}

const formatEvidence = (evidence: string) => {
  try {
    return JSON.stringify(JSON.parse(evidence), null, 2)
  } catch {
    return evidence || '{}'
  }
}

const statusVariant = (status: AutoBanRecord['status']) => {
  if (status === 'active') return 'destructive' as const
  if (status === 'observed') return 'secondary' as const
  return 'outline' as const
}

const statusLabel: Record<AutoBanRecord['status'], string> = {
  observed: 'Observed threshold',
  active: 'Active ban',
  released: 'Ban released',
  expired: 'Ban expired',
}

export function AutoBanHistory() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('all')
  const [ruleType, setRuleType] = useState('all')
  const [releaseRecord, setReleaseRecord] = useState<AutoBanRecord | null>(null)
  const [releaseReason, setReleaseReason] = useState('')

  const recordsQuery = useQuery({
    queryKey: ['auto-ban-records', page, userId, status, ruleType],
    queryFn: async () => {
      const response = await api.get<AutoBanRecordsResponse>(
        '/api/security/auto-ban/records',
        {
          params: {
            page,
            page_size: PAGE_SIZE,
            user_id: userId || undefined,
            status: status === 'all' ? undefined : status,
            rule_type: ruleType === 'all' ? undefined : ruleType,
          },
        }
      )
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to load ban history')
      }
      return response.data.data
    },
  })

  const releaseMutation = useMutation({
    mutationFn: async (record: AutoBanRecord) => {
      const response = await api.post(
        `/api/security/auto-ban/users/${record.user_id}/release`,
        { reason: releaseReason.trim() }
      )
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to release ban')
      }
    },
    onSuccess: async () => {
      toast.success(t('Automatic ban released'))
      setReleaseRecord(null)
      setReleaseReason('')
      await queryClient.invalidateQueries({ queryKey: ['auto-ban-records'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to release ban'))
    },
  })

  const records = recordsQuery.data?.items ?? []
  const total = recordsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-end gap-3'>
        <div className='min-w-36 flex-1 space-y-1'>
          <label className='text-sm font-medium' htmlFor='auto-ban-user-id'>
            {t('User ID')}
          </label>
          <Input
            id='auto-ban-user-id'
            type='number'
            min={1}
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value)
              setPage(1)
            }}
            placeholder={t('All users')}
          />
        </div>
        <div className='min-w-44 space-y-1'>
          <label className='text-sm font-medium'>{t('Rule')}</label>
          <Select
            items={[
              { value: 'all', label: t('All rules') },
              ...Object.entries(AUTO_BAN_RULE_LABELS).map(([value, label]) => ({
                value,
                label: t(label),
              })),
            ]}
            value={ruleType}
            onValueChange={(value) => {
              setRuleType(value ?? 'all')
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value='all'>{t('All rules')}</SelectItem>
                {Object.entries(AUTO_BAN_RULE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {t(label)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className='min-w-36 space-y-1'>
          <label className='text-sm font-medium'>{t('Status')}</label>
          <Select
            items={[
              { value: 'all', label: t('All statuses') },
              { value: 'observed', label: t(statusLabel.observed) },
              { value: 'active', label: t(statusLabel.active) },
              { value: 'released', label: t(statusLabel.released) },
              { value: 'expired', label: t(statusLabel.expired) },
            ]}
            value={status}
            onValueChange={(value) => {
              setStatus(value ?? 'all')
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value='all'>{t('All statuses')}</SelectItem>
                <SelectItem value='observed'>
                  {t(statusLabel.observed)}
                </SelectItem>
                <SelectItem value='active'>{t(statusLabel.active)}</SelectItem>
                <SelectItem value='released'>
                  {t(statusLabel.released)}
                </SelectItem>
                <SelectItem value='expired'>
                  {t(statusLabel.expired)}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={() => recordsQuery.refetch()}
          disabled={recordsQuery.isFetching}
        >
          <RefreshCw
            className={recordsQuery.isFetching ? 'animate-spin' : undefined}
          />
          {t('Refresh')}
        </Button>
      </div>

      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('User')}</TableHead>
              <TableHead>{t('Rule')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Trigger')}</TableHead>
              <TableHead>{t('Client')}</TableHead>
              <TableHead>{t('Created')}</TableHead>
              <TableHead>{t('Expires')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={8} className='py-10 text-center'>
                  <span className='text-muted-foreground'>
                    {t('Loading...')}
                  </span>
                </TableCell>
              </TableRow>
            )}
            {recordsQuery.isError && (
              <TableRow>
                <TableCell colSpan={8} className='py-10 text-center'>
                  <span className='text-destructive'>
                    {t('Failed to load')}
                  </span>
                </TableCell>
              </TableRow>
            )}
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <div className='font-medium'>{record.username || '—'}</div>
                  <div className='text-muted-foreground text-xs'>
                    #{record.user_id} · {record.user_group || '—'}
                  </div>
                </TableCell>
                <TableCell>
                  {t(
                    AUTO_BAN_RULE_LABELS[record.rule_type as AutoBanRuleKey] ??
                      record.rule_type
                  )}
                  <div className='text-muted-foreground text-xs'>
                    {record.mode === 'observe'
                      ? t('Observe only')
                      : t('Enforce ban')}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(record.status)}>
                    {t(statusLabel[record.status])}
                  </Badge>
                </TableCell>
                <TableCell>
                  {record.trigger_count}/{record.threshold}
                  <div className='text-muted-foreground text-xs'>
                    {record.window_minutes} {t('minutes')}
                  </div>
                </TableCell>
                <TableCell className='max-w-56'>
                  <div className='truncate'>{record.ip || '—'}</div>
                  <div
                    className='text-muted-foreground max-w-56 truncate text-xs'
                    title={record.user_agent}
                  >
                    {record.user_agent || '—'}
                  </div>
                  <details className='mt-1 max-w-72 text-xs'>
                    <summary className='text-muted-foreground cursor-pointer'>
                      {t('Evidence')}
                    </summary>
                    <pre className='bg-muted mt-1 max-h-32 overflow-auto rounded p-2 whitespace-pre-wrap'>
                      {formatEvidence(record.evidence)}
                    </pre>
                  </details>
                </TableCell>
                <TableCell>{formatTime(record.created_at)}</TableCell>
                <TableCell>
                  {record.status === 'active' && record.expires_at === 0
                    ? t('Permanent')
                    : formatTime(record.expires_at)}
                </TableCell>
                <TableCell className='text-right'>
                  {record.status === 'active' ? (
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setReleaseReason('')
                        setReleaseRecord(record)
                      }}
                    >
                      {t('Release ban')}
                    </Button>
                  ) : (
                    <span className='text-muted-foreground'>—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!recordsQuery.isLoading &&
              !recordsQuery.isError &&
              records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className='py-10 text-center'>
                    <span className='text-muted-foreground'>
                      {t('No automatic ban records found')}
                    </span>
                  </TableCell>
                </TableRow>
              )}
          </TableBody>
        </Table>
      </div>

      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-sm'>
          {t('{{count}} records', { count: total })}
        </span>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t('Previous')}
          </Button>
          <span className='text-sm'>
            {page}/{totalPages}
          </span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={releaseRecord !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReleaseRecord(null)
            setReleaseReason('')
          }
        }}
        title={t('Release automatic ban')}
        desc={t(
          'The user will be able to log in and use API tokens again immediately.'
        )}
        confirmText={t('Release ban')}
        isLoading={releaseMutation.isPending}
        handleConfirm={() => {
          if (releaseRecord) releaseMutation.mutate(releaseRecord)
        }}
      >
        <Input
          value={releaseReason}
          maxLength={255}
          onChange={(event) => setReleaseReason(event.target.value)}
          placeholder={t('Optional release reason')}
        />
      </ConfirmDialog>
    </div>
  )
}
