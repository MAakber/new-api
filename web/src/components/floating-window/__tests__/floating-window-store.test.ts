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
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import { useFloatingWindowStore } from '../../../stores/floating-window-store'

function resetFloatingWindows(): void {
  useFloatingWindowStore.setState({
    windows: [],
    activeWindowId: null,
  })
}

describe('floating window store', () => {
  afterEach(() => {
    resetFloatingWindows()
  })

  test('opens each channel create request as a distinct window', () => {
    const store = useFloatingWindowStore.getState()

    const firstId = store.openChannelEditor({ mode: 'create' })
    const secondId = store.openChannelEditor({ mode: 'create' })
    const windows = useFloatingWindowStore.getState().windows

    assert.notEqual(firstId, secondId)
    assert.equal(windows.length, 2)
    assert.deepEqual(
      windows.map((descriptor) => descriptor.mode),
      ['create', 'create']
    )
    assert.deepEqual(
      windows.map((descriptor) => descriptor.channelId),
      [null, null]
    )
  })

  test('activates and returns the existing edit window for the same channel', () => {
    const store = useFloatingWindowStore.getState()
    const editWindowId = store.openChannelEditor({
      mode: 'edit',
      channelId: 42,
    })
    store.openChannelEditor({ mode: 'create' })

    const duplicateWindowId = store.openChannelEditor({
      mode: 'edit',
      channelId: 42,
    })
    const state = useFloatingWindowStore.getState()

    assert.equal(duplicateWindowId, editWindowId)
    assert.equal(
      state.windows.filter((descriptor) => descriptor.channelId === 42).length,
      1
    )
    assert.equal(state.activeWindowId, editWindowId)
  })

  test('brings an activated window above the current top window', () => {
    const store = useFloatingWindowStore.getState()
    const firstId = store.openChannelEditor({ mode: 'create' })
    const secondId = store.openChannelEditor({ mode: 'create' })

    store.activateWindow(firstId)

    const windows = useFloatingWindowStore.getState().windows
    const firstWindow = windows.find(
      (descriptor) => descriptor.instanceId === firstId
    )
    const secondWindow = windows.find(
      (descriptor) => descriptor.instanceId === secondId
    )

    assert.equal(useFloatingWindowStore.getState().activeWindowId, firstId)
    assert.ok(firstWindow)
    assert.ok(secondWindow)
    assert.ok(firstWindow.order > secondWindow.order)
  })

  test('clears all windows when the authenticated layout is torn down', () => {
    const store = useFloatingWindowStore.getState()

    store.openChannelEditor({ mode: 'create' })
    store.openChannelEditor({ mode: 'create' })
    store.clearWindows()

    assert.deepEqual(useFloatingWindowStore.getState().windows, [])
    assert.equal(useFloatingWindowStore.getState().activeWindowId, null)
  })
})
