// Личная статистика партий. Одна запись на партию (ключ — стартовая позиция + ходы), поэтому повторное
// сохранение той же партии (из игры, из анализа, из резервной копии) её не дублирует.
// Хранится в localStorage отдельно от списка сессий (там лимит 200 и лежит весь PGN) — записи компактные и без лимита.
import { pk } from './profile'
import type { Color } from 'chess.js'
import { gameKey, loadReview, type SavedSession, type SessionResult } from '../storage'
import { parsePgn } from './pgn'
import { PIECE_VALUE, phaseOf, replay, type Phase } from './game'
import { buildReport } from './review'
import { isCritical, sideAccuracy, type MoveClass } from './classify'
import type { PositionEval } from './review'

export type Outcome = 'win' | 'draw' | 'loss'
export type GameSrc = 'bot' | 'analysis'

export type PhaseSummary = { n: number; acc: number | null; bad: number }

/** Итог разбора партии по ходам пользователя. */
export type GameReview = {
  v: 1
  moves: number
  /** Точность партии, %: среднее по ходам (формула по потере шансов на победу, как у lichess). */
  acc: number | null
  counts: Partial<Record<MoveClass, number>>
  phases: Record<Phase, PhaseSummary>
  /** Ошибки и зевки, после которых соперник сразу взял фигуру. */
  hung: number
  /** Упущенные шансы и упущенные маты. */
  missed: number
  /** Наибольшие шансы пользователя на победу за партию, %. */
  peakWin: number | null
  /** Шансы пользователя на победу при входе в эндшпиль, %. */
  endEntry: number | null
}

export type GameStat = {
  key: string
  at: string
  src: GameSrc
  color: Color | null
  result: SessionResult
  outcome: Outcome | null
  /** Номинальный рейтинг бота (только партии с ботом). */
  opp: number | null
  /** Контроль времени из PGN: «5+3», «-» (без часов) или null, если неизвестен (старые партии). */
  tc: string | null
  plies: number
  /** Партия дошла до эндшпиля (по материалу). */
  endgame: boolean
  review?: GameReview
}

export function outcomeOf(result: SessionResult, color: Color | null): Outcome | null {
  if (!color || result === 'in_progress') return null
  if (result === '1/2-1/2') return 'draw'
  return (result === '1-0') === (color === 'w') ? 'win' : 'loss'
}

function header(pgn: string, name: string): string | null {
  const m = new RegExp(`\\[${name}\\s+"([^"]*)"\\]`).exec(pgn)
  return m ? m[1] : null
}

/** Запись статистики по сохранённой сессии; null, если PGN не читается или в партии нет ходов. */
export function deriveGame(s: Pick<SavedSession, 'created_at' | 'result' | 'pgn'>): GameStat | null {
  try {
    const p = parsePgn(s.pgn)
    const white = p.white, black = p.black
    const isMe = (n: string | null | undefined) => n === 'Вы' || n === 'You' // 'Вы' — партии, сохранённые до локализации
    const color: Color | null = isMe(white) ? 'w' : isMe(black) ? 'b' : null
    const botName = color === 'w' ? black : color === 'b' ? white : null
    const m = botName ? /~(\d+)/.exec(botName) : null
    const { records } = replay(p.startFen, p.ucis)
    const result: SessionResult = s.result
    const tc = header(s.pgn, 'TimeControl')
    return {
      key: gameKey(p.startFen, p.ucis),
      at: s.created_at,
      src: color ? 'bot' : 'analysis',
      color,
      result,
      outcome: outcomeOf(result, color),
      opp: m ? Number(m[1]) : null,
      tc,
      plies: p.ucis.length,
      endgame: records.some((r, i) => i >= 10 && phaseOf(r.fenAfter, i + 1) === 'endgame'),
    }
  } catch { return null }
}

/** Добавляет партию или объединяет с уже записанной (по ключу). Возвращает тот же массив, если менять нечего. */
export function upsertGame(list: readonly GameStat[], g: GameStat): GameStat[] {
  const i = list.findIndex(x => x.key === g.key)
  if (i < 0) return [...list, g]
  const old = list[i]
  const merged: GameStat = {
    ...old,
    // «бот» с известным цветом важнее «анализа», законченный результат важнее in_progress
    src: old.src === 'bot' || g.src === 'analysis' ? old.src : g.src,
    color: old.color ?? g.color,
    opp: old.opp ?? g.opp,
    tc: old.tc ?? g.tc,
    result: old.result === 'in_progress' ? g.result : old.result,
    endgame: old.endgame || g.endgame,
    review: old.review ?? g.review,
  }
  merged.outcome = outcomeOf(merged.result, merged.color)
  merged.src = merged.color ? 'bot' : merged.src
  if (JSON.stringify(merged) === JSON.stringify(old)) return list as GameStat[]
  const out = list.slice(); out[i] = merged
  return out
}

