import { useSyncExternalStore, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ContinuationDock.module.css'

/** Small client-side store for continuations accepted by this browser tab. */
export interface PendingContinuationStore {
  get(sessionId: SessionId): string | undefined
  subscribe(listener: () => void): () => void
}

export interface ContinuationDockInjected {
  pending: PendingContinuationStore
  cancel: () => Promise<boolean>
}

export type ContinuationDockProps = PropsRuntime<'conversation.input.dock'> & ContinuationDockInjected

/** The pending continuation strip shown immediately above the composer. */
export function ContinuationDock({ sessionId, pending, cancel }: ContinuationDockProps) {
  const text = useSyncExternalStore(
    pending.subscribe,
    () => pending.get(sessionId),
    () => pending.get(sessionId),
  )
  const [busy, setBusy] = useState(false)

  if (text === undefined) return null

  const handleCancel = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    if (!await cancel()) setBusy(false)
  }

  return (
    <div className={css.dock} data-session-continuation>
      <div className={css.bar} role="status">
        <span className={css.text}>{text}</span>
        <button
          type="button"
          className={css.cancel}
          disabled={busy}
          onClick={() => { void handleCancel() }}
        >
          {busy ? '取消中…' : '取消'}
        </button>
      </div>
    </div>
  )
}
