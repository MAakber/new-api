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
import type { TFunction } from 'i18next'
import { Clock3, Crown, Network, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AUTO_BAN_RULE_LABELS,
  type AutoBanRuleKey,
} from '@/features/system-settings/request-limits/auto-ban-types'

import { formatRankingTime } from '../lib/format'
import type { RankingAutoBan, RankingBanSort, RankingUserIP } from '../types'

type SecuritySectionProps = {
  bans?: RankingAutoBan[]
  ipUsers?: RankingUserIP[]
  isAdmin: boolean
  loading: boolean
  error: boolean
  banSort: RankingBanSort
  onBanSortChange: (sort: RankingBanSort) => void
}

const STATUS_LABELS: Record<RankingAutoBan['latest_status'], string> = {
  active: 'Active ban',
  released: 'Ban released',
  expired: 'Ban expired',
}

export function SecuritySection(props: SecuritySectionProps) {
  return (
    <section
      className={
        props.isAdmin ? 'grid gap-4 xl:grid-cols-[1.15fr_0.85fr]' : undefined
      }
    >
      <BanLeaderboard
        rows={props.bans ?? []}
        loading={props.loading}
        error={props.error}
        sort={props.banSort}
        onSortChange={props.onBanSortChange}
      />
      {props.isAdmin && (
        <IPLeaderboard
          rows={props.ipUsers ?? []}
          loading={props.loading}
          error={props.error}
        />
      )}
    </section>
  )
}

