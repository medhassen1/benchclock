import { describe, expect, it, vi } from 'vitest'

import { readJson, readValidated, writeJson } from '@/lib/storage'

describe('readJson', () => {
  it('returns the fallback for a missing key', () => {
    expect(readJson('missing', { a: 1 })).toEqual({ a: 1 })
  })

  it('round-trips a written value', () => {
    writeJson('demo', { a: 1, b: ['x'] })

    expect(readJson('demo', null)).toEqual({ a: 1, b: ['x'] })
  })

  it('returns the fallback when the stored value is not valid JSON', () => {
    window.localStorage.setItem('broken', '{not json')

    expect(readJson('broken', 'fallback')).toBe('fallback')
  })

  it('returns the fallback when storage itself throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(readJson('demo', 'fallback')).toBe('fallback')
  })
})

describe('writeJson', () => {
  it('reports success', () => {
    expect(writeJson('demo', 1)).toBe(true)
  })

  it('reports failure instead of throwing when the quota is exceeded', () => {
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'demo') throw new Error('QuotaExceededError')
      original.call(this, key, value)
    })

    expect(writeJson('demo', 'value')).toBe(false)
  })
})

describe('readValidated', () => {
  const parseIds = (raw: unknown): string[] | null =>
    Array.isArray(raw) && raw.every((entry) => typeof entry === 'string') ? (raw as string[]) : null

  it('accepts a value the parser recognises', () => {
    writeJson('ids', ['a', 'b'])

    expect(readValidated('ids', parseIds, [])).toEqual(['a', 'b'])
  })

  it('falls back when the persisted shape has drifted', () => {
    writeJson('ids', [1, 2, 3])

    expect(readValidated('ids', parseIds, [])).toEqual([])
  })

  it('falls back when nothing is stored', () => {
    expect(readValidated('ids', parseIds, ['default'])).toEqual(['default'])
  })
})
