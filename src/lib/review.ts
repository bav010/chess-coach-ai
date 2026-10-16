// Разбор завершённой партии: последовательный анализ позиций и построение отчёта.
// Для хода i нужны оценки двух позиций: до хода (она же даёт лучший ход и вариант) и после него.
// Поэтому анализируется n+1 позиций, и каждая оценка используется дважды.
import { Chess, type Color } from 'chess.js'
import type { Analysis, Engine, PvLine } from '../engine'
import { getCached, isTerminalFen, putCache } from './analysisCache'
import {
  CLASS_ORDER, DEFAULT_THRESHOLDS, classify, isBad, isCritical, moveAccuracy, sideAccuracy, winLoss,
  type MoveClass, type Thresholds,
} from './classify'
import { isBookMove } from './book'
import { sacrificeValue } from './tactics'
import { finalScore, toWhite, whiteWinPercent, winPercentFor, type Score } from './eval'
import { phaseOf, type MoveRecord, type Phase } from './game'
import type { ReviewQuality } from './prefs'
import { pvToSan, uciToSan } from './san'
import type { StoredEval } from '../storage'

/** Результат анализа позиции с точки зрения стороны, чей ход (как отдаёт движок). */
export type PositionEval = StoredEval

export const QUALITY: Record<ReviewQuality, { label: string; depth: number; movetime: number }> = {
  fast: { label: 'Быстро', depth: 12, movetime: 400 },
  normal: { label: 'Обычно', depth: 14, movetime: 800 },
  deep: { label: 'Глубоко', depth: 18, movetime: 2000 },
}

export const REVIEW_MULTIPV = 2

/** Оценка позиции (с точки зрения белых): итог для мата/пата, иначе по движку. */
export function positionScore(fen: string, ev: PositionEval): Score | null {
  let chess: Chess
  try { chess = new Chess(fen) } catch { return null }
  if (chess.isCheckmate()) return finalScore(chess.turn() === 'w' ? '0-1' : '1-0')
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return finalScore('1/2-1/2')
  const top = ev?.lines[0]
  return top ? toWhite(top, chess.turn()) : null
}

export type ReviewMove = {
  /** Номер хода в партии, с 1. */
  ply: number
  record: MoveRecord
  before: Score
  after: Score
  bestUci: string | null
  bestSan: string | null
  /** Основной вариант движка из позиции до хода. */
  pvSan: string[]
  loss: number
  cls: MoveClass
  accuracy: number
  playedIsBest: boolean
  /** Насколько лучший ход надёжнее второго по шансам на победу (п. п.); null, если второй линии нет. */
  gapToSecond: number | null
  /** Материал, отданный в варианте движка (0 — жертвы нет). */
  sacrifice: number
  /** Ход входит во встроенный список дебютных линий. */
  book: boolean
  /** Предыдущий ход соперника был ошибкой (или хуже) — важно для «упущенного шанса». */
  opponentErred: boolean
  phase: Phase
}

export type SideCounts = Record<MoveClass, number>

export type PhaseStat = { phase: Phase; white: number | null; black: number | null; whiteMoves: number; blackMoves: number }

export type ReviewReport = {
  moves: ReviewMove[]
  accuracy: Record<Color, number | null>
  counts: Record<Color, SideCounts>
  /** Хронологически: ошибки, грубые ошибки и упущенные маты. */
  keyMoments: ReviewMove[]
  bestDecisions: ReviewMove[]
  worstDecisions: ReviewMove[]
  /** Ходы, после которых шансы белых изменились на SWING_MIN п. п. и больше. */
  swings: ReviewMove[]
  phases: PhaseStat[]
  /** Шансы белых на победу в позициях 0..n (для графика); null — позиция не анализировалась. */
  graph: (number | null)[]
}

export const SWING_MIN = 15

/** Контекст хода, нужный для особых оценок. */
export type MoveContext = {
  /** Предыдущий ход (соперника) и его потеря — для «упущенного шанса» и отсева простых взятий. */
  prevRecord?: MoveRecord | null
  prevLoss?: number | null
}

