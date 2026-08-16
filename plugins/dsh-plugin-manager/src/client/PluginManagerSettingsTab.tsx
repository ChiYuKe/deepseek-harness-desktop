import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { IconChevronDownOutline14, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginManagerLocaleKey } from './locales.ts'
import css from './PluginManagerSettingsTab.module.css'

export interface PluginManagerEntry {
  readonly entryId: string
  readonly moduleName: string
  readonly enabled: boolean
  readonly fiberPhase: 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null
  readonly source: 'local' | 'downloaded' | 'builtin'
  readonly canToggle: boolean
}

export interface PluginManagerSnapshot {
  readonly entries: readonly PluginManagerEntry[]
}

export interface PluginManagerActions {
  readonly list: () => Promise<PluginManagerSnapshot>
  readonly setEnabled: (entryId: string, enabled: boolean) => Promise<PluginManagerSnapshot>
}

type Translate = (key: PluginManagerLocaleKey) => string
type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginManagerSnapshot }

const SOURCE_KEYS = {
  local: 'local',
  downloaded: 'downloaded',
  builtin: 'builtin',
} as const satisfies Record<PluginManagerEntry['source'], PluginManagerLocaleKey>

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} as const satisfies Record<Exclude<PluginManagerEntry['fiberPhase'], null>, PluginManagerLocaleKey>

function phaseLabel(phase: PluginManagerEntry['fiberPhase'], t: Translate): string {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

function titleOf(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped.replace(/^cordis:/, '').replace(/^dsh-(?:host-|client-)?/, '')
}

function matches(entry: PluginManagerEntry, query: string): boolean {
  return query.length === 0 || [entry.moduleName, entry.entryId].some(value => value.toLocaleLowerCase().includes(query))
}

export function PluginManagerSettingsTab({ list, setEnabled, t }: PluginManagerActions & { t: Translate }): ReactNode {
  const catalogId = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | PluginManagerEntry['source']>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void Promise.resolve().then(list).then(
      snapshot => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredEntries = useMemo(() => state.status !== 'ready' ? [] : state.snapshot.entries.filter((entry) => {
    return (filter === 'all' || entry.source === filter) && matches(entry, normalizedQuery)
  }), [filter, normalizedQuery, state])

  const refresh = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  const toggle = async (entry: PluginManagerEntry): Promise<void> => {
    if (!entry.canToggle || busy !== null) return
    setBusy(entry.entryId)
    try {
      const snapshot = await setEnabled(entry.entryId, !entry.enabled)
      setState({ status: 'ready', snapshot })
    } catch {
      setState({ status: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return <div className={css.section} aria-busy={state.status === 'loading'}>
    {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
    {state.status === 'error' ? <div className={css.failure}>
      <p role="alert">{t('error')}</p>
      <button type="button" onClick={refresh}>{t('retry')}</button>
    </div> : null}
    {state.status === 'ready' ? <div className={css.catalog}>
      <label className={css.search}>
        <IconSearchOutline16 aria-hidden="true" />
        <span className={css.visuallyHidden}>{t('search')}</span>
        <input type="search" value={query} placeholder={t('search')} aria-label={t('search')} onChange={event => setQuery(event.currentTarget.value)} />
      </label>
      <div className={css.filters} role="tablist" aria-label={t('source')}>
        {(['all', 'local', 'downloaded', 'builtin'] as const).map(key => <button
          key={key}
          type="button"
          role="tab"
          aria-selected={filter === key}
          className={css.filter}
          data-active={filter === key ? 'true' : undefined}
          onClick={() => setFilter(key)}
        >{t(key === 'all' ? 'all' : SOURCE_KEYS[key])}</button>)}
      </div>
      <div className={css.catalogHeading}><h3>{t('catalog')}</h3><span>{filteredEntries.length}</span></div>
      {state.snapshot.entries.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
      {state.snapshot.entries.length > 0 && filteredEntries.length === 0 ? <p className={css.status}>{t('emptySearch')}</p> : null}
      {filteredEntries.length > 0 ? <ul className={css.cards}>{filteredEntries.map(entry => {
        const title = titleOf(entry.moduleName)
        const open = expanded === entry.entryId
        const detailId = `${catalogId}-details-${encodeURIComponent(entry.entryId)}`
        const isBusy = busy === entry.entryId
        return <li className={css.card} key={entry.entryId} data-open={open ? 'true' : undefined}>
          <div className={css.cardContent}>
            <button className={css.identity} type="button" aria-expanded={open} aria-controls={detailId} onClick={() => setExpanded(current => current === entry.entryId ? null : entry.entryId)}>
              <strong className={css.cardTitle} title={entry.moduleName}>{title}</strong>
              <span className={css.moduleName}>{entry.moduleName}</span>
            </button>
            <div className={css.cardTrailing}>
              <span className={css.sourceTag} data-source={entry.source}>{t(SOURCE_KEYS[entry.source])}</span>
              <button className={css.toggle} type="button" disabled={!entry.canToggle || isBusy} title={entry.canToggle ? undefined : t('protected')} onClick={() => { void toggle(entry) }}>
                {isBusy ? '…' : t(entry.enabled ? 'disable' : 'enable')}
              </button>
              <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
            </div>
          </div>
          {open ? <div className={css.cardDetails} id={detailId}>
            <dl className={css.details}>
              <div><dt>{t('configuration')}</dt><dd>{t(entry.enabled ? 'enabledTag' : 'disabledTag')}</dd></div>
              <div><dt>{t('source')}</dt><dd>{t(SOURCE_KEYS[entry.source])}</dd></div>
              <div><dt>{t('cordis')}</dt><dd>{phaseLabel(entry.fiberPhase, t)}</dd></div>
              <div><dt>ID</dt><dd className={css.entryValue}>{entry.entryId}</dd></div>
            </dl>
          </div> : null}
        </li>
      })}</ul> : null}
    </div> : null}
  </div>
}
