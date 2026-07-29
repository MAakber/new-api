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
/**
 * Theme customization constants and types.
 *
 * Lives in `lib/` (not `context/`) so it can be imported alongside the
 * provider without breaking React Fast Refresh boundaries.
 */

export const THEME_PRESETS = [
  {
    value: 'default',
    name: 'Default',
    swatches: ['oklch(0.72 0.18 250)', 'oklch(0.7 0.12 280)'],
  },
  {
    // Inspired by Anthropic's official brand language: warm cream canvas
    // (#faf9f5) paired with clay/coral (#d97757) as the single accent.
    // Swatches preview the canvas → accent gradient that defines the system.
    value: 'anthropic',
    name: 'Anthropic',
    swatches: ['oklch(0.984 0.005 95)', 'oklch(0.685 0.142 38)'],
  },
  {
    value: 'simple-large',
    name: 'Simple Large-font',
    swatches: ['oklch(0.15 0 0)', 'oklch(0.99 0 0)'],
  },
  {
    value: 'underground',
    name: 'Underground',
    swatches: ['oklch(0.5315 0.0694 156.19)', 'oklch(0.5748 0.0862 336.52)'],
  },
  {
    value: 'rose-garden',
    name: 'Rose Garden',
    swatches: ['oklch(0.5827 0.2418 12.23)', 'oklch(0.8131 0.1129 5.67)'],
  },
  {
    value: 'lake-view',
    name: 'Lake View',
    swatches: ['oklch(0.765 0.177 163.22)', 'oklch(0.551 0.0899 200.52)'],
  },
  {
    value: 'sunset-glow',
    name: 'Sunset Glow',
    swatches: ['oklch(0.5591 0.1882 25.33)', 'oklch(0.7938 0.1248 42.42)'],
  },
  {
    value: 'forest-whisper',
    name: 'Forest Whisper',
    swatches: ['oklch(0.5276 0.1072 182.22)', 'oklch(0.5236 0.0505 250.18)'],
  },
  {
    value: 'ocean-breeze',
    name: 'Ocean Breeze',
    swatches: ['oklch(0.5461 0.2152 262.88)', 'oklch(0.5854 0.2041 277.12)'],
  },
  {
    value: 'lavender-dream',
    name: 'Lavender Dream',
    swatches: ['oklch(0.5709 0.1808 306.89)', 'oklch(0.811 0.0589 201.14)'],
  },
] as const

export const CUSTOM_THEME_PRESET = 'custom'
export const DEFAULT_CUSTOM_THEME_COLOR = '#6366f1'

export type ThemePreset =
  | (typeof THEME_PRESETS)[number]['value']
  | typeof CUSTOM_THEME_PRESET
export type ThemeRadius = 'default' | 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type ThemeScale = 'default' | 'sm' | 'lg' | 'xl'
export type ContentLayout = 'full' | 'centered'

/**
 * Font axis for the theme.
 *
 * - `default` — resolve at runtime from the active preset
 *   (see `PRESET_DEFAULT_FONT`). The shipped `default` and `anthropic`
 *   presets resolve to serif; other named color presets fall back to
 *   sans unless they list a different choice. Mirrors how
 *   `radius: 'default'` defers to a per-preset hint.
 * - `sans` — humanist sans (Public Sans), the project's UI fallback.
 * - `serif` — editorial serif (Lora + CJK fallbacks), the project's
 *   "soul" typography. Inherits across the whole UI; monospace contexts
 *   keep their own family via Tailwind preflight and `.font-mono`.
 */
export type ThemeFont = 'default' | 'sans' | 'serif'

/**
 * The resolved (non-`default`) font value applied to the DOM. The provider
 * always sets `data-theme-font` to one of these concrete values so CSS only
 * needs simple attribute selectors (no `:not()` gymnastics, no per-preset
 * font branches).
 */
export type ResolvedThemeFont = Exclude<ThemeFont, 'default'>

export type ThemeCustomization = {
  preset: ThemePreset
  customColor: string
  font: ThemeFont
  radius: ThemeRadius
  scale: ThemeScale
  contentLayout: ContentLayout
}

export const DEFAULT_THEME_CUSTOMIZATION: ThemeCustomization = {
  preset: 'default',
  customColor: DEFAULT_CUSTOM_THEME_COLOR,
  font: 'default',
  radius: 'default',
  scale: 'default',
  contentLayout: 'full',
}

export const THEME_PRESET_VALUES: ReadonlySet<ThemePreset> = new Set([
  ...THEME_PRESETS.map((preset) => preset.value),
  CUSTOM_THEME_PRESET,
])

