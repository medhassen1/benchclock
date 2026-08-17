import { useMemo, useState, type FormEvent } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/toast-context'
import { CONSUMABLES, UNIT_LABELS, type Consumable } from '@/data/consumables'
import { MACHINE_KIND_LABELS } from '@/data/workshop'
import { formatQuantity, projectLevels, stockFraction, stockStatus } from '@/lib/stock'
import { useBoard } from '@/state/board-context'
import { useStock } from '@/state/stock-context'

import styles from './StockPage.module.css'

/** Status is spelled out, so the warning never rests on the badge colour. */
const STATUS_TEXT = {
  out: 'Out of stock — order now',
  low: 'Low stock — order more',
  ok: 'In stock',
} as const

const STATUS_TONE = { out: 'stop', low: 'warn', ok: 'ok' } as const
const STATUS_ICON = { out: '✕', low: '!', ok: '✓' } as const

export function StockPage() {
  const { levels, restock, lowStock, quantityOf } = useStock()
  const { bookings } = useBoard()
  const { notify } = useToast()

  const [amounts, setAmounts] = useState<Record<string, string>>({})

  const projection = useMemo(() => projectLevels(levels, bookings), [levels, bookings])

  const submitRestock = (item: Consumable) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // A blank or nonsense box is a mistake, not a request to change nothing:
    // saying so beats silently doing nothing.
    const added = Number(amounts[item.id] ?? '')
    if (!Number.isFinite(added) || added <= 0) {
      notify({ title: `Enter how many ${UNIT_LABELS[item.unit].many} to add`, tone: 'warning' })
      return
    }

    restock(item.id, added)
    setAmounts((current) => ({ ...current, [item.id]: '' }))
    notify({
      title: `Restocked ${item.name}`,
      description: `${formatQuantity(item, added)} added to the shelf.`,
      tone: 'success',
    })
  }

  return (
    <div className={styles.root}>
      <header>
        <h1 className={styles.title}>Stock</h1>
        <p className={styles.subtitle}>
          What the machines are eating through, and what has to be ordered before the next
          session.
        </p>
      </header>

      <section className={styles.card} role="group" aria-label="Stock summary">
        <h2 className={styles.cardHeading}>Needs ordering</h2>

        <p className={styles.summary}>
          {lowStock.length === 0 ? (
            <Badge tone="ok" icon="✓">
              Every item is above its reorder level
            </Badge>
          ) : (
            <Badge tone="warn" icon="!">
              {lowStock.length === 1
                ? '1 item needs ordering'
                : `${lowStock.length} items need ordering`}
              : {lowStock.map((item) => item.name).join(', ')}
            </Badge>
          )}
        </p>
      </section>

      <section className={styles.card} aria-labelledby="stock-levels">
        <h2 id="stock-levels" className={styles.cardHeading}>
          Stock levels
        </h2>

        <table className={styles.table}>
          <caption className="visually-hidden">
            Consumable stock, with the level projected after this week&rsquo;s bookings
          </caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Used by</th>
              <th scope="col">On the shelf</th>
              <th scope="col">Reorder at</th>
              <th scope="col">After booked jobs</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Restock</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {CONSUMABLES.map((item) => {
              const status = stockStatus(item, levels)
              const quantity = quantityOf(item.id)
              const after = projection.levels[item.id] ?? quantity
              const shortfall = projection.shortfalls[item.id] ?? 0

              return (
                <tr key={item.id}>
                  <th scope="row" className={styles.itemCell}>
                    {item.name}
                    <span className={styles.bar} aria-hidden="true">
                      <span
                        className={styles.barFill}
                        style={{ inlineSize: `${stockFraction(item, levels) * 100}%` }}
                      />
                    </span>
                  </th>
                  <td className={styles.muted}>
                    {item.consumedBy.map((kind) => MACHINE_KIND_LABELS[kind]).join(', ')}
                  </td>
                  <td className={styles.numeric}>{formatQuantity(item, quantity)}</td>
                  <td className={styles.numeric}>{formatQuantity(item, item.reorderThreshold)}</td>
                  <td className={styles.numeric}>
                    {formatQuantity(item, after)}
                    {shortfall > 0 ? (
                      <span className={styles.short}>
                        {formatQuantity(item, shortfall)} short
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>
                      {STATUS_TEXT[status]}
                    </Badge>
                  </td>
                  <td>
                    <form className={styles.restock} onSubmit={submitRestock(item)}>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={amounts[item.id] ?? ''}
                        aria-label={`${UNIT_LABELS[item.unit].many} of ${item.name} to add`}
                        onChange={(event) =>
                          setAmounts((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                      />
                      <Button size="sm" type="submit" aria-label={`Restock ${item.name}`}>
                        Restock
                      </Button>
                    </form>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
