import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots/client'
import type { ReviewDiff, ReviewSnapshot } from '../types.ts'
import reviewRemote from '../remote.ts'
import { en, zh } from './locales.ts'
import { ReviewPanel, type ReviewActions, type ReviewPanelInjected } from './ReviewPanel.tsx'

const NS = 'dsh.reviewChanges'

interface RemoteFailure { readonly code: string; readonly message: string }
interface RemoteResult<T> { readonly ok: boolean; readonly value?: T; readonly error?: RemoteFailure }
interface ReviewRemote {
  list: (sessionId: SessionId) => Promise<RemoteResult<ReviewSnapshot>>
  diff: (sessionId: SessionId, path: string) => Promise<RemoteResult<ReviewDiff>>
  discard: (sessionId: SessionId, path: string) => Promise<RemoteResult<ReviewSnapshot>>
}
interface RemoteWithReview { reviewChanges: ReviewRemote }

export const inject = ['remote', 'slots', 'locale']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(reviewRemote)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-review-changes: dictionaries')

  const remote = ctx.reflect.get('remote.reviewChanges') as RemoteWithReview['reviewChanges']
  const call = async <T>(method: 'list' | 'diff' | 'discard', ...args: [SessionId] | [SessionId, string]): Promise<T> => {
    const result = await remote[method](...args as never) as RemoteResult<T>
    if (!result.ok || result.value === undefined) throw new Error(`reviewChanges.${method} failed: ${result.error?.message ?? 'remote error'}`)
    return result.value
  }

  const t = ctx.locale.bind(NS)
  const actions = (): ReviewPanelInjected => ({
    review: {
      list: sessionId => call<ReviewSnapshot>('list', sessionId),
      diff: (sessionId, path) => call<ReviewDiff>('diff', sessionId, path),
      discard: (sessionId, path) => call<ReviewSnapshot>('discard', sessionId, path),
    } satisfies ReviewActions,
  })

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'dsh-review-changes',
    order: 20,
    locale: NS,
    inject: actions,
  }, ReviewPanel))

  return async () => { await unmountRemote() }
}
