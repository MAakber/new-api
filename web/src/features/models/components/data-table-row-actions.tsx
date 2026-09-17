import { useQueryClient } from '@tanstack/react-query'
import type { Row } from '@tanstack/react-table'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableRowActionMenu } from '@/components/data-table/core/row-action-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'
import { useCanEditModelPricing } from '@/features/model-pricing/api'

import { handleToggleModelStatus, isModelEnabled } from '../lib'
import type { Model } from '../types'
import { ModelDeleteDialog } from './dialogs/model-delete-dialog'
import { useModels } from './models-provider'

interface DataTableRowActionsProps {
  row: Row<Model>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { t } = useTranslation()
  const canPrice = useCanEditModelPricing()
  const model = row.original
  const { setOpen, setCurrentRow } = useModels()
  const queryClient = useQueryClient()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const isEnabled = isModelEnabled(model)

  const handleEdit = () => {
    setCurrentRow(model)
    setOpen('update-model')
  }

  const handleToggleStatus = () => {
    handleToggleModelStatus(model.id, model.status, queryClient)
  }

  const toggleLabel = isEnabled
    ? t('Hide from model square')
    : t('Show in model square')

  return (
    <div className='-ml-1.5 flex min-w-0 items-center gap-1 [&>button]:min-w-0 [&>button]:shrink'>
      <Button
        variant='ghost'
        size='sm'
        onClick={handleEdit}
        title={model.id > 0 ? t('Edit') : t('Add metadata')}
      >
        <span className='truncate'>
          {model.id > 0 ? t('Edit') : t('Add metadata')}
        </span>
      </Button>

      {canPrice && (
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            setCurrentRow(model)
            setOpen('price-model')
          }}
        >
          <span className='truncate'>{t('Pricing')}</span>
        </Button>
      )}

      {model.id > 0 && (
        <DataTableRowActionMenu ariaLabel={t('Open menu')}>
          <DropdownMenuItem onClick={handleToggleStatus}>
            {toggleLabel}
            <DropdownMenuShortcut>
              {isEnabled ? <EyeOff size={16} /> : <Eye size={16} />}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setDeleteConfirmOpen(true)
            }}
            className='text-destructive focus:text-destructive'
          >
            {t('Delete')}
            <DropdownMenuShortcut>
              <Trash2 size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DataTableRowActionMenu>
      )}

      {deleteConfirmOpen && (
        <ModelDeleteDialog
          models={[model]}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      )}
    </div>
  )
}
