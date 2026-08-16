import type {
  ClientContext, SessionId, SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { CommandUiContract, SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots/client'
import { ContinuationDock } from './ContinuationDock.tsx'
import type { PendingContinuationStore } from './ContinuationDock.tsx'

const CONTINUATION_MARKER = '若要取消，请输入 /session-id cancel。'
const CANCEL_RESULT_PREFIXES = ['已取消 ', '当前会话没有待取消']
const CANCEL_OPTION_ID = '__dsh_session_id_cancel__'

/** Keep the picker useful without turning it into a second full session browser. */
const MAX_PICKER_OPTIONS = 30

class ContinuationStore implements PendingContinuationStore {
  private readonly entries = new Map<SessionId, string>()
  private readonly listeners = new Set<() => void>()

  get(sessionId: SessionId): string | undefined {
    return this.entries.get(sessionId)
  }

  set(sessionId: SessionId, text: string): void {
    this.entries.set(sessionId, text)
    this.notify()
  }

  clear(sessionId: SessionId): void {
    if (!this.entries.delete(sessionId)) return
    this.notify()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

function shortId(id: SessionId): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

function optionsOf(
  summaries: readonly SessionSummary[],
  currentId: SessionId,
): SelectOption[] {
  const sessions = summaries
    .filter(summary => summary.id !== currentId && !summary.blank && summary.origin !== 'subagent')
    .slice(0, MAX_PICKER_OPTIONS)
    .map(summary => ({
      id: String(summary.id),
      label: summary.displayTitle,
      detail: summary.cwd === undefined
        ? shortId(summary.id)
        : `${summary.cwd} · ${shortId(summary.id)}`,
    }))
  return [
    {
      id: CANCEL_OPTION_ID,
      label: '取消当前继续',
      detail: '清除已经载入但尚未使用的跨会话上下文',
    },
    ...sessions,
  ]
}

/** The client only listens for the command acknowledgment; it never navigates. */
export const inject = ['commandUi', 'sessions', 'slots']

/**
 * Surface the command result immediately in the current session's composer.
 *
 * The Host still owns the actual continuation: it queues the referenced
 * snapshot on the current agent and the next user message consumes it. This
 * browser-side notice only closes the feedback gap between command admission
 * and that next message, without creating a duplicate chat record or opening
 * the referenced session.
 */
export function apply(ctx: ClientContext): void {
  const pending = new ContinuationStore()
  const command = ctx.get('commandUi') as CommandUiContract
  const sessions = ctx.sessions

  ctx.effect(() => command.decorate({
    name: 'session-id',
    available: session => sessions.binding(session.sessionId)?.session !== undefined,
    ui: {
      kind: 'popupSelect',
      options: async (session, signal) => {
        if (signal.aborted) return []
        const snapshot = sessions.list.getSnapshot()
        const summaries = snapshot.ids
          .map(id => snapshot.byId[id])
          .filter((summary): summary is SessionSummary => summary !== undefined)
        return optionsOf(summaries, session.sessionId)
      },
      onSelect: async (option, session) => {
        const live = sessions.binding(session.sessionId)?.session
        if (live === undefined) throw new Error('当前会话尚未准备好')
        const result = await live.command(option.id === CANCEL_OPTION_ID
          ? '/session-id cancel'
          : `/session-id ${option.id}`)
        if (!result.ok) throw new Error(`载入会话失败：${result.error.message}`)
        if (!result.value.matched) throw new Error('当前环境没有可用的 /session-id 命令')
      },
    },
  }), 'dsh-session-id: recent session picker')

  ctx.on('command/executed', (sessionId, commandName, result) => {
    if (commandName !== 'session-id') return

    const actx = ctx.sessions.scope(sessionId)
    if (actx === undefined) return

    const conversation = actx.get('conversation')
    if (conversation === undefined) return

    const text = result.text ?? '会话 ID 命令已执行。'
    if (result.kind === 'success' && (text.startsWith('已将会话 ') || text.includes(CONTINUATION_MARKER))) {
      pending.set(sessionId, text)
      return
    }

    if (result.kind === 'success' && CANCEL_RESULT_PREFIXES.some(prefix => text.startsWith(prefix))) {
      pending.clear(sessionId)
    }

    conversation.input.for(actx).notify(
      result.kind === 'error' ? 'error' : 'info',
      text,
    )
  })

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-session-id',
    order: 30,
    inject: (sessionId: SessionId): { pending: PendingContinuationStore; cancel: () => Promise<boolean> } => {
      const actx = ctx.sessions.scope(sessionId)
      if (actx === undefined) throw new Error(`dsh-session-id: session "${sessionId}" resolved no scope`)
      const conversation = actx.get('conversation')
      if (conversation === undefined) throw new Error('dsh-session-id: conversation service unavailable')

      return {
        pending,
        cancel: async () => {
          const session = ctx.sessions.binding(sessionId)?.session
          if (session === undefined) return false
          try {
            const result = await session.command('/session-id cancel')
            if (!result.ok || !result.value.matched) {
              conversation.input.for(actx).notify('error', '取消跨会话上下文失败。')
              return false
            }
            pending.clear(sessionId)
            return true
          } catch (error: unknown) {
            conversation.input.for(actx).notify('error', error instanceof Error ? error.message : String(error))
            return false
          }
        },
      }
    },
  }, ContinuationDock))
}
