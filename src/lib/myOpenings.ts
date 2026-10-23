// «Мои дебюты»: по сохранённым партиям с ботом считаем, какие дебюты вы играете, как в них выступаете и где партия выходит
// за пределы каталога дебютов. Каталог — справочник названий (lichess, CC0), а не оценка движка: выход из каталога
// не означает ошибку.
import type { Color } from 'chess.js'
import { deriveGame } from './gameStats'
import { START_FEN } from './game'
import { uciToSan } from './san'
import { openingAt, nodeAt, type Catalog } from './openings'
import { parsePgn } from './pgn'
import type { SavedSession } from '../storage'
import { Chess } from 'chess.js'

export type Exit = {
  /** Кто сделал первый ход за пределами каталога. */
  by: 'me' | 'opp'
  /** Номер полухода, с 1. */
  ply: number
  /** Ход в записи SAN с номером («5.Nf3», «5...Nc6»). */
  label: string
  count: number
}

export type OpeningGroup = {
  id: string
  color: Color
  /** Семейство дебюта (название до двоеточия) и самая частая вариация. */
  family: string
  variation: string
  eco: string
  games: number
  w: number; d: number; l: number
  /** Результат в очках, %: победа — 1, ничья — 0.5. */
  score: number
  /** Средняя глубина каталога (полуходов) до выхода из него. */
  avgDepth: number
  exits: Exit[]
}

export type MyOpenings = { groups: OpeningGroup[]; considered: number; skipped: number }

/** Минимум партий, чтобы говорить о результате в дебюте. */
export const MIN_VERDICT = 3
/** Результат ниже этого порога (в очках, %) при достаточном числе партий считается слабым местом. */
export const WEAK_SCORE = 40

const familyOf = (name: string) => name.split(':')[0].trim()

function moveLabel(fen: string, ply: number, uci: string): string {
  const san = uciToSan(fen, uci) ?? uci
  const n = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${n}.${san}` : `${n}...${san}`
}

type Acc = { color: Color; family: string; vars: Map<string, { n: number; eco: string }>; w: number; d: number; l: number; depth: number; games: number; exits: Map<string, Exit> }

export function analyseMyOpenings(sessions: readonly SavedSession[], catalog: Catalog): MyOpenings {
  const groups = new Map<string, Acc>()
  let considered = 0, skipped = 0
  for (const s of sessions) {
    const g = deriveGame(s)
    if (!g || !g.color) { skipped++; continue }
    let p
    try { p = parsePgn(s.pgn) } catch { skipped++; continue }
    if (p.startFen !== START_FEN) { skipped++; continue }
    // глубина: сколько полуходов партии лежит в каталоге
    let depth = 0
    for (; depth < p.ucis.length; depth++) if (!nodeAt(catalog.root, p.ucis.slice(0, depth + 1))) break
    const op = openingAt(catalog.root, p.ucis.slice(0, depth))
    if (!op || depth < 2) { skipped++; continue } // нет названного дебюта
    considered++
    const family = familyOf(op.opening.name)
    const id = `${g.color}:${family}`
    const a = groups.get(id) ?? { color: g.color, family, vars: new Map(), w: 0, d: 0, l: 0, depth: 0, games: 0, exits: new Map() }
    a.games++; a.depth += depth
    const v = a.vars.get(op.opening.name) ?? { n: 0, eco: op.opening.eco }; v.n++; a.vars.set(op.opening.name, v)
    if (g.outcome === 'win') a.w++; else if (g.outcome === 'draw') a.d++; else if (g.outcome === 'loss') a.l++
    if (depth < p.ucis.length) {
      const ply = depth + 1
      const mover: Color = ply % 2 === 1 ? 'w' : 'b'
      const by = mover === g.color ? 'me' : 'opp'
      const c = new Chess(p.startFen); for (const u of p.ucis.slice(0, depth)) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      const label = moveLabel(c.fen(), ply, p.ucis[depth])
      const k = `${by}:${label}`
      const e = a.exits.get(k) ?? { by, ply, label, count: 0 }; e.count++; a.exits.set(k, e)
    }
    groups.set(id, a)
  }
  const out: OpeningGroup[] = [...groups.entries()].map(([id, a]) => {
    const top = [...a.vars.entries()].sort((x, y) => y[1].n - x[1].n || x[0].length - y[0].length)[0]
    return {
      id, color: a.color, family: a.family, variation: top[0], eco: top[1].eco, games: a.games, w: a.w, d: a.d, l: a.l,
      score: Math.round(((a.w + a.d / 2) / Math.max(1, a.w + a.d + a.l)) * 100),
      avgDepth: Math.round((a.depth / a.games) * 10) / 10,
      exits: [...a.exits.values()].sort((x, y) => y.count - x.count || x.ply - y.ply).slice(0, 4),
    }
  }).sort((x, y) => y.games - x.games || x.family.localeCompare(y.family))
  return { groups: out, considered, skipped }
}

export const isWeak = (g: OpeningGroup) => g.games >= MIN_VERDICT && g.score < WEAK_SCORE
