import { useEffect, useState, type MouseEvent } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReviewDiff, ReviewFile, ReviewSnapshot } from '../types.ts'
import type { ReviewLocaleKey } from './locales.ts'
import css from './ReviewPanel.module.css'

export interface ReviewActions {
  readonly list: (sessionId: SessionId) => Promise<ReviewSnapshot>
  readonly diff: (sessionId: SessionId, path: string) => Promise<ReviewDiff>
  readonly discard: (sessionId: SessionId, path: string) => Promise<ReviewSnapshot>
}

export interface ReviewPanelInjected {
  readonly review: ReviewActions
}

export type ReviewPanelProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<'dsh.reviewChanges'>
  & ReviewPanelInjected

function statusLabel(file: ReviewFile, t: (key: ReviewLocaleKey, params?: Record<string, string | number>) => string): string {
  return t(file.status)
}

function template(t: (key: ReviewLocaleKey, params?: Record<string, string | number>) => string, key: ReviewLocaleKey, params: Record<string, string | number>): string {
  return t(key, params)
}

export function ReviewPanel({ sessionId, t, review }: ReviewPanelProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedDiff, setSelectedDiff] = useState<ReviewDiff | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setBusy(true)
    setError(null)
    void review.list(sessionId).then(next => {
      if (cancelled) return
      setSnapshot(next)
      setSelectedPath(current => current !== null && next.files.some(file => file.path === current) ? current : next.files[0]?.path ?? null)
    }).catch(() => {
      if (!cancelled) setError(t('loadFailed'))
    }).finally(() => {
      if (!cancelled) setBusy(false)
    })
    return () => { cancelled = true }
  }, [open, review, sessionId, t])

  useEffect(() => {
    if (!open || selectedPath === null) {
      setSelectedDiff(null)
      return
    }
    let cancelled = false
    setSelectedDiff(null)
    void review.diff(sessionId, selectedPath).then(next => {
      if (!cancelled) setSelectedDiff(next)
    }).catch(() => {
      if (!cancelled) setError(t('diffFailed'))
    })
    return () => { cancelled = true }
  }, [open, review, selectedPath, sessionId, t])

  const refresh = (): void => {
    setOpen(false)
    setTimeout(() => { setOpen(true) }, 0)
  }

  const discard = async (): Promise<void> => {
    if (selectedPath === null) return
    const confirmed = window.confirm(template(t, 'confirmDiscard', { path: selectedPath }))
    if (!confirmed) return
    setBusy(true)
    setError(null)
    try {
      const next = await review.discard(sessionId, selectedPath)
      setSnapshot(next)
      setSelectedPath(next.files[0]?.path ?? null)
    } catch {
      setError(t('discardFailed'))
    } finally {
      setBusy(false)
    }
  }

  const stop = (event: MouseEvent<HTMLDivElement>): void => { event.stopPropagation() }
  const count = snapshot?.files.length ?? 0

  return (
    <div className={css.root}>
      <button
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={count === 0 ? t('button') : template(t, 'buttonWithCount', { count })}
        onClick={() => { setOpen(current => !current) }}
      >
        <span>{t('button')}</span>
        {count > 0 ? <span className={css.triggerCount}>{count}</span> : null}
      </button>
      {open ? (
        <div className={css.backdrop} role="presentation" onClick={() => { setOpen(false) }}>
          <section className={css.panel} role="dialog" aria-modal="true" aria-label={t('title')} onClick={stop}>
            <header className={css.panelHeader}>
              <div>
                <div className={css.title}>{t('title')}</div>
                <div className={css.subtitle}>{snapshot?.root ?? t('workspace')}</div>
              </div>
              <button type="button" className={css.iconButton} aria-label={t('close')} onClick={() => { setOpen(false) }}>×</button>
            </header>
            <div className={css.toolbar}>
              <span className={css.summary}>
                {snapshot?.branch ?? '—'}
                <span className={css.summaryAdditions}>+{snapshot?.additions ?? 0}</span>
                <span className={css.summaryDeletions}>-{snapshot?.deletions ?? 0}</span>
              </span>
              <button type="button" className={css.refreshButton} disabled={busy} onClick={refresh}>
                {busy ? t('refreshing') : t('refresh')}
              </button>
            </div>
            {error ? <div className={css.error} role="alert">{error}</div> : null}
            {snapshot !== null && snapshot.files.length === 0 && !error ? <div className={css.empty}>{t('noChanges')}</div> : null}
            {snapshot !== null && snapshot.files.length > 0 ? (
              <div className={css.content}>
                <div className={css.files}>
                  {snapshot.files.map(file => (
                    <button
                      type="button"
                      key={`${file.status}:${file.path}`}
                      className={file.path === selectedPath ? `${css.fileButton} ${css.fileButtonSelected}` : css.fileButton}
                      onClick={() => { setSelectedPath(file.path) }}
                    >
                      <span className={css.filePath} title={file.path}>{file.path}</span>
                      <span className={css.fileMeta}>
                        <span className={css.status}>{statusLabel(file, t)}</span>
                        {file.binary ? <span>{t('binary')}</span> : <>
                          <span className={css.additions}>{template(t, 'additions', { count: file.additions })}</span>
                          <span className={css.deletions}>{template(t, 'deletions', { count: file.deletions })}</span>
                        </>}
                      </span>
                    </button>
                  ))}
                </div>
                <div className={css.diff}>
                  {selectedDiff !== null ? <>
                    <div className={css.diffHeader}>{selectedDiff.path}</div>
                    <pre className={css.code}>{selectedDiff.diff || t('selectFile')}</pre>
                  </> : <div className={css.selectFile}>{t('selectFile')}</div>}
                </div>
              </div>
            ) : null}
            <footer className={css.footer}>
              <button type="button" className={`${css.footerButton} ${css.footerPrimary}`} disabled={busy || selectedPath === null} onClick={() => { void discard() }}>
                {t('discard')}
              </button>
              <button type="button" className={css.footerButton} onClick={() => { setOpen(false) }}>{t('close')}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh.reviewChanges': ReviewLocaleKey
  }
}
