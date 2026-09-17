import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useDrawingStore } from '@/stores/drawing-store'

import { getUserGroups, getUserModels } from '../../api'
import { settingsForImageModel } from '../lib/image-settings'

export function useImageOptions(userId: number) {
  const group = useDrawingStore((state) => state.settings.group)
  const model = useDrawingStore((state) => state.settings.model)
  const groups = useQuery({
    queryKey: ['drawing-groups', userId],
    queryFn: getUserGroups,
  })
  const models = useQuery({
    queryKey: ['drawing-models', userId, group],
    queryFn: () => getUserModels(group),
    enabled: Boolean(group),
  })
  useEffect(() => {
    if (
      !groups.data?.length ||
      groups.data.some((item) => item.value === group)
    ) {
      return
    }
    useDrawingStore
      .getState()
      .updateSettings({ group: groups.data[0].value, model: '' })
  }, [groups.data, group])
  useEffect(() => {
    if (!models.data?.length || model) return
    const preferred = models.data.find((item) =>
      /gpt-image|dall-e|chatgpt-image/.test(item.value)
    )
    if (preferred) {
      const state = useDrawingStore.getState()
      state.updateSettings(
        settingsForImageModel(state.settings, preferred.value)
      )
    }
  }, [models.data, model])
  return { groups, models }
}
