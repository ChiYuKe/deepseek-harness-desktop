/** Font preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the font plugin. */
export const FONT_SETTINGS_NAMESPACE = 'ui-font'

/** Field carrying the interface font stack override ('' = design default). */
export const UI_FONT_FIELD = 'uiFont'

/** Field carrying the assistant-output font stack override ('' = follow the interface font). */
export const OUTPUT_FONT_FIELD = 'outputFont'

/** Field carrying the assistant-output base font size in px (0 = design default). */
export const OUTPUT_SIZE_FIELD = 'outputSize'

/** Font preferences persisted by the Font settings row. */
export interface FontSettings {
  /** Interface font stack applied to the whole application chrome. */
  uiFont: string
  /** Assistant-output font stack applied to markdown text bodies. */
  outputFont: string
  /** Assistant-output base font size in px; 0 keeps the design default. */
  outputSize: number
}

/** Durable font section shared by the Host schema and the browser scope. */
export const FontSettingsSchema: z<FontSettings> = z.object({
  [UI_FONT_FIELD]: z.string().default(''),
  [OUTPUT_FONT_FIELD]: z.string().default(''),
  [OUTPUT_SIZE_FIELD]: z.number().default(0),
})

/** Maximum accepted family-list length; longer inputs fall back to the default. */
export const MAX_FONT_FAMILY_LENGTH = 200

/**
 * Accepted characters in one CSS `<family-name>` list: letters, digits, CJK
 * and full-width characters, spaces, quotes, and the punctuation family names
 * legitimately contain. Anything else (url(), braces, semicolons) would
 * smuggle CSS into the document, so the apply site rejects it.
 */
const FONT_FAMILY_SAFE = /^[A-Za-z0-9 ,'"_\-.\u00b7\u00e0-\u00fc\u00c0-\u00dc\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+$/

/**
 * Narrow one wire value to a safe font stack.
 * @param value - value crossing the settings boundary.
 * @returns the trimmed stack, or '' when absent, oversized, or unsafe (the design default).
 */
export function sanitizeFontFamily(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > MAX_FONT_FAMILY_LENGTH) return ''
  return FONT_FAMILY_SAFE.test(trimmed) ? trimmed : ''
}

/**
 * Narrow one wire value to a safe output size in px.
 * @param value - value crossing the settings boundary.
 * @returns the rounded size, or 0 when absent or outside the 8-40px range (the design default).
 */
export function sanitizeOutputSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value < 8 || value > 40) return 0
  return Math.round(value)
}
