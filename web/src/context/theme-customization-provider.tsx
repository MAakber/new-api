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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { getCookie, removeCookie, setCookie } from '@/lib/cookies'
import {
  CONTENT_LAYOUT_VALUES,
  CUSTOM_THEME_PRESET,
  CUSTOM_THEME_VARIABLE_NAMES,
  type ContentLayout,
  DEFAULT_THEME_CUSTOMIZATION,
  getCustomThemeVariables,
  normalizeCustomColor,
  resolveThemeFont,
  THEME_COOKIE_KEYS,
  THEME_FONT_VALUES,
  THEME_PRESET_VALUES,
  THEME_RADIUS_VALUES,
  THEME_SCALE_VALUES,
  type ThemeCustomization,
  type ThemeFont,
  type ThemePreset,
  type ThemeRadius,
  type ThemeScale,
} from '@/lib/theme-customization'
import { useSystemConfigStore } from '@/stores/system-config-store'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

function readCookie<T extends string>(
  name: string,
  allowed: ReadonlySet<T>,
  fallback: T
): T {
  const value = getCookie(name)
  return value && allowed.has(value as T) ? (value as T) : fallback
}

function applyAttribute(name: string, value: string | null) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  if (value === null) {
    body.removeAttribute(name)
  } else {
    body.setAttribute(name, value)
  }
}

type ThemeCustomizationContextType = {
  defaults: ThemeCustomization
  customization: ThemeCustomization
  setPreset: (preset: ThemePreset) => void
  setCustomColor: (color: string) => void
  resetPreset: () => void
  setFont: (font: ThemeFont) => void
  setRadius: (radius: ThemeRadius) => void
  setScale: (scale: ThemeScale) => void
  setContentLayout: (contentLayout: ContentLayout) => void
  resetCustomization: () => void
}

// Fallback used when a consumer renders outside the provider (e.g. an error
// route mounted before providers are ready, or stale HMR boundaries). Keeping
// it permissive prevents the whole tree from crashing — the UI just behaves
// like the defaults until the real provider re-mounts.
const FALLBACK_CONTEXT: ThemeCustomizationContextType = {
  defaults: DEFAULT_THEME_CUSTOMIZATION,
  customization: DEFAULT_THEME_CUSTOMIZATION,
  setPreset: () => {},
  setCustomColor: () => {},
  resetPreset: () => {},
  setFont: () => {},
  setRadius: () => {},
  setScale: () => {},
  setContentLayout: () => {},
  resetCustomization: () => {},
}

const ThemeCustomizationContext =
  createContext<ThemeCustomizationContextType>(FALLBACK_CONTEXT)

function applyCustomThemeVariables(color: string | null) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return

  const variables = color ? getCustomThemeVariables(color) : null
  for (const name of CUSTOM_THEME_VARIABLE_NAMES) {
    if (variables) {
      body.style.setProperty(name, variables[name])
    } else {
      body.style.removeProperty(name)
    }
  }
}

