// Подбор линий для тренировки и проверка ответа.
import { isDue, urgency, type CardState } from './srs'
import { lineCardIds, type Repertoire, type RepLine } from './repertoire'

export type DrillMode = 'due' | 'all'

export type DrillPlan = { lines: RepLine[]; dueCards: number; newCards: number }

/**
 * Какие линии показать сегодня. Режим «к повторению»: жадно набираем линии, покрывающие больше всего
 * карточек, которым пора (новые + просроченные), самые «трудные» первыми. Режим «все»: все линии, сначала
 * те, где больше трудных карточек.
 */
export function planDrill(rep: Repertoire, cards: Readonly<Record<string, CardState>>, now: number, mode: DrillMode, limit = 12): DrillPlan {
  const lineIds = rep.lines.map(l => ({ line: l, ids: lineCardIds(rep, l) }))
  const allIds = new Set(lineIds.flatMap(x => x.ids))
  const need = new Set<string>()
  let newCards = 0, dueCards = 0
  for (const id of allIds) {
    const c = cards[id]
    if (!c) { need.add(id); newCards++ }
    else if (isDue(c, now)) { need.add(id); dueCards++ }
  }
  const weight = (ids: string[]) => ids.reduce((s, id) => s + (cards[id] ? urgency(cards[id], now) : 0.5), 0)
  if (mode === 'all') {
    const lines = [...lineIds].sort((a, b) => weight(b.ids) - weight(a.ids)).map(x => x.line)
    return { lines: lines.slice(0, limit), dueCards, newCards }
  }
  const uncovered = new Set(need)
  const chosen: RepLine[] = []
  const pool = [...lineIds]
  while (uncovered.size > 0 && chosen.length < limit) {
    let best = -1, bestScore = 0
    pool.forEach((x, i) => {
      const gain = x.ids.filter(id => uncovered.has(id))
      const score = gain.length * 1000 + weight(gain)
      if (gain.length > 0 && score > bestScore) { best = i; bestScore = score }
    })
    if (best < 0) break
    const [pick] = pool.splice(best, 1)
    chosen.push(pick.line)
    pick.ids.forEach(id => uncovered.delete(id))
  }
  return { lines: chosen, dueCards, newCards }
}

export type Counts = { total: number; new: number; due: number; learning: number; learned: number }

export function countCards(rep: Repertoire, cards: Readonly<Record<string, CardState>>, now: number): Counts {
  const ids = new Set(rep.lines.flatMap(l => lineCardIds(rep, l)))
  const out: Counts = { total: ids.size, new: 0, due: 0, learning: 0, learned: 0 }
  for (const id of ids) {
    const c = cards[id]
    if (!c) { out.new++; continue }
    if (isDue(c, now)) out.due++
    if (c.ivl >= 7) out.learned++
    else out.learning++
  }
  return out
}
