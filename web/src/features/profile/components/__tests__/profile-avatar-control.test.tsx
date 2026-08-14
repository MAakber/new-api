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
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Node',
  'Element',
  'Event',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { ProfileAvatarControl } = await import('../profile-avatar-control')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Upload avatar': 'Upload avatar',
        'Choose an avatar image': 'Choose an avatar image',
        'Profile avatar': 'Profile avatar',
        'Remove avatar': 'Remove avatar',
        'Remove profile avatar?': 'Remove profile avatar?',
        'Your initials will be shown until you upload a new avatar.':
          'Your initials will be shown until you upload a new avatar.',
        Cancel: 'Cancel',
      },
    },
  },
})

describe('ProfileAvatarControl', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps the empty avatar action hidden until hover or keyboard focus', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ProfileAvatarControl
            name='Ada Lovelace'
            avatarUrl=''
            updating={false}
            onUpload={async () => true}
            onRemove={async () => true}
          />
        </I18nextProvider>
      )
    })

    const uploadButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Upload avatar"]'
    )
    const actions = container.querySelector('[data-avatar-actions]')
    const fileInput = container.querySelector('input[type="file"]')
    assert.ok(uploadButton)
    assert.ok(actions)
    assert.equal(
      container.querySelector('button[aria-label="Remove avatar"]'),
      null
    )
    assert.equal(actions.classList.contains('opacity-0'), true)
    assert.equal(actions.classList.contains('pointer-events-none'), true)
    assert.equal(
      actions.classList.contains('group-hover/avatar-control:opacity-100'),
      true
    )
    assert.equal(
      actions.classList.contains(
        'group-focus-within/avatar-control:opacity-100'
      ),
      true
    )
    assert.ok(fileInput)
    assert.equal(fileInput.getAttribute('aria-label'), 'Choose an avatar image')
    assert.equal(
      fileInput.getAttribute('accept'),
      'image/jpeg,image/png,image/webp'
    )

    await act(async () => {
      uploadButton.focus()
    })
    assert.equal(document.activeElement, uploadButton)

    await act(async () => root.unmount())
    container.remove()
  })

  test('reveals replace and remove actions for an existing avatar', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ProfileAvatarControl
            name='Ada Lovelace'
            avatarUrl='/api/user/self/avatar'
            updating={false}
            onUpload={async () => true}
            onRemove={async () => true}
          />
        </I18nextProvider>
      )
    })

    const actions = container.querySelector('[data-avatar-actions]')
    const replaceButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Replace avatar"]'
    )
    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove avatar"]'
    )

    assert.ok(actions)
    assert.ok(replaceButton)
    assert.ok(removeButton)
    assert.equal(actions.classList.contains('opacity-0'), true)
    assert.equal(
      actions.classList.contains('group-hover/avatar-control:opacity-100'),
      true
    )
    assert.equal(
      actions.classList.contains(
        'group-focus-within/avatar-control:opacity-100'
      ),
      true
    )
    assert.equal(
      actions.classList.contains('[@media(hover:none)]:opacity-100'),
      true
    )
    assert.equal(actions.classList.contains('-right-1'), true)
    assert.equal(actions.classList.contains('-bottom-1'), true)
    assert.equal(actions.classList.contains('gap-0.5'), true)
    assert.equal(actions.classList.contains('rounded-lg'), true)
    assert.equal(actions.classList.contains('p-0.5'), true)
    assert.equal(replaceButton.classList.contains('size-6'), true)
    assert.equal(removeButton.classList.contains('size-6'), true)
    assert.equal(
      replaceButton.querySelector('svg')?.classList.contains('size-3.5'),
      true
    )
    assert.equal(
      removeButton.querySelector('svg')?.classList.contains('size-3.5'),
      true
    )

    await act(async () => {
      removeButton.focus()
    })
    assert.equal(document.activeElement, removeButton)

    await act(async () => {
      removeButton.click()
    })
    assert.equal(
      document.body.textContent?.includes('Remove profile avatar?'),
      true
    )

    await act(async () => root.unmount())
    container.remove()
  })
})
