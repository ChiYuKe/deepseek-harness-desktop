/**
 * Font preference row registered into the General section item slot: the
 * interface and assistant-output font stacks plus the output base size, with
 * a live preview and a reset control. Inputs keep a local draft so typing
 * never fights the settings round trip; drafts re-sync from the store only
 * while their field is not focused. Writes go through the injected scope
 * face; every change applies live through the font runtime.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { sanitizeFontFamily } from '../font-settings.ts'
import type { createFontRowStore } from './settings-store.ts'
import { UI_FONT_CSS_VAR, type FontField } from './font-runtime.ts'
import type { FontKey } from './locales.ts'
import css from './FontSettingsRow.module.css'

/** Injected business face: the durable writes (t rides the standard locale seat). */
export interface FontSettingsRowInjected {
  /** Persist one font field. */
  update: (field: FontField, value: string | number) => void
  /** Clear every font override back to the design defaults. */
  reset: () => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type FontSettingsRowProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createFontRowStore>>
  & PropsLocale<'settings.font'> & FontSettingsRowInjected

type FontChoice = { value: string; label: FontKey }

/** Curated stacks that work well for both Latin and Chinese UI text. */
const FONT_CHOICES: readonly FontChoice[] = [
  { value: "'Microsoft YaHei', 'Segoe UI', sans-serif", label: 'font.options.microsoftYahei' },
  { value: "'PingFang SC', 'Microsoft YaHei', sans-serif", label: 'font.options.pingfang' },
  { value: "'Source Han Sans SC', 'Microsoft YaHei', sans-serif", label: 'font.options.sourceHanSans' },
  { value: "'Noto Sans SC', 'Microsoft YaHei', sans-serif", label: 'font.options.notoSans' },
  { value: "'HarmonyOS Sans SC', 'Microsoft YaHei', sans-serif", label: 'font.options.harmony' },
  { value: "'Segoe UI', 'Microsoft YaHei', sans-serif", label: 'font.options.segoe' },
  { value: "Inter, 'Microsoft YaHei', sans-serif", label: 'font.options.inter' },
]

function fontChoices(current: string, emptyLabel: FontKey): FontChoice[] {
  const safeCurrent = sanitizeFontFamily(current)
  const choices: FontChoice[] = [{ value: '', label: emptyLabel }, ...FONT_CHOICES]
  if (safeCurrent !== '' && !choices.some(choice => choice.value === safeCurrent)) {
    choices.unshift({ value: safeCurrent, label: 'font.currentCustom' })
  }
  return choices
}

/**
 * Render the Font row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function FontSettingsRow({ t, update, reset, useStore }: FontSettingsRowProps) {
  const settings = useStore(s => s)
  const titleId = useId()
  const uiInput = useRef<HTMLSelectElement | null>(null)
  const outputInput = useRef<HTMLSelectElement | null>(null)
  const sizeInput = useRef<HTMLInputElement | null>(null)
  const [uiDraft, setUiDraft] = useState(settings.uiFont)
  const [outputDraft, setOutputDraft] = useState(settings.outputFont)
  const [sizeDraft, setSizeDraft] = useState(settings.outputSize === 0 ? '' : String(settings.outputSize))

  // Re-sync a draft from the store only when its field is not being edited,
  // so an external change (reset, another surface) lands without fighting
  // in-flight keystrokes.
  useEffect(() => {
    if (uiInput.current !== document.activeElement) setUiDraft(settings.uiFont)
  }, [settings.uiFont])
  useEffect(() => {
    if (outputInput.current !== document.activeElement) setOutputDraft(settings.outputFont)
  }, [settings.outputFont])
  useEffect(() => {
    if (sizeInput.current !== document.activeElement) {
      setSizeDraft(settings.outputSize === 0 ? '' : String(settings.outputSize))
    }
  }, [settings.outputSize])

  const changeOutputSize = (raw: string): void => {
    setSizeDraft(raw)
    const parsed = raw === '' ? 0 : Number(raw)
    update('outputSize', Number.isFinite(parsed) ? parsed : 0)
  }

  const resetAll = (): void => {
    reset()
    setUiDraft('')
    setOutputDraft('')
    setSizeDraft('')
  }

  const previewFamily = sanitizeFontFamily(outputDraft)
  const previewStyle = {
    fontFamily: previewFamily === '' ? `var(${UI_FONT_CSS_VAR})` : `${previewFamily}, var(${UI_FONT_CSS_VAR})`,
  } as const
  const uiChoices = fontChoices(uiDraft, 'font.uiFont.default')
  const outputChoices = fontChoices(outputDraft, 'font.outputFont.followUi')
  const uiValue = sanitizeFontFamily(uiDraft)
  const outputValue = sanitizeFontFamily(outputDraft)
  const uiStyle = { fontFamily: uiValue || `var(${UI_FONT_CSS_VAR})` } as const

  return (
    <div className={css.row}>
      <div className={css.title} id={titleId}>{t('font.title')}</div>
      <div className={css.field}>
        <label className={css.label} htmlFor={`${titleId}-ui`}>{t('font.uiFont.label')}</label>
        <select
          ref={uiInput}
          id={`${titleId}-ui`}
          className={css.select}
          value={uiValue}
          aria-label={t('font.options.aria')}
          style={uiStyle}
          onChange={event => {
            setUiDraft(event.currentTarget.value)
            update('uiFont', event.currentTarget.value)
          }}
        >
          {uiChoices.map(choice => (
            <option key={choice.value || 'system'} value={choice.value} style={{ fontFamily: choice.value || undefined }}>
              {t(choice.label)}
            </option>
          ))}
        </select>
      </div>
      <div className={css.field}>
        <label className={css.label} htmlFor={`${titleId}-output`}>{t('font.outputFont.label')}</label>
        <select
          ref={outputInput}
          id={`${titleId}-output`}
          className={css.select}
          value={outputValue}
          aria-label={t('font.options.aria')}
          style={previewStyle}
          onChange={event => {
            setOutputDraft(event.currentTarget.value)
            update('outputFont', event.currentTarget.value)
          }}
        >
          {outputChoices.map(choice => (
            <option key={choice.value || 'interface'} value={choice.value} style={{ fontFamily: choice.value || undefined }}>
              {t(choice.label)}
            </option>
          ))}
        </select>
      </div>
      <div className={css.field}>
        <label className={css.label} htmlFor={`${titleId}-size`}>{t('font.outputSize.label')}</label>
        <span className={css.sizeWrap}>
          <input
            ref={sizeInput}
            id={`${titleId}-size`}
            className={css.sizeInput}
            type="number"
            min={0}
            max={40}
            step={1}
            value={sizeDraft}
            placeholder={t('font.outputSize.placeholder')}
            onChange={event => { changeOutputSize(event.target.value) }}
          />
          <span className={css.unit}>{t('font.outputSize.unit')}</span>
        </span>
      </div>
      <div className={css.preview} style={previewStyle}>
        <span className={css.previewLabel}>{t('font.preview')}</span>
        <span className={css.previewText}>Aa 中文 123</span>
      </div>
      <div className={css.actions}>
        <Button variant="outline" size="sm" onClick={resetAll}>{t('font.reset')}</Button>
      </div>
    </div>
  )
}