export function ThemeCustomizationProvider(props: {
  children: React.ReactNode
}) {
  const defaults = useSystemConfigStore((state) => state.config.defaultTheme)
  const [preset, _setPreset] = useState<ThemePreset>(() =>
    readCookie<ThemePreset>(
      THEME_COOKIE_KEYS.preset,
      THEME_PRESET_VALUES,
      defaults.preset
    )
  )
  const [customColor, _setCustomColor] = useState(
    () =>
      normalizeCustomColor(getCookie(THEME_COOKIE_KEYS.customColor)) ??
      defaults.customColor
  )
  const [font, _setFont] = useState<ThemeFont>(() =>
    readCookie<ThemeFont>(
      THEME_COOKIE_KEYS.font,
      THEME_FONT_VALUES,
      defaults.font
    )
  )
  const [radius, _setRadius] = useState<ThemeRadius>(() =>
    readCookie<ThemeRadius>(
      THEME_COOKIE_KEYS.radius,
      THEME_RADIUS_VALUES,
      defaults.radius
    )
  )
  const [scale, _setScale] = useState<ThemeScale>(() =>
    readCookie<ThemeScale>(
      THEME_COOKIE_KEYS.scale,
      THEME_SCALE_VALUES,
      defaults.scale
    )
  )
  const [contentLayout, _setContentLayout] = useState<ContentLayout>(() =>
    readCookie<ContentLayout>(
      THEME_COOKIE_KEYS.contentLayout,
      CONTENT_LAYOUT_VALUES,
      defaults.contentLayout
    )
  )

  useEffect(() => {
    const savedPreset = getCookie(THEME_COOKIE_KEYS.preset)
    const savedCustomColor = getCookie(THEME_COOKIE_KEYS.customColor)
    if (!savedPreset || !THEME_PRESET_VALUES.has(savedPreset as ThemePreset)) {
      _setPreset(defaults.preset)
    }
    if (!normalizeCustomColor(savedCustomColor)) {
      _setCustomColor(defaults.customColor)
    }
    const savedFont = getCookie(THEME_COOKIE_KEYS.font)
    if (!savedFont || !THEME_FONT_VALUES.has(savedFont as ThemeFont)) {
      _setFont(defaults.font)
    }
    const savedRadius = getCookie(THEME_COOKIE_KEYS.radius)
    if (!savedRadius || !THEME_RADIUS_VALUES.has(savedRadius as ThemeRadius)) {
      _setRadius(defaults.radius)
    }
    const savedScale = getCookie(THEME_COOKIE_KEYS.scale)
    if (!savedScale || !THEME_SCALE_VALUES.has(savedScale as ThemeScale)) {
      _setScale(defaults.scale)
    }
    const savedContentLayout = getCookie(THEME_COOKIE_KEYS.contentLayout)
    if (
      !savedContentLayout ||
      !CONTENT_LAYOUT_VALUES.has(savedContentLayout as ContentLayout)
    ) {
      _setContentLayout(defaults.contentLayout)
    }
  }, [defaults])

  // Mirror state to the <body> via data-* attributes so theme-presets.css can
  // override CSS variables at the right cascade layer.
  useEffect(() => {
    applyAttribute(
      'data-theme-preset',
      preset === defaults.preset ? null : preset
    )
  }, [defaults.preset, preset])

  // Custom colors are intentionally inline because their value is chosen at
  // runtime. Fixed presets keep using the stylesheet; clearing these tokens
  // when another preset is selected lets their original CSS win unchanged.
  useEffect(() => {
    applyCustomThemeVariables(
      preset === CUSTOM_THEME_PRESET ? customColor : null
    )
  }, [preset, customColor])

  // Font is the one axis where we resolve before writing the attribute:
  // the persisted preference may be `default`, but CSS works in terms of
  // the concrete `sans`/`serif` choice that should drive the cascade.
  // Resolving here (instead of in CSS via `:not()` selectors) keeps the
  // stylesheet to one simple `[data-theme-font='serif']` selector and lets
  // future presets opt into typography via `PRESET_DEFAULT_FONT` alone.
  useEffect(() => {
    applyAttribute('data-theme-font', resolveThemeFont(font, preset))
  }, [font, preset])

  useEffect(() => {
    applyAttribute(
      'data-theme-radius',
      radius === defaults.radius ? null : radius
    )
  }, [defaults.radius, radius])

  useEffect(() => {
    applyAttribute('data-theme-scale', scale === defaults.scale ? null : scale)
  }, [defaults.scale, scale])

  useEffect(() => {
    applyAttribute('data-theme-content-layout', contentLayout)
  }, [contentLayout])

  const setPreset = useCallback(
    (value: ThemePreset) => {
      _setPreset(value)
      if (value === defaults.preset) {
        removeCookie(THEME_COOKIE_KEYS.preset)
      } else {
        setCookie(THEME_COOKIE_KEYS.preset, value, COOKIE_MAX_AGE)
      }
    },
    [defaults.preset]
  )

  const setCustomColor = useCallback(
    (value: string) => {
      const color = normalizeCustomColor(value)
      if (!color) return

      _setCustomColor(color)
      _setPreset(CUSTOM_THEME_PRESET)
      setCookie(THEME_COOKIE_KEYS.preset, CUSTOM_THEME_PRESET, COOKIE_MAX_AGE)

      if (color === defaults.customColor) {
        removeCookie(THEME_COOKIE_KEYS.customColor)
      } else {
        setCookie(THEME_COOKIE_KEYS.customColor, color, COOKIE_MAX_AGE)
      }
    },
    [defaults.customColor]
  )

  const resetPreset = useCallback(() => {
    _setPreset(defaults.preset)
    _setCustomColor(defaults.customColor)
    removeCookie(THEME_COOKIE_KEYS.preset)
    removeCookie(THEME_COOKIE_KEYS.customColor)
  }, [defaults.customColor, defaults.preset])

  const setFont = useCallback(
    (value: ThemeFont) => {
      _setFont(value)
      if (value === defaults.font) {
        removeCookie(THEME_COOKIE_KEYS.font)
      } else {
        setCookie(THEME_COOKIE_KEYS.font, value, COOKIE_MAX_AGE)
      }
    },
    [defaults.font]
  )

  const setRadius = useCallback(
    (value: ThemeRadius) => {
      _setRadius(value)
      if (value === defaults.radius) {
        removeCookie(THEME_COOKIE_KEYS.radius)
      } else {
        setCookie(THEME_COOKIE_KEYS.radius, value, COOKIE_MAX_AGE)
      }
    },
    [defaults.radius]
  )

  const setScale = useCallback(
    (value: ThemeScale) => {
      _setScale(value)
      if (value === defaults.scale) {
        removeCookie(THEME_COOKIE_KEYS.scale)
      } else {
        setCookie(THEME_COOKIE_KEYS.scale, value, COOKIE_MAX_AGE)
      }
    },
    [defaults.scale]
  )

  const setContentLayout = useCallback(
    (value: ContentLayout) => {
      _setContentLayout(value)
      if (value === defaults.contentLayout) {
        removeCookie(THEME_COOKIE_KEYS.contentLayout)
      } else {
        setCookie(THEME_COOKIE_KEYS.contentLayout, value, COOKIE_MAX_AGE)
      }
    },
    [defaults.contentLayout]
  )

  const resetCustomization = useCallback(() => {
    resetPreset()
    setFont(defaults.font)
    setRadius(defaults.radius)
    setScale(defaults.scale)
    setContentLayout(defaults.contentLayout)
  }, [
    defaults.contentLayout,
    defaults.font,
    defaults.radius,
    defaults.scale,
    resetPreset,
    setFont,
    setRadius,
    setScale,
    setContentLayout,
  ])

  const value = useMemo<ThemeCustomizationContextType>(
    () => ({
      defaults,
      customization: {
        preset,
        customColor,
        font,
        radius,
        scale,
        contentLayout,
      },
      setPreset,
      setCustomColor,
      resetPreset,
      setFont,
      setRadius,
      setScale,
      setContentLayout,
      resetCustomization,
    }),
    [
      preset,
      customColor,
      font,
      radius,
      scale,
      contentLayout,
      setPreset,
      setCustomColor,
      resetPreset,
      setFont,
      setRadius,
      setScale,
      setContentLayout,
      resetCustomization,
      defaults,
    ]
  )

  return (
    <ThemeCustomizationContext.Provider value={value}>
      {props.children}
    </ThemeCustomizationContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeCustomization() {
  return useContext(ThemeCustomizationContext)
}
