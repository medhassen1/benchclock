import { useEffect, useRef } from 'react'

/**
 * A key combination the application listens for while it has focus.
 *
 * `mod` is a single slot for Ctrl and Cmd: the same shortcut has to work on a
 * workshop terminal and on a member's laptop without two declarations.
 */
export interface Hotkey {
  /** Matched against `KeyboardEvent.key`, case-insensitively. */
  key: string
  /** Requires Ctrl (Windows/Linux) or Cmd (macOS). */
  mod?: boolean
  shift?: boolean
  /** Fires even while the caret sits in a text field. */
  allowWhileTyping?: boolean
  /** Defaults to true; set false to let the browser keep its own behaviour. */
  preventDefault?: boolean
  onTrigger: (event: KeyboardEvent) => void
}

export interface UseHotkeysOptions {
  /** Turns every binding off without unmounting the component. */
  enabled?: boolean
}

/** Fields that swallow ordinary typing, so a bare letter must not be a shortcut. */
const TYPING_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Inputs that hold no text. A checkbox or a range takes keys such as Space
 * and the arrows, but typing `n` into one means nothing, so shortcuts stay on.
 */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/**
 * True when the event target is somewhere the member is writing prose.
 *
 * jsdom does not implement `isContentEditable`, so the attribute and the
 * nearest editable ancestor are checked as well; without that fallback every
 * contenteditable test would report "not typing".
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  if (target.tagName === 'INPUT') {
    const type = (target as HTMLInputElement).type.toLowerCase()
    return !NON_TEXT_INPUT_TYPES.has(type)
  }

  if (TYPING_TAGS.has(target.tagName)) return true

  if ((target as HTMLElement).isContentEditable) return true

  return target.closest('[contenteditable="true"],[contenteditable=""]') !== null
}

/**
 * Exact modifier matching. A shortcut declared without Shift must not fire
 * when Shift is held, otherwise Ctrl+Shift+K would steal Ctrl+K. Alt is never
 * part of a benchclock shortcut, so an Alt combination belongs to someone else.
 */
function matches(event: KeyboardEvent, hotkey: Hotkey): boolean {
  if (event.key.toLowerCase() !== hotkey.key.toLowerCase()) return false

  const mod = event.ctrlKey || event.metaKey
  if (mod !== Boolean(hotkey.mod)) return false
  if (event.shiftKey !== Boolean(hotkey.shift)) return false
  return !event.altKey
}

/**
 * Binds a list of global shortcuts to the document for as long as the calling
 * component is mounted.
 *
 * The list is read through a ref, so a caller may build a fresh array on every
 * render — the usual shape, since handlers close over local state — without
 * the listener being detached and re-attached each time.
 */
export function useHotkeys(hotkeys: readonly Hotkey[], options: UseHotkeysOptions = {}): void {
  const { enabled = true } = options

  const hotkeysRef = useRef(hotkeys)
  hotkeysRef.current = hotkeys

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      // Something nearer the event already claimed it, such as a dialog.
      if (event.defaultPrevented) return

      const typing = isTypingTarget(event.target)

      for (const hotkey of hotkeysRef.current) {
        if (typing && !hotkey.allowWhileTyping) continue
        if (!matches(event, hotkey)) continue

        if (hotkey.preventDefault !== false) event.preventDefault()
        hotkey.onTrigger(event)
        // First match wins; two bindings on one combination would fight.
        return
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
