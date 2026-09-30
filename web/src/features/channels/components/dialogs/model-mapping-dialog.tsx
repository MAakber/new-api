import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

import {
  findMissingModelsInMapping,
  validateModelMappingJson,
} from '../../lib/model-mapping-validation'
import { ModelMappingBatchEditor } from '../model-mapping-batch-editor'
import { ModelMappingEditor } from '../model-mapping-editor'

type ModelMappingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  channelModels: string[]
  upstreamModels: string[]
  disabled?: boolean
  onApply: (value: string, models: string[]) => void
}

// Mount a separate session on every open, including when the caller keeps the
// outer dialog mounted. Cancel/Escape never writes to the owning channel form.
export function ModelMappingDialog(props: ModelMappingDialogProps) {
  return props.open ? <ModelMappingSession {...props} /> : null
}

function ModelMappingSession(props: ModelMappingDialogProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(props.value)
  const [valid, setValid] = useState(
    () => validateModelMappingJson(props.value).valid
  )
  const [batch, setBatch] = useState(false)
  const [publishAliases, setPublishAliases] = useState(false)
  const missing = valid
    ? findMissingModelsInMapping(draft, props.channelModels)
    : []

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Model Mapping')}
      description={t(
        'Users call the model on the left. The platform forwards the request to the upstream model on the right.'
      )}
      contentClassName='sm:max-w-3xl'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            disabled={props.disabled || !valid || batch}
            onClick={() => {
              if (!valid || !validateModelMappingJson(draft).valid) return
              props.onApply(
                draft,
                publishAliases
                  ? [...new Set([...props.channelModels, ...missing])]
                  : props.channelModels
              )
              props.onOpenChange(false)
            }}
          >
            {t('Apply')}
          </Button>
        </>
      }
    >
      <div hidden={batch}>
        <ModelMappingEditor
          value={draft}
          onChange={setDraft}
          onValidityChange={setValid}
          sourceModelOptions={props.channelModels}
          targetModelOptions={props.upstreamModels}
          disabled={props.disabled}
          onBatchAdd={() => setBatch(true)}
        />
      </div>
      {batch && (
        <ModelMappingBatchEditor
          value={draft}
          channelModels={props.channelModels}
          upstreamModels={props.upstreamModels}
          disabled={props.disabled}
          onCancel={() => setBatch(false)}
          onApply={(value) => {
            setDraft(value)
            setBatch(false)
          }}
        />
      )}
      {!batch && missing.length > 0 && (
        <div className='space-y-2 rounded-lg border p-3'>
          <p className='text-muted-foreground text-xs break-all'>
            {t('Request models missing from the channel model list:')}{' '}
            {missing.join(', ')}
          </p>
          <Label className='flex items-center gap-2'>
            <Checkbox
              checked={publishAliases}
              onCheckedChange={setPublishAliases}
              disabled={props.disabled}
            />
            {t('Add missing request models when applying')}
          </Label>
        </div>
      )}
      <p className='text-muted-foreground text-xs'>
        {t(
          'Apply updates this form. Save the channel to make redirects effective.'
        )}
      </p>
    </Dialog>
  )
}
