import { describe, expect, it } from 'vitest'
import { sanitizeFontFamily, sanitizeOutputSize } from '../src/font-settings.ts'

describe('font settings wire sanitizers', () => {
  it('keeps ordinary CSS family lists while trimming the input', () => {
    expect(sanitizeFontFamily("  'Microsoft YaHei', sans-serif  ")).toBe("'Microsoft YaHei', sans-serif")
    expect(sanitizeFontFamily('思源黑体, sans-serif')).toBe('思源黑体, sans-serif')
  })

  it('drops values that could escape the family-list field', () => {
    expect(sanitizeFontFamily('url(https://example.test/font.woff2)')).toBe('')
    expect(sanitizeFontFamily('Inter; color: red')).toBe('')
    expect(sanitizeFontFamily('x'.repeat(201))).toBe('')
  })

  it('accepts the default sentinel and rounds supported output sizes', () => {
    expect(sanitizeOutputSize(0)).toBe(0)
    expect(sanitizeOutputSize(16.6)).toBe(17)
    expect(sanitizeOutputSize(8)).toBe(8)
    expect(sanitizeOutputSize(40)).toBe(40)
  })

  it('falls back to the design default outside the safe size range', () => {
    expect(sanitizeOutputSize(7)).toBe(0)
    expect(sanitizeOutputSize(41)).toBe(0)
    expect(sanitizeOutputSize(Number.NaN)).toBe(0)
    expect(sanitizeOutputSize(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
