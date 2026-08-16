import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import SessionReferenceResolver from '@deepseek-ai/dsh-session-reference'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Host half of the command-based Session ID workflow. */
export const name = 'dsh-session-id'
export const inject = ['commands', 'sessionQuery']

const USAGE = '用法：/session-id [会话ID|cancel]'
const CONTINUATION_CONTEXT = '请把引用会话作为只读背景，在当前会话中继续处理用户接下来的新消息。'

/** Reserved command words for canceling a queued cross-session context. */
const CANCEL_WORDS = new Set(['cancel', '取消'])

/** Remove every queued session-reference context from the current agent. */
function cancelQueuedReferences(invocation: CommandInvocation): number {
  const pending = invocation.agent.inbox.nextStep.filter(message => message.source.kind === 'session-reference')
  let removed = 0
  for (const message of pending) {
    if (invocation.agent.inbox.remove(message.id)) removed += 1
  }
  return removed
}

/** A current session can hold at most one not-yet-consumed continuation. */
function hasQueuedReference(invocation: CommandInvocation): boolean {
  return invocation.agent.inbox.nextStep.some(message => message.source.kind === 'session-reference')
}

/**
 * Return the current id, or queue a read-only snapshot of the requested
 * session into the current agent. The current session remains the target.
 */
async function execute(
  invocation: CommandInvocation,
  resolver: SessionReferenceResolver,
): Promise<CommandResult> {
  const requested = invocation.rawInput.trim()
  if (requested === '') return { kind: 'success', text: String(invocation.agent.session.id) }
  if (CANCEL_WORDS.has(requested.toLocaleLowerCase())) {
    const removed = cancelQueuedReferences(invocation)
    return {
      kind: 'success',
      text: removed === 0
        ? '当前会话没有待取消的跨会话上下文。'
        : `已取消 ${removed} 个待处理的跨会话上下文；当前会话不会继续引用旧会话。`,
    }
  }
  if (/\s/u.test(requested)) return { kind: 'error', text: USAGE }

  if (requested === String(invocation.agent.session.id)) {
    return { kind: 'error', text: '不能引用当前会话本身，请输入旧会话 ID。' }
  }
  if (hasQueuedReference(invocation)) {
    return { kind: 'error', text: '当前会话已有待处理的跨会话上下文，请先选择“取消当前继续”后再选择其他会话。' }
  }

  const prepared = await resolver.prepare(
    invocation.agent,
    [{ type: 'text', text: CONTINUATION_CONTEXT }],
    [{ sessionId: requested as SessionId, label: requested }],
    invocation.signal,
  )
  if (prepared.additionalContext === undefined) {
    return { kind: 'error', text: `无法读取会话 "${requested}"。` }
  }

  // Queue the old conversation as model-facing context for this agent. This
  // deliberately does not call a client navigation API or open the source
  // session; the next user prompt stays in the current/new session.
  invocation.agent.inject(prepared.additionalContext)
  return {
    kind: 'success',
    text: `已将会话 ${requested} 的上下文载入当前会话；下一条消息将在当前会话中继续。若要取消，请输入 /session-id cancel。`,
  }
}

/** Register `/session-id` for every composed human-command adapter. */
export function apply(ctx: Context): void {
  // session-reference is opt-in in the base bundle. Mount it only when this
  // plugin is enabled, so disabling the plugin also removes the service it
  // owns. If a deployment already mounted it, reuse that instance instead.
  if (ctx.get('sessionReferenceResolver') === undefined) {
    void Promise.resolve(ctx.plugin(SessionReferenceResolver)).catch(error => {
      ctx.logger.warn('dsh-session-id: failed to mount session-reference')
      ctx.logger.warn(error)
    })
  }

  ctx.inject(['commands', 'sessionReferenceResolver'], commandCtx => {
    commandCtx.effect(() => commandCtx.commands.register({
      name: 'session-id',
      description: '选择、输入或取消当前会话中的会话 ID 上下文',
      input: { hint: '可选择最近会话或输入 ID；输入 cancel 取消，留空则查看当前 ID' },
      handler: invocation => execute(invocation, commandCtx.sessionReferenceResolver),
    }), 'dsh-session-id: command')
  })
}
