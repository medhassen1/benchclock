import { useCallback, useEffect, useRef, useState } from 'react'

import { readValidated, writeJson } from '@/lib/storage'

type SetState<T> = (next: T | ((current: T) => T)) => void

/**
 * `useState` backed by `localStorage`. The stored value is read once during
 * the initial render and validated by `parse`, so a value written by an older
 * build degrades to `initialValue` instead of corrupting the board.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  parse: (raw: unknown) => T | null,
): [T, SetState<T>] {
  const parseRef = useRef(parse)
  useEffect(() => {
    parseRef.current = parse
  }, [parse])

  const [value, setValue] = useState<T>(() => readValidated(key, parseRef.current, initialValue))

  // Writes follow the value changing, not the setter being called, so a
  // functional update from any caller is persisted too.
  useEffect(() => {
    writeJson(key, value)
  }, [key, value])

  const update = useCallback<SetState<T>>((next) => {
    setValue((current) => (typeof next === 'function' ? (next as (c: T) => T)(current) : next))
  }, [])

  return [value, update]
}
