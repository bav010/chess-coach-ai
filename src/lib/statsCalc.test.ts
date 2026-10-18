import { describe, it, expect } from 'vitest'
import { deriveGame, upsertGame, syncFromSessions, summarizeReview, attachReview, type GameStat, type GameReview } from './gameStats'
import { applyFilters, DEFAULT_FILTERS, ratingSeries, recommend, summarize, RATING_START } from './statsCalc'
import { EMPTY_STATS } from './puzzleStats'
import { START_FEN } from './game'
import { toPgn } from './pgn'
import { parseBackup } from './backup'
import type { PositionEval } from './review'

const pgn = (ucis: string[], white: string, black: string, result: string, extra: Record<string, string> = {}) =>
  toPgn(START_FEN, ucis, { White: white, Black: black, Result: result, ...extra })

const mk = (i: number, o: Partial<GameStat> = {}): GameStat => ({
  key: `k${i}`, at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(), src: 'bot', color: 'w', result: '1-0', outcome: 'win',
  opp: 1200, tc: '-', plies: 40, endgame: false, ...o,
})
const rv = (o: Partial<GameReview> = {}): GameReview => ({
  v: 1, moves: 30, acc: 80, counts: {}, hung: 0, missed: 0, peakWin: 60, endEntry: null,
  phases: { opening: { n: 10, acc: 85, bad: 0 }, middlegame: { n: 15, acc: 78, bad: 0 }, endgame: { n: 5, acc: 80, bad: 0 } }, ...o,
})

describe('deriveGame / upsertGame', () => {
  it('партия с ботом: цвет, результат, сила бота, контроль времени', () => {
    const g = deriveGame({ created_at: '2026-10-01T10:00:00Z', result: '0-1', pgn: pgn(['e2e4', 'e7e5'], 'Вы', 'Бот (~1400)', '0-1', { TimeControl: '300+3' }) })!
    expect(g.src).toBe('bot'); expect(g.color).toBe('w'); expect(g.outcome).toBe('loss'); expect(g.opp).toBe(1400); expect(g.tc).toBe('300+3')
  })
  it('партия анализа не относится к пользователю', () => {
    const g = deriveGame({ created_at: '2026-10-01T10:00:00Z', result: '1-0', pgn: pgn(['e2e4'], '?', '?', '1-0') })!
    expect(g.src).toBe('analysis'); expect(g.outcome).toBeNull()
  })
  it('повторное сохранение той же партии не дублируется, а дополняет запись', () => {
    const a = deriveGame({ created_at: '2026-10-01T10:00:00Z', result: '1-0', pgn: pgn(['e2e4', 'e7e5'], 'Вы', 'Бот (~900)', '1-0') })!
    const b = deriveGame({ created_at: '2026-10-02T10:00:00Z', result: '1-0', pgn: pgn(['e2e4', 'e7e5'], '?', '?', '1-0') })!
    expect(a.key).toBe(b.key)
    const list = upsertGame(upsertGame([], a), b)
    expect(list).toHaveLength(1); expect(list[0].src).toBe('bot'); expect(list[0].color).toBe('w')
    expect(upsertGame(list, b)).toBe(list)
  })
  it('синхронизация сессий идемпотентна', () => {
    const s = { id: 1, created_at: '2026-10-01T10:00:00Z', result: '1-0' as const, plies: 2, pgn: pgn(['e2e4', 'e7e5'], 'Вы', 'Бот (~900)', '1-0') }
    const once = syncFromSessions([], [s, s])
    expect(once).toHaveLength(1)
    expect(syncFromSessions(once, [s])).toBe(once)
  })
})

describe('рейтинг приложения', () => {
  it('стартует с 1000, растёт за победы и падает за поражения', () => {
    const win = ratingSeries([mk(1)])
    expect(win[0].rating).toBeGreaterThan(RATING_START)
    const loss = ratingSeries([mk(1, { outcome: 'loss', result: '0-1' })])
    expect(loss[0].rating).toBeLessThan(RATING_START)
  })
  it('не зависит от порядка записей и пропускает анализ/незавершённые', () => {
    const gs = [mk(1), mk(2, { outcome: 'loss' }), mk(3, { src: 'analysis', color: null, outcome: null, opp: null }), mk(4, { outcome: null, result: 'in_progress' })]
    const a = ratingSeries(gs), b = ratingSeries([...gs].reverse())
    expect(a).toHaveLength(2); expect(a).toEqual(b)
  })
})

