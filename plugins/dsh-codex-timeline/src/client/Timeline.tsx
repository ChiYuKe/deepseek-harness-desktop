import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TimelineLocaleKey } from './locales.ts'
import css from './Timeline.module.css'

type MarkerKind = 'context' | 'user' | 'assistant' | 'tool' | 'other'

interface Marker {
  readonly key: string
  readonly kind: MarkerKind
  readonly ratio: number
  readonly title: string
  readonly text: string
  readonly source: string | null
  readonly row: HTMLElement
}

interface RailLayout {
  readonly left: number
  readonly top: number
  readonly height: number
  readonly right: number
}

export type TimelineProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<'dsh.codexTimeline'>

function clean(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function markerKind(row: HTMLElement): MarkerKind {
  const kind = row.dataset.chatFlowKind
  if (kind === 'context') return 'context'
  if (kind === 'user' || kind === 'steering') return 'user'
  if (kind?.includes('assistant')) return 'assistant'
  if (kind?.includes('tool') || kind?.includes('command')) return 'tool'
  return 'other'
}

function markerText(row: HTMLElement, t: (key: TimelineLocaleKey) => string): Pick<Marker, 'title' | 'text' | 'source'> {
  const source = row.querySelector<HTMLElement>('[data-context-source]')
  const summary = row.querySelector<HTMLElement>('[data-context-summary]')
  const visible = clean(row.innerText || row.textContent || '')
  const title = visible.slice(0, 80) || t('message')
  const text = visible.length > title.length ? visible.slice(title.length).trim() : clean(summary?.textContent ?? '')
  const sourceText = source === null ? null : clean(source.textContent ?? '')
  return { title, text: text || t('noPreview'), source: sourceText }
}

function findScrollport(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-conversation-scroll]')
}

function readMarkers(scrollport: HTMLElement, t: (key: TimelineLocaleKey) => string): Marker[] {
  const flow = scrollport.querySelector<HTMLElement>('[data-chat-flow]')
  if (flow === null) return []
  const rows = [...flow.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]
  const total = Math.max(1, flow.scrollHeight, scrollport.scrollHeight)
  return rows.map(row => {
    const top = row.offsetTop + row.offsetHeight / 2
    const content = markerText(row, t)
    return {
      key: row.dataset.chatAnchorKey ?? String(top),
      kind: markerKind(row),
      ratio: Math.max(0, Math.min(1, top / total)),
      ...content,
      row,
    }
  })
}

function railLayout(scrollport: HTMLElement): RailLayout | null {
  const rect = scrollport.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const left = Math.max(4, rect.left + 6)
  return { left, top: Math.max(4, rect.top), height: Math.max(40, rect.height - 8), right: rect.right }
}

function previewPosition(layout: RailLayout, marker: Marker): { left: number; top: number } {
  const left = Math.min(layout.left + 36, window.innerWidth - 240)
  const desiredTop = layout.top + marker.ratio * layout.height - 34
  const top = Math.max(8, Math.min(window.innerHeight - 150, desiredTop))
  return { left, top }
}

export function Timeline({ t }: TimelineProps) {
  const [visible, setVisible] = useState(true)
  const [layout, setLayout] = useState<RailLayout | null>(null)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const scrollportRef = useRef<HTMLElement | null>(null)
  const clearHoverTimer = useRef<number | null>(null)

  const refresh = (): void => {
    const scrollport = findScrollport()
    scrollportRef.current = scrollport
    if (scrollport === null) {
      setLayout(null)
      setMarkers([])
      return
    }
    setLayout(railLayout(scrollport))
    setMarkers(readMarkers(scrollport, t))
    const center = scrollport.scrollTop + scrollport.clientHeight / 2
    const nearest = [...readMarkers(scrollport, t)].sort((a, b) => Math.abs(a.ratio * scrollport.scrollHeight - center) - Math.abs(b.ratio * scrollport.scrollHeight - center))[0]
    setActive(nearest?.key ?? null)
  }

  useEffect(() => {
    let frame: number | null = null
    const schedule = (): void => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        refresh()
      })
    }
    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    window.addEventListener('resize', schedule)
    const timer = window.setInterval(schedule, 1200)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      window.clearInterval(timer)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [t])

  useEffect(() => {
    const scrollport = scrollportRef.current
    if (scrollport === null) return
    const onScroll = (): void => {
      setLayout(railLayout(scrollport))
      const center = scrollport.scrollTop + scrollport.clientHeight / 2
      const next = [...markers].sort((a, b) => Math.abs(a.ratio * scrollport.scrollHeight - center) - Math.abs(b.ratio * scrollport.scrollHeight - center))[0]
      setActive(next?.key ?? null)
    }
    scrollport.addEventListener('scroll', onScroll, { passive: true })
    return () => { scrollport.removeEventListener('scroll', onScroll) }
  }, [markers])

  const selected = useMemo(() => markers.find(marker => marker.key === hovered) ?? null, [hovered, markers])
  if (layout === null || markers.length === 0 || !visible) {
    return (
      <button type="button" className={css.trigger} aria-expanded={visible} aria-label={t('navigationOff')} onClick={() => { setVisible(true); window.setTimeout(refresh, 0) }}>
        {t('navigation')}
      </button>
    )
  }

  const portal = (
    <div className={css.portal}>
      <div
        className={css.rail}
        aria-label={t('aria')}
        style={{ left: layout.left, top: layout.top, height: layout.height }}
        onMouseLeave={() => {
          clearHoverTimer.current = window.setTimeout(() => { setHovered(null) }, 160)
        }}
        onMouseEnter={() => {
          if (clearHoverTimer.current !== null) window.clearTimeout(clearHoverTimer.current)
        }}
      >
        <div className={css.track} />
        {markers.map(marker => (
          <button
            type="button"
            key={marker.key}
            className={css.marker}
            data-kind={marker.kind}
            data-active={marker.key === active || undefined}
            style={{ top: `${marker.ratio * 100}%` }}
            aria-label={marker.title}
            onMouseEnter={() => { setHovered(marker.key) }}
            onClick={() => {
              const scrollport = scrollportRef.current
              if (scrollport === null) return
              scrollport.scrollTo({ top: Math.max(0, marker.row.offsetTop - scrollport.clientHeight / 3), behavior: 'smooth' })
            }}
          />
        ))}
      </div>
      {selected !== null ? (() => {
        const position = previewPosition(layout, selected)
        return (
          <div
            className={css.preview}
            style={{ left: position.left, top: position.top }}
            onMouseEnter={() => {
              if (clearHoverTimer.current !== null) window.clearTimeout(clearHoverTimer.current)
            }}
            onMouseLeave={() => { setHovered(null) }}
          >
            <div className={css.previewTitle}>{selected.title}</div>
            <p className={css.previewText}>{selected.text}</p>
            {selected.source !== null ? <div className={css.previewMeta}>{t(selected.kind === 'context' ? 'contextInjection' : 'message')} · {selected.source}</div> : null}
          </div>
        )
      })() : null}
    </div>
  )

  return (
    <>
      <button type="button" className={css.trigger} aria-expanded="true" aria-label={t('navigationOn')} onClick={() => { setVisible(false) }}>
        {t('navigation')}
      </button>
      {createPortal(portal, document.body)}
    </>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh.codexTimeline': TimelineLocaleKey
  }
}
