import { fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isTypingTarget, useHotkeys, type Hotkey } from '@/hooks/useHotkeys'

/** Presses a combination on the document, away from any field. */
function press(key: string, init: KeyboardEventInit = {}) {
  return fireEvent.keyDown(document, { key, ...init })
}

const mounted: HTMLElement[] = []

/** Mounts an element in the document so events dispatched on it bubble. */
function mount<E extends HTMLElement>(element: E): E {
  document.body.append(element)
  mounted.push(element)
  return element
}

afterEach(() => {
  for (const element of mounted.splice(0)) element.remove()
})

const hotkey = (over: Partial<Hotkey> & Pick<Hotkey, 'onTrigger'>): Hotkey => ({
  key: 'k',
  ...over,
})

describe('isTypingTarget', () => {
  it('is false for a non-element target', () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(document)).toBe(false)
  })

  it('is false for ordinary elements', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
  })

  it('is true for text fields', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(document.createElement('select'))).toBe(true)
  })

  it('is true for text-like input types', () => {
    for (const type of ['text', 'search', 'email', 'number', 'password', 'url']) {
      const input = document.createElement('input')
      input.type = type
      expect(isTypingTarget(input)).toBe(true)
    }
  })

  it('is false for inputs that hold no text', () => {
    for (const type of ['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file']) {
      const input = document.createElement('input')
      input.type = type
      expect(isTypingTarget(input)).toBe(false)
    }
  })

  it('is true inside a contenteditable region', () => {
    const editor = mount(document.createElement('div'))
    editor.setAttribute('contenteditable', 'true')
    const child = editor.appendChild(document.createElement('span'))

    expect(isTypingTarget(editor)).toBe(true)
    expect(isTypingTarget(child)).toBe(true)
  })

  it('is false for a region explicitly marked not editable', () => {
    const element = document.createElement('div')
    element.setAttribute('contenteditable', 'false')

    expect(isTypingTarget(element)).toBe(false)
  })
})

describe('useHotkeys', () => {
  it('fires a bare key', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ key: 'n', onTrigger })]))

    press('n')

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('matches the key case-insensitively', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ key: 'N', onTrigger })]))

    press('n')

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('requires the mod modifier when the hotkey asks for it', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ mod: true, onTrigger })]))

    press('k')
    expect(onTrigger).not.toHaveBeenCalled()

    press('k', { ctrlKey: true })
    press('k', { metaKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(2)
  })

  it('refuses a mod press for a hotkey that does not want one', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ onTrigger })]))

    press('k', { ctrlKey: true })

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('treats Shift as part of the combination in both directions', () => {
    const plain = vi.fn()
    const shifted = vi.fn()
    renderHook(() =>
      useHotkeys([hotkey({ mod: true, onTrigger: plain }), hotkey({ mod: true, shift: true, onTrigger: shifted })]),
    )

    press('k', { ctrlKey: true })
    expect(plain).toHaveBeenCalledTimes(1)
    expect(shifted).not.toHaveBeenCalled()

    press('k', { ctrlKey: true, shiftKey: true })
    expect(plain).toHaveBeenCalledTimes(1)
    expect(shifted).toHaveBeenCalledTimes(1)
  })

  it('never fires for an Alt combination', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ mod: true, onTrigger })]))

    press('k', { ctrlKey: true, altKey: true })

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('stops at the first matching binding', () => {
    const first = vi.fn()
    const second = vi.fn()
    renderHook(() => useHotkeys([hotkey({ onTrigger: first }), hotkey({ onTrigger: second })]))

    press('k')

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('ignores an event another handler already claimed', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ onTrigger })]))

    const event = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true })
    event.preventDefault()
    document.dispatchEvent(event)

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('prevents the default action, unless the hotkey opts out', () => {
    renderHook(() =>
      useHotkeys([
        hotkey({ key: 'a', mod: true, onTrigger: vi.fn() }),
        hotkey({ key: 'p', mod: true, preventDefault: false, onTrigger: vi.fn() }),
      ]),
    )

    expect(press('a', { ctrlKey: true })).toBe(false)
    expect(press('p', { ctrlKey: true })).toBe(true)
  })

  it('stays quiet while the member is typing in a field', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ key: 'n', onTrigger })]))
    const input = mount(document.createElement('input'))

    fireEvent.keyDown(input, { key: 'n' })

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('still fires from a field when the hotkey opts in', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ mod: true, allowWhileTyping: true, onTrigger })]))
    const input = mount(document.createElement('input'))

    fireEvent.keyDown(input, { key: 'k', ctrlKey: true })

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('stays quiet inside a contenteditable region', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ key: 'n', onTrigger })]))
    const editor = mount(document.createElement('div'))
    editor.setAttribute('contenteditable', 'true')

    fireEvent.keyDown(editor, { key: 'n' })

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('fires from a checkbox, which swallows no typing', () => {
    const onTrigger = vi.fn()
    renderHook(() => useHotkeys([hotkey({ key: 'n', onTrigger })]))
    const box = mount(document.createElement('input'))
    box.type = 'checkbox'

    fireEvent.keyDown(box, { key: 'n' })

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('binds nothing while disabled, and binds once enabled', () => {
    const onTrigger = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useHotkeys([hotkey({ onTrigger })], { enabled }),
      { initialProps: { enabled: false } },
    )

    press('k')
    expect(onTrigger).not.toHaveBeenCalled()

    rerender({ enabled: true })
    press('k')
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('keeps one listener when the hotkey array is rebuilt every render', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const first = vi.fn()
    const second = vi.fn()

    const { rerender } = renderHook(
      ({ onTrigger }: { onTrigger: () => void }) => useHotkeys([{ key: 'k', onTrigger }]),
      { initialProps: { onTrigger: first } },
    )

    const bindings = () => add.mock.calls.filter(([type]) => type === 'keydown').length
    expect(bindings()).toBe(1)

    rerender({ onTrigger: second })

    expect(bindings()).toBe(1)

    // The listener is the same one, but it reads the newest handler.
    press('k')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('detaches on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const onTrigger = vi.fn()
    const { unmount } = renderHook(() => useHotkeys([hotkey({ onTrigger })]))

    unmount()
    press('k')

    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('detaches when it is disabled again', () => {
    const onTrigger = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useHotkeys([hotkey({ onTrigger })], { enabled }),
      { initialProps: { enabled: true } },
    )

    rerender({ enabled: false })
    press('k')

    expect(onTrigger).not.toHaveBeenCalled()
  })
})