/**
 * Оценка одного хода по анализу позиций до и после него. Единая для живого анализа и разбора.
 * Возвращает null, если для какой-то из позиций нет оценки.
 *
 * Оценки в духе chess.com (критерии приблизительные и описаны в README):
 *  — лучший: совпал с первой линией движка; отличный: потеря ≤ порога «лучшего»; хороший: ниже порога неточности;
 *  — неточность / ошибка / зевок: по потере шансов на победу;
 *  — упущенный шанс: потеря ≥ порога неточности, при этом соперник только что ошибся (или был мат), а позиция
 *    после хода не рухнула (шансы ≥ 40%);
 *  — сильный: единственный хороший ход (второй вариант движка хуже на 15+ п. п.), не простое взятие в ответ;
 *  — блестящий: лучший ход с жертвой материала (минус ≥ 2 после первых четырёх полуходов варианта), после
 *    которого позиция не хуже равной, а до хода не была уже выигранной;
 *  — дебютный: ход из встроенного списка линий (если это не блестящий/сильный и не ошибка).
 */
export function assessMove(
  record: MoveRecord,
  index: number,
  evBefore: PositionEval,
  evAfter: PositionEval,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
  ctx: MoveContext = {},
): ReviewMove | null {
  const before = positionScore(record.fenBefore, evBefore)
  const after = positionScore(record.fenAfter, evAfter)
  if (!before || !after) return null
  const mover = record.color
  const bestUci = evBefore?.lines[0]?.pv[0] ?? null
  const playedIsBest = bestUci !== null && bestUci === record.uci
  const loss = playedIsBest ? 0 : winLoss(before, after, mover)
  const second = evBefore?.lines[1]
  const gapToSecond = evBefore && second
    ? winPercentFor(toWhite(evBefore.lines[0], mover), mover) - winPercentFor(toWhite(second, mover), mover)
    : null

  const winBefore = winPercentFor(before, mover)
  const winAfter = winPercentFor(after, mover)
  const own = mover === 'w' ? 1 : -1
  const hadMate = before.mate !== null && before.mate * own > 0
  const keptMate = after.mate !== null && after.mate * own > 0
  const opponentErred = (ctx.prevLoss ?? 0) >= thresholds.mistake
  const sacrifice = playedIsBest && evBefore?.lines[0] ? sacrificeValue(record.fenBefore, evBefore.lines[0].pv, mover) : 0
  const book = isBookMove(record.fenBefore, record.fenAfter, index + 1)

  let cls: MoveClass = classify(loss, playedIsBest, thresholds)
  if (cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder') {
    if ((opponentErred || (hadMate && !keptMate)) && winAfter >= 40) cls = 'miss'
  } else if (playedIsBest) {
    const recapture = !!record.captured && !!ctx.prevRecord?.captured && ctx.prevRecord.to === record.to
    if (sacrifice >= 2 && winAfter >= 45 && winBefore < 90 && !hadMate) cls = 'brilliant'
    else if (gapToSecond !== null && gapToSecond >= 15 && winBefore < 85 && !hadMate && !recapture) cls = 'great'
  }
  if (book && (cls === 'best' || cls === 'excellent' || cls === 'good')) cls = 'book'

  return {
    ply: index + 1,
    record,
    before,
    after,
    bestUci,
    bestSan: uciToSan(record.fenBefore, bestUci),
    pvSan: evBefore?.lines[0] ? pvToSan(record.fenBefore, evBefore.lines[0].pv, 8) : [],
    loss,
    cls,
    accuracy: moveAccuracy(loss),
    playedIsBest,
    gapToSecond,
    sacrifice,
    book,
    opponentErred,
    phase: phaseOf(record.fenBefore, index),
  }
}

