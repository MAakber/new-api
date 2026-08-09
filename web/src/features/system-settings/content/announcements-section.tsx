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
import type { TFunction } from 'i18next'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { DateTimePicker } from '@/components/datetime-picker'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type AnnouncementType = 'default' | 'ongoing' | 'success' | 'warning' | 'error'

type Announcement = {
  rowId: number
  source: Record<string, unknown>
  content: string
  publishDate: string
  type: AnnouncementType
  extra: string
}

type AnnouncementsSectionProps = {
  enabled: boolean
  data: string
}

type AnnouncementFormValues = {
  content: string
  publishDate: string
  type: AnnouncementType
  extra: string
}

const announcementTypes = [
  'default',
  'ongoing',
  'success',
  'warning',
  'error',
] as const

const typeOptions = [
  {
    value: 'default',
    labelKey: 'Default',
    color: 'bg-gray-500',
    badgeVariant: 'neutral' as const,
  },
  {
    value: 'ongoing',
    labelKey: 'Ongoing',
    color: 'bg-blue-500',
    badgeVariant: 'info' as const,
  },
  {
    value: 'success',
    labelKey: 'Success',
    color: 'bg-green-500',
    badgeVariant: 'success' as const,
  },
  {
    value: 'warning',
    labelKey: 'Warning',
    color: 'bg-orange-500',
    badgeVariant: 'warning' as const,
  },
  {
    value: 'error',
    labelKey: 'Error',
    color: 'bg-red-500',
    badgeVariant: 'danger' as const,
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeAnnouncement(
  value: Record<string, unknown>,
  index: number
): Announcement {
  const itemType = value.type as AnnouncementType
  const type = announcementTypes.includes(itemType) ? itemType : 'default'
  const rowId =
    typeof value.id === 'number' && Number.isFinite(value.id)
      ? value.id
      : index + 1

  return {
    rowId,
    source: { ...value },
    content: typeof value.content === 'string' ? value.content : '',
    publishDate: typeof value.publishDate === 'string' ? value.publishDate : '',
    type,
    extra: typeof value.extra === 'string' ? value.extra : '',
  }
}

function toAnnouncementPayload(announcement: Announcement) {
  return {
    ...announcement.source,
    content: announcement.content,
    publishDate: announcement.publishDate,
    type: announcement.type,
    extra: announcement.extra,
  }
}

function getDefaultAnnouncementValues(): AnnouncementFormValues {
  return {
    content: '',
    publishDate: new Date().toISOString(),
    type: 'default',
    extra: '',
  }
}

function createAnnouncementSchema(t: TFunction) {
  return z.object({
    content: z
      .string()
      .min(1, t('Content is required'))
      .max(500, t('Content must be less than 500 characters')),
    publishDate: z
      .string()
      .min(1, t('Publish date is required'))
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        t('Publish date must be a valid date')
      ),
    type: z.enum(announcementTypes),
    extra: z.string().max(200, t('Extra must be less than 200 characters')),
  })
}

function formatPublishDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

const ANNOUNCEMENT_FORM_ID = 'announcement-form'

export function AnnouncementsSection({
  enabled,
  data,
}: AnnouncementsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<Announcement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<'single' | 'batch'>('single')

  const schema = useMemo(() => createAnnouncementSchema(t), [t])
  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultAnnouncementValues(),
  })

  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(data || '[]')
      if (!Array.isArray(parsed)) {
        setAnnouncements([])
        return
      }

      setAnnouncements(
        parsed
          .filter(isRecord)
          .map((item, index) => normalizeAnnouncement(item, index))
      )
    } catch {
      setAnnouncements([])
    }
  }, [data])

  useEffect(() => {
    setIsEnabled(enabled)
  }, [enabled])

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.announcements_enabled',
        value: checked,
      })
      setIsEnabled(checked)
      toast.success(t('Setting saved'))
    } catch {
      toast.error(t('Failed to update setting'))
    }
  }

  const handleAdd = () => {
    setEditingAnnouncement(null)
    form.reset(getDefaultAnnouncementValues())
    setShowDialog(true)
  }

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    form.reset({
      content: announcement.content,
      publishDate: announcement.publishDate,
      type: announcement.type,
      extra: announcement.extra,
    })
    setShowDialog(true)
  }

  const handleDelete = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    setDeleteTarget('single')
    setShowDeleteDialog(true)
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error(t('Please select items to delete'))
      return
    }
    setDeleteTarget('batch')
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (deleteTarget === 'single' && editingAnnouncement) {
      setAnnouncements((prev) =>
        prev.filter((item) => item.rowId !== editingAnnouncement.rowId)
      )
      setHasChanges(true)
      toast.success(t('Announcement deleted. Click "Save Settings" to apply.'))
    } else if (deleteTarget === 'batch') {
      setAnnouncements((prev) =>
        prev.filter((item) => !selectedIds.includes(item.rowId))
      )
      setSelectedIds([])
      setHasChanges(true)
      toast.success(
        t('{{count}} announcements deleted. Click "Save Settings" to apply.', {
          count: selectedIds.length,
        })
      )
    }
    setShowDeleteDialog(false)
    setEditingAnnouncement(null)
  }

  const handleSubmit: SubmitHandler<AnnouncementFormValues> = (values) => {
    if (editingAnnouncement) {
      setAnnouncements((prev) =>
        prev.map((item) =>
          item.rowId === editingAnnouncement.rowId
            ? {
                ...item,
                source: { ...item.source, ...values },
                ...values,
              }
            : item
        )
      )
      toast.success(t('Announcement updated. Click "Save Settings" to apply.'))
    } else {
      const newId = Math.max(...announcements.map((item) => item.rowId), 0) + 1
      setAnnouncements((prev) => [
        ...prev,
        {
          rowId: newId,
          source: { id: newId, ...values },
          ...values,
        },
      ])
      toast.success(t('Announcement added. Click "Save Settings" to apply.'))
    }
    setHasChanges(true)
    setShowDialog(false)
  }

  const handleSaveAll = async () => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.announcements',
        value: JSON.stringify(announcements.map(toAnnouncementPayload)),
      })
      setHasChanges(false)
      toast.success(t('Announcements saved successfully'))
    } catch {
      toast.error(t('Failed to save announcements'))
    }
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? announcements.map((item) => item.rowId) : [])
  }

  const toggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    )
  }

  return (
    <SettingsSection title={t('Announcements')}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button onClick={handleAdd} size='sm'>
              <Plus data-icon='inline-start' />
              {t('Add Announcement')}
            </Button>
            <Button
              onClick={handleBatchDelete}
              size='sm'
              variant='destructive'
              disabled={selectedIds.length === 0}
            >
              <Trash2 data-icon='inline-start' />
              {t('Delete (')}
              {selectedIds.length})
            </Button>
            <Button
              onClick={handleSaveAll}
              size='sm'
              variant='secondary'
              disabled={!hasChanges || updateOption.isPending}
            >
              <Save data-icon='inline-start' />
              {updateOption.isPending ? t('Saving...') : t('Save Settings')}
            </Button>
          </div>
          <SettingsSwitchField
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
            label={t('Enabled')}
            className='py-0'
          />
        </div>

        <StaticDataTable
          data={announcements}
          getRowKey={(announcement) => announcement.rowId}
          emptyContent={t(
            'No announcements yet. Click "Add Announcement" to create one.'
          )}
          columns={[
            {
              id: 'select',
              header: (
                <Checkbox
                  checked={
                    selectedIds.length === announcements.length &&
                    announcements.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              ),
              className: 'w-12',
              cell: (announcement) => (
                <Checkbox
                  checked={selectedIds.includes(announcement.rowId)}
                  onCheckedChange={(checked) =>
                    toggleSelectOne(announcement.rowId, checked as boolean)
                  }
                />
              ),
            },
            {
              id: 'content',
              header: t('Content'),
              cellClassName: 'max-w-xs truncate',
              cell: (announcement) => announcement.content,
            },
            {
              id: 'publish-date',
              header: t('Publish Date'),
              cell: (announcement) =>
                formatPublishDate(announcement.publishDate),
            },
            {
              id: 'type',
              header: t('Type'),
              cell: (announcement) => (
                <StatusBadge
                  label={t(
                    typeOptions.find((opt) => opt.value === announcement.type)
                      ?.labelKey ?? 'Default'
                  )}
                  variant={
                    typeOptions.find((opt) => opt.value === announcement.type)
                      ?.badgeVariant ?? 'neutral'
                  }
                  copyable={false}
                />
              ),
            },
            {
              id: 'extra',
              header: t('Extra'),
              cellClassName: 'text-muted-foreground max-w-xs truncate',
              cell: (announcement) => announcement.extra || '—',
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (announcement) => (
                <StaticRowActions
                  editLabel={t('Edit')}
                  deleteLabel={t('Delete')}
                  menuLabel={t('Open menu')}
                  onEdit={() => handleEdit(announcement)}
                  onDelete={() => handleDelete(announcement)}
                />
              ),
            },
          ]}
        />
      </div>

      <Dialog
        open={showDialog}
        onOpenChange={setShowDialog}
        title={
          editingAnnouncement ? t('Edit Announcement') : t('Add Announcement')
        }
        description={t(
          'Create or update system announcements for the dashboard'
        )}
        contentClassName='max-w-2xl'
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowDialog(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' form={ANNOUNCEMENT_FORM_ID}>
              {editingAnnouncement ? t('Update') : t('Add')}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            id={ANNOUNCEMENT_FORM_ID}
            onSubmit={form.handleSubmit(handleSubmit)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='content'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Content')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t(
                        'Enter announcement content (supports Markdown/HTML)'
                      )}
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Maximum 500 characters. Supports Markdown and HTML.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='publishDate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Publish Date')}</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(date) =>
                        field.onChange(date ? date.toISOString() : '')
                      }
                      placeholder={t('Select publish date')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Date and time when this announcement should be displayed'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Type')}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={typeOptions.map((option) => ({
                      value: option.value,
                      label: t(option.labelKey),
                    }))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t('Select announcement type')}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {typeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className='flex items-center gap-2'>
                              <div
                                aria-hidden='true'
                                className={`h-3 w-3 rounded-full ${option.color}`}
                              />
                              {t(option.labelKey)}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='extra'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Extra Notes (Optional)')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('Additional information')}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Optional supplementary information (max 200 characters)'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === 'single'
                ? t('This announcement will be removed from the list.')
                : t('{{count}} announcements will be removed from the list.', {
                    count: selectedIds.length,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={confirmDelete}>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
