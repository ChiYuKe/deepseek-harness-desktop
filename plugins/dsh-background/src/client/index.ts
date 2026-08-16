import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { BackgroundSettingsRow } from './BackgroundSettingsRow.tsx'
import { BackgroundController } from './background.ts'
import { BACKGROUND_SETTINGS_NAMESPACE, DEFAULT_SETTINGS, SETTINGS_NS } from '../background-settings.ts'
import { en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.background': keyof typeof zh
  }
}

export const inject = ['slots', 'locale', 'theme', 'settingsScope']

export function apply(ctx: ClientContext): void {
  const settings = ctx.settingsScope.bind({ namespace: BACKGROUND_SETTINGS_NAMESPACE })
  const store = createSnapshotStore(DEFAULT_SETTINGS)
  const controller = new BackgroundController(ctx, store, settings)

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'dsh-background: dictionaries')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'background',
    order: 20,
    locale: SETTINGS_NS,
    inject: () => controller.actions,
  }, BackgroundSettingsRow))
}
