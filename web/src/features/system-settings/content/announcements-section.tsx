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
import { ExternalLink, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { AnnouncementItem } from '@/features/dashboard/types'
import { getSafeAnnouncementLink } from '@/lib/announcement-utils'
import dayjs from '@/lib/dayjs'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type Announcement = AnnouncementItem & {
  id: number
  content: string
  publishDate: string
}

type AnnouncementsSectionProps = {
  enabled: boolean
  data: string
}

const ANNOUNCEMENT_SORT_ORDER_MIN = -2147483648
const ANNOUNCEMENT_SORT_ORDER_MAX = 2147483647

const announcementTypes = [
  'default',
  'ongoing',
  'success',
  'warning',
  'error',
] as const

function isValidOptionalDate(value: string): boolean {
  return value === '' || !Number.isNaN(Date.parse(value))
}

const announcementSchema = z
  .object({
    content: z
      .string()
      .min(1, 'Content is required')
      .max(500, 'Content must be less than 500 characters'),
    publishDate: z.string().min(1, 'Publish date is required'),
    type: z.enum(announcementTypes),
    extra: z
      .string()
      .max(200, 'Extra must be less than 200 characters')
      .optional(),
    enabled: z.boolean(),
    sortOrder: z
      .number()
      .int('Sort order must be a whole number')
      .min(
        ANNOUNCEMENT_SORT_ORDER_MIN,
        'Sort order is below the supported minimum'
      )
      .max(
        ANNOUNCEMENT_SORT_ORDER_MAX,
        'Sort order is above the supported maximum'
      )
      .optional(),
    startDate: z
      .string()
      .refine(isValidOptionalDate, 'Start date must be a valid date')
      .optional(),
    endDate: z
      .string()
      .refine(isValidOptionalDate, 'End date must be a valid date')
      .optional(),
    link: z
      .string()
      .max(500, 'Link must be less than 500 characters')
      .refine(
        (value) => value === '' || Boolean(getSafeAnnouncementLink(value)),
        'Link must be a valid HTTP or HTTPS URL'
      )
      .optional(),
  })
  .superRefine((values, context) => {
    if (!values.startDate || !values.endDate) return

    if (Date.parse(values.startDate) > Date.parse(values.endDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Start date cannot be later than end date',
        path: ['endDate'],
      })
    }
  })

type AnnouncementFormValues = z.infer<typeof announcementSchema>

const ANNOUNCEMENT_FORM_ID = 'announcement-form'

function getDefaultAnnouncementValues(): AnnouncementFormValues {
  return {
    content: '',
    publishDate: new Date().toISOString(),
    type: 'default',
    extra: '',
    enabled: true,
    sortOrder: undefined,
    startDate: '',
    endDate: '',
    link: '',
  }
}

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
  item: Record<string, unknown>,
  index: number
): Announcement {
  const type = announcementTypes.includes(
    item.type as (typeof announcementTypes)[number]
  )
    ? (item.type as Announcement['type'])
    : 'default'
  const announcement: Announcement = {
    ...item,
    id:
      typeof item.id === 'number' && Number.isFinite(item.id)
        ? item.id
        : index + 1,
    content: typeof item.content === 'string' ? item.content : '',
    publishDate: typeof item.publishDate === 'string' ? item.publishDate : '',
    type,
    extra: typeof item.extra === 'string' ? item.extra : '',
    enabled: item.enabled !== false,
  }

  if (
    typeof item.sortOrder === 'number' &&
    Number.isInteger(item.sortOrder) &&
    item.sortOrder >= ANNOUNCEMENT_SORT_ORDER_MIN &&
    item.sortOrder <= ANNOUNCEMENT_SORT_ORDER_MAX
  ) {
    announcement.sortOrder = item.sortOrder
  } else {
    delete announcement.sortOrder
  }

  for (const field of ['startDate', 'endDate'] as const) {
    const value = typeof item[field] === 'string' ? item[field].trim() : ''
    if (value && isValidOptionalDate(value)) {
      announcement[field] = value
    } else {
      delete announcement[field]
    }
  }

  const link = typeof item.link === 'string' ? item.link.trim() : ''
  if (link && getSafeAnnouncementLink(link)) {
    announcement.link = link
  } else {
    delete announcement.link
  }

  return announcement
}

function toAnnouncementPayload(announcement: Announcement): Announcement {
  const payload = { ...announcement }
  if (!payload.startDate) delete payload.startDate
  if (!payload.endDate) delete payload.endDate
  if (!payload.link) delete payload.link
  if (payload.sortOrder === undefined) delete payload.sortOrder
  return payload
}

