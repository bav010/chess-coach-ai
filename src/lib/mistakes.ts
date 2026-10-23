// Личные задачи из собственных ошибок: позиции, где в разборе партии был ошибочный ход, и лучший ход движка.
// Повторяются по интервальной схеме (srs.ts). Хранится в localStorage, входит в синхронизацию.
import type { Color } from 'chess.js'
import { isCritical, type MoveClass } from './classify'
import { replay } from './game'
import { pk } from './profile'
import { buildReport, type PositionEval } from './review'
import { newCard, schedule, urgency, isDue, mastery, type CardState } from './srs'
import { listReviews } from '../storage'

export type MistakeItem = {
  id: string
  gameKey: string
  ply: number
  /** Позиция перед ошибочным ходом. */
  fen: string
  color: Color
  /** Лучший ход движка (UCI) и его запись. */
  bestUci: string
  bestSan: string
  playedSan: string
  cls: MoveClass
  /** Потеря шансов на победу, п. п. */
  loss: number
  at: string
}

export type MistakeStore = { v: 1; items: Record<string, MistakeItem>; cards: Record<string, CardState> }
export const EMPTY_MISTAKES: MistakeStore = { v: 1, items: {}, cards: {} }
export const MAX_ITEMS = 300

/** Ошибки пользователя в разобранной партии: только критические ходы с известным лучшим ходом. */
export function extractMistakes(startFen: string, ucis: readonly string[], evals: readonly PositionEval[], color: Color | null, gameKey: string, at: string): MistakeItem[] {
  if (!color) return []
  const { records } = replay(startFen, ucis)
  const report = buildReport(startFen, records, evals)
  return report.moves
    .filter(m => m.record.color === color && isCritical(m.cls) && !m.playedIsBest && !!m.bestUci && !m.book)
    .map(m => ({
      id: `${gameKey}#${m.ply}`, gameKey, ply: m.ply, fen: m.record.fenBefore, color, bestUci: m.bestUci!, bestSan: m.bestSan ?? m.bestUci!,
      playedSan: m.record.san, cls: m.cls, loss: Math.round(m.loss * 10) / 10, at,
    }))
}

/** Добавляет новые задачи; уже известные не трогает. При переполнении сначала уходят выученные, затем самые старые. */
export function addMistakes(s: MistakeStore, found: readonly MistakeItem[]): MistakeStore {
  const items = { ...s.items }
  let changed = false
  for (const m of found) if (!items[m.id]) { items[m.id] = m; changed = true }
  if (!changed) return s
  const cards = { ...s.cards }
  const ids = Object.keys(items)
  if (ids.length > MAX_ITEMS) {
    const rank = (id: string) => (mastery(cards[id]) === 'learned' ? 0 : 1)
    const drop = ids.sort((a, b) => rank(a) - rank(b) || items[a].at.localeCompare(items[b].at)).slice(0, ids.length - MAX_ITEMS)
    for (const id of drop) { delete items[id]; delete cards[id] }
  }
  return { v: 1, items, cards }
}

/** Что показать сейчас: сначала просроченные (самые срочные), затем новые (свежие партии первыми). */
export function planMistakes(s: MistakeStore, now: number, limit = 20): MistakeItem[] {
  const all = Object.values(s.items)
  const due = all.filter(m => s.cards[m.id] && isDue(s.cards[m.id], now)).sort((a, b) => urgency(s.cards[b.id], now) - urgency(s.cards[a.id], now))
  const fresh = all.filter(m => !s.cards[m.id]).sort((a, b) => b.at.localeCompare(a.at) || a.ply - b.ply)
  return [...due, ...fresh].slice(0, limit)
}

export type MistakeCounts = { total: number; due: number; fresh: number; learned: number }
export function countMistakes(s: MistakeStore, now: number): MistakeCounts {
  const all = Object.values(s.items)
  const c: MistakeCounts = { total: all.length, due: 0, fresh: 0, learned: 0 }
  for (const m of all) {
    const card = s.cards[m.id]
    if (!card) c.fresh++
    else { if (isDue(card, now)) c.due++; if (mastery(card) === 'learned') c.learned++ }
  }
  return c
}

/** Результат попытки: верно с первого раза — «good», иначе — «again» (вернётся через 10 минут). */
export function gradeMistake(s: MistakeStore, id: string, ok: boolean, now: number): MistakeStore {
  if (!s.items[id]) return s
  return { ...s, cards: { ...s.cards, [id]: schedule(s.cards[id] ?? newCard(now), ok ? 'good' : 'again', now) } }
}

/** Объединение двух устройств: задачи — объединением, прогресс карточки — у той, что тренировалась позже. */
export function mergeMistakes(a: MistakeStore, b: MistakeStore): MistakeStore {
  const items = { ...b.items, ...a.items }
  const cards: Record<string, CardState> = {}
  for (const id of Object.keys(items)) {
    const x = a.cards[id], y = b.cards[id]
    const pick = x && y ? (x.last >= y.last ? x : y) : (x ?? y)
    if (pick) cards[id] = pick
  }
  return { v: 1, items, cards }
}

/** Берёт ошибки из сохранённых в браузере разборов (последние 8 партий), которых ещё нет в банке. */
export function backfillFromReviews(s: MistakeStore): MistakeStore {
  let out = s
  for (const r of listReviews()) {
    if (!r.userColor || r.evals.length !== r.ucis.length + 1) continue
    out = addMistakes(out, extractMistakes(r.startFen, r.ucis, r.evals, r.userColor, r.key, r.created_at))
  }
  return out
}

const BASE = 'chess-coach-ai:mistakes:v1'
export function loadMistakes(): MistakeStore {
  try {
    const raw = localStorage.getItem(pk(BASE))
    const d: unknown = raw ? JSON.parse(raw) : null
    const o = d as Partial<MistakeStore> | null
    if (o && o.v === 1 && o.items && typeof o.items === 'object' && o.cards && typeof o.cards === 'object') return { v: 1, items: o.items, cards: o.cards }
  } catch { /* повреждённые данные — начинаем с пустого банка */ }
  return EMPTY_MISTAKES
}
export function saveMistakes(s: MistakeStore) { try { localStorage.setItem(pk(BASE), JSON.stringify(s)) } catch { /* хранилище недоступно */ } }
