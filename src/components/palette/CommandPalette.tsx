import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useHotkeys } from '@/hooks/useHotkeys'
import { cx } from '@/lib/cx'

import { matchCommands, type Command } from './commands'
import styles from './CommandPalette.module.css'

export interface CommandPaletteProps {
  commands: readonly Command[]
  /** Accessible name for the search field and the list of results. */
  label?: string
  placeholder?: string
  /** Told whenever the palette opens or closes, so the shell can follow. */
  onOpenChange?: (open: boolean) => void
}

/**
 * Ctrl/Cmd+K search over everything the app can do.
 *
 * The field is an ARIA combobox: focus stays in the input while the arrow
 * keys move `aria-activedescendant` down a listbox, which is what lets a
 * screen reader announce the highlighted command without the caret leaving
 * the query the member is still typing.
 */
export function CommandPalette({
  commands,
  label = 'Run a command',
  placeholder = 'Search commands…',
  onOpenChange,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const baseId = useId()
  const inputId = `${baseId}-input`
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const results = useMemo(() => matchCommands(commands, query), [commands, query])

  // Derived and clamped during render rather than stored: a query that
  // shrinks the list can never leave the highlight pointing at a command that
  // is no longer there.
  const activeIndex = results.length === 0 ? -1 : Math.min(highlight, results.length - 1)

  const setOpenState = useCallback(
    (next: boolean) => {
      setOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  const close = useCallback(() => setOpenState(false), [setOpenState])

  // Every opening starts from a clean query, so yesterday's search is not in
  // the way of today's.
  const openPalette = useCallback(() => {
    setQuery('')
    setHighlight(0)
    setOpenState(true)
  }, [setOpenState])

  useHotkeys([
    {
      key: 'k',
      mod: true,
      // The palette's own field is a text input, so the shortcut has to work
      // while typing or it could not close what it opened.
      allowWhileTyping: true,
      onTrigger: () => (open ? close() : openPalette()),
    },
  ])

  // Move focus into the field on open and hand it back on close, so the
  // member returns to whatever they were doing.
  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    inputRef.current?.focus()

    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // Keeps the highlighted command in view while the arrows run down a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return

    listRef.current
      ?.querySelector<HTMLLIElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const move = (step: number) => {
    if (results.length === 0) return
    // Wraps around, so Up from the first command lands on the last.
    setHighlight((activeIndex + step + results.length) % results.length)
  }

  const run = (command: Command) => {
    if (command.disabled) return

    close()
    command.run()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Home':
        event.preventDefault()
        setHighlight(0)
        break
      case 'End':
        event.preventDefault()
        setHighlight(Math.max(0, results.length - 1))
        break
      case 'Enter': {
        event.preventDefault()
        const command = results[activeIndex]
        if (command) run(command)
        break
      }
      case 'Escape':
        event.preventDefault()
        // Nothing behind the palette should act on the same Escape.
        event.stopPropagation()
        close()
        break
      default:
        break
    }
  }

  if (!open) return null

  return createPortal(
    <div className={styles.overlay} onMouseDown={close}>
      <div className={styles.panel} onMouseDown={(event) => event.stopPropagation()}>
        <label htmlFor={inputId} className="visually-hidden">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          className={styles.input}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            // A new query re-ranks everything, so start from the best match.
            setHighlight(0)
          }}
          onKeyDown={onKeyDown}
        />

        <ul ref={listRef} id={listId} role="listbox" aria-label={label} className={styles.list}>
          {results.map((command, index) => (
            <li
              key={command.id}
              id={optionId(index)}
              role="option"
              data-index={index}
              aria-selected={index === activeIndex}
              aria-disabled={command.disabled || undefined}
              className={cx(
                styles.option,
                index === activeIndex && styles.active,
                command.disabled && styles.disabled,
              )}
              // Keeps focus, and the caret, in the field while clicking.
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setHighlight(index)}
              onClick={() => run(command)}
            >
              <span className={styles.optionLabel}>{command.label}</span>
              {command.hint ? <span className={styles.hint}>{command.hint}</span> : null}
            </li>
          ))}
        </ul>

        {results.length === 0 ? (
          <p role="status" className={styles.empty}>
            No command matches that.
          </p>
        ) : null}

        <p className={styles.footer}>
          <span>Arrow keys to move</span>
          <span>Enter to run</span>
          <span>Esc to close</span>
        </p>
      </div>
    </div>,
    document.body,
  )
}
