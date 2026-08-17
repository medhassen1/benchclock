/**
 * Matching and ranking for the command palette. Kept apart from the component
 * so the search behaviour can be reasoned about, and tested, on its own.
 */

export interface Command {
  id: string
  /** What the palette shows, and the first thing searched. */
  label: string
  /** Extra words the command can be found by; never displayed as the title. */
  keywords?: readonly string[]
  /** Short trailing hint, usually the shortcut that runs the same command. */
  hint?: string
  /** Listed but not runnable, for instance a booking action with nothing selected. */
  disabled?: boolean
  run: () => void
}

/**
 * Where a term was found. Lower is a better match: a member typing `boo`
 * expects "Booking board" before "Show my bookings", and both before a
 * command that only carries `booking` as a hidden keyword.
 */
const RANK_LABEL_PREFIX = 0
const RANK_LABEL = 1
const RANK_KEYWORD = 2
const RANK_NONE = 3

function rankTerm(term: string, label: string, keywords: readonly string[]): number {
  const index = label.indexOf(term)
  if (index === 0) return RANK_LABEL_PREFIX
  if (index > 0) return RANK_LABEL
  if (keywords.some((keyword) => keyword.includes(term))) return RANK_KEYWORD
  return RANK_NONE
}

/**
 * A command is only as strong as its weakest term: every term has to be
 * found, and the one hiding furthest from the label decides the rank. That
 * keeps a command matched entirely on its label ahead of one that leans on
 * its keywords to complete the query.
 */
function rankCommand(command: Command, terms: readonly string[]): number {
  const label = command.label.toLowerCase()
  const keywords = (command.keywords ?? []).map((keyword) => keyword.toLowerCase())

  let worst = RANK_LABEL_PREFIX
  for (const term of terms) {
    const rank = rankTerm(term, label, keywords)
    if (rank === RANK_NONE) return RANK_NONE
    if (rank > worst) worst = rank
  }
  return worst
}

/**
 * The commands matching `query`, best first. Every whitespace-separated term
 * must appear somewhere in the label or the keywords, so extra words narrow
 * the list rather than widening it.
 *
 * Always returns a new array: the palette derives it during render and must
 * never hand a caller's list back to be sorted in place.
 */
export function matchCommands(
  commands: readonly Command[],
  query: string,
): Command[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...commands]

  const ranked: { command: Command; rank: number; index: number }[] = []
  commands.forEach((command, index) => {
    const rank = rankCommand(command, terms)
    if (rank !== RANK_NONE) ranked.push({ command, rank, index })
  })

  // The authored index breaks ties, so equally good matches keep the order
  // the app listed them in rather than depending on the sort being stable.
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index)

  return ranked.map((entry) => entry.command)
}
