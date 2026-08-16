export type GoUsageStatus = 'ready' | 'not-configured' | 'unauthorized' | 'unavailable' | 'error'

export interface GoUsageWindow {
  readonly percent: number
  readonly resetAt: string | null
  readonly usedDollars?: number
  readonly limitDollars?: number
}

export interface GoUsageData {
  readonly rolling: GoUsageWindow
  readonly weekly: GoUsageWindow
  readonly monthly: GoUsageWindow
  readonly useBalance: boolean | null
  readonly fetchedAt: string
}

export interface GoUsageResult {
  readonly status: GoUsageStatus
  readonly data?: GoUsageData
  readonly stale?: boolean
}
