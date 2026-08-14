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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

import { useFetchModelPreferences } from '@/stores/fetch-model-preferences-store'

import { ChannelsProvider } from '../components/channels-provider'
import { FetchModelsDialog } from '../components/dialogs/fetch-models-dialog'

const queryClients: QueryClient[] = []

beforeEach(() => {
  useFetchModelPreferences.setState({ types: [] })
  localStorage.clear()
})

afterEach(() => {
  for (const client of queryClients) client.clear()
  queryClients.length = 0
})

export function renderChannelUI(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  queryClients.push(client)
  function Wrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ChannelsProvider>{props.children}</ChannelsProvider>
      </QueryClientProvider>
    )
  }
  return render(element, { wrapper: Wrapper })
}

export function renderPicker(
  provided: Partial<ComponentProps<typeof FetchModelsDialog>> = {}
) {
  let props = {
    open: true,
    onOpenChange: vi.fn(),
    ...provided,
    onModelsSelected: provided.onModelsSelected ?? vi.fn(),
    existingModelsOverride: provided.existingModelsOverride ?? [],
  }
  const view = renderChannelUI(<FetchModelsDialog {...props} />)
  return {
    ...view,
    update: (updates: Partial<ComponentProps<typeof FetchModelsDialog>>) => {
      props = {
        ...props,
        ...updates,
        onModelsSelected: updates.onModelsSelected ?? props.onModelsSelected,
        existingModelsOverride:
          updates.existingModelsOverride ?? props.existingModelsOverride,
      }
      view.rerender(<FetchModelsDialog {...props} />)
    },
  }
}

export function deferredModelList() {
  let resolve!: (models: string[]) => void
  const promise = new Promise<string[]>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
