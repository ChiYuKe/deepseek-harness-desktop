import { useRef, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { BackgroundActions, BackgroundSettings } from './background.ts'
import css from './BackgroundSettingsRow.module.css'

export type BackgroundSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.background'>
  & BackgroundActions

function imageUrl(data: string | null): string | undefined {
  return data === null ? undefined : `url("${data.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}")`
}

export function BackgroundSettingsRow({ state, choose, update, clear, t }: BackgroundSettingsRowProps) {
  const settings = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasImage = settings.imageData !== null

  return (
    <div className={css.group}>
      <div className={css.header}>
        <div className={css.title}>{t('title')}</div>
        <div className={css.description}>{t('description')}</div>
      </div>
      <div className={css.editor}>
        <div
          className={css.preview}
          style={hasImage ? { backgroundImage: imageUrl(settings.imageData), backgroundSize: settings.fit } : undefined}
          aria-label={hasImage ? settings.imageName : t('noImage')}
        >
          {!hasImage && <span>{t('noImage')}</span>}
        </div>
        <div className={css.actions}>
          <input
            ref={inputRef}
            className={css.fileInput}
            type="file"
            accept="image/*"
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file !== undefined) void choose(file)
            }}
          />
          <button type="button" className={`${css.button} ${css.primaryButton}`} onClick={() => { inputRef.current?.click() }}>
            {hasImage ? t('change') : t('choose')}
          </button>
          <button type="button" className={css.button} disabled={!hasImage} onClick={clear}>
            {t('clear')}
          </button>
          <label className={css.toggle}>
            <input
              type="checkbox"
              checked={settings.enabled && hasImage}
              disabled={!hasImage}
              onChange={event => { update({ enabled: event.currentTarget.checked }) }}
            />
            {t('enabled')}
          </label>
        </div>
      </div>
      {hasImage && (
        <div className={css.controls}>
          <label className={css.control}>
            <span>{t('opacity')} <output>{Math.round(settings.opacity * 100)}%</output></span>
            <input type="range" min="0.2" max="1" step="0.05" value={settings.opacity} onChange={event => { update({ opacity: Number(event.currentTarget.value) }) }} />
          </label>
          <label className={css.control}>
            <span>{t('mask')} <output>{Math.round(settings.mask * 100)}%</output></span>
            <input type="range" min="0" max="0.85" step="0.05" value={settings.mask} onChange={event => { update({ mask: Number(event.currentTarget.value) }) }} />
          </label>
          <label className={css.control}>
            <span>{t('blur')} <output>{settings.blur}px</output></span>
            <input type="range" min="0" max="20" step="1" value={settings.blur} onChange={event => { update({ blur: Number(event.currentTarget.value) }) }} />
          </label>
          <label className={css.selectControl}>
            <span>{t('fit')}</span>
            <select value={settings.fit} onChange={event => { update({ fit: event.currentTarget.value as BackgroundSettings['fit'] }) }}>
              <option value="cover">{t('cover')}</option>
              <option value="contain">{t('contain')}</option>
            </select>
          </label>
        </div>
      )}
      {settings.error !== null && (
        <div className={css.error} role="alert">
          {t(settings.error as 'fileTooLarge' | 'invalidFile' | 'readFailed')}
        </div>
      )}
    </div>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.background': keyof typeof import('./locales.ts').zh
  }
}
