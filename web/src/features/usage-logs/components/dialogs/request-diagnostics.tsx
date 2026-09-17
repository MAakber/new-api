import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { RequestDebug, RequestDebugEntry } from '../../data/schema'
import { hasRequestDebugData } from '../../lib/utils'
import { getRequestDebugBody } from '../../request-debug-api'
import { DetailRow } from './log-detail-layout'

const CodeBlock = lazy(() =>
  import('@/components/ai-elements/code-block').then((module) => ({
    default: module.CodeBlock,
  }))
)

function RequestDiagnosticsGroup(props: {
  entry: RequestDebugEntry
  isResponse: boolean
  requestId?: string
  isRoot?: boolean
}) {
  const { t } = useTranslation()
  const entry = props.entry
  const [fullBody, setFullBody] = useState<string | null>(null)
  const [fullBodyLoading, setFullBodyLoading] = useState(false)
  const [fullBodyError, setFullBodyError] = useState<string | null>(null)
  const headers = Object.entries(entry.headers ?? {})
  const headersJson = JSON.stringify(entry.headers ?? {}, null, 2)
  const bodyLabel = props.isResponse ? t('Response Body') : t('Request Body')
  const bodyTitle = fullBody != null ? t('Full request body') : bodyLabel
  const body = fullBody ?? entry.body
  const canLoadFullBody =
    props.isRoot === true && entry.body_available === true && !!entry.body_ref
  const fields = [
    { label: t('Remote Address'), value: entry.remote_addr },
    { label: t('Host'), value: entry.host },
    { label: t('Body Bytes'), value: entry.body_bytes?.toLocaleString() },
    {
      label: t('Body Bytes Known'),
      value: entry.body_bytes_known,
    },
    { label: t('Body Encoding'), value: entry.body_encoding },
    {
      label: t('Body Truncated'),
      value: entry.body_truncated,
    },
    { label: t('Stored Bytes'), value: entry.stored_bytes?.toLocaleString() },
    { label: t('Content Type'), value: entry.content_type },
    { label: t('Compression'), value: entry.compression },
    {
      label: t('Truncated'),
      value: entry.truncated,
    },
  ].filter((field) => field.value != null)

  const loadFullBody = async () => {
    const bodyRequestId = entry.body_ref || props.requestId
    if (!bodyRequestId || fullBodyLoading) return

    setFullBodyLoading(true)
    setFullBodyError(null)
    try {
      const response = await getRequestDebugBody(bodyRequestId)
      if (!response.success || response.data?.body == null) {
        throw new Error(response.message || t('Request body not available'))
      }
      setFullBody(response.data.body)
    } catch (error) {
      setFullBodyError(
        error instanceof Error ? error.message : t('Request body not available')
      )
    } finally {
      setFullBodyLoading(false)
    }
  }

  return (
    <div className='flex min-w-0 flex-col gap-5'>
      {(entry.method ||
        entry.url ||
        entry.status != null ||
        entry.protocol) && (
        <div className='bg-muted/30 flex min-w-0 flex-wrap items-center gap-3 rounded-lg border p-3'>
          {entry.method && (
            <StatusBadge label={entry.method} variant='blue' copyable={false} />
          )}
          {entry.status != null && (
            <StatusBadge
              label={`${t('Status')} ${entry.status}`}
              variant={entry.status >= 400 ? 'red' : 'green'}
              copyable={false}
            />
          )}
          {entry.url && (
            <span className='min-w-0 flex-1 font-mono text-xs leading-relaxed wrap-anywhere sm:text-sm'>
              {entry.url}
            </span>
          )}
          {entry.protocol && (
            <span className='text-muted-foreground font-mono text-xs'>
              {entry.protocol}
            </span>
          )}
          {entry.url && (
            <CopyButton
              value={entry.url}
              aria-label={t('Copy {{field}}', { field: t('URL') })}
              className='size-8'
            />
          )}
        </div>
      )}

      {fields.length > 0 && (
        <div className='grid min-w-0 grid-cols-2 gap-x-6 gap-y-4 px-1 sm:grid-cols-3 lg:grid-cols-4'>
          {fields.map((field) => {
            let value = field.value
            if (typeof value === 'boolean') value = value ? t('Yes') : t('No')
            return (
              <DetailRow
                key={field.label}
                label={field.label}
                value={value}
                mono
                stacked
              />
            )
          })}
        </div>
      )}

      {(entry.headers != null || body != null || canLoadFullBody) && (
        <Accordion
          defaultValue={['headers']}
          multiple
          className='min-w-0 rounded-lg border px-3 sm:px-4'
        >
          {entry.headers != null && (
            <AccordionItem value='headers'>
              <div className='flex min-w-0 items-center gap-2'>
                <div className='min-w-0 flex-1'>
                  <AccordionTrigger className='gap-2 py-3'>
                    <span className='flex items-center gap-2'>
                      {t('Headers')}
                      <span className='text-muted-foreground font-mono text-xs'>
                        ({headers.length})
                      </span>
                    </span>
                  </AccordionTrigger>
                </div>
                <CopyButton
                  value={headersJson}
                  aria-label={t('Copy {{field}}', { field: t('Headers') })}
                  className='size-8'
                />
              </div>
              <AccordionContent className='pb-3'>
                {headers.length > 0 ? (
                  <dl className='divide-border min-w-0 divide-y'>
                    {headers.map(([name, value]) => (
                      <div
                        key={name}
                        className='grid min-w-0 gap-1 py-2.5 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4'
                      >
                        <dt className='text-muted-foreground min-w-0 font-mono text-xs wrap-anywhere'>
                          {name}
                        </dt>
                        <dd className='min-w-0 font-mono text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap'>
                          {Array.isArray(value)
                            ? value.join('\n')
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <EmptyState
                    title={t('No headers recorded')}
                    className='min-h-0 py-5'
                  />
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {(body != null || canLoadFullBody) && (
            <AccordionItem value='body'>
              <AccordionTrigger className='py-3'>{bodyLabel}</AccordionTrigger>
              <AccordionContent className='flex min-w-0 flex-col gap-3 pb-4'>
                {body != null && (
                  <Suspense fallback={<LoadingState className='min-h-24' />}>
                    <CodeBlock
                      code={body}
                      language={
                        entry.content_type?.includes('json') ||
                        body.trimStart().startsWith('{')
                          ? 'json'
                          : 'plaintext'
                      }
                      title={bodyTitle}
                      showToolbar
                      showLineNumbers
                      enableCollapse={false}
                      maxExpandedLines={18}
                      className='my-0'
                    >
                      <CopyButton
                        value={body}
                        aria-label={t('Copy {{field}}', { field: bodyTitle })}
                        className='size-8'
                      />
                    </CodeBlock>
                  </Suspense>
                )}
                {canLoadFullBody && fullBody == null && !fullBodyError && (
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={loadFullBody}
                    disabled={fullBodyLoading}
                    aria-busy={fullBodyLoading}
                    className='w-fit max-w-full whitespace-normal'
                  >
                    {fullBodyLoading && <LoadingState inline size='sm' />}
                    {t('Load full request body')}
                  </Button>
                )}
                {fullBodyError && (
                  <div role='alert'>
                    <ErrorState
                      title={t('Request body not available')}
                      description={fullBodyError}
                      onRetry={loadFullBody}
                      className='min-h-0 py-5'
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}
    </div>
  )
}

export function RequestDiagnostics(props: {
  requestDebug: RequestDebug
  requestId?: string
  isRoot?: boolean
}) {
  const { t } = useTranslation()
  const stages: Array<{
    value: keyof RequestDebug
    label: string
    entry: RequestDebugEntry
  }> = []
  const stageLabels = [
    ['inbound', t('Inbound Request')],
    ['upstream', t('Upstream Request')],
    ['response', t('Upstream Response')],
  ] as const
  for (const [value, label] of stageLabels) {
    const entry = props.requestDebug[value]
    if (hasRequestDebugData(entry)) stages.push({ value, label, entry })
  }
  if (stages.length === 0) return null

  return (
    <Tabs
      defaultValue={stages[0].value}
      className='h-full min-h-0 min-w-0 gap-4'
    >
      <TabsList
        aria-label={t('Request Diagnostics')}
        className='grid w-full shrink-0 auto-cols-fr grid-flow-col group-data-horizontal/tabs:h-auto'
      >
        {stages.map((stage) => (
          <TabsTrigger
            key={stage.value}
            value={stage.value}
            className='min-h-10 min-w-0 px-2 py-2 text-xs whitespace-normal sm:text-sm'
          >
            {stage.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {stages.map((stage) => (
        <TabsContent
          key={stage.value}
          value={stage.value}
          className='min-h-0 min-w-0 [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-2'
        >
          <RequestDiagnosticsGroup
            key={stage.entry.body_ref ?? stage.value}
            entry={stage.entry}
            isResponse={stage.value === 'response'}
            requestId={props.requestId}
            isRoot={props.isRoot}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}
