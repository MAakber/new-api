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

import { zodResolver } from '@hookform/resolvers/zod'
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { ExternalLink, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useAdminBanners } from '@/features/banners'
import {
  deleteBanner,
  createBanner,
  updateBanner,
} from '@/features/banners/api'
import { createBannerSchema } from '@/features/banners/lib/banner-schema'
import {
  BANNER_TYPE_OPTIONS,
  formatBannerDate,
  getDefaultBannerValues,
  toBannerPayload,
} from '@/features/banners/lib/banner-utils'
import type {
  Banner,
  BannerFormValues,
  CreateBannerPayload,
  UpdateBannerPayload,
} from '@/features/banners/types'
import { getPreviewText } from '@/features/dashboard/lib'

import { BannerForm } from '../../banners/components/banner-form'
import { bannerQueryKeys } from '../../banners/hooks/use-banners'
import { SettingsSection } from '../components/settings-section'

const BANNER_FORM_ID = 'banner-form'
type BannerMutationPayload = CreateBannerPayload | UpdateBannerPayload

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function invalidateBannerQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bannerQueryKeys.admin }),
    queryClient.invalidateQueries({ queryKey: bannerQueryKeys.public }),
  ])
}

function getTypeOption(type: Banner['type']) {
  return (
    BANNER_TYPE_OPTIONS.find((option) => option.value === type) ??
    BANNER_TYPE_OPTIONS[0]
  )
}

