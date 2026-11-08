// Библиотека партий: импорт PGN из lichess / chess.com (одна или много партий в файле), список с фильтрами,
// учёт в «Моих дебютах». Свою сторону определяем по нику (в PGN игрок назван ником, а не «You»).
// Хранится только на устройстве, входит в резервную копию; в облачную синхронизацию не включена (объём).
import { Chess, type Color } from 'chess.js'
import { pk } from './profile'
import { parsePgn, toPgn } from './pgn'
import { gameKey, type SavedSession, type SessionResult } from '../storage'
import { outcomeOf, type Outcome } from './gameStats'

export type LibGame = {
  key: string
  /** Когда партия добавлена (ISO). */
  at: string
  /** Дата партии из PGN («2026-11-02») или null. */
  date: string | null
  white: string
  black: string
  whiteElo: number | null
  blackElo: number | null
  result: SessionResult
  /** Контроль времени из PGN («300+3») или null. */
  tc: string | null
  plies: number
  /** Чистый PGN без комментариев и пометок часов (компактнее оригинала). */
  pgn: string
}
export type LibStore = { v: 1; nicks: string[]; games: LibGame[] }
export const EMPTY_LIB: LibStore = { v: 1, nicks: [], games: [] }
export const MAX_GAMES = 500
const MAX_NICKS = 5

export type ImportReport = { store: LibStore; added: number; duplicates: number; failed: number }

/** Делит текст с несколькими партиями на отдельные: новая партия начинается с тега [Event ...] после пустой строки. */
export function splitPgn(text: string): string[] {
  const t = text.replace(/\r\n?/g, '\n').trim()
  if (!t) return []
  const parts = t.split(/\n\s*\n(?=\[Event\s)/)
  return parts.map(p => p.trim()).filter(Boolean)
}

const KEEP = ['Event', 'Site', 'Date', 'White', 'Black', 'Result', 'WhiteElo', 'BlackElo', 'TimeControl'] as const
const pick = (v: string | null | undefined) => (v && v !== '?' ? v : null)
const num = (v: string | null | undefined) => { const n = v ? parseInt(v, 10) : NaN; return Number.isFinite(n) && n > 0 ? n : null }
const resultOf = (r: string | null): SessionResult => (r === '1-0' || r === '0-1' || r === '1/2-1/2' ? r : 'in_progress')

/** Читает одну партию; null — если PGN не читается или в нём нет ходов. */
export function readGame(pgn: string, at: string): LibGame | null {
  try {
    const c = new Chess()
    c.loadPgn(pgn)
    const h = c.getHeaders()
    const p = parsePgn(pgn)
    const headers: Record<string, string> = {}
    for (const k of KEEP) if (h[k] && h[k] !== '?') headers[k] = h[k]
    const clean = toPgn(p.startFen, p.ucis, headers)
    return {
      key: gameKey(p.startFen, p.ucis), at, date: pick(h.Date)?.replace(/\./g, '-') ?? null,
      white: pick(h.White) ?? '?', black: pick(h.Black) ?? '?', whiteElo: num(h.WhiteElo), blackElo: num(h.BlackElo),
      result: resultOf(pick(h.Result)), tc: pick(h.TimeControl), plies: p.ucis.length, pgn: clean,
    }
  } catch { return null }
}

/** Добавляет партии из текста PGN (дубликаты по ключу «позиция + ходы» пропускаются; новые — сверху, всего не больше MAX_GAMES). */
export function importPgn(store: LibStore, text: string, now = new Date()): ImportReport {
  const at = now.toISOString()
  const seen = new Set(store.games.map(g => g.key))
  const fresh: LibGame[] = []
  let duplicates = 0, failed = 0
  for (const part of splitPgn(text)) {
    const g = readGame(part, at)
    if (!g) { failed++; continue }
    if (seen.has(g.key)) { duplicates++; continue }
    seen.add(g.key); fresh.push(g)
  }
  fresh.sort(newestFirst)
  const games = [...fresh, ...store.games].sort(newestFirst).slice(0, MAX_GAMES)
  return { store: { ...store, games }, added: fresh.length, duplicates, failed }
}

const stamp = (g: LibGame) => (g.date ? Date.parse(g.date) : NaN) || Date.parse(g.at) || 0
const newestFirst = (a: LibGame, b: LibGame) => stamp(b) - stamp(a)

export const normNick = (s: string) => s.trim().toLowerCase()
/** Чистит список ников: без пустых и повторов, не больше MAX_NICKS. */
export function cleanNicks(list: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of list) {
    const n = raw.replace(/\s+/g, ' ').trim().slice(0, 40)
    if (n && !out.some(o => normNick(o) === normNick(n))) out.push(n)
  }
  return out.slice(0, MAX_NICKS)
}

