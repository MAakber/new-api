import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'

import {
  SyncPriceCell,
  SyncSourceHeader,
  SyncSourcePriceCell,
} from './upstream-price-cells'
import { getUpstreamDisplayName } from './upstream-ratio-sync-helpers'
import type { PricingSyncRow } from './upstream-ratio-sync-table'

export function useUpstreamRatioSyncColumns(
  upstreamNames: string[],
  isMobile: boolean
): ColumnDef<PricingSyncRow>[] {
  const { t } = useTranslation()
  // Selection travels through context so toggling a checkbox does not replace
  // column renderer functions, remount the control and lose keyboard focus.
  return useMemo(
    () => [
      {
        accessorKey: 'model',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
        size: 220,
        minSize: 180,
        meta: { mobileTitle: true },
        cell: ({ row }) => (
          <span
            className='block max-w-72 truncate font-medium'
            title={row.original.model}
          >
            {row.original.model}
          </span>
        ),
      },
      {
        id: 'current',
        header: t('Current Price'),
        size: 240,
        minSize: 220,
        cell: ({ row }) => (
          <SyncPriceCell values={row.original.prices.current} />
        ),
      },
      ...upstreamNames.map(
        (source): ColumnDef<PricingSyncRow> => ({
          id: `upstream_${source}`,
          size: upstreamNames.length === 1 ? 420 : 320,
          minSize: 280,
          header: isMobile
            ? getUpstreamDisplayName(source, t)
            : () => <SyncSourceHeader source={source} />,
          cell: ({ row }) => (
            <SyncSourcePriceCell row={row.original} source={source} />
          ),
        })
      ),
    ],
    [upstreamNames, isMobile, t]
  )
}
