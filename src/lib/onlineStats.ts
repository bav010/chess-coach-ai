// Личная статистика онлайн-партий: считается по завершённым партиям аккаунта (прерванные не учитываются).
import { mySide, outcomeFor, type OnlineGame, type Side } from './online'

export type Wdl = { games: number; wins: number; draws: number; losses: number }
export type OnlineSummary = {
  total: Wdl
  winRate: number | null
  byColor: Record<Side, Wdl>
  /** Контроль времени → итоги, по убыванию числа партий. */
  byTc: { tc: string; wdl: Wdl }[]
  /** Чем заканчивались партии: reason → число. */
  endings: Record<string, number>
  /** Последние результаты, новые справа (не больше 10). */
  form: ('win' | 'draw' | 'loss')[]
  /** Текущая серия одинаковых результатов (победы/поражения подряд), 0 — нет. */
  streak: { kind: 'win' | 'loss'; n: number } | null
  /** Частые соперники. */
  opponents: { name: string; wdl: Wdl }[]
  avgPlies: number | null
}

const empty = (): Wdl => ({ games: 0, wins: 0, draws: 0, losses: 0 })
function add(w: Wdl, o: 'win' | 'draw' | 'loss') {
  w.games++
  if (o === 'win') w.wins++; else if (o === 'draw') w.draws++; else w.losses++
}

export const tcLabel = (g: Pick<OnlineGame, 'base_ms' | 'inc_ms'>): string =>
  g.base_ms === 0 ? 'none' : `${Math.round((g.base_ms / 60000) * 10) / 10}+${Math.round(g.inc_ms / 1000)}`

export function summarizeOnline(games: readonly OnlineGame[], uid: string): OnlineSummary {
  const fin = games
    .map(g => ({ g, side: mySide(g, uid) }))
    .filter((x): x is { g: OnlineGame; side: Side } => x.side !== null && x.g.status === 'finished' && x.g.result !== null)
    .sort((a, b) => (a.g.updated_at ?? '').localeCompare(b.g.updated_at ?? ''))
  const total = empty(); const byColor = { w: empty(), b: empty() }
  const tcs = new Map<string, Wdl>(); const opp = new Map<string, Wdl>(); const endings: Record<string, number> = {}
  const outs: ('win' | 'draw' | 'loss')[] = []
  let plies = 0
  for (const { g, side } of fin) {
    const o = outcomeFor(g, side)!
    outs.push(o); add(total, o); add(byColor[side], o)
    const k = tcLabel(g); add(tcs.get(k) ?? tcs.set(k, empty()).get(k)!, o)
    const name = (side === 'w' ? g.black_name : g.white_name).trim()
    if (name) add(opp.get(name) ?? opp.set(name, empty()).get(name)!, o)
    const r = g.reason ?? 'other'; endings[r] = (endings[r] ?? 0) + 1
    plies += g.moves.length
  }
  let streak: OnlineSummary['streak'] = null
  const last = outs[outs.length - 1]
  if (last && last !== 'draw') { let n = 0; for (let i = outs.length - 1; i >= 0 && outs[i] === last; i--) n++; streak = { kind: last, n } }
  const byGames = (a: { wdl: Wdl }, b: { wdl: Wdl }) => b.wdl.games - a.wdl.games
  return {
    total, winRate: total.games ? Math.round((total.wins + total.draws / 2) / total.games * 100) : null, byColor,
    byTc: [...tcs].map(([tc, wdl]) => ({ tc, wdl })).sort(byGames),
    endings, form: outs.slice(-10), streak,
    opponents: [...opp].map(([name, wdl]) => ({ name, wdl })).sort(byGames).slice(0, 3),
    avgPlies: total.games ? Math.round(plies / total.games) : null,
  }
}