/** Ваша сторона в партии по нику; если ник совпал с обоими игроками или ни с одним — null. */
export function colorOf(g: Pick<LibGame, 'white' | 'black'>, nicks: readonly string[]): Color | null {
  const set = new Set(nicks.map(normNick))
  const w = set.has(normNick(g.white)), b = set.has(normNick(g.black))
  return w === b ? null : w ? 'w' : 'b'
}
export const outcomeFor = (g: LibGame, nicks: readonly string[]): Outcome | null => outcomeOf(g.result, colorOf(g, nicks))

export type LibFilter = { color: 'all' | Color; outcome: 'all' | Outcome; q: string }
export const NO_FILTER: LibFilter = { color: 'all', outcome: 'all', q: '' }

export function filterGames(games: readonly LibGame[], nicks: readonly string[], f: LibFilter): LibGame[] {
  const q = f.q.trim().toLowerCase()
  return games.filter(g => {
    const c = colorOf(g, nicks)
    if (f.color !== 'all' && c !== f.color) return false
    if (f.outcome !== 'all' && outcomeFor(g, nicks) !== f.outcome) return false
    if (q && !`${g.white} ${g.black} ${g.date ?? ''} ${g.tc ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
}

/** Сводка по партиям с известной стороной. */
export function summary(games: readonly LibGame[], nicks: readonly string[]) {
  let w = 0, d = 0, l = 0, unknown = 0
  for (const g of games) {
    const o = outcomeFor(g, nicks)
    if (o === 'win') w++; else if (o === 'draw') d++; else if (o === 'loss') l++; else unknown++
  }
  return { total: games.length, w, d, l, unknown, score: w + d + l ? Math.round(((w + d / 2) / (w + d + l)) * 100) : null }
}

/** Партии библиотеки как «сессии», чтобы «Мои дебюты» и открытие в анализе работали без отдельного кода:
 *  в PGN ваша сторона подписывается «You» (так подписаны партии с ботом), соперник сохраняет своё имя.
 *  Партии, где сторона неизвестна, остаются как есть (в дебютах не учитываются). */
export function sessionFor(g: LibGame, nicks: readonly string[], i = 0): SavedSession | null {
  const c = colorOf(g, nicks)
  let pgn = g.pgn
  if (c) {
    try {
      const p = parsePgn(g.pgn)
      pgn = toPgn(p.startFen, p.ucis, { Date: g.date ?? '?', White: c === 'w' ? 'You' : g.white, Black: c === 'b' ? 'You' : g.black, Result: g.result === 'in_progress' ? '*' : g.result })
    } catch { return null }
  }
  return { id: stamp(g) + i, created_at: g.date ? new Date(Date.parse(g.date)).toISOString() : g.at, result: g.result, plies: g.plies, pgn }
}
export function asSessions(store: LibStore): SavedSession[] {
  const out: SavedSession[] = []
  store.games.forEach((g, i) => { const s = sessionFor(g, store.nicks, i); if (s) out.push(s) })
  return out
}

/** Слияние двух устройств: партии без повторов, ники — объединение. */
export function mergeLibrary(a: LibStore, b: LibStore): LibStore {
  const seen = new Set<string>()
  const games = [...a.games, ...b.games].filter(g => (seen.has(g.key) ? false : (seen.add(g.key), true))).sort(newestFirst).slice(0, MAX_GAMES)
  return { v: 1, nicks: cleanNicks([...a.nicks, ...b.nicks]), games }
}

const BASE = 'chess-coach-ai:library:v1'
const isGame = (g: unknown): g is LibGame => !!g && typeof (g as LibGame).key === 'string' && typeof (g as LibGame).pgn === 'string' && typeof (g as LibGame).white === 'string' && typeof (g as LibGame).black === 'string' && typeof (g as LibGame).plies === 'number'
export function loadLibrary(): LibStore {
  try {
    const raw = localStorage.getItem(pk(BASE))
    const d = (raw ? JSON.parse(raw) : null) as Partial<LibStore> | null
    if (d && d.v === 1 && Array.isArray(d.games)) return { v: 1, nicks: cleanNicks(Array.isArray(d.nicks) ? d.nicks.filter((x): x is string => typeof x === 'string') : []), games: d.games.filter(isGame) }
  } catch { /* повреждённые данные — начинаем сначала */ }
  return EMPTY_LIB
}
export function saveLibrary(s: LibStore) { try { localStorage.setItem(pk(BASE), JSON.stringify(s)) } catch { /* хранилище недоступно или переполнено */ } }
