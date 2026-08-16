/**
 * Browser font registry: adopts the durable font section and applies it to
 * CSS variables on the document root. The interface stack overrides
 * `--dsw-font-family` (the token every component inherits). Output-only
 * variables are consumed by this plugin's own style tag, so the feature is
 * fully external and does not require a Web core stylesheet change. Code
 * tokens keep the monospace stack, so code blocks are never re-themed.
 * Node-side client-tree boots without a document skip DOM application.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  OUTPUT_FONT_FIELD, OUTPUT_SIZE_FIELD, UI_FONT_FIELD,
  sanitizeFontFamily, sanitizeOutputSize, type FontSettings,
} from '../font-settings.ts'

/** CSS variable carrying the interface font stack. */
export const UI_FONT_CSS_VAR = '--dsw-font-family'

/** CSS variable carrying the assistant-output font stack. */
export const OUTPUT_FONT_CSS_VAR = '--dsh-font-output'

/** CSS variable carrying the assistant-output base size. */
export const OUTPUT_SIZE_CSS_VAR = '--dsh-font-output-size'

/** Marker used to scope the output-font overrides to an active plugin. */
const OUTPUT_MARKER = 'dshFont'

/**
 * Markdown text tokens owned by ui-theme. Keeping this override in the
 * external plugin means disabling dsh-font immediately restores the design
 * stylesheet without leaving a dependency in the Web bundle.
 */
const OUTPUT_STYLE_TEXT = `
body[data-dsh-font="on"] {
  --dsw-font-markdown-h1: 700 var(${OUTPUT_SIZE_CSS_VAR}, 24px)/34px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-h1-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-h2: 700 var(${OUTPUT_SIZE_CSS_VAR}, 22px)/32px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-h2-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-h3: 700 var(${OUTPUT_SIZE_CSS_VAR}, 20px)/30px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-h3-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-h4: 600 var(${OUTPUT_SIZE_CSS_VAR}, 16px)/28px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-h4-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-base: var(${OUTPUT_SIZE_CSS_VAR}, 16px)/28px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-base-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-base-strong: 600 var(${OUTPUT_SIZE_CSS_VAR}, 16px)/28px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-base-strong-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-base-italic: italic var(${OUTPUT_SIZE_CSS_VAR}, 16px)/28px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-base-italic-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-base-strong-italic: italic 600 var(${OUTPUT_SIZE_CSS_VAR}, 16px)/28px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-base-strong-italic-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-table: var(${OUTPUT_SIZE_CSS_VAR}, 15px)/25px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-table-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-table-head: 500 var(${OUTPUT_SIZE_CSS_VAR}, 15px)/25px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-table-head-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-small: var(${OUTPUT_SIZE_CSS_VAR}, 14px)/24px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-small-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-small-strong: 600 var(${OUTPUT_SIZE_CSS_VAR}, 14px)/24px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-small-strong-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-small-italic: italic var(${OUTPUT_SIZE_CSS_VAR}, 14px)/24px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-small-italic-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-small-strong-italic: italic 600 var(${OUTPUT_SIZE_CSS_VAR}, 14px)/24px var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
  --dsw-font-markdown-small-strong-italic-font-family: var(${OUTPUT_FONT_CSS_VAR}, var(--dsw-font-family));
}
`

/** One persisted font field addressable by the runtime's write face. */
export type FontField = 'uiFont' | 'outputFont' | 'outputSize'

declare module '@deepseek-ai/cordis' {
  interface Context {
    font: FontRuntime
  }
}

/**
 * Reactive font owner. Reads go through the settings scope snapshot; writes
 * only through the scope's `set`; continuous sync only through its
 * subscription. The applied CSS always resolves to the design default when a
 * field is empty or fails sanitization.
 */
export class FontRuntime {
  private readonly host: SettingsScope<FontSettings>
  private readonly root: HTMLElement | undefined
  private readonly style: HTMLStyleElement | undefined

  /**
   * @param ctx - owning context (the scope listener is released through
   * ctx.effect on dispose).
   * @param host - durable font scope owned by the same plugin.
   */
  constructor(ctx: Context, host: SettingsScope<FontSettings>) {
    this.host = host
    // Non-browser runs (node e2e booting the client tree) have no document.
    this.root = typeof document === 'undefined' ? undefined : document.documentElement
    if (typeof document === 'undefined') {
      this.style = undefined
    } else {
      const style = document.createElement('style')
      style.dataset.dshFontStyle = 'true'
      style.textContent = OUTPUT_STYLE_TEXT
      ;(document.head ?? document.documentElement).appendChild(style)
      this.style = style
    }
    this.apply(this.host.getSnapshot().value)
    ctx.effect(() => {
      const dispose = host.subscribe(() => { this.apply(this.host.getSnapshot().value) })
      return () => {
        dispose()
        this.cleanup()
      }
    }, 'dsh-font: css variable adoption')
  }

  /**
   * Read the current durable section.
   * @returns the last accepted section, or undefined before the first acceptance.
   */
  getSection(): FontSettings | undefined {
    return this.host.getSnapshot().value
  }

  /**
   * Route one user choice into the durable scope.
   * @param field - one of the persisted font fields.
   * @param value - JSON-shaped value selected by the user.
   * @returns the scope write settlement.
   */
  set(field: FontField, value: unknown): Promise<void> {
    return this.host.set(field, value)
  }

  /** Clear every font override so the design defaults apply again. */
  reset(): Promise<void> {
    return Promise.all([
      this.host.unset(UI_FONT_FIELD),
      this.host.unset(OUTPUT_FONT_FIELD),
      this.host.unset(OUTPUT_SIZE_FIELD),
    ]).then(() => undefined)
  }

  /**
   * Apply one accepted section to the document root's CSS variables. Each
   * write sets the variable or removes it so the stylesheet default wins;
   * removed variables never leak a stale override after a reset.
   * @param section - the accepted section, or undefined while loading.
   */
  private apply(section: FontSettings | undefined): void {
    const root = this.root
    if (root === undefined) return
    const ui = sanitizeFontFamily(section?.[UI_FONT_FIELD])
    const output = sanitizeFontFamily(section?.[OUTPUT_FONT_FIELD])
    const size = sanitizeOutputSize(section?.[OUTPUT_SIZE_FIELD])
    if (ui === '') root.style.removeProperty(UI_FONT_CSS_VAR)
    else root.style.setProperty(UI_FONT_CSS_VAR, ui)
    if (output === '') root.style.removeProperty(OUTPUT_FONT_CSS_VAR)
    else root.style.setProperty(OUTPUT_FONT_CSS_VAR, `${output}, var(${UI_FONT_CSS_VAR})`)
    if (size === 0) root.style.removeProperty(OUTPUT_SIZE_CSS_VAR)
    else root.style.setProperty(OUTPUT_SIZE_CSS_VAR, `${size}px`)
    if (document.body !== null) {
      document.body.dataset[OUTPUT_MARKER] = output !== '' || size !== 0 ? 'on' : 'off'
    }
  }

  /** Remove all DOM state owned by this external plugin. */
  private cleanup(): void {
    const root = this.root
    if (root !== undefined) {
      root.style.removeProperty(UI_FONT_CSS_VAR)
      root.style.removeProperty(OUTPUT_FONT_CSS_VAR)
      root.style.removeProperty(OUTPUT_SIZE_CSS_VAR)
    }
    if (typeof document !== 'undefined') document.body?.removeAttribute('data-dsh-font')
    this.style?.remove()
  }
}