/** Подтягивает в статистику сохранённые сессии, которых там ещё нет (в том числе сыгранные до появления статистики). */
export function syncFromSessions(list: readonly GameStat[], sessions: readonly SavedSession[]): GameStat[] {
  let out = list as GameStat[]
  for (const s of sessions) {
    if (s.plies === 0) continue
    const g = deriveGame(s)
    if (g) out = upsertGame(out, g)
  }
  return out
}

/** Итог разбора партии с точки зрения пользователя; null, если цвет пользователя неизвестен. */
export function summarizeReview(startFen: string, ucis: readonly string[], evals: readonly PositionEval[], color: Color | null): GameReview | null {
  if (!color) return null
  const { records } = replay(startFen, ucis)
  const report = buildReport(startFen, records, evals)
  const mine = report.moves.filter(m => m.record.color === color)
  if (mine.length === 0) return null
  const own = color === 'w' ? 1 : -1
  let hung = 0, missed = 0
  const phases = Object.fromEntries((['opening', 'middlegame', 'endgame'] as Phase[]).map(ph => {
    const ms = mine.filter(m => m.phase === ph)
    return [ph, { n: ms.length, acc: sideAccuracy(ms.map(m => m.loss)), bad: ms.filter(m => isCritical(m.cls)).length }]
  })) as Record<Phase, PhaseSummary>
  const counts: Partial<Record<MoveClass, number>> = {}
  for (const m of mine) {
    counts[m.cls] = (counts[m.cls] ?? 0) + 1
    const mateMissed = m.before.mate !== null && m.before.mate * own > 0 && !(m.after.mate !== null && m.after.mate * own > 0) && !m.playedIsBest
    if (m.cls === 'miss' || mateMissed) missed++
    if (m.cls === 'blunder' || m.cls === 'mistake' || m.cls === 'miss') {
      const reply = records[m.ply] // ответ соперника
      if (reply?.captured && PIECE_VALUE[reply.captured] >= 3 && PIECE_VALUE[reply.captured] > (m.record.captured ? PIECE_VALUE[m.record.captured] : 0)) hung++
    }
  }
  const mineWin = (g: number | null) => (g === null ? null : color === 'w' ? g : 100 - g)
  const wins = report.graph.map(mineWin).filter((x): x is number => x !== null)
  let endEntry: number | null = null
  for (let i = 0; i < records.length; i++) {
    if (i >= 10 && phaseOf(records[i].fenAfter, i + 1) === 'endgame') { endEntry = mineWin(report.graph[i + 1] ?? null); break }
  }
  return {
    v: 1, moves: mine.length, acc: report.accuracy[color], counts, phases, hung, missed,
    peakWin: wins.length ? Math.max(...wins) : null, endEntry,
  }
}

/** Для партий без итога разбора берёт сохранённый разбор (в браузере хранятся последние 8). */
export function backfillReviews(list: readonly GameStat[]): GameStat[] {
  let out = list as GameStat[]
  for (const g of list) {
    if (g.review || !g.color) continue
    const st = loadReview(g.key)
    if (!st || st.userColor !== g.color || st.evals.length !== st.ucis.length + 1) continue
    const r = summarizeReview(st.startFen, st.ucis, st.evals, g.color)
    if (r) out = out.map(x => (x.key === g.key ? { ...x, review: r } : x))
  }
  return out
}

/** Записывает итог разбора в партию (если партии нет в статистике — ничего не делает). */
export function attachReview(list: readonly GameStat[], key: string, review: GameReview): GameStat[] {
  const i = list.findIndex(g => g.key === key)
  if (i < 0 || !list[i].color) return list as GameStat[]
  const out = list.slice(); out[i] = { ...list[i], review }
  return out
}

// ---------- хранение ----------
const BASE = 'chess-coach-ai:games:v1'

export function loadGames(): GameStat[] {
  try {
    const raw = localStorage.getItem(pk(BASE))
    const d: unknown = raw ? JSON.parse(raw) : null
    const arr = d && typeof d === 'object' && Array.isArray((d as { games?: unknown }).games) ? (d as { games: unknown[] }).games : []
    return arr.filter((g): g is GameStat => !!g && typeof (g as GameStat).key === 'string' && typeof (g as GameStat).at === 'string' && typeof (g as GameStat).plies === 'number')
  } catch { return [] }
}

export function saveGames(games: readonly GameStat[]) {
  try { localStorage.setItem(pk(BASE), JSON.stringify({ v: 1, games })) } catch { /* хранилище недоступно — статистика только на время сессии */ }
}

export function mergeGames(a: readonly GameStat[], b: readonly GameStat[]): GameStat[] {
  let out = a as GameStat[]
  for (const g of b) out = upsertGame(out, g)
  return out
}
