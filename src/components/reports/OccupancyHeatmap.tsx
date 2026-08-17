import { DAY_NAMES } from '@/data/workshop'
import { cx } from '@/lib/cx'
import { formatPercent, type OccupancyCell, type OccupancyMatrix } from '@/lib/reports'
import { formatClock } from '@/lib/weektime'

import styles from './OccupancyHeatmap.module.css'

/** Shading bands, densest last. The text in each cell says the same thing. */
const BANDS = [
  { className: 'band0', upTo: 0, label: 'Nothing booked' },
  { className: 'band1', upTo: 0.25, label: 'Up to a quarter booked' },
  { className: 'band2', upTo: 0.5, label: 'Up to half booked' },
  { className: 'band3', upTo: 0.75, label: 'Up to three quarters booked' },
  { className: 'band4', upTo: 1, label: 'Nearly or fully booked' },
] as const

function bandFor(fraction: number): (typeof BANDS)[number] {
  return BANDS.find((band) => fraction <= band.upTo) ?? BANDS[BANDS.length - 1]
}

/** `Monday 18:00, 75% booked` — the whole meaning of a cell, in one sentence. */
function describeCell(cell: OccupancyCell): string {
  const when = `${DAY_NAMES[cell.day]} ${formatClock(cell.hour * 60)}`
  if (!cell.open) return `${when}, closed`
  return `${when}, ${formatPercent(cell.fraction)} booked`
}

export interface OccupancyHeatmapProps {
  matrix: OccupancyMatrix
  /** Table caption, which is also the table's accessible name. */
  caption?: string
  className?: string
}

/**
 * How busy every hour of the week is, as a real table.
 *
 * Shading is only ever a second copy of the information: each cell carries the
 * day, the hour and the percentage as text, so the grid can be read by a
 * screen reader, in high contrast, or by anyone who does not see the colours.
 */
export function OccupancyHeatmap({
  matrix,
  caption = 'Occupancy by day and hour',
  className,
}: OccupancyHeatmapProps) {
  if (matrix.hours.length === 0) {
    return <p className={styles.empty}>The workshop has no opening hours to report on.</p>
  }

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <caption className={styles.caption}>{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}>
                <span className="visually-hidden">Day</span>
              </th>
              {matrix.hours.map((hour) => (
                <th key={hour} scope="col" className={styles.hourHead}>
                  {formatClock(hour * 60)}
                </th>
              ))}
              <th scope="col" className={styles.totalHead}>
                All day
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.day}>
                <th scope="row" className={styles.dayHead}>
                  {DAY_NAMES[row.day]}
                </th>

                {row.cells.map((cell) => {
                  const band = bandFor(cell.fraction)
                  return (
                    <td
                      key={cell.hour}
                      className={cx(styles.cell, cell.open ? styles[band.className] : styles.shut)}
                    >
                      <span className="visually-hidden">{describeCell(cell)}</span>
                      <span aria-hidden="true" className={styles.mark}>
                        {cell.open ? formatPercent(cell.fraction).replace('%', '') : '·'}
                      </span>
                    </td>
                  )
                })}

                <td className={styles.total}>
                  <span className="visually-hidden">
                    {DAY_NAMES[row.day]} all day,{' '}
                    {row.capacityMinutes > 0 ? `${formatPercent(row.fraction)} booked` : 'closed'}
                  </span>
                  <span aria-hidden="true">
                    {row.capacityMinutes > 0 ? formatPercent(row.fraction) : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.key} aria-label="Shading key">
        {BANDS.map((band) => (
          <li key={band.className} className={styles.keyItem}>
            <span aria-hidden="true" className={cx(styles.swatch, styles[band.className])} />
            {band.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
