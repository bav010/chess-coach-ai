// Каталог дебютов (данные lichess-org/chess-openings, CC0) и дерево вариантов. Не содержит оценок движка:
// это справочные данные, анализ Stockfish хранится и показывается отдельно.
import { Chess } from 'chess.js'
import { splitUci } from './game'
import { ruNameStatic } from './openingNames'

export type Opening = { eco: string; name: string; moves: string[] }

export type TNode = {
  /** Ход UCI, которым пришли в узел ('' у корня). */
  uci: string
  children: Map<string, TNode>
  /** Сколько линий каталога проходит через узел. */
  lines: number
  /** Названные дебюты, заканчивающиеся ровно здесь. */
  openings: Opening[]
}

export type Catalog = { root: TNode; list: Opening[] }

const node = (uci: string): TNode => ({ uci, children: new Map(), lines: 0, openings: [] })

export function buildCatalog(rows: readonly (readonly [string, string, string])[]): Catalog {
  const root = node('')
  const list: Opening[] = []
  for (const [eco, name, uci] of rows) {
    const moves = uci ? uci.split(' ') : []
    const op: Opening = { eco, name, moves }
    list.push(op)
    let cur = root
    root.lines++
    for (const m of moves) {
      let next = cur.children.get(m)
      if (!next) { next = node(m); cur.children.set(m, next) }
      next.lines++
      cur = next
    }
    cur.openings.push(op)
  }
  return { root, list }
}

export function nodeAt(root: TNode, path: readonly string[]): TNode | null {
  let cur: TNode | null = root
  for (const m of path) {
    cur = cur.children.get(m) ?? null
    if (!cur) return null
  }
  return cur
}

/** Дебют на этой позиции: ближайший названный узел на пути (сам узел или предок). */
export function openingAt(root: TNode, path: readonly string[]): { opening: Opening; exact: boolean } | null {
  let cur: TNode | null = root
  let best: { opening: Opening; exact: boolean } | null = null
  if (cur.openings[0]) best = { opening: cur.openings[0], exact: path.length === 0 }
  for (let i = 0; i < path.length; i++) {
    cur = cur.children.get(path[i]) ?? null
    if (!cur) break
    if (cur.openings.length) {
      // из нескольких названий на одной позиции берём самое короткое — обычно это название семейства
      const op = [...cur.openings].sort((a, b) => a.name.length - b.name.length)[0]
      best = { opening: op, exact: i === path.length - 1 }
    }
  }
  return best
}

export type Continuation = { uci: string; lines: number; opening: Opening | null; recommended: boolean }

/** Продолжения из позиции по каталогу, самые разработанные первыми. Рекомендуется самое разработанное. */
export function continuations(root: TNode, path: readonly string[]): Continuation[] {
  const n = nodeAt(root, path)
  if (!n) return []
  const rows = [...n.children.values()].sort((a, b) => b.lines - a.lines || a.uci.localeCompare(b.uci))
  return rows.map((c, i) => ({
    uci: c.uci, lines: c.lines, recommended: i === 0,
    opening: c.openings.length ? [...c.openings].sort((a, b) => a.name.length - b.name.length)[0] : null,
  }))
}

export type SearchOptions = { query: string; eco: string | null; limit?: number }

export function searchOpenings(list: readonly Opening[], { query, eco, limit = 60 }: SearchOptions): { items: Opening[]; total: number } {
  const q = query.trim().toLowerCase()
  const items: Opening[] = []
  let total = 0
  for (const o of list) {
    if (eco && o.eco[0] !== eco) continue
    if (q && !(o.name.toLowerCase().includes(q) || ruNameStatic(o.name).toLowerCase().includes(q) || o.eco.toLowerCase().startsWith(q))) continue
    total++
    if (items.length < limit) items.push(o)
  }
  return { items, total }
}

/** SAN-запись линии с номерами ходов: [{no:1, white:'e4', black:'e5'}, …]. */
export type SanRow = { no: number; white?: string; black?: string; wi?: number; bi?: number }

export function sanRows(startFen: string, path: readonly string[]): SanRow[] {
  const c = new Chess(startFen)
  const rows: SanRow[] = []
  path.forEach((u, i) => {
    const white = c.turn() === 'w'
    const no = c.moveNumber()
    const m = c.move(splitUci(u))
    if (white) rows.push({ no, white: m.san, wi: i })
    else if (rows.length && rows[rows.length - 1].no === no && rows[rows.length - 1].black === undefined) { rows[rows.length - 1].black = m.san; rows[rows.length - 1].bi = i }
    else rows.push({ no, black: m.san, bi: i })
  })
  return rows
}
