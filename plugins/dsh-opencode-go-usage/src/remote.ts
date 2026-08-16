import type { GoUsageResult } from './types.ts'

interface Schema<T = unknown> { parse(value: unknown): T }

function schema<T>(parse: (value: unknown) => T): Schema<T> {
  return { parse }
}

const usageResult = schema<GoUsageResult>((value) => {
  if (typeof value !== 'object' || value === null || typeof (value as { status?: unknown }).status !== 'string') {
    throw new TypeError('expected OpenCode Go usage result')
  }
  return value as GoUsageResult
})

const TYPERT_REMOTE = {
  package: 'dsh-opencode-go-usage',
  descriptors: [
    {
      id: 'dsh-opencode-go-usage#opencodeGoUsage/get',
      service: 'opencodeGoUsage',
      namespace: 'opencodeGoUsage',
      method: 'get',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-opencode-go-usage#GoUsageResult',
        schema: usageResult,
      },
    },
    {
      id: 'dsh-opencode-go-usage#opencodeGoUsage/refresh',
      service: 'opencodeGoUsage',
      namespace: 'opencodeGoUsage',
      method: 'refresh',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-opencode-go-usage#GoUsageResult',
        schema: usageResult,
      },
    },
  ],
}

export default TYPERT_REMOTE
