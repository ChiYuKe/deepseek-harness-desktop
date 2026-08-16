import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { GoUsageData, GoUsageResult, GoUsageWindow } from './types.ts'

const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'
const CACHE_TTL_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10_000
const FALLBACK_REFS = ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY'] as const

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function percentOf(value: UnknownRecord): number | undefined {
  const direct = numberOf(value.percent) ?? numberOf(value.usagePercent)
  if (direct !== undefined) return clampPercent(direct)

  const usage = numberOf(value.usageDollars)
  const limit = numberOf(value.limitDollars)
  if (usage !== undefined && limit !== undefined && limit > 0) {
    return clampPercent((usage / limit) * 100)
  }
  return undefined
}

function resetAtOf(value: UnknownRecord): string | null {
  const explicit = textOf(value.resetsAt) ?? textOf(value.resetAt)
  if (explicit !== undefined) {
    const date = new Date(explicit)
    return Number.isNaN(date.valueOf()) ? null : date.toISOString()
  }

  const seconds = numberOf(value.resetInSec) ?? numberOf(value.resetsInSeconds) ?? numberOf(value.resetInSeconds)
  if (seconds === undefined || seconds < 0) return null
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function windowOf(value: unknown, fallbackLimit: number): GoUsageWindow | undefined {
  if (!isRecord(value)) return undefined
  const percent = percentOf(value)
  if (percent === undefined) return undefined
  const usedDollars = numberOf(value.usageDollars)
  const limitDollars = numberOf(value.limitDollars) ?? fallbackLimit
  return {
    percent,
    resetAt: resetAtOf(value),
    ...(usedDollars === undefined ? {} : { usedDollars }),
    ...(limitDollars === undefined ? {} : { limitDollars }),
  }
}

/** Parse the official response and tolerate the first endpoint's field aliases. */
export function parseUsagePayload(payload: unknown): GoUsageData {
  if (!isRecord(payload)) throw new Error('invalid usage response')
  const usage = isRecord(payload.usage) ? payload.usage : payload
  const rolling = windowOf(usage.rolling ?? usage.rolling5h, 12)
  const weekly = windowOf(usage.weekly, 30)
  const monthly = windowOf(usage.monthly, 60)
  if (rolling === undefined || weekly === undefined || monthly === undefined) {
    throw new Error('usage response is missing one or more usage windows')
  }

  const useBalance = typeof payload.useBalance === 'boolean'
    ? payload.useBalance
    : typeof usage.useBalance === 'boolean' ? usage.useBalance : null
  return {
    rolling,
    weekly,
    monthly,
    useBalance,
    fetchedAt: new Date().toISOString(),
  }
}

function routeLooksLikeOpenCodeGo(route: string, profile: UnknownRecord): boolean {
  const signature = [route, textOf(profile.displayName), textOf(profile.baseURL)]
    .filter((value): value is string => value !== undefined)
    .join(' ')
    .toLocaleLowerCase()
  return signature.includes('opencode') && signature.includes('go')
    || signature.includes('opencode.ai/zen/go')
}

function apiKeyRefFromSettings(settings: unknown): string | undefined {
  if (!isRecord(settings) || !isRecord(settings.providers)) return undefined
  for (const [route, rawProfile] of Object.entries(settings.providers)) {
    if (!isRecord(rawProfile) || !routeLooksLikeOpenCodeGo(route, rawProfile)) continue
    const ref = textOf(rawProfile.apiKeyEnv)
    if (ref !== undefined) return ref
  }
  return undefined
}

/** Host gateway for the official OpenCode Go subscription usage endpoint. */
export class OpencodeGoUsageGateway extends TypertRemoteService {
  static inject = ['settings', 'credentials']

  private cached: GoUsageData | undefined
  private cachedAt = 0
  private inFlight: Promise<GoUsageResult> | undefined

  constructor(ctx: Context) {
    super(ctx, 'opencodeGoUsage')
  }

  @Remote('get')
  async get(): Promise<GoUsageResult> {
    return this.load(false)
  }

  @Remote('refresh')
  async refresh(): Promise<GoUsageResult> {
    return this.load(true)
  }

  private async load(force: boolean): Promise<GoUsageResult> {
    if (!force && this.cached !== undefined && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return { status: 'ready', data: this.cached }
    }
    if (this.inFlight !== undefined) return this.inFlight

    this.inFlight = this.fetchUsage().finally(() => { this.inFlight = undefined })
    return this.inFlight
  }

  private async fetchUsage(): Promise<GoUsageResult> {
    const ref = apiKeyRefFromSettings(this.ctx.settings.get('llm-pi-ai'))
    const refs = ref === undefined ? FALLBACK_REFS : [ref, ...FALLBACK_REFS.filter(item => item !== ref)]
    let apiKey: string | undefined
    for (const candidate of refs) {
      try {
        const resolved = await this.ctx.credentials.resolve(credentialRef(candidate) as CredentialRef)
        if (resolved?.value !== undefined && resolved.value.trim().length > 0) {
          apiKey = resolved.value.trim()
          break
        }
      } catch (error) {
        this.ctx.logger.warn('dsh-opencode-go-usage: invalid credential reference')
        this.ctx.logger.warn(error)
      }
    }
    if (apiKey === undefined) return { status: 'not-configured', ...this.staleData() }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(USAGE_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        return { status: 'unauthorized', ...this.staleData() }
      }
      if (!response.ok) return { status: 'unavailable', ...this.staleData() }

      const data = parseUsagePayload(await response.json())
      this.cached = data
      this.cachedAt = Date.now()
      return { status: 'ready', data }
    } catch (error) {
      this.ctx.logger.warn('dsh-opencode-go-usage: usage request failed')
      this.ctx.logger.warn(error)
      return { status: 'error', ...this.staleData() }
    } finally {
      clearTimeout(timeout)
    }
  }

  private staleData(): { data?: GoUsageData; stale?: boolean } {
    return this.cached === undefined ? {} : { data: this.cached, stale: true }
  }
}

export const name = 'dsh-opencode-go-usage'
export default OpencodeGoUsageGateway
