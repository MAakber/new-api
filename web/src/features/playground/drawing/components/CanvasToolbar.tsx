import {
  ArrangeIcon,
  Album02Icon,
  Cursor01Icon,
  Delete02Icon,
  Download04Icon,
  HandPointingLeft01Icon,
  ImageAdd01Icon,
  RedoIcon,
  Settings02Icon,
  UndoIcon,
  Upload01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, type Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useDrawingStore } from '@/stores/drawing-store'

type CanvasToolbarProps = {
  tool: 'select' | 'hand'
  onToolChange: (tool: 'select' | 'hand') => void
  onUpload: (files: File[]) => void
  onImport: (file: File) => void
  onExport: () => void
  onClear: () => void
  onSettings: () => void
  onArrange: () => void
  onGallery: () => void
  galleryOpen: boolean
  galleryButtonRef: Ref<HTMLButtonElement>
  busy: boolean
  compact: boolean
  saveStatus: 'loading' | 'saving' | 'saved' | 'error'
}

export function CanvasToolbar(props: CanvasToolbarProps) {
  const { t } = useTranslation()
  const upload = useRef<HTMLInputElement>(null)
  const importFile = useRef<HTMLInputElement>(null)
  const canUndo = useDrawingStore((state) => state.past.length > 0)
  const canRedo = useDrawingStore((state) => state.future.length > 0)
  const count = useDrawingStore((state) => state.nodes.length)
  return (
    <div
      className='bg-background flex min-w-0 shrink-0 items-center gap-2 border-b px-3 py-2'
      role='toolbar'
      aria-label={t('Canvas tools')}
    >
      <div className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto'>
        {props.compact && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={props.onSettings}
          >
            <HugeiconsIcon icon={Settings02Icon} size={15} aria-hidden='true' />
            {t('Generate')}
          </Button>
        )}
        <Button
          type='button'
          variant={props.tool === 'select' ? 'secondary' : 'ghost'}
          size='icon-sm'
          aria-label={t('Select images')}
          title={t('Select images')}
          aria-pressed={props.tool === 'select'}
          onClick={() => props.onToolChange('select')}
        >
          <HugeiconsIcon icon={Cursor01Icon} size={16} aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant={props.tool === 'hand' ? 'secondary' : 'ghost'}
          size='icon-sm'
          aria-label={t('Pan canvas')}
          title={t('Pan canvas')}
          aria-pressed={props.tool === 'hand'}
          onClick={() => props.onToolChange('hand')}
        >
          <HugeiconsIcon
            icon={HandPointingLeft01Icon}
            size={16}
            aria-hidden='true'
          />
        </Button>
        <Separator orientation='vertical' className='mx-1 h-5' />
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={t('Undo')}
          title={t('Undo')}
          disabled={!canUndo}
          onClick={() => useDrawingStore.getState().undo()}
        >
          <HugeiconsIcon icon={UndoIcon} size={16} aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={t('Redo')}
          title={t('Redo')}
          disabled={!canRedo}
          onClick={() => useDrawingStore.getState().redo()}
        >
          <HugeiconsIcon icon={RedoIcon} size={16} aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={t('Arrange images')}
          title={t('Arrange images')}
          disabled={!count}
          onClick={props.onArrange}
        >
          <HugeiconsIcon icon={ArrangeIcon} size={16} aria-hidden='true' />
        </Button>
        <Separator orientation='vertical' className='mx-1 h-5' />
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={props.busy}
          onClick={() => upload.current?.click()}
        >
          <HugeiconsIcon icon={ImageAdd01Icon} size={16} aria-hidden='true' />
          <span className='hidden sm:inline'>{t('Add images')}</span>
          <span className='sr-only sm:hidden'>{t('Add images')}</span>
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          disabled={props.busy}
          onClick={() => importFile.current?.click()}
          aria-label={t('Import canvas')}
          title={t('Import canvas')}
        >
          <HugeiconsIcon icon={Upload01Icon} size={16} aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          disabled={!count}
          onClick={props.onExport}
          aria-label={t('Export canvas')}
          title={t('Export canvas')}
        >
          <HugeiconsIcon icon={Download04Icon} size={16} aria-hidden='true' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          disabled={!count}
          onClick={props.onClear}
          aria-label={t('Clear canvas')}
          title={t('Clear canvas')}
        >
          <HugeiconsIcon icon={Delete02Icon} size={16} aria-hidden='true' />
        </Button>
        <span
          className='text-muted-foreground ml-auto hidden shrink-0 pl-3 text-[11px] lg:inline'
          role='status'
        >
          {props.saveStatus === 'saved' && t('Saved in this browser')}
          {props.saveStatus === 'saving' && t('Saving…')}
          {props.saveStatus === 'error' && t('Canvas not saved')}
        </span>
      </div>
      <Button
        ref={props.galleryButtonRef}
        type='button'
        variant={props.galleryOpen ? 'secondary' : 'ghost'}
        size='sm'
        className='shrink-0'
        onClick={props.onGallery}
        aria-label={t('Gallery')}
        aria-expanded={props.galleryOpen}
        aria-controls='drawing-gallery'
      >
        <HugeiconsIcon icon={Album02Icon} size={16} aria-hidden='true' />
        {t('Gallery')}
      </Button>
      <input
        ref={upload}
        type='file'
        className='hidden'
        accept='image/png,image/jpeg,image/webp'
        multiple
        aria-label={t('Add images')}
        onChange={(event) => {
          props.onUpload([...(event.target.files || [])])
          event.target.value = ''
        }}
      />
      <input
        ref={importFile}
        type='file'
        className='hidden'
        accept='.json,application/json'
        aria-label={t('Import canvas')}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) props.onImport(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}
