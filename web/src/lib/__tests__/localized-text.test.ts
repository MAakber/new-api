import { describe, expect, test } from 'vitest'

import {
  resolveLocalizedText,
  type LocalizedTextValue,
} from '../localized-text'

type ResolveCase = {
  name: string
  value: LocalizedTextValue | null | undefined
  language: string
  expected: string
}

const KLING = {
  en: 'Video generation via Kling API',
  zh: '可灵视频生成',
  'zh-TW': '可靈影片生成',
} as const

describe('resolveLocalizedText', () => {
  test.each<ResolveCase>([
    {
      name: 'returns a bare string unchanged so legacy marketplace indexes still render',
      value: 'Video generation via Kling API',
      language: 'zhCN',
      expected: 'Video generation via Kling API',
    },
    {
      name: 'returns the exact BCP-47 tag when the map contains zh-TW',
      value: KLING,
      language: 'zh-TW',
      expected: '可靈影片生成',
    },
    {
      name: 'matches zh-TW case-insensitively when i18next language is zh-tw',
      value: KLING,
      language: 'zh-tw',
      expected: '可靈影片生成',
    },
    {
      name: 'maps the project i18next code zhTW onto the zh-TW map key',
      value: KLING,
      language: 'zhTW',
      expected: '可靈影片生成',
    },
    {
      name: 'falls back from zh-TW to the zh primary subtag when zh-TW is absent',
      value: { en: KLING.en, zh: KLING.zh },
      language: 'zh-TW',
      expected: '可灵视频生成',
    },
    {
      name: 'maps the project i18next code zhCN onto the zh primary subtag',
      value: { en: KLING.en, zh: KLING.zh },
      language: 'zhCN',
      expected: '可灵视频生成',
    },
    {
      name: 'falls back from en-US to en when only the primary tag exists',
      value: { en: KLING.en, zh: KLING.zh },
      language: 'en-US',
      expected: 'Video generation via Kling API',
    },
    {
      name: 'falls back to en when the requested language and its primary tag are absent',
      value: { en: KLING.en, ja: 'Kling で動画生成' },
      language: 'fr',
      expected: 'Video generation via Kling API',
    },
    {
      name: 'uses the first sorted key when en and the requested language are both absent',
      value: { ja: 'Kling で動画生成', fr: 'Génération vidéo Kling' },
      language: 'ru',
      expected: 'Génération vidéo Kling',
    },
    {
      name: 'returns an empty string when the value is null',
      value: null,
      language: 'en',
      expected: '',
    },
    {
      name: 'returns an empty string when the value is undefined',
      value: undefined,
      language: 'en',
      expected: '',
    },
    {
      name: 'returns an empty string when the map has no usable entries',
      value: {},
      language: 'zhCN',
      expected: '',
    },
  ])('$name', ({ value, language, expected }) => {
    expect(resolveLocalizedText(value, language)).toBe(expected)
  })
})
