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
import { Download, FileDown, Filter, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { exportRedemptions } from '../api'
import type { RedemptionExportScope } from '../types'

type ExportOptions = {
  selectedIds: number[]
  keyword: string
  status: string
}

function useRedemptionExport(options: ExportOptions) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState<RedemptionExportScope | null>(null)

  const runExport = async (scope: RedemptionExportScope) => {
    setExporting(scope)
    try {
      await exportRedemptions({
        scope,
        ids: scope === 'selected' ? options.selectedIds : undefined,
        keyword: scope === 'filtered' ? options.keyword : undefined,
        status: scope === 'filtered' ? options.status : undefined,
      })
      toast.success(t('Redemption codes exported'))
    } catch {
      toast.error(t('Failed to export redemption codes'))
    } finally {
      setExporting(null)
    }
  }

  return { exporting, runExport }
}

export function RedemptionsExportMenu(props: ExportOptions) {
  const { t } = useTranslation()
  const { exporting, runExport } = useRedemptionExport(props)
  const isExporting = exporting !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant='outline' size='sm' disabled={isExporting} />}
      >
        {isExporting ? <Loader2 className='animate-spin' /> : <Download />}
        {t('Export')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuItem
          disabled={props.selectedIds.length === 0}
          onClick={() => runExport('selected')}
        >
          {t('Export selected')} ({props.selectedIds.length})
          <DropdownMenuShortcut>
            <Download />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => runExport('filtered')}>
          {t('Export current results')}
          <DropdownMenuShortcut>
            <Filter />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => runExport('all')}>
          {t('Export all codes')}
          <DropdownMenuShortcut>
            <FileDown />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SelectedRedemptionsExportButton(props: ExportOptions) {
  const { t } = useTranslation()
  const { exporting, runExport } = useRedemptionExport(props)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            disabled={exporting !== null || props.selectedIds.length === 0}
            onClick={() => runExport('selected')}
            aria-label={t('Export selected codes')}
          />
        }
      >
        {exporting ? <Loader2 className='animate-spin' /> : <Download />}
      </TooltipTrigger>
      <TooltipContent>{t('Export selected codes')}</TooltipContent>
    </Tooltip>
  )
}
