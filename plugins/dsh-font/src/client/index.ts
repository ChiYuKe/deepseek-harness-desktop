/**
 * Browser font plugin: provides the font runtime (durable section → CSS
 * variables) and registers the feature-owned Font row into the General
 * settings section. The Host settings and credential contracts stay behind
 * the settings scope wire.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.settingsScope Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { FontSettings } from '../font-settings.ts'
import { FONT_SETTINGS_NAMESPACE } from '../font-settings.ts'
import { FontRuntime, type FontField } from './font-runtime.ts'
import { FontSettingsRow } from './FontSettingsRow.tsx'
import type { FontSettingsRowInjected } from './FontSettingsRow.tsx'
import { createFontRowStore } from './settings-store.ts'
import { en, zh, type FontKey } from './locales.ts'

export type { FontSettingsRowInjected, FontSettingsRowProps } from './FontSettingsRow.tsx'
export type { FontField } from './font-runtime.ts'
export type { FontRowState } from './settings-store.ts'
export type { FontKey } from './locales.ts'
export type { FontRuntime } from './font-runtime.ts'
export type { FontSettings } from '../font-settings.ts'

/** Namespace owning this feature's settings-row copy. */
export const SETTINGS_NS = 'settings.font'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Font settings row's copy. */
    'settings.font': FontKey
  }
}

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'settingsScope', 'locale']

/**
 * Client plugin body: bind the durable font scope, provide the font runtime,
 * and register the feature-owned Font row into the General section's item
 * slot (a feature owns its settings surface).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-font: copy dictionaries')

  const host = ctx.settingsScope.bind<FontSettings>({ namespace: FONT_SETTINGS_NAMESPACE })
  const runtime = new FontRuntime(ctx, host)
  ctx.provide('font', runtime)

  const store = createFontRowStore()
  let bound: BoundActions<typeof store> | undefined
  const sync = (): void => {
    const snapshot = host.getSnapshot()
    bound?.sync(
      snapshot.value ?? { uiFont: '', outputFont: '', outputSize: 0 },
      snapshot.revision ?? -1,
    )
  }
  ctx.effect(() => host.subscribe(sync), 'ui-font: row store sync')
  const injected = (actions: BoundActions<typeof store>): FontSettingsRowInjected => {
    bound = actions
    // Re-sync from the getter so no change is lost between registration and
    // first render (the store's revision guard drops stale duplicates).
    sync()
    return {
      update: (field: FontField, value: string | number) => { void runtime.set(field, value) },
      reset: () => { void runtime.reset() },
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'font',
    order: 20,
    store,
    locale: SETTINGS_NS,
    inject: injected,
  }, FontSettingsRow))
}
