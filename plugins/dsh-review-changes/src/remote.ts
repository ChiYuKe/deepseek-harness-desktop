import type { ReviewDiff, ReviewSnapshot } from './types.ts'

interface Schema<T = unknown> { parse(value: unknown): T }

function schema<T>(parse: (value: unknown) => T): Schema<T> {
  return { parse }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const reviewSnapshot = schema<ReviewSnapshot>((value) => {
  if (!isRecord(value) || typeof value.root !== 'string' || !Array.isArray(value.files)) {
    throw new TypeError('expected review snapshot')
  }
  return value as unknown as ReviewSnapshot
})

const reviewDiff = schema<ReviewDiff>((value) => {
  if (!isRecord(value) || typeof value.path !== 'string' || typeof value.diff !== 'string') {
    throw new TypeError('expected review diff')
  }
  return value as unknown as ReviewDiff
})

const stringSchema = schema<string>((value) => {
  if (typeof value !== 'string') throw new TypeError('expected string')
  return value
})

const TYPERT_REMOTE = {
  package: 'dsh-review-changes',
  descriptors: [
    {
      id: 'dsh-review-changes#reviewChanges/list',
      service: 'reviewChanges',
      namespace: 'reviewChanges',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-review-changes#SessionId', schema: stringSchema } }],
      result: { mode: 'strict', typeSymbol: 'dsh-review-changes#ReviewSnapshot', schema: reviewSnapshot },
    },
    {
      id: 'dsh-review-changes#reviewChanges/diff',
      service: 'reviewChanges',
      namespace: 'reviewChanges',
      method: 'diff',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-review-changes#SessionId', schema: stringSchema } },
        { name: 'path', wire: 'path', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-review-changes#ReviewPath', schema: stringSchema } },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-review-changes#ReviewDiff', schema: reviewDiff },
    },
    {
      id: 'dsh-review-changes#reviewChanges/discard',
      service: 'reviewChanges',
      namespace: 'reviewChanges',
      method: 'discard',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-review-changes#SessionId', schema: stringSchema } },
        { name: 'path', wire: 'path', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-review-changes#ReviewPath', schema: stringSchema } },
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-review-changes#ReviewSnapshot', schema: reviewSnapshot },
    },
  ],
}

export default TYPERT_REMOTE
