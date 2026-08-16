import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots/client'
import type { PluginManagerActions, PluginManagerSnapshot } from './PluginManagerSettingsTab.tsx'
import { PluginManagerSettingsTab } from './PluginManagerSettingsTab.tsx'
import { en, zh } from './locales.ts'
import managerRemote from '../remote.ts'

const NS = 'settings.pluginManager'

interface ManagerRemote {
  list: () => Promise<{ ok: true; value: PluginManagerSnapshot } | { ok: false; error: { code: string; message: string } }>
  setEnabled: (entryId: string, enabled: boolean) => Promise<{ ok: true; value: PluginManagerSnapshot } | { ok: false; error: { code: string; message: string } }>
}

interface RemoteWithManager {
  pluginManager: ManagerRemote
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.pluginManager': keyof typeof zh
  }
}

export const inject = ['slots', 'locale', 'remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(managerRemote)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-manager: dictionaries')

  const t = ctx.locale.bind(NS)
  const remote = ctx.reflect.get('remote.pluginManager') as RemoteWithManager['pluginManager']
  const call = async <T extends 'list' | 'setEnabled'>(method: T, ...args: T extends 'list' ? [] : [string, boolean]): Promise<PluginManagerSnapshot> => {
    const result = await remote[method](...args as never)
    if (!result.ok) throw new Error(`pluginManager.${method} failed: ${result.error.code}: ${result.error.message}`)
    return result.value
  }

  const actions = (): PluginManagerActions => ({
    list: () => call('list'),
    setEnabled: (entryId, enabled) => call('setEnabled', entryId, enabled),
  })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'manager',
    order: 5,
    label: () => t('tab'),
    locale: NS,
    inject: actions,
  }, PluginManagerSettingsTab))

  return async () => { await unmountRemote() }
}
