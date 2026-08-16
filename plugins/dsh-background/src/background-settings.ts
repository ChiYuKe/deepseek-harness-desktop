/** Durable settings owned by the customizable background plugin. */

import z from '@deepseek-ai/schemastery'

/** Host settings namespace for the background preference. */
export const BACKGROUND_SETTINGS_NAMESPACE = 'ui-background'

/** Browser locale namespace for the settings row. */
export const SETTINGS_NS = 'settings.background'

export interface BackgroundSettings {
  imageData: string | null
  imageName: string
  enabled: boolean
  opacity: number
  mask: number
  blur: number
  fit: 'cover' | 'contain'
  error: string | null
}

export const DEFAULT_SETTINGS: BackgroundSettings = {
  imageData: null,
  imageName: '',
  enabled: false,
  opacity: 0.82,
  mask: 0.32,
  blur: 0,
  fit: 'cover',
  error: null,
}

/** Schema shared by the Host settings file and the browser settings scope. */
export const BackgroundSettingsSchema: z<BackgroundSettings> = z.object({
  imageData: z.union([z.string(), z.const(null)]).default(DEFAULT_SETTINGS.imageData),
  imageName: z.string().default(DEFAULT_SETTINGS.imageName),
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled),
  opacity: z.number().default(DEFAULT_SETTINGS.opacity),
  mask: z.number().default(DEFAULT_SETTINGS.mask),
  blur: z.number().default(DEFAULT_SETTINGS.blur),
  fit: z.union(['cover', 'contain']).default(DEFAULT_SETTINGS.fit),
  error: z.union([z.string(), z.const(null)]).default(DEFAULT_SETTINGS.error),
})
