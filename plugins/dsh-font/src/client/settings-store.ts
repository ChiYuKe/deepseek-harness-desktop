/**
 * Font row slot store: a mirror of the settings-scope snapshot. The plugin's
 * apply-world scope listener is the only writer; the row component reads via
 * props.useStore. The row now uses curated choices, while valid legacy custom
 * values remain visible during the transition instead of being discarded.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { FontSettings } from '../font-settings.ts'

/** Store state mirrored from the scope snapshot. */
export interface FontRowState extends FontSettings {
  /** Scope revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type FontRowActions = {
  sync: (draft: FontRowState, settings: FontSettings, revision: number) => void
}

/**
 * Declares the Font row state and write surface.
 * @returns the store handle.
 */
export function createFontRowStore(): EngineStoreHandle<FontRowState, FontRowActions> {
  return defineStore({
    init: (): FontRowState => ({ uiFont: '', outputFont: '', outputSize: 0, revision: -1 }),
    actions: {
      sync: (d, settings: FontSettings, revision: number) => {
        if (revision <= d.revision) return
        d.uiFont = settings.uiFont
        d.outputFont = settings.outputFont
        d.outputSize = settings.outputSize
        d.revision = revision
      },
    },
  })
}
