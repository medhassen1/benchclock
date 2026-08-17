import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Debounced input plus simulated latency can outlast the 1s default when the
// suite runs in parallel on a loaded machine.
configure({ asyncUtilTimeout: 5_000 })

// jsdom has no layout engine, so scrolling is a no-op rather than an error.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})