function BanLeaderboard(props: {
  rows: RankingAutoBan[]
  loading: boolean
  error: boolean
  sort: RankingBanSort
  onSortChange: (sort: RankingBanSort) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='bg-card overflow-hidden rounded-xl border'>
      <header className='border-b px-5 py-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex items-start gap-2.5'>
            <span className='flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400'>
              <Crown className='size-4' />
            </span>
            <div>
              <h2 className='text-sm font-semibold'>{t('Hall of bans')}</h2>
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {t('Actual automatic bans with privacy-masked usernames')}
              </p>
            </div>
          </div>
          <Tabs
            value={props.sort}
            onValueChange={(value) =>
              props.onSortChange(value as RankingBanSort)
            }
          >
            <TabsList>
              <TabsTrigger value='count'>{t('Most bans')}</TabsTrigger>
              <TabsTrigger value='latest'>{t('Most recent')}</TabsTrigger>
              <TabsTrigger value='duration'>{t('Longest ban')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>
      <div className='p-3'>
        <BanLeaderboardContent
          rows={props.rows}
          loading={props.loading}
          error={props.error}
        />
      </div>
    </div>
  )
}

function BanLeaderboardContent(props: {
  rows: RankingAutoBan[]
  loading: boolean
  error: boolean
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return <SecurityLoading />
  }
  if (props.error) {
    return <SecurityEmpty label={t('Unable to load security rankings')} />
  }
  if (props.rows.length === 0) {
    return (
      <SecurityEmpty label={t('No automatic bans in the selected period')} />
    )
  }
  return (
    <ol className='divide-border/60 divide-y'>
      {props.rows.map((row, index) => (
        <BanRow
          key={`${row.username}-${row.latest_ban_at}`}
          row={row}
          rank={index + 1}
        />
      ))}
    </ol>
  )
}

function BanRow(props: { row: RankingAutoBan; rank: number }) {
  const { t } = useTranslation()
  const ruleLabel =
    AUTO_BAN_RULE_LABELS[props.row.latest_rule as AutoBanRuleKey] ??
    props.row.latest_rule
  return (
    <li className='grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3'>
      <span className='text-muted-foreground text-right font-mono text-xs tabular-nums'>
        {props.rank}.
      </span>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='truncate font-mono text-xs font-semibold'>
            {props.row.username}
          </span>
          <Badge
            variant={
              props.row.latest_status === 'active' ? 'destructive' : 'outline'
            }
          >
            {t(STATUS_LABELS[props.row.latest_status])}
          </Badge>
        </div>
        <p className='text-muted-foreground mt-1 truncate text-[11px]'>
          {t(ruleLabel)} · {formatRankingTime(props.row.latest_ban_at)}
        </p>
      </div>
      <div className='text-right'>
        <div className='font-mono text-sm font-semibold tabular-nums'>
          {props.row.ban_count}
          <span className='text-muted-foreground ml-1 text-[10px] font-normal'>
            {t('bans')}
          </span>
        </div>
        <div className='text-muted-foreground mt-0.5 inline-flex items-center gap-1 text-[10px]'>
          <Clock3 className='size-3' />
          {formatBanDuration(props.row.longest_ban_minutes, t)}
        </div>
      </div>
    </li>
  )
}

function IPLeaderboard(props: {
  rows: RankingUserIP[]
  loading: boolean
  error: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className='bg-card overflow-hidden rounded-xl border'>
      <header className='flex items-start gap-2.5 border-b px-5 py-4'>
        <span className='flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400'>
          <Network className='size-4' />
        </span>
        <div>
          <div className='flex items-center gap-2'>
            <h2 className='text-sm font-semibold'>
              {t('User IP leaderboard')}
            </h2>
            <Badge variant='secondary'>{t('Admin only')}</Badge>
          </div>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {t('Distinct API client IPs by user')}
          </p>
        </div>
      </header>
      <div className='p-3'>
        <IPLeaderboardContent
          rows={props.rows}
          loading={props.loading}
          error={props.error}
        />
      </div>
    </div>
  )
}

function IPLeaderboardContent(props: {
  rows: RankingUserIP[]
  loading: boolean
  error: boolean
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return <SecurityLoading />
  }
  if (props.error) {
    return <SecurityEmpty label={t('Unable to load security rankings')} />
  }
  if (props.rows.length === 0) {
    return <SecurityEmpty label={t('No API traffic in the selected period')} />
  }
  return (
    <ol className='divide-border/60 divide-y'>
      {props.rows.map((row, index) => (
        <li
          key={row.user_id}
          className='grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3'
        >
          <span className='text-muted-foreground text-right font-mono text-xs tabular-nums'>
            {index + 1}.
          </span>
          <div className='min-w-0'>
            <div className='truncate text-xs font-semibold'>
              {row.username || `#${row.user_id}`}
            </div>
            <p className='text-muted-foreground mt-1 text-[11px]'>
              #{row.user_id} · {row.request_count.toLocaleString()}{' '}
              {t('API calls')}
            </p>
          </div>
          <div className='text-right'>
            <div className='font-mono text-sm font-semibold text-sky-600 tabular-nums dark:text-sky-400'>
              {row.ip_count}
              <span className='text-muted-foreground ml-1 text-[10px] font-normal'>
                {t('unique IPs')}
              </span>
            </div>
            <div className='text-muted-foreground mt-0.5 text-[10px]'>
              {t('Last seen')} {formatRankingTime(row.last_seen)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function SecurityLoading() {
  return (
    <div className='space-y-2'>
      {['one', 'two', 'three', 'four'].map((key) => (
        <Skeleton key={key} className='h-14 w-full rounded-lg' />
      ))}
    </div>
  )
}

function SecurityEmpty(props: { label: string }) {
  return (
    <div className='text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-2 text-xs'>
      <ShieldAlert className='size-5 opacity-50' />
      {props.label}
    </div>
  )
}

function formatBanDuration(minutes: number, t: TFunction): string {
  if (minutes === -1) return t('Permanent')
  if (minutes >= 1440) {
    return t('{{count}} days', { count: Math.round(minutes / 1440) })
  }
  if (minutes >= 60) {
    return t('{{count}} hours', { count: Math.round(minutes / 60) })
  }
  return t('{{count}} minutes', { count: minutes })
}
