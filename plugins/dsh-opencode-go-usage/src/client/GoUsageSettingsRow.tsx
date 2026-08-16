import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GoUsageData, GoUsageResult, GoUsageWindow } from '../types.ts'
import type { GoUsageLocaleKey } from './locales.ts'
import css from './GoUsageSettingsRow.module.css'

export interface GoUsageActions {
  readonly get: () => Promise<GoUsageResult>
  readonly refresh: () => Promise<GoUsageResult>
}

export type GoUsageSettingsRowProps = PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.opencodeGoUsage'>
  & GoUsageActions

function formatPercent(percent: number): string {
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分钟`
  return `${minutes}分钟`
}

function resetText(window: GoUsageWindow, now: number, t: (key: GoUsageLocaleKey) => string): string {
  if (window.resetAt === null) return t('reset')
  const resetAt = Date.parse(window.resetAt)
  if (!Number.isFinite(resetAt)) return t('reset')
  return `${t('reset')} ${formatDuration(resetAt - now)}`
}

const WINDOWS: readonly { key: keyof Pick<GoUsageData, 'rolling' | 'weekly' | 'monthly'>; label: GoUsageLocaleKey }[] = [
  { key: 'rolling', label: 'rolling' },
  { key: 'weekly', label: 'weekly' },
  { key: 'monthly', label: 'monthly' },
]

export function GoUsageSettingsRow({ t, get, refresh }: GoUsageSettingsRowProps) {
  const [result, setResult] = useState<GoUsageResult>({ status: 'error' })
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = async (force: boolean): Promise<void> => {
    setBusy(true)
    try {
      setResult(await (force ? refresh() : get()))
    } catch {
      setResult({ status: 'error' })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load(false)
    const refreshTimer = window.setInterval(() => { void load(false) }, 5 * 60 * 1000)
    const clockTimer = window.setInterval(() => { setNow(Date.now()) }, 30_000)
    return () => {
      window.clearInterval(refreshTimer)
      window.clearInterval(clockTimer)
    }
  }, [])

  const data = result.data
  const statusMessage: GoUsageLocaleKey = result.status === 'not-configured'
    ? 'notConfigured'
    : result.status === 'unauthorized'
      ? 'unauthorized'
      : result.status === 'unavailable'
        ? 'unavailable'
        : result.status === 'error' ? 'error' : 'noData'

  return (
    <div className={css.row}>
      <div className={css.header}>
        <div>
          <div className={css.title}>{t('title')}</div>
          <div className={css.description}>{t('description')}</div>
        </div>
        <button type="button" className={css.button} disabled={busy} onClick={() => { void load(true) }}>
          {busy ? t('refreshing') : t('refresh')}
        </button>
      </div>
      {data === undefined ? <div className={css.message} role="status">{t(statusMessage)}</div> : null}
      {data !== undefined ? <>
        <div className={css.windows}>
          {WINDOWS.map(({ key, label }) => {
            const usage = data[key]
            return <div className={css.window} key={key}>
              <div className={css.windowHeader}>
                <span>{t(label)}</span>
                <span className={css.percent}>{formatPercent(usage.percent)}</span>
              </div>
              <div className={css.track} aria-hidden="true">
                <div className={css.fill} style={{ width: `${usage.percent}%` }} />
              </div>
              <div className={css.reset}>{resetText(usage, now, t)}</div>
            </div>
          })}
        </div>
        <div className={css.meta}>
          <span className={result.stale ? css.stale : undefined}>{result.stale ? t('stale') : `${t('updated')} ${formatTime(data.fetchedAt)}`}</span>
        </div>
      </> : null}
    </div>
  )
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.opencodeGoUsage': GoUsageLocaleKey
  }
}
