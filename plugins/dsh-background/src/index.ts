/** Host half for the customizable background surface and its durable settings. */
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { BACKGROUND_SETTINGS_NAMESPACE, BackgroundSettingsSchema } from './background-settings.ts'

export const name = 'dsh-background'

/** Register the background settings in the Host user-settings document. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE),
      BackgroundSettingsSchema,
    )
  })
}
