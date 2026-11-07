// Онлайн-партия с другом: чистая логика (без сети и React). Состояние партии хранит сервер (supabase.sql),
// клиент лишь показывает его, проверяет легальность хода и считает отображаемое время.
import { Chess } from 'chess.js'
import { START_FEN, splitUci, statusOf } from './game'

export type OnlineStatus = 'waiting' | 'active' | 'finished'
export type OnlineResult = '1-0' | '0-1' | '1/2-1/2'
export type Side = 'w' | 'b'

export type OnlineGame = {
  id: string
  code: string
  creator: string
  white: string | null
  black: string | null
  white_name: string
  black_name: string
  moves: string[]
  base_ms: number
  inc_ms: number
  white_ms: number
  black_ms: number
  turn_started: string | null
  status: OnlineStatus
  result: OnlineResult | null
  reason: string | null
  draw_offer: Side | null
  /** Показана в списке открытых вызовов (быстрый поиск). */
  is_open?: boolean
  /** Последняя реакция (код из белого списка), кто её послал и порядковый номер. */
  emote?: string | null
  emote_by?: Side | null
  emote_seq?: number
  /** Позиция (FEN), которую ведёт сервер, и признак партии с рейтингом. */
  fen?: string | null
  rated?: boolean
  /** Рейтинг игроков на начало партии/сейчас и изменение после партии (null — партия без рейтинга). */
  white_rating?: number | null
  black_rating?: number | null
  white_elo?: number | null
  black_elo?: number | null
  white_delta?: number | null
  black_delta?: number | null
  updated_at?: string
  /** Время сервера в момент ответа (есть только у ответов функций, не у событий Realtime). */
  server_now?: string
}

/** Изменение рейтинга игрока после партии: { delta, after } или null, если партия без рейтинга. */
export function ratingChange(g: OnlineGame, side: Side | null): { delta: number; after: number } | null {
  if (!side || g.status !== 'finished') return null
  const delta = side === 'w' ? g.white_delta : g.black_delta
  const elo = side === 'w' ? g.white_elo : g.black_elo
  if (delta == null || elo == null) return null
  return { delta, after: elo + delta }
}

export const CODE_RE = /^[0-9a-f]{8}$/

/** Код партии из ссылки-приглашения или просто из кода. */
export function parseCode(input: string): string | null {
  const s = input.trim().toLowerCase()
  const m = /(?<![0-9a-f])([0-9a-f]{8})(?![0-9a-f])/.exec(s)
  return m ? m[1] : null
}

export function inviteLink(code: string, loc: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${loc.origin}${loc.pathname}#/online/${code}`
}

export const mySide = (g: OnlineGame, uid: string | null | undefined): Side | null => (!uid ? null : g.white === uid ? 'w' : g.black === uid ? 'b' : null)
export const turnOf = (g: OnlineGame): Side => (g.moves.length % 2 === 0 ? 'w' : 'b')
export const hasClock = (g: OnlineGame): boolean => g.base_ms > 0
export const isMyTurn = (g: OnlineGame, side: Side | null): boolean => g.status === 'active' && side !== null && turnOf(g) === side

/** Поправка часов: на сколько мс время сервера впереди местного (вычисляется по ответу функции). */
export function clockOffset(g: Pick<OnlineGame, 'server_now'>, localNow: number): number | null {
  if (!g.server_now) return null
  const s = Date.parse(g.server_now)
  return Number.isNaN(s) ? null : s - localNow
}

/** Сколько осталось у стороны (мс); null, если партия без часов. Идёт только часы стороны, чей ход, в активной партии. */
export function remainingMs(g: OnlineGame, side: Side, localNow: number, offset: number): number | null {
  if (!hasClock(g)) return null
  const base = side === 'w' ? g.white_ms : g.black_ms
  if (g.status !== 'active' || turnOf(g) !== side || !g.turn_started) return Math.max(0, base)
  const started = Date.parse(g.turn_started)
  if (Number.isNaN(started)) return Math.max(0, base)
  return Math.max(0, base - (localNow + offset - started))
}

export function formatClock(ms: number): string {
  if (ms < 10_000) { const s = Math.floor(ms / 1000); return `0:${String(s).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}` }
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function chessOf(g: Pick<OnlineGame, 'moves'>, upTo = g.moves.length): Chess {
  const c = new Chess(START_FEN)
  for (const u of g.moves.slice(0, upTo)) c.move(splitUci(u))
  return c
}

/** Ход допустим в текущей позиции? Возвращает позицию после хода или null. */
export function tryMove(chess: Chess, uci: string): Chess | null {
  try { const c = new Chess(chess.fen()); c.move(splitUci(uci)); return c } catch { return null }
}

/** Конец партии по правилам в позиции после последнего хода (для сообщения серверу). Повторения считаются по всей истории. */
export function ruleOutcome(g: Pick<OnlineGame, 'moves'>): { result: OnlineResult; reason: 'checkmate' | 'stalemate' | 'insufficient' | 'repetition' | 'fifty' } | null {
  const st = statusOf(chessOf(g))
  if (!st.over) return null
  const reason = st.reason === 'threefold' ? 'repetition' : st.reason
  if (reason === 'checkmate' || reason === 'stalemate' || reason === 'insufficient' || reason === 'repetition' || reason === 'fifty') return { result: st.result, reason }
  return null
}

/** Результат с точки зрения игрока: победа, ничья, поражение; null — отмена или партия идёт. */
export function outcomeFor(g: OnlineGame, side: Side | null): 'win' | 'draw' | 'loss' | null {
  if (g.status !== 'finished' || !g.result || !side) return null
  if (g.result === '1/2-1/2') return 'draw'
  return (g.result === '1-0') === (side === 'w') ? 'win' : 'loss'
}

/** Ключ перевода ошибки сервера или сети. */
export function onlineErrorKey(e: unknown): string {
  const raw = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')).toLowerCase()
  if (raw.includes('illegal_move')) return 'online.err.illegal'
  for (const k of ['not_found', 'full', 'not_your_turn', 'not_active', 'bad_time', 'not_authenticated', 'bad_move', 'too_long', 'too_fast', 'bad_emote']) if (raw.includes(k)) return `online.err.${k}`
  if (raw.includes('failed to fetch') || raw.includes('network') || raw.includes('load failed')) return 'online.err.network'
  if (raw.includes('could not find the function') || raw.includes('does not exist') || raw.includes('schema cache')) return 'online.err.setup'
  return 'online.err.other'
}

export const EMOTES = ['gl', 'gg', 'nice', 'oops', 'thanks', 'wow'] as const
export type Emote = (typeof EMOTES)[number]

/** Новая версия партии не старше известной (события Realtime могут прийти не по порядку). */
export function isNewer(next: Pick<OnlineGame, 'moves' | 'status' | 'updated_at' | 'draw_offer'>, cur: Pick<OnlineGame, 'moves' | 'status' | 'updated_at' | 'draw_offer'> | null): boolean {
  if (!cur) return true
  if (cur.status === 'finished' && next.status !== 'finished') return false
  if (next.moves.length !== cur.moves.length) return next.moves.length > cur.moves.length
  if (next.status !== cur.status) return true
  if (next.updated_at && cur.updated_at) return next.updated_at >= cur.updated_at
  return next.draw_offer !== cur.draw_offer
}