export function BannersSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const bannersQuery = useAdminBanners()
  const [showDialog, setShowDialog] = useState(false)
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null)

  const schema = useMemo(() => createBannerSchema(t), [t])
  const form = useForm<BannerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultBannerValues(),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: BannerMutationPayload) => {
      if ('id' in payload) {
        return updateBanner(payload)
      }

      return createBanner(payload)
    },
    onSuccess: async (_response, variables) => {
      await invalidateBannerQueries(queryClient)
      setShowDialog(false)
      setEditingBanner(null)
      const message =
        'id' in variables
          ? 'Banner updated successfully'
          : 'Banner created successfully'
      toast.success(t(message))
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('Failed to save banner')))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBanner(id),
    onSuccess: async () => {
      await invalidateBannerQueries(queryClient)
      setDeleteTarget(null)
      toast.success(t('Banner deleted successfully'))
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t('Failed to delete banner')))
    },
  })

  const banners = useMemo(
    () =>
      [...(bannersQuery.data ?? [])].sort((left, right) => {
        const sortDifference = right.sortOrder - left.sortOrder
        if (sortDifference !== 0) return sortDifference

        return (
          new Date(right.publishDate).getTime() -
          new Date(left.publishDate).getTime()
        )
      }),
    [bannersQuery.data]
  )

  const handleAdd = () => {
    setEditingBanner(null)
    form.reset(getDefaultBannerValues())
    setShowDialog(true)
  }

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner)
    form.reset({
      content: banner.content,
      publishDate: banner.publishDate,
      type: banner.type,
      extra: banner.extra,
      enabled: banner.enabled,
      sortOrder: banner.sortOrder,
      startDate: banner.startDate ?? '',
      endDate: banner.endDate ?? '',
      link: banner.link,
    })
    setShowDialog(true)
  }

  const handleSubmit: SubmitHandler<BannerFormValues> = (values) => {
    if (editingBanner) {
      saveMutation.mutate(toBannerPayload(values, editingBanner.id))
      return
    }

    saveMutation.mutate(toBannerPayload(values))
  }

  const handleDialogChange = (open: boolean) => {
    if (saveMutation.isPending) return
    setShowDialog(open)
  }

  const showLoadingState = bannersQuery.isLoading
  const showErrorState = !showLoadingState && bannersQuery.isError
  const showTable = !showLoadingState && !bannersQuery.isError

  let submitButtonLabel = t('Add')
  if (saveMutation.isPending) {
    submitButtonLabel = t('Saving...')
  } else if (editingBanner) {
    submitButtonLabel = t('Update')
  }

  return (
    <SettingsSection title={t('Banners')}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Button onClick={handleAdd} size='sm'>
            <Plus data-icon='inline-start' />
            {t('Add Banner')}
          </Button>
          <Button
            aria-label={t('Refresh')}
            disabled={bannersQuery.isFetching}
            onClick={() => bannersQuery.refetch()}
            size='sm'
            type='button'
            variant='outline'
          >
            <RefreshCw
              aria-hidden='true'
              className={bannersQuery.isFetching ? 'animate-spin' : undefined}
            />
            {t('Refresh')}
          </Button>
        </div>

        {showLoadingState && (
          <div className='text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm'>
            <Spinner aria-hidden='true' />
            {t('Loading banners...')}
          </div>
        )}
        {showErrorState && (
          <div className='border-destructive/40 bg-destructive/5 text-destructive flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border px-4 text-center text-sm'>
            <p>{t('Failed to load banners')}</p>
            <Button
              onClick={() => bannersQuery.refetch()}
              size='sm'
              type='button'
              variant='outline'
            >
              {t('Retry')}
            </Button>
          </div>
        )}
        {showTable && (
          <StaticDataTable
            className='overflow-x-auto'
            data={banners}
            emptyContent={t(
              'No banners yet. Click "Add Banner" to create one.'
            )}
            getRowKey={(banner) => banner.id}
            tableClassName='min-w-[62rem]'
            columns={[
              {
                id: 'content',
                header: t('Content'),
                cellClassName: 'max-w-xs truncate font-medium',
                cell: (banner) => getPreviewText(banner.content, 160),
              },
              {
                id: 'enabled',
                header: t('Enabled'),
                cell: (banner) => (
                  <StatusBadge
                    copyable={false}
                    label={banner.enabled ? t('Enabled') : t('Disabled')}
                    variant={banner.enabled ? 'success' : 'neutral'}
                  />
                ),
              },
              {
                id: 'sort-order',
                header: t('Sort Order'),
                cell: (banner) => banner.sortOrder,
              },
              {
                id: 'publish-date',
                header: t('Publish Date'),
                cell: (banner) => formatBannerDate(banner.publishDate),
              },
              {
                id: 'display-window',
                header: t('Display window'),
                cell: (banner) => (
                  <div className='flex flex-col gap-1 text-xs'>
                    <span>
                      <span className='text-muted-foreground'>
                        {t('Start')}:
                      </span>{' '}
                      {formatBannerDate(banner.startDate)}
                    </span>
                    <span className='text-muted-foreground'>
                      <span>{t('End')}:</span>{' '}
                      {formatBannerDate(banner.endDate)}
                    </span>
                  </div>
                ),
              },
              {
                id: 'type',
                header: t('Type'),
                cell: (banner) => {
                  const option = getTypeOption(banner.type)
                  return (
                    <StatusBadge
                      copyable={false}
                      label={t(option.labelKey)}
                      variant={option.badgeVariant}
                    />
                  )
                },
              },
              {
                id: 'extra',
                header: t('Extra'),
                cellClassName: 'text-muted-foreground max-w-xs truncate',
                cell: (banner) => banner.extra || '—',
              },
              {
                id: 'link',
                header: t('Link'),
                cell: (banner) => {
                  const link = banner.link
                  return link ? (
                    <a
                      className='text-primary inline-flex items-center gap-1 hover:underline'
                      href={link}
                      rel='noopener noreferrer'
                      target='_blank'
                    >
                      {t('Open')}
                      <ExternalLink aria-hidden='true' className='size-3' />
                    </a>
                  ) : (
                    '—'
                  )
                },
              },
              {
                id: 'actions',
                header: t('Actions'),
                cell: (banner) => (
                  <StaticRowActions
                    deleteLabel={t('Delete')}
                    editLabel={t('Edit')}
                    menuLabel={t('Open menu')}
                    onDelete={() => setDeleteTarget(banner)}
                    onEdit={() => handleEdit(banner)}
                  />
                ),
              },
            ]}
          />
        )}
      </div>

      <Dialog
        open={showDialog}
        onOpenChange={handleDialogChange}
        title={editingBanner ? t('Edit Banner') : t('Add Banner')}
        description={t('Create or update public banners')}
        contentClassName='max-w-3xl'
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              disabled={saveMutation.isPending}
              onClick={() => setShowDialog(false)}
              type='button'
              variant='outline'
            >
              {t('Cancel')}
            </Button>
            <Button
              disabled={saveMutation.isPending}
              form={BANNER_FORM_ID}
              type='submit'
            >
              {submitButtonLabel}
            </Button>
          </>
        }
      >
        <BannerForm
          form={form}
          formId={BANNER_FORM_ID}
          onSubmit={handleSubmit}
        />
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null)
        }}
        title={t('Delete banner?')}
        desc={t('This banner will be deleted permanently.')}
        confirmText={t('Delete')}
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
    </SettingsSection>
  )
}
