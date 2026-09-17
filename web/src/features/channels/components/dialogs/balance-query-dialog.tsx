import { useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, DollarSign } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

import { getCodexUsage, updateChannelBalance } from '../../api'
import { channelsQueryKeys } from '../../lib'
import type { Channel } from '../../types'
import { useChannels } from '../channels-provider'
import {
  CodexUsageDialog,
  type CodexUsageDialogData,
} from './codex-usage-dialog'

type BalanceQueryDialogProps = {
  channel?: Channel | null
  initialRawResponse?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BalanceQueryDialog(props: BalanceQueryDialogProps) {
  const { currentRow } = useChannels()
  const channel = props.channel === undefined ? currentRow : props.channel
  if (!props.open || !channel) return null
  return <BalanceQuerySession {...props} channel={channel} key={channel.id} />
}

function BalanceQuerySession(
  props: BalanceQueryDialogProps & { channel: Channel }
) {
  const { t } = useTranslation()
  const currentRow = props.channel
  const queryClient = useQueryClient()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [isQuerying, setIsQuerying] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceUpdatedTime, setBalanceUpdatedTime] = useState<number | null>(
    null
  )
  const [rawResponse, setRawResponse] = useState<string | null>(
    props.initialRawResponse ?? null
  )
  const [codexUsageResponse, setCodexUsageResponse] =
    useState<CodexUsageDialogData | null>(null)

  const isCodex = currentRow?.type === 57

  const handleQueryCodexUsage = async () => {
    const row = currentRow
    if (!row) return
    setIsQuerying(true)
    try {
      const res = await getCodexUsage(row.id)
      if (!mounted.current) return
      if (!res.success) {
        throw createServerError(res, t('Failed to fetch usage'))
      }
      setCodexUsageResponse(res)
    } catch (error: unknown) {
      handleServerError(error, t('Failed to fetch usage'))
    } finally {
      if (mounted.current) setIsQuerying(false)
    }
  }

  useEffect(() => {
    if (!isCodex) return
    if (!props.open) return
    handleQueryCodexUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, isCodex])

  const handleQueryBalance = async () => {
    setIsQuerying(true)
    try {
      const response = await updateChannelBalance(currentRow.id)
      if (!mounted.current) return
      if (response.success && response.balance !== undefined) {
        const newBalance = response.balance
        const now = Math.floor(Date.now() / 1000)

        setBalance(newBalance)
        setBalanceUpdatedTime(now)
        toast.success(t('Balance updated successfully'))

        // Invalidate queries to refresh the table
        await queryClient.invalidateQueries({
          queryKey: channelsQueryKeys.lists(),
        })
        setRawResponse(null)
      } else if (response.success && response.raw_response !== undefined) {
        setRawResponse(response.raw_response)
      } else {
        handleServerError(response, t('Failed to query balance'))
      }
    } catch (error: unknown) {
      handleServerError(error, t('Failed to query balance'))
    } finally {
      if (mounted.current) setIsQuerying(false)
    }
  }

  const handleClose = () => {
    setBalance(null)
    setBalanceUpdatedTime(null)
    setRawResponse(null)
    setCodexUsageResponse(null)
    props.onOpenChange(false)
  }

  const formatBalance = (bal: number) =>
    formatCurrencyFromUSD(bal, {
      digitsLarge: 2,
      digitsSmall: 4,
      abbreviate: false,
    })

  const formatDate = (timestamp: number) => {
    if (!timestamp) return t('Never')
    return formatTimestampToDate(timestamp)
  }

  if (isCodex) {
    return (
      <CodexUsageDialog
        open={props.open}
        onOpenChange={(v) => {
          if (!v) handleClose()
        }}
        channelName={currentRow.name}
        channelId={currentRow.id}
        response={codexUsageResponse}
        onRefresh={handleQueryCodexUsage}
        isRefreshing={isQuerying}
      />
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={handleClose}
      title={t('Query Balance')}
      description={
        <>
          {t('Update balance for:')}
          <strong>{currentRow.name}</strong>
        </>
      }
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <Button variant='outline' onClick={handleClose} disabled={isQuerying}>
          {t('Close')}
        </Button>
      }
    >
      <div className='space-y-4 py-4'>
        {rawResponse !== null ? (
          <>
            <Alert>
              <AlertTitle>{t('Balance response not recognized')}</AlertTitle>
              <AlertDescription>
                {t(
                  'The upstream response is valid JSON, but it does not match the OpenAI credit_summary format. The channel balance was not updated.'
                )}
              </AlertDescription>
            </Alert>
            <CodeBlock
              code={rawResponse}
              language='json'
              maxExpandedLines={24}
              showLineNumbers
              title={t('Upstream JSON response')}
            >
              <CodeBlockCopyButton />
            </CodeBlock>
          </>
        ) : (
          <>
            {/* Current Balance Display */}
            <div className='bg-muted/50 rounded-lg border p-4'>
              <div className='text-muted-foreground mb-2 flex items-center gap-2 text-sm'>
                <IconBadge tone='success' size='xs'>
                  <DollarSign />
                </IconBadge>
                <span>{t('Current Balance')}</span>
              </div>
              <div className='text-2xl font-bold'>
                {balance !== null
                  ? formatBalance(balance)
                  : formatBalance(currentRow.balance)}
              </div>
              <div className='text-muted-foreground mt-2 text-xs'>
                {t('Last updated:')}{' '}
                {formatDate(
                  balanceUpdatedTime ?? currentRow.balance_updated_time
                )}
              </div>
            </div>
          </>
        )}

        {/* Balance Update Button */}
        <Button
          className='w-full'
          onClick={handleQueryBalance}
          disabled={isQuerying}
        >
          {isQuerying && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {!isQuerying && <RefreshCw className='mr-2 h-4 w-4' />}
          {isQuerying ? t('Querying...') : t('Update Balance')}
        </Button>
      </div>
    </Dialog>
  )
}
