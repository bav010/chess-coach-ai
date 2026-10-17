// Репертуар пользователя: линии, заметки и карточки для тренировки.
import { Chess, type Color } from 'chess.js'
import { splitUci } from './game'

export type RepLine = {
  id: string; name: string; moves: string[]; note: string
  /** Уроки, пройденные по этой линии: пройденный урок считается выученным дебютом. */
  lessons?: string[]
}

export type Repertoire = {
  id: string
  name: string
  side: Color
  lines: RepLine[]
  /** Заметки к позициям: ключ — позиция без счётчиков ходов. */
  notes: Record<string, string>
}

export const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

let counter = 0
export const makeId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

export const newRepertoire = (name: string, side: Color): Repertoire => ({ id: makeId('r'), name, side, lines: [], notes: {} })

export function validLine(moves: readonly string[], startFen?: string): boolean {
  try {
    const c = new Chess(startFen)
    for (const u of moves) c.move(splitUci(u))
    return moves.length > 0
  } catch { return false }
}

const isPrefix = (a: readonly string[], b: readonly string[]) => a.length <= b.length && a.every((m, i) => m === b[i])

export type AddResult = { rep: Repertoire; status: 'added' | 'extended' | 'exists' | 'invalid' }

/** Добавляет линию. Если она уже входит в другую линию — не дублируем; если продолжает существующую — удлиняем её. */
export function addLine(rep: Repertoire, moves: readonly string[], name: string, note = ''): AddResult {
  if (!validLine(moves)) return { rep, status: 'invalid' }
  if (rep.lines.some(l => isPrefix(moves, l.moves))) return { rep, status: 'exists' }
  const idx = rep.lines.findIndex(l => isPrefix(l.moves, moves))
  if (idx >= 0) {
    const lines = rep.lines.slice()
    lines[idx] = { ...lines[idx], moves: [...moves], name: name || lines[idx].name }
    return { rep: { ...rep, lines }, status: 'extended' }
  }
  return { rep: { ...rep, lines: [...rep.lines, { id: makeId('l'), name: name || 'Без названия', moves: [...moves], note }] }, status: 'added' }
}

export const removeLine = (rep: Repertoire, id: string): Repertoire => ({ ...rep, lines: rep.lines.filter(l => l.id !== id) })

export const updateLine = (rep: Repertoire, id: string, patch: Partial<Pick<RepLine, 'name' | 'note'>>): Repertoire =>
  ({ ...rep, lines: rep.lines.map(l => (l.id === id ? { ...l, ...patch } : l)) })

export function setNote(rep: Repertoire, key: string, text: string): Repertoire {
  const notes = { ...rep.notes }
  if (text.trim()) notes[key] = text
  else delete notes[key]
  return { ...rep, notes }
}

/** Ходы репертуара из позиции после `path` (по дереву линий). */
export function repMovesAt(rep: Repertoire, path: readonly string[]): string[] {
  const out = new Set<string>()
  for (const l of rep.lines) if (l.moves.length > path.length && isPrefix(path, l.moves)) out.add(l.moves[path.length])
  return [...out]
}

export type CardSpec = {
  id: string
  key: string
  fen: string
  /** Допустимые ходы пользователя (UCI) — объединение по всем путям к этой позиции. */
  expected: string[]
  /** Кратчайший путь к позиции. */
  path: string[]
  turn: Color
}

/** Карточки: все позиции репертуара, где ход пользователя. */
export function cardSpecs(rep: Repertoire): CardSpec[] {
  const map = new Map<string, CardSpec>()
  const seenPaths = new Set<string>()
  for (const line of rep.lines) {
    const c = new Chess()
    for (let i = 0; i < line.moves.length; i++) {
      const path = line.moves.slice(0, i)
      if (c.turn() === rep.side) {
        const pk = path.join(' ')
        const key = posKey(c.fen())
        const id = `${rep.id}|${key}`
        let spec = map.get(id)
        if (!spec) { spec = { id, key, fen: c.fen(), expected: [], path, turn: c.turn() }; map.set(id, spec) }
        else if (path.length < spec.path.length) spec.path = path
        if (!spec.expected.includes(line.moves[i])) spec.expected.push(line.moves[i])
        seenPaths.add(pk)
      }
      c.move(splitUci(line.moves[i]))
    }
  }
  return [...map.values()]
}

/** Идентификаторы карточек, встречающихся на линии (в порядке ходов). */
export function lineCardIds(rep: Repertoire, line: RepLine): string[] {
  const out: string[] = []
  const c = new Chess()
  for (const u of line.moves) {
    if (c.turn() === rep.side) out.push(`${rep.id}|${posKey(c.fen())}`)
    c.move(splitUci(u))
  }
  return out
}
