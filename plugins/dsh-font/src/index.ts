/** Host registration for the durable font preferences. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  FONT_SETTINGS_NAMESPACE, FontSettingsSchema,
} from './font-settings.ts'

export {
  FONT_SETTINGS_NAMESPACE, MAX_FONT_FAMILY_LENGTH, OUTPUT_FONT_FIELD, OUTPUT_SIZE_FIELD,
  UI_FONT_FIELD, sanitizeFontFamily, sanitizeOutputSize,
  type FontSettings,
} from './font-settings.ts'

/**
 * Register the durable font section when the optional Host settings service
 * is composed. The browser scope then binds the same namespace.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(FONT_SETTINGS_NAMESPACE), FontSettingsSchema)
  })
}