export function buildReport(
  startFen: string,
  records: readonly MoveRecord[],
  evals: readonly PositionEval[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): ReviewReport {
  const moves: ReviewMove[] = []
  const fens = [startFen, ...records.map(r => r.fenAfter)]
  const graph = fens.map((fen, i) => {
    const s = positionScore(fen, evals[i] ?? null)
    return s ? whiteWinPercent(s) : null
  })

  let prev: ReviewMove | null = null
  records.forEach((record, i) => {
    const m = assessMove(record, i, evals[i] ?? null, evals[i + 1] ?? null, thresholds,
      { prevRecord: i > 0 ? records[i - 1] : null, prevLoss: prev?.loss ?? null })
    if (m) moves.push(m)
    prev = m
  })

  const side = (c: Color) => moves.filter(m => m.record.color === c)
  const counts = (c: Color): SideCounts => {
    const out = Object.fromEntries(CLASS_ORDER.map(k => [k, 0])) as SideCounts
    for (const m of side(c)) out[m.cls]++
    return out
  }

  const missedMate = (m: ReviewMove) => {
    const own = m.record.color === 'w' ? 1 : -1
    return m.before.mate !== null && m.before.mate * own > 0 && !(m.after.mate !== null && m.after.mate * own > 0) && !m.playedIsBest
  }

  const phases: PhaseStat[] = (['opening', 'middlegame', 'endgame'] as Phase[]).map(phase => {
    const w = side('w').filter(m => m.phase === phase)
    const b = side('b').filter(m => m.phase === phase)
    return {
      phase,
      white: sideAccuracy(w.map(m => m.loss)),
      black: sideAccuracy(b.map(m => m.loss)),
      whiteMoves: w.length,
      blackMoves: b.length,
    }
  })

  return {
    moves,
    accuracy: { w: sideAccuracy(side('w').map(m => m.loss)), b: sideAccuracy(side('b').map(m => m.loss)) },
    counts: { w: counts('w'), b: counts('b') },
    keyMoments: moves.filter(m => isCritical(m.cls) || missedMate(m)),
    bestDecisions: moves
      .filter(m => m.cls === 'brilliant' || (m.playedIsBest && m.gapToSecond !== null && m.gapToSecond >= 10))
      .sort((a, b) => (Number(b.cls === 'brilliant') - Number(a.cls === 'brilliant')) || ((b.gapToSecond ?? 0) - (a.gapToSecond ?? 0)))
      .slice(0, 3),
    worstDecisions: moves
      .filter(m => isBad(m.cls))
      .sort((a, b) => b.loss - a.loss).slice(0, 3),
    swings: moves
      .filter(m => Math.abs(whiteWinPercent(m.after) - whiteWinPercent(m.before)) >= SWING_MIN)
      .sort((a, b) =>
        Math.abs(whiteWinPercent(b.after) - whiteWinPercent(b.before)) -
        Math.abs(whiteWinPercent(a.after) - whiteWinPercent(a.before)))
      .slice(0, 6),
    phases: phases.filter(p => p.whiteMoves + p.blackMoves >= 2),
    graph,
  }
}

/** Критические позиции для тренировки: ошибки и грубые ошибки выбранной стороны (или обеих). */
export function criticalMoves(report: ReviewReport, side: Color | 'both'): ReviewMove[] {
  return report.moves.filter(m =>
    isCritical(m.cls) && (side === 'both' || m.record.color === side))
}

function toStored(a: Analysis): PositionEval {
  return {
    depth: a.depth,
    lines: a.lines.map((l: PvLine) => ({ multipv: l.multipv, depth: l.depth, cp: l.cp, mate: l.mate, pv: l.pv.slice(0, 10) })),
  }
}

/**
 * Последовательно анализирует все позиции партии. Использует и пополняет общий кэш.
 * При отмене возвращает то, что успели посчитать (остальные позиции — null).
 */
export async function runReview(
  engine: Engine,
  startFen: string,
  records: readonly MoveRecord[],
  quality: ReviewQuality,
  onProgress: (done: number, total: number, evals: PositionEval[]) => void,
  signal: AbortSignal,
  initial: readonly PositionEval[] = [],
): Promise<PositionEval[]> {
  const q = QUALITY[quality]
  const fens = [startFen, ...records.map(r => r.fenAfter)]
  const evals: PositionEval[] = fens.map((_, i) => initial[i] ?? null)
  onProgress(evals.filter(Boolean).length, fens.length, evals)

  for (let i = 0; i < fens.length; i++) {
    if (signal.aborted) break
    if (evals[i] || isTerminalFen(fens[i])) { onProgress(i + 1, fens.length, evals); continue }
    const cached = getCached(fens[i], REVIEW_MULTIPV, q.movetime)
    if (cached) {
      evals[i] = { depth: cached.depth, lines: cached.lines.map(l => ({ ...l, pv: l.pv.slice(0, 10) })) }
    } else {
      const a = await engine.analyse(fens[i], { depth: q.depth, movetime: q.movetime, multipv: REVIEW_MULTIPV, signal })
      if (signal.aborted) break
      putCache(fens[i], a, REVIEW_MULTIPV, q.movetime, true)
      evals[i] = a.lines.length ? toStored(a) : null
    }
    onProgress(i + 1, fens.length, evals)
  }
  return evals
}
