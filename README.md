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

## What's in it

| Area | Pages |
| --- | --- |
| Booking | Board (week grid), My bookings, Repeats (recurring series), Waiting for (waitlist) |
| Workshop | Inductions, Maintenance, Stock |
| Insight | Usage, Reports, Activity (audit trail) |
| Manage | Import & export (CSV), Admin, Settings |

Beyond placing a booking, the board handles the things a real workshop runs into:

- **Repeating bookings** — a series is stored once and expanded a week at a time, so clashes,
  cool-down and the weekly allowance are judged per week. Refused weeks can be skipped or the
  whole series abandoned.
- **Waitlists** — join a queue for a taken slot. When the holder cancels, the slot passes to the
  first person still eligible; anyone who no longer qualifies is skipped rather than handed a
  booking that would be refused.
- **Maintenance** — servicing windows block bookings, and machines are flagged overdue against a
  run-hours interval. Only keyholders may record a completed service.
- **Inductions and stock** — training sessions grant the sign-offs that unlock machines, and
  consumables draw down against booked time with reorder thresholds.
- **Reports** — utilisation per machine, an occupancy heatmap, peak hours, and a member
  leaderboard. Utilisation clips to opening hours; the leaderboard deliberately does not, because
  that is what the allowance actually charges.
- **Import and export** — a dependency-free RFC 4180 CSV reader and writer, with a preview and
  per-row errors before anything is applied.
- **Command palette** — `Ctrl`/`Cmd` + `K` for keyboard-first navigation.

## Architecture

```
src/
  data/         Machines, members, and opening hours
  types/        Domain types shared across the app
  lib/          weektime.ts  integer week-minute arithmetic
                rules.ts     the rules engine, pure and framework-free
                api.ts       cancellable async facade that re-checks the rules
                storage.ts   validated localStorage helpers
  hooks/        usePersistentState, useHotkeys
  state/        One provider per concern: board, session, series, waitlist,
                maintenance, stock, audit, workshop config, preferences
  components/   ui/ primitives, then board/, bookings/, series/, waitlist/,
                inductions/, maintenance/, stock/, usage/, reports/, audit/,
                data/, admin/, settings/, palette/, layout/
  test/         Shared provider harness mirroring the app's provider stack
```

A few conventions worth knowing before changing things:

- **Time is an integer.** Everything is minutes from Monday 00:00. No `Date`, no timezone, no
  daylight-saving edge cases, and every calculation is exactly testable.
- **The rules live in one pure module.** `findRejections` takes a draft and a context and returns
  reasons. The dialog calls it during render to preview a refusal, and `api.ts` calls it again on
  write, so the UI cannot save something its own checks would have blocked.
- **Writes are optimistic.** A new booking appears immediately with a temporary id and is rolled
  back if the write is refused, so the grid never jumps while a request is in flight. Moving a
  booking excludes it from its own clash check, so a one-slot nudge is not read as a collision
  with where it used to be.
- **Persistence is defensive.** Anything read back from `localStorage` is validated, and a value
  written by an older build degrades to the default instead of breaking the board.
- **Accessibility is part of "done".** The grid is one tab stop with roving focus and arrow-key
  navigation, dialogs trap focus and restore it, every cell has a full accessible name, and every
  status that uses colour also states its meaning in text or a shape. The occupancy heatmap is a
  real table whose cells are named "Monday 18:00, 75% booked" — the colour is decoration.
- **The test harness mirrors the app.** `src/test/renderWithProviders.tsx` mounts the same
  provider stack as `App.tsx`. If a page works in one and not the other, those two have drifted.

## Testing

The suite runs on Vitest with Testing Library and jsdom. It covers the pure modules directly and the
pages through user-facing interaction — no snapshots and no assertions on class names.

```bash
npm test
```