export const THEME_FONT_VALUES: ReadonlySet<ThemeFont> = new Set([
  'default',
  'sans',
  'serif',
])

export const THEME_RADIUS_VALUES: ReadonlySet<ThemeRadius> = new Set([
  'default',
  'none',
  'sm',
  'md',
  'lg',
  'xl',
])

export const THEME_SCALE_VALUES: ReadonlySet<ThemeScale> = new Set([
  'default',
  'sm',
  'lg',
  'xl',
])

export const CONTENT_LAYOUT_VALUES: ReadonlySet<ContentLayout> = new Set([
  'full',
  'centered',
])

export const THEME_COOKIE_KEYS = {
  preset: 'theme_preset',
  customColor: 'theme_custom_color',
  font: 'theme_font',
  radius: 'theme_radius',
  scale: 'theme_scale',
  contentLayout: 'theme_content_layout',
} as const

export const CUSTOM_THEME_VARIABLE_NAMES = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-ring',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
] as const

type CustomThemeVariableName = (typeof CUSTOM_THEME_VARIABLE_NAMES)[number]

/**
 * Normalizes the hex values emitted by native color inputs before they are
 * persisted or used in CSS. Keeping the accepted format narrow also prevents
 * arbitrary cookie values from becoming inline style values.
 */
export function normalizeCustomColor(value: string | undefined): string | null {
  if (!value) return null

  const color = value.trim().toLowerCase()
  const shortHexMatch = color.match(/^#([\da-f]{3})$/i)
  const shortHex = shortHexMatch?.[1]
  if (shortHex) {
    return `#${[...shortHex].map((channel) => channel.repeat(2)).join('')}`
  }

  return /^#[\da-f]{6}$/i.test(color) ? color : null
}

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255
  )
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/**
 * Selects the higher-contrast text color for a custom primary color. Black
 * and white are the only candidates because they remain readable on the full
 * sRGB range exposed by <input type="color">.
 */
export function getContrastingForeground(color: string): '#000000' | '#ffffff' {
  const normalizedColor =
    normalizeCustomColor(color) ?? DEFAULT_CUSTOM_THEME_COLOR
  const luminance = relativeLuminance(normalizedColor)
  const blackContrast = (luminance + 0.05) / 0.05
  const whiteContrast = 1.05 / (luminance + 0.05)

  return blackContrast > whiteContrast ? '#000000' : '#ffffff'
}

/**
 * Builds the inline accent tokens used only by the custom preset. Surface and
 * sidebar accent tints continue to come from the shared preset CSS bridge,
 * which derives them from --primary in both light and dark modes.
 */
export function getCustomThemeVariables(
  color: string
): Record<CustomThemeVariableName, string> {
  const primary = normalizeCustomColor(color) ?? DEFAULT_CUSTOM_THEME_COLOR
  const foreground = getContrastingForeground(primary)

  return {
    '--primary': primary,
    '--primary-foreground': foreground,
    '--ring': primary,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': foreground,
    '--sidebar-ring': primary,
    '--chart-1': primary,
    '--chart-2': `color-mix(in oklch, ${primary} 72%, oklch(0.72 0.16 165))`,
    '--chart-3': `color-mix(in oklch, ${primary} 72%, oklch(0.7 0.16 250))`,
    '--chart-4': `color-mix(in oklch, ${primary} 72%, oklch(0.74 0.16 75))`,
    '--chart-5': `color-mix(in oklch, ${primary} 72%, oklch(0.68 0.17 325))`,
  }
}

/**
 * Preset → default font mapping. Used by the provider to resolve the user's
 * `font: 'default'` preference against the active preset.
 *
 * Co-located with the preset registry so a preset's signature typography
 * is declared in one place. Presets not listed here fall back to the
 * `resolveThemeFont` default of `sans`. The shipped `default` preset
 * opts into serif so the editorial Lora voice is the out-of-the-box
 * experience; vivid color presets stay on the humanist sans so their
 * accents read clearly without competing with the body type.
 */
export const PRESET_DEFAULT_FONT: Partial<
  Record<ThemePreset, ResolvedThemeFont>
> = {
  default: 'sans',
  anthropic: 'serif',
}

/**
 * Resolve a user font preference + active preset into the concrete font that
 * should drive the DOM. Pure function so it's safe to call inside both the
 * effect that applies the attribute and the UI preview that hints at what
 * `default` will render as.
 */
export function resolveThemeFont(
  font: ThemeFont,
  preset: ThemePreset
): ResolvedThemeFont {
  if (font === 'default') {
    return PRESET_DEFAULT_FONT[preset] ?? 'sans'
  }
  return font
}
