import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots/client'
import { GoUsageSettingsRow } from './GoUsageSettingsRow.tsx'
import type { GoUsageActions } from './GoUsageSettingsRow.tsx'
import type { GoUsageResult } from '../types.ts'
import usageRemote from '../remote.ts'
import { en, zh } from './locales.ts'

const NS = 'settings.opencodeGoUsage'

interface RemoteFailure { readonly code: string; readonly message: string }
interface RemoteResult { readonly ok: boolean; readonly value?: GoUsageResult; readonly error?: RemoteFailure }
interface UsageRemote {
  get: () => Promise<RemoteResult>
  refresh: () => Promise<RemoteResult>
}
interface RemoteWithUsage { opencodeGoUsage: UsageRemote }

export const inject = ['remote', 'slots', 'locale']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(usageRemote)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-opencode-go-usage: dictionaries')

  const remote = ctx.reflect.get('remote.opencodeGoUsage') as RemoteWithUsage['opencodeGoUsage']
  const call = async (method: 'get' | 'refresh'): Promise<GoUsageResult> => {
    const result = await remote[method]()
    if (!result.ok || result.value === undefined) {
      throw new Error(`opencodeGoUsage.${method} failed: ${result.error?.message ?? 'remote error'}`)
    }
    return result.value
  }

  const t = ctx.locale.bind(NS)
  const actions = (): GoUsageActions => ({
    get: () => call('get'),
    refresh: () => call('refresh'),
  })

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'opencode-go-usage',
    order: 30,
    locale: NS,
    inject: actions,
  }, GoUsageSettingsRow))

  return async () => { await unmountRemote() }
}
