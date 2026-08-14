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
import { Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface UpstreamUpdateDialogProps {
  open: boolean
  addModels: string[]
  removeModels: string[]
  preferredTab: 'add' | 'remove'
  confirmLoading: boolean
  onConfirm: (data: { addModels: string[]; removeModels: string[] }) => void
  onCancel: () => void
}

export function UpstreamUpdateDialog(props: UpstreamUpdateDialogProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState(props.preferredTab)
  const [searchAdd, setSearchAdd] = useState('')
  const [searchRemove, setSearchRemove] = useState('')
  const [selectedAdd, setSelectedAdd] = useState<Set<string>>(
    () => new Set(props.addModels)
  )
  const [selectedRemove, setSelectedRemove] = useState<Set<string>>(
    () => new Set(props.removeModels)
  )
  const [partialConfirmOpen, setPartialConfirmOpen] = useState(false)

  const filteredAdd = useMemo(
    () =>
      props.addModels.filter((m) =>
        m.toLowerCase().includes(searchAdd.toLowerCase())
      ),
    [props.addModels, searchAdd]
  )

  const filteredRemove = useMemo(
    () =>
      props.removeModels.filter((m) =>
        m.toLowerCase().includes(searchRemove.toLowerCase())
      ),
    [props.removeModels, searchRemove]
  )

  const toggleModel = (
    model: string,
    set: Set<string>,
    setter: (s: Set<string>) => void
  ) => {
    const next = new Set(set)
    if (next.has(model)) next.delete(model)
    else next.add(model)
    setter(next)
  }

  const toggleAllVisible = (
    models: string[],
    set: Set<string>,
    setter: (s: Set<string>) => void
  ) => {
    const allSelected = models.every((m) => set.has(m))
    const next = new Set(set)
    if (allSelected) {
      models.forEach((m) => next.delete(m))
    } else {
      models.forEach((m) => next.add(m))
    }
    setter(next)
  }

  const handleConfirm = () => {
    const hasAdd = props.addModels.length > 0
    const hasRemove = props.removeModels.length > 0
    const selectedAddArr = [...selectedAdd]
    const selectedRemoveArr = [...selectedRemove]
    const anyAdd = selectedAddArr.length > 0
    const anyRemove = selectedRemoveArr.length > 0

    if (hasAdd && hasRemove && anyAdd !== anyRemove) {
      setPartialConfirmOpen(true)
      return
    }

    props.onConfirm({
      addModels: selectedAddArr,
      removeModels: selectedRemoveArr,
    })
  }

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={(v) => !v && props.onCancel()}
        title={t('Upstream Model Updates')}
        contentClassName='sm:max-w-lg max-md:inset-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:!max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:!w-screen max-md:!rounded-none max-md:gap-3 max-md:!p-3 max-md:[&>div:nth-child(2)]:min-h-0 max-md:[&>div:nth-child(2)]:flex-1 max-md:[&>div:nth-child(2)]:h-auto max-md:[&>div:nth-child(2)]:max-h-none'
        contentHeight='auto'
        bodyClassName='space-y-4 max-md:min-w-0'
        footerClassName='max-md:!flex-col max-md:items-stretch max-md:!-mx-3 max-md:!-mb-3 max-md:!p-3 max-md:!pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]'
        footer={
          <>
            <Button
              variant='outline'
              onClick={props.onCancel}
              className='max-md:w-full'
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleConfirm}
              className='max-md:w-full'
              disabled={
                props.confirmLoading ||
                (props.addModels.length === 0 &&
                  props.removeModels.length === 0)
              }
            >
              {t('Confirm')}
            </Button>
          </>
        }
      >
        <p className='text-muted-foreground text-sm'>
          {t(
            'Select models to process. Unselected "add" models will be ignored.'
          )}
        </p>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'add' | 'remove')}
          className='min-w-0'
        >
          <TabsList className='grid w-full grid-cols-2 max-md:h-auto'>
            <TabsTrigger
              value='add'
              className='min-w-0 gap-1 max-md:text-center max-md:leading-tight max-md:whitespace-normal'
            >
              {t('Add Models')}
              <StatusBadge variant='neutral' className='ml-1' copyable={false}>
                {selectedAdd.size}/{props.addModels.length}
              </StatusBadge>
            </TabsTrigger>
            <TabsTrigger
              value='remove'
              className='min-w-0 gap-1 max-md:text-center max-md:leading-tight max-md:whitespace-normal'
            >
              {t('Remove Models')}
              <StatusBadge variant='neutral' className='ml-1' copyable={false}>
                {selectedRemove.size}/{props.removeModels.length}
              </StatusBadge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value='add' className='space-y-3'>
            <div className='relative min-w-0'>
              <Search className='text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4' />
              <Input
                placeholder={t('Search models...')}
                className='pl-8'
                value={searchAdd}
                onChange={(e) => setSearchAdd(e.target.value)}
              />
            </div>
            {filteredAdd.length > 0 && (
              <div className='flex items-center gap-2'>
                <Checkbox
                  checked={filteredAdd.every((m) => selectedAdd.has(m))}
                  onCheckedChange={() =>
                    toggleAllVisible(filteredAdd, selectedAdd, setSelectedAdd)
                  }
                />
                <span className='text-muted-foreground text-xs'>
                  {t('Select All Visible')}
                </span>
              </div>
            )}
            <ScrollArea className='h-[280px] min-w-0 rounded-md border p-2 max-md:h-auto max-md:overflow-visible max-md:[&_[data-slot=scroll-area-scrollbar]]:hidden max-md:[&_[data-slot=scroll-area-viewport]]:h-auto max-md:[&_[data-slot=scroll-area-viewport]]:overflow-visible'>
              {filteredAdd.length > 0 ? (
                <div className='min-w-0 space-y-1'>
                  {filteredAdd.map((model) => (
                    <label
                      key={model}
                      className='hover:bg-accent flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5'
                    >
                      <Checkbox
                        checked={selectedAdd.has(model)}
                        onCheckedChange={() =>
                          toggleModel(model, selectedAdd, setSelectedAdd)
                        }
                      />
                      <span className='min-w-0 truncate text-sm max-md:overflow-visible max-md:break-all max-md:whitespace-normal'>
                        {model}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className='text-muted-foreground py-8 text-center text-sm'>
                  {props.addModels.length === 0
                    ? t('No models to add')
                    : t('No matching results')}
                </p>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value='remove' className='space-y-3'>
            <div className='relative min-w-0'>
              <Search className='text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4' />
              <Input
                placeholder={t('Search models...')}
                className='pl-8'
                value={searchRemove}
                onChange={(e) => setSearchRemove(e.target.value)}
              />
            </div>
            {filteredRemove.length > 0 && (
              <div className='flex items-center gap-2'>
                <Checkbox
                  checked={filteredRemove.every((m) => selectedRemove.has(m))}
                  onCheckedChange={() =>
                    toggleAllVisible(
                      filteredRemove,
                      selectedRemove,
                      setSelectedRemove
                    )
                  }
                />
                <span className='text-muted-foreground text-xs'>
                  {t('Select All Visible')}
                </span>
              </div>
            )}
            <ScrollArea className='h-[280px] min-w-0 rounded-md border p-2 max-md:h-auto max-md:overflow-visible max-md:[&_[data-slot=scroll-area-scrollbar]]:hidden max-md:[&_[data-slot=scroll-area-viewport]]:h-auto max-md:[&_[data-slot=scroll-area-viewport]]:overflow-visible'>
              {filteredRemove.length > 0 ? (
                <div className='min-w-0 space-y-1'>
                  {filteredRemove.map((model) => (
                    <label
                      key={model}
                      className='hover:bg-accent flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5'
                    >
                      <Checkbox
                        checked={selectedRemove.has(model)}
                        onCheckedChange={() =>
                          toggleModel(model, selectedRemove, setSelectedRemove)
                        }
                      />
                      <span className='min-w-0 truncate text-sm max-md:overflow-visible max-md:break-all max-md:whitespace-normal'>
                        {model}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className='text-muted-foreground py-8 text-center text-sm'>
                  {props.removeModels.length === 0
                    ? t('No models to remove')
                    : t('No matching results')}
                </p>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Dialog>

      <ConfirmDialog
        open={partialConfirmOpen}
        onOpenChange={setPartialConfirmOpen}
        title={t('Partial Submission')}
        desc={t(
          'There are both add and remove models pending, but you only selected one type. Confirm submitting only the selected items?'
        )}
        handleConfirm={() => {
          setPartialConfirmOpen(false)
          props.onConfirm({
            addModels: [...selectedAdd],
            removeModels: [...selectedRemove],
          })
        }}
      />
    </>
  )
}