describe('фильтры и сводка', () => {
  const gs = [mk(1), mk(2, { color: 'b', outcome: 'loss' }), mk(3, { outcome: 'draw', tc: '300+3' }), mk(4, { src: 'analysis', color: null, outcome: null, opp: null })]
  it('по цвету, результату, режиму и периоду', () => {
    expect(applyFilters(gs, { ...DEFAULT_FILTERS, color: 'b' })).toHaveLength(1)
    expect(applyFilters(gs, { ...DEFAULT_FILTERS, result: 'win' })).toHaveLength(1)
    expect(applyFilters(gs, { ...DEFAULT_FILTERS, mode: 'analysis' })).toHaveLength(1)
    expect(applyFilters(gs, { ...DEFAULT_FILTERS, mode: 'botClock' }).map(g => g.key)).toEqual(['k3'])
    expect(applyFilters(gs, { ...DEFAULT_FILTERS, mode: 'botNoClock' })).toHaveLength(2)
    const now = Date.UTC(2026, 9, 10, 12)
    expect(applyFilters(gs, { ...DEFAULT_FILTERS, period: '7' }, now).map(g => g.key)).toEqual(['k3', 'k4'])
    expect(applyFilters(gs, { ...DEFAULT_FILTERS, period: '7' }, Date.UTC(2026, 9, 20))).toHaveLength(0)
  })
  it('победы/ничьи/поражения считаются без партий анализа', () => {
    const s = summarize(gs)
    expect(s.wdl).toEqual({ w: 1, d: 1, l: 1 }); expect(s.decided).toBe(3); expect(s.total).toBe(4); expect(s.scorePct).toBe(50)
  })
  it('ошибки на 100 ходов и средняя точность по разобранным', () => {
    const s = summarize([mk(1, { review: rv({ counts: { blunder: 2, mistake: 1 }, acc: 70 }) }), mk(2, { review: rv({ counts: { inaccuracy: 3 }, acc: 90 }) })])
    expect(s.acc).toBe(80); expect(s.reviewedMoves).toBe(60); expect(s.per100?.blunder).toBe(3.3); expect(s.errors.mistake).toBe(1)
  })
})

describe('рекомендации', () => {
  it('при малом количестве разобранных партий выводов по партиям нет', () => {
    const r = recommend([1, 2, 3].map(i => mk(i, { review: rv({ counts: { blunder: 3 }, hung: 2 }) })), EMPTY_STATS)
    expect(r.recs).toHaveLength(0); expect(r.needMore).toBe(2)
  })
  it('повторяющиеся зевки → рекомендация с основанием и списком партий', () => {
    const gs = [1, 2, 3, 4, 5, 6].map(i => mk(i, { review: rv({ counts: { blunder: i <= 4 ? 2 : 0 }, hung: i <= 3 ? 1 : 0 }) }))
    const r = recommend(gs, EMPTY_STATS)
    const b = r.recs.find(x => x.id === 'blunders')!
    expect(b.basis).toMatch(/8 зевков/); expect(b.keys).toHaveLength(4)
    expect(r.recs.find(x => x.id === 'hung')).toBeTruthy()
  })
  it('единичный зевок не даёт рекомендации', () => {
    const gs = [1, 2, 3, 4, 5, 6].map(i => mk(i, { review: rv({ counts: { blunder: i === 1 ? 1 : 0 } }) }))
    expect(recommend(gs, EMPTY_STATS).recs).toHaveLength(0)
  })
  it('нереализованное преимущество', () => {
    const gs = [1, 2, 3, 4, 5].map(i => mk(i, { outcome: i <= 3 ? 'draw' : 'win', review: rv({ peakWin: 90 }) }))
    expect(recommend(gs, EMPTY_STATS).recs.find(x => x.id === 'convert')).toBeTruthy()
  })
  it('слабая стадия партии', () => {
    const gs = [1, 2, 3, 4, 5].map(i => mk(i, { review: rv({ acc: 80, phases: { opening: { n: 10, acc: 95, bad: 0 }, middlegame: { n: 15, acc: 90, bad: 0 }, endgame: { n: 10, acc: 55, bad: 2 } } }) }))
    expect(recommend(gs, EMPTY_STATS).recs.find(x => x.id === 'phase-endgame')).toBeTruthy()
  })
})

describe('итог разбора', () => {
  it('точность и зевок считаются по ходам пользователя', () => {
    // 1.e4 e5 2.Qh5 (зевок) Nc6 3.Qxf7?? — упрощённо: оценки заданы вручную с точки зрения стороны на ходу
    const ucis = ['e2e4', 'e7e5', 'd1h5', 'b8c6']
    const ev = (cp: number): PositionEval => ({ depth: 10, lines: [{ multipv: 1, depth: 10, cp, mate: null, pv: [] }] })
    // позиции 0..4: белые на ходу (0), чёрные (1), белые (2), чёрные (3), белые (4)
    const evals = [ev(20), ev(-20), ev(-20), ev(20), ev(-900)]
    const r = summarizeReview(START_FEN, ucis, evals, 'w')!
    expect(r.moves).toBe(2)
    expect(r.counts.blunder ?? 0).toBeLessThanOrEqual(1)
    expect(r.acc).not.toBeNull()
    expect(summarizeReview(START_FEN, ucis, evals, null)).toBeNull()
    const list = attachReview([mk(1, { key: 'x' })], 'x', r)
    expect(list[0].review).toBe(r)
    expect(attachReview(list, 'missing', r)).toBe(list)
  })
})

describe('резервная копия', () => {
  it('отклоняет чужие файлы', () => {
    expect(() => parseBackup('не json')).toThrow()
    expect(() => parseBackup('{"a":1}')).toThrow(/не резервная копия/)
    expect(parseBackup('{"app":"chess-coach-ai","kind":"backup","v":1}').games).toEqual([])
  })
})
