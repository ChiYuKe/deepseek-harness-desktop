import type { ClientContext, SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  DEFAULT_SETTINGS, SETTINGS_NS,
  type BackgroundSettings,
} from '../background-settings.ts'

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** Legacy browser-local key used before the Host settings migration. */
const LEGACY_SETTINGS_KEY = 'dsh-background.settings'

export interface BackgroundActions {
  readonly state: SnapshotStore<BackgroundSettings>
  readonly choose: (file: File) => Promise<void>
  readonly update: (patch: Partial<Pick<BackgroundSettings, 'enabled' | 'opacity' | 'mask' | 'blur' | 'fit'>>) => void
  readonly clear: () => void
}

const BACKGROUND_LAYER_ID = 'dsh-background-layer'

const BACKGROUND_THEME_OVERRIDES = {
  '--dsw-alias-bg-base': { light: 'transparent', dark: 'transparent' },
  // Keep the sidebar readable while allowing the selected image to show
  // through the shell column instead of leaving it as an opaque slab.
  '--dsw-specific-sidebar-fill': {
    light: 'rgba(249, 250, 251, 0.66)',
    dark: 'rgba(21, 21, 23, 0.66)',
  },
  // The composer remains a raised surface, but is no longer fully opaque.
  '--dsw-specific-input-major': {
    light: 'rgba(255, 255, 255, 0.72)',
    dark: 'rgba(44, 44, 46, 0.72)',
  },
  // Diff, terminal, read, and fenced-code cards all share these surfaces.
  '--dsw-alias-markdown-code-block': {
    light: 'rgba(250, 250, 251, 0.72)',
    dark: 'rgba(27, 27, 28, 0.72)',
  },
  '--dsw-alias-markdown-code-block-banner': {
    light: 'rgba(249, 250, 251, 0.68)',
    dark: 'rgba(33, 35, 36, 0.68)',
  },
} as const

const STYLE_TEXT = `
body[data-dsh-background="on"] {
  position: relative;
  isolation: isolate;
  background: transparent !important;
  --dsw-alias-bg-base: transparent !important;
}

body[data-dsh-background="on"] > #${BACKGROUND_LAYER_ID} {
  position: fixed;
  inset: -24px;
  z-index: 0;
  pointer-events: none;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover, cover;
  transform: scale(1.02);
}

body[data-dsh-background="on"] #root {
  position: relative;
  z-index: 1;
  background: transparent !important;
}

/* The shell frame and conversation root each consume the base token on their
   own element. Force that inherited base transparent while leaving raised
   surfaces (sidebar, composer, cards, dialogs) on their dedicated tokens. */
body[data-dsh-background="on"] #root,
body[data-dsh-background="on"] #root * {
  --dsw-alias-bg-base: transparent !important;
}

body[data-dsh-background="on"] > #${BACKGROUND_LAYER_ID}[hidden] {
  display: none !important;
}
`

function normalize(value: Partial<BackgroundSettings>): BackgroundSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    imageData: typeof value.imageData === 'string' && value.imageData.length > 0 ? value.imageData : null,
    imageName: typeof value.imageName === 'string' ? value.imageName : '',
    enabled: value.enabled === true,
    opacity: clampNumber(value.opacity, DEFAULT_SETTINGS.opacity, 0.2, 1),
    mask: clampNumber(value.mask, DEFAULT_SETTINGS.mask, 0, 0.85),
    blur: clampNumber(value.blur, DEFAULT_SETTINGS.blur, 0, 20),
    fit: value.fit === 'contain' ? 'contain' : 'cover',
    error: typeof value.error === 'string' ? value.error : null,
  }
}

/** Read the pre-Host browser state for a one-time migration. */
function readLegacySettings(): BackgroundSettings | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const legacy = value as Partial<BackgroundSettings>
    const settings = normalize(legacy)
    return settings.imageData === null ? undefined : settings
  } catch {
    return undefined
  }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function cssUrl(data: string): string {
  return `url("${data.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}")`
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('FileReader returned no image data'))
    })
    reader.addEventListener('error', () => { reject(reader.error ?? new Error('FileReader failed')) })
    reader.readAsDataURL(file)
  })
}

export class BackgroundController {
  private readonly style: HTMLStyleElement | undefined
  private readonly layer: HTMLDivElement | undefined
  private removeThemeOverride: (() => void) | undefined