function formatOptionalDate(value?: string): string {
  if (!value) return '—'
  const date = dayjs(value)
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : '—'
}

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

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
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
      type: announcement.type ?? 'default',
      extra: announcement.extra || '',
      enabled: announcement.enabled !== false,
      sortOrder: announcement.sortOrder,
      startDate: announcement.startDate || '',
      endDate: announcement.endDate || '',
      link: announcement.link || '',
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
        prev.filter((item) => item.id !== editingAnnouncement.id)
      )
      setHasChanges(true)
      toast.success(t('Announcement deleted. Click "Save Settings" to apply.'))
    } else if (deleteTarget === 'batch') {
      setAnnouncements((prev) =>
        prev.filter((item) => !selectedIds.includes(item.id))
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

  const handleSubmitForm = (values: AnnouncementFormValues) => {
    if (editingAnnouncement) {
      setAnnouncements((prev) =>
        prev.map((item, index) =>
          item.id === editingAnnouncement.id
            ? normalizeAnnouncement({ ...item, ...values }, index)
            : item
        )
      )
      toast.success(t('Announcement updated. Click "Save Settings" to apply.'))
    } else {
      const newId = Math.max(...announcements.map((item) => item.id), 0) + 1
      setAnnouncements((prev) => [
        ...prev,
        normalizeAnnouncement({ id: newId, ...values }, prev.length),
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
    setSelectedIds(checked ? announcements.map((item) => item.id) : [])
  }

  const toggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    )
  }

  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((a, b) => {
      const sortOrderDifference = (b.sortOrder ?? 0) - (a.sortOrder ?? 0)
      if (sortOrderDifference !== 0) return sortOrderDifference

      return (
        new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
      )
    })
  }, [announcements])

  const getRelativeTime = (date: string) => {
    const now = new Date()
    const past = new Date(date)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <SettingsSection title={t('Announcements')}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button onClick={handleAdd} size='sm'>
              <Plus className='mr-2 h-4 w-4' />
              {t('Add Announcement')}
            </Button>
            <Button
              onClick={handleBatchDelete}
              size='sm'
              variant='destructive'
              disabled={selectedIds.length === 0}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              {t('Delete (')}
              {selectedIds.length})
            </Button>
            <Button
              onClick={handleSaveAll}
              size='sm'
              variant='secondary'
              disabled={!hasChanges || updateOption.isPending}
            >
              <Save className='mr-2 h-4 w-4' />
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
          data={sortedAnnouncements}
          getRowKey={(announcement) => announcement.id}
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
                  checked={selectedIds.includes(announcement.id)}
                  onCheckedChange={(checked) =>
                    toggleSelectOne(announcement.id, checked as boolean)
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
              id: 'enabled',
              header: t('Enabled'),
              cell: (announcement) => (
                <StatusBadge
                  label={
                    announcement.enabled === false
                      ? t('Disabled')
                      : t('Enabled')
                  }
                  variant={
                    announcement.enabled === false ? 'neutral' : 'success'
                  }
                  copyable={false}
                />
              ),
            },
            {
              id: 'sort-order',
              header: t('Sort Order'),
              cell: (announcement) => announcement.sortOrder ?? '—',
            },
            {
              id: 'publish-date',
              header: t('Publish Date'),
              cell: (announcement) => (
                <div className='flex flex-col gap-1'>
                  <span className='text-sm font-medium'>
                    {getRelativeTime(announcement.publishDate)}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {dayjs(announcement.publishDate).format(
                      'YYYY-MM-DD HH:mm:ss'
                    )}
                  </span>
                </div>
              ),
            },
            {
              id: 'lifecycle',
              header: t('Display window'),
              cell: (announcement) => (
                <div className='flex flex-col gap-1 text-xs'>
                  <span>
                    <span className='text-muted-foreground'>{t('Start')}:</span>{' '}
                    {formatOptionalDate(announcement.startDate)}
                  </span>
                  <span className='text-muted-foreground'>
                    <span>{t('End')}:</span>{' '}
                    {formatOptionalDate(announcement.endDate)}
                  </span>
                </div>
              ),
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
              cell: (announcement) => announcement.extra || '-',
            },
            {
              id: 'link',
              header: t('Link'),
              cell: (announcement) => {
                const link = getSafeAnnouncementLink(announcement.link)
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
        contentClassName='max-w-3xl'
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
            onSubmit={form.handleSubmit(handleSubmitForm)}
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
              name='enabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-xl border px-3 py-2.5'>
                  <div className='space-y-0.5'>
                    <FormLabel>{t('Enabled')}</FormLabel>
                    <FormDescription className='text-xs'>
                      {t('Show this announcement on public pages')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
              name='sortOrder'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Sort Order')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={ANNOUNCEMENT_SORT_ORDER_MIN}
                      max={ANNOUNCEMENT_SORT_ORDER_MAX}
                      step='1'
                      value={field.value ?? ''}
                      onChange={(event) => {
                        const value = event.target.valueAsNumber
                        field.onChange(Number.isNaN(value) ? undefined : value)
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Optional priority. Higher values appear first.')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='startDate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Start date')}</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(date) =>
                        field.onChange(date ? date.toISOString() : '')
                      }
                      placeholder={t('Select date')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Optional start date for this announcement')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='endDate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('End date')}</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(date) =>
                        field.onChange(date ? date.toISOString() : '')
                      }
                      placeholder={t('Select date')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Optional end date for this announcement')}
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
                    items={typeOptions.map((option) => ({
                      value: option.value,
                      label: (
                        <div className='flex items-center gap-2'>
                          <div
                            className={`h-3 w-3 rounded-full ${option.color}`}
                          />
                          {t(option.labelKey)}
                        </div>
                      ),
                    }))}
                    onValueChange={field.onChange}
                    value={field.value}
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
              name='link'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Link')}</FormLabel>
                  <FormControl>
                    <Input
                      type='url'
                      inputMode='url'
                      placeholder={t('Enter URL...')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Optional HTTP or HTTPS destination')}
                  </FormDescription>
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
                    <Input
                      placeholder={t('Additional information')}
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
