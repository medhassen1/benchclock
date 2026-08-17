# Benchclock

Benchclock is a booking board for a shared workshop. Members reserve machine time on a weekly grid,
and the board enforces the rules a workshop actually runs on: equipment sign-offs, clashes, cool-down
gaps between bookings, opening hours, per-machine session limits, and weekly hour allowances.

Everything runs in the browser. There is no backend, no account, and no network call — the roster and
machine list ship with the app, and bookings are kept in `localStorage`.

## Requirements

- Node.js 20 (see [`.nvmrc`](.nvmrc))
- npm

## Getting started

```bash
npm ci
npm run dev
```

The dev server prints a local URL, normally <http://localhost:5173>.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with fast refresh |
| `npm run build` | Type-check the project references and produce a production bundle in `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint over the whole repository |
| `npm run typecheck` | Type-check without emitting |

## The rules

A booking is refused for any of these reasons, reported together so a member sees every problem at
once rather than one per attempt:

| Code | Meaning |
| --- | --- |
| `out-of-service` | The machine is marked out of service |
| `missing-ticket` | The member lacks the sign-off the machine requires |
| `zero-length` | Start and end are not on the half hour, or the end is not after the start |
| `outside-opening-hours` | The workshop is shut, or the slot runs past closing |
| `too-long` | Longer than the machine's per-session limit |
| `overlaps-booking` | Another booking already holds part of that slot |
| `ignores-cooldown` | Too close to a neighbouring booking on a machine that needs cooling |
| `allowance-exceeded` | Would take the member past their weekly hours |

Touching intervals do not clash: a booking ending at 18:00 and one starting at 18:00 are both fine,
unless the machine has a cool-down.

## Architecture

```
src/
  data/         Machines, members, and opening hours
  types/        Domain types shared across the app
  lib/          weektime.ts  integer week-minute arithmetic
                rules.ts     the rules engine, pure and framework-free
                api.ts       cancellable async facade that re-checks the rules
                storage.ts   validated localStorage helpers
  hooks/        usePersistentState
  state/        BoardProvider (bookings, optimistic writes), SessionProvider
  components/   ui/ primitives, then board/, bookings/, usage/, layout/
  test/         Shared provider harness for component tests
```

A few conventions worth knowing before changing things:

- **Time is an integer.** Everything is minutes from Monday 00:00. No `Date`, no timezone, no
  daylight-saving edge cases, and every calculation is exactly testable.
- **The rules live in one pure module.** `findRejections` takes a draft and a context and returns
  reasons. The dialog calls it during render to preview a refusal, and `api.ts` calls it again on
  write, so the UI cannot save something its own checks would have blocked.
- **Writes are optimistic.** A new booking appears immediately with a temporary id and is rolled
  back if the write is refused, so the grid never jumps while a request is in flight.
- **Persistence is defensive.** Anything read back from `localStorage` is validated, and a value
  written by an older build degrades to the default instead of breaking the board.
- **Accessibility is part of "done".** The grid is one tab stop with roving focus and arrow-key
  navigation, dialogs trap focus and restore it, every cell has a full accessible name, and every
  status that uses colour also states its meaning in text or a shape.

## Testing

The suite runs on Vitest with Testing Library and jsdom. It covers the pure modules directly and the
pages through user-facing interaction — no snapshots and no assertions on class names.

```bash
npm test
```