  constructor(
    private readonly ctx: ClientContext,
    readonly store: SnapshotStore<BackgroundSettings>,
    private readonly settings: SettingsScope<BackgroundSettings>,
  ) {
    store.set(normalize(store.getSnapshot()))
    if (typeof document !== 'undefined') {
      const style = document.createElement('style')
      style.dataset.dshBackgroundStyle = 'true'
      style.textContent = STYLE_TEXT
      ;(document.head ?? document.documentElement).appendChild(style)
      this.style = style
      const layer = document.createElement('div')
      layer.id = BACKGROUND_LAYER_ID
      layer.hidden = true
      layer.setAttribute('aria-hidden', 'true')
      document.body.insertBefore(layer, document.body.firstChild)
      this.layer = layer
    }
    ctx.effect(() => {
      let migrationStarted = false
      let lastSettingsValue: BackgroundSettings | undefined
      const syncSettings = (): void => {
        const snapshot = settings.getSnapshot()
        const value = snapshot.value
        // SettingsScope publishes revision changes for stale queued writes too,
        // while keeping the last accepted value. Only a new value reference is
        // authoritative; otherwise an older slider write would snap the draft
        // back while the latest drag event is still queued.
        if (value !== undefined && value !== lastSettingsValue) {
          lastSettingsValue = value
          store.set(normalize(value))
        }
        if (migrationStarted || snapshot.mode !== 'host' || value === undefined) return
        migrationStarted = true
        const user = snapshot.user
        if (typeof user === 'object' && user !== null && Object.keys(user).length > 0) return
        const legacy = readLegacySettings()
        if (legacy === undefined) return
        const { imageData, imageName, enabled, opacity, mask, blur, fit } = legacy
        this.persist({ imageData, imageName, enabled, opacity, mask, blur, fit })
      }
      const sync = (): void => { this.sync(store.getSnapshot()) }
      const unsubscribeSettings = settings.subscribe(syncSettings)
      const unsubscribe = store.subscribe(sync)
      syncSettings()
      sync()
      return () => {
        unsubscribeSettings()
        unsubscribe()
        this.resetDom()
        this.style?.remove()
        this.layer?.remove()
      }
    }, 'dsh-background: presentation')
  }

  get actions(): BackgroundActions {
    return {
      state: this.store,
      choose: file => this.choose(file),
      update: patch => {
        this.store.update(state => {
          Object.assign(state, patch)
          state.error = null
        })
        this.persist({ ...patch, error: null })
      },
      clear: () => {
        this.store.update(state => {
          state.imageData = null
          state.imageName = ''
          state.enabled = false
          state.error = null
        })
        this.persist({ imageData: null, imageName: '', enabled: false, error: null })
      },
    }
  }

  private async choose(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.setError('invalidFile')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.setError('fileTooLarge')
      return
    }
    try {
      const imageData = await readFile(file)
      this.store.update(state => {
        state.imageData = imageData
        state.imageName = file.name
        state.enabled = true
        state.error = null
      })
      this.persist({ imageData, imageName: file.name, enabled: true, error: null })
    } catch {
      this.setError('readFailed')
    }
  }

  private setError(error: string): void {
    this.store.update(state => { state.error = error })
    this.persist({ error })
  }

  /** Persist each changed field through the Host settings scope. */
  private persist(patch: Partial<BackgroundSettings>): void {
    for (const [field, value] of Object.entries(patch) as Array<[keyof BackgroundSettings, unknown]>) {
      void this.settings.set(field, value)
    }
  }

  private sync(settings: BackgroundSettings): void {
    if (typeof document === 'undefined') return
    const active = settings.enabled && settings.imageData !== null
    const body = document.body
    if (active) {
      body.dataset.dshBackground = 'on'
      if (this.layer !== undefined) {
        const mask = `rgba(0, 0, 0, ${settings.mask})`
        this.layer.hidden = false
        this.layer.style.backgroundImage = `linear-gradient(${mask}, ${mask}), ${cssUrl(settings.imageData!)}`
        this.layer.style.backgroundSize = `cover, ${settings.fit}`
        this.layer.style.opacity = String(settings.opacity)
        this.layer.style.filter = `blur(${settings.blur}px)`
      }
      body.style.setProperty('--dsh-background-image', cssUrl(settings.imageData!))
      body.style.setProperty('--dsh-background-opacity', String(settings.opacity))
      body.style.setProperty('--dsh-background-mask', String(settings.mask))
      body.style.setProperty('--dsh-background-blur', `${settings.blur}px`)
      body.style.setProperty('--dsh-background-fit', settings.fit)
      this.removeThemeOverride ??= this.ctx.theme.overrideTokens('dsh-background', BACKGROUND_THEME_OVERRIDES)
      return
    }
    this.resetDom()
  }

  private resetDom(): void {
    if (typeof document !== 'undefined') {
      const body = document.body
      delete body.dataset.dshBackground
      if (this.layer !== undefined) {
        this.layer.hidden = true
        this.layer.style.backgroundImage = ''
        this.layer.style.backgroundSize = ''
        this.layer.style.opacity = ''
        this.layer.style.filter = ''
      }
      for (const name of [
        '--dsh-background-image',
        '--dsh-background-opacity',
        '--dsh-background-mask',
        '--dsh-background-blur',
        '--dsh-background-fit',
      ]) body.style.removeProperty(name)
    }
    this.removeThemeOverride?.()
    this.removeThemeOverride = undefined
  }
}
