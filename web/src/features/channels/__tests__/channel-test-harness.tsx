import { useEffect, useState } from 'react'

import { useChannels } from '../components/channels-provider'
import { ChannelTestDialog } from '../components/dialogs/channel-test-dialog'
import type { Channel } from '../types'

export function TestDialogHarness(props: { channel: Channel }) {
  const { setCurrentRow } = useChannels()
  const [open, setOpen] = useState(true)
  useEffect(() => setCurrentRow(props.channel), [props.channel, setCurrentRow])
  return (
    <>
      <button type='button' onClick={() => setOpen(true)}>
        Open probe dialog
      </button>
      <ChannelTestDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
