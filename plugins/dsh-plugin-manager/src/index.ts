import { createRequire } from 'node:module'
import { existsSync, realpathSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'

const MANAGER_PACKAGE = 'dsh-plugin-manager'
const SETTINGS_NAMESPACE = settingsNamespace('dsh-plugin-manager')
const MANAGER_SETTINGS = z.object({
  disabled: z.array(z.string()).default([]),
})

type PluginSource = 'local' | 'downloaded' | 'builtin'

interface PluginManagerEntry {
  readonly entryId: string
  readonly moduleName: string
  readonly enabled: boolean
  readonly fiberPhase: 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null
  readonly source: PluginSource
  readonly canToggle: boolean
}

export interface PluginManagerSnapshot {
  readonly entries: readonly PluginManagerEntry[]
}

const FIBER_PHASE: Record<number, PluginManagerEntry['fiberPhase']> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
}

const requireFromManager = createRequire(import.meta.url)
const managerRoot = realpathSync(dirname(fileURLToPath(import.meta.url)))
const pluginsRoot = realpathSync(join(managerRoot, '..', '..'))
const projectPackages = normalize(join(managerRoot, '..', '..', 'packages')).toLocaleLowerCase()

/** Remote Host service for the standalone DSH plugin manager. */
export class PluginManagerGateway extends TypertRemoteService {
  static inject = ['loader', 'settings']

  private readonly settingsScope

  constructor(ctx: Context) {
    super(ctx, 'pluginManager')
    this.settingsScope = ctx.settings.register(SETTINGS_NAMESPACE, MANAGER_SETTINGS)
    ctx.effect(() => {
      const stop = this.settingsScope.watch(next => {
        void this.applyPersistedDisabled(next.disabled)
      })
      void this.applyPersistedDisabled(this.settingsScope.get().disabled)
      // The manager can mount before sibling entries have been created. Wait
      // for the loader to settle once so persisted states are also applied to
      // plugins that finish loading after this gateway is constructed.
      void this.ctx.loader.await().then(() => {
        void this.applyPersistedDisabled(this.settingsScope.get().disabled)
      }).catch(error => {
        this.ctx.logger.warn('dsh-plugin-manager: failed to apply persisted states after loader settle')
        this.ctx.logger.warn(error)
      })
      return stop
    }, 'dsh-plugin-manager: persisted disabled plugins')
  }

  /** Return the current plugin catalog with a best-effort package provenance. */
  @Remote('list')
  async list(): Promise<PluginManagerSnapshot> {
    // Re-apply persisted choices before every read. This covers entries that
    // were created after the manager's initial boot synchronization.
    await this.applyPersistedDisabled(this.settingsScope.get().disabled)
    return this.snapshot()
  }

  private snapshot(): PluginManagerSnapshot {
    const entries: PluginManagerEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      entries.push({
        entryId: entry.id,
        moduleName: entry.options.name,
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state] ?? null,
        source: this.sourceOf(entry.options.name, entry),
        canToggle: entry.options.name !== MANAGER_PACKAGE,
      })
    }
    return { entries }
  }

  /** Change one plugin's runtime state and persist the choice for the next boot. */
  @Remote('setEnabled')
  async setEnabled(entryId: string, enabled: boolean): Promise<PluginManagerSnapshot> {
    const entry = this.ctx.loader.resolve(entryId)
    if (entry.options.group) throw new Error('plugin groups cannot be toggled')
    if (entry.options.name === MANAGER_PACKAGE) throw new Error('插件管理器不能停用')

    await this.ctx.loader.update(entryId, { disabled: !enabled })

    const disabled = new Set(this.settingsScope.get().disabled)
    const persistedKeys = [entryId, entry.options.name, `include:${entry.options.name}`]
    if (enabled) {
      for (const key of persistedKeys) disabled.delete(key)
    } else {
      // Keep the current entry id as the primary key. The name and include
      // forms are accepted during restore for compatibility with older runs.
      disabled.add(entryId)
    }
    await this.settingsScope.replace({ disabled: [...disabled].sort() })
    return this.list()
  }

  private async applyPersistedDisabled(ids: readonly string[]): Promise<void> {
    const disabled = new Set(ids)
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group || entry.options.name === MANAGER_PACKAGE) continue
      const matchesPersistedKey = disabled.has(entry.id)
        || disabled.has(entry.options.name)
        || disabled.has(`include:${entry.options.name}`)
      if (!matchesPersistedKey || entry.disabled) continue
      try {
        await this.ctx.loader.update(entry.id, { disabled: true })
      } catch (error) {
        this.ctx.logger.warn('dsh-plugin-manager: failed to disable %s', entry.options.name)
        this.ctx.logger.warn(error)
      }
    }
  }

  private sourceOf(moduleName: string, entry: { parent: { tree: { ctx: Context } } }): PluginSource {
    const resolved = this.resolvePackage(moduleName, entry)
    const normalized = resolved === undefined ? '' : normalize(resolved).toLocaleLowerCase()
    const isUnderPlugins = normalized === pluginsRoot.toLocaleLowerCase()
      || normalized.startsWith(`${pluginsRoot.toLocaleLowerCase()}${sep}`)
    const isWorkspacePlugin = this.hasWorkspacePluginManifest(moduleName)

    if (isUnderPlugins || isWorkspacePlugin || moduleName === MANAGER_PACKAGE) return 'local'
    if (moduleName.startsWith('cordis:')) return 'builtin'
    if (normalized.startsWith(`${projectPackages}${sep}`) || moduleName.startsWith('@deepseek-ai/')) return 'builtin'
    return 'downloaded'
  }

  /**
   * The loader can resolve linked workspace plugins even when Node's resolver
   * cannot resolve them from the runtime base URL. Fall back to the repository
   * manifest so locally developed plugins are not mislabeled as downloaded.
   */
  private hasWorkspacePluginManifest(moduleName: string): boolean {
    const manifest = join(pluginsRoot, moduleName, 'package.json')
    if (!existsSync(manifest)) return false
    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown }
      return parsed.name === moduleName
    } catch {
      return false
    }
  }

  private resolvePackage(moduleName: string, entry: { parent: { tree: { ctx: Context } } }): string | undefined {
    if (moduleName.startsWith('cordis:')) return undefined
    const candidates = [
      entry.parent.tree.ctx.baseUrl,
      this.ctx.loader.ctx.baseUrl,
      process.cwd(),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)

    for (const base of candidates) {
      try {
        const resolved = requireFromManager.resolve(`${moduleName}/package.json`, { paths: [base] })
        return realpathSync(resolved)
      } catch {
        try {
          const resolved = requireFromManager.resolve(moduleName, { paths: [base] })
          return this.findPackageRoot(resolved)
        } catch {
          // The loader can resolve virtual/builtin entries that Node cannot.
        }
      }
    }
    return undefined
  }

  private findPackageRoot(resolved: string): string | undefined {
    let current = dirname(resolved)
    while (isAbsolute(current) && current.length > 2) {
      const manifest = join(current, 'package.json')
      if (existsSync(manifest)) {
        try {
          const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown }
          if (typeof parsed.name === 'string') return realpathSync(current)
        } catch {
          return undefined
        }
      }
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return undefined
  }
}

export default PluginManagerGateway
