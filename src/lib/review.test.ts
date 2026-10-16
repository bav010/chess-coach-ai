import { describe, expect, it } from 'vitest'
import { START_FEN, replay } from './game'
import { assessMove, buildReport, criticalMoves, positionScore, type PositionEval } from './review'

// Детский «мат дурака»: 1.f3 e5 2.g4 Qh4#
const game = replay(START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
const line = (cp: number | null, mate: number | null, pv: string[], multipv = 1) => ({ multipv, depth: 12, cp, mate, pv })
const ev = (...lines: ReturnType<typeof line>[]): PositionEval => ({ depth: 12, lines })

// Оценки движка — с точки зрения стороны, чей ход
const evals: PositionEval[] = [
  ev(line(30, null, ['e2e4']), line(20, null, ['d2d4'], 2)),        // 0: белые, лучший e4
  ev(line(100, null, ['e7e5']), line(60, null, ['d7d5'], 2)),       // 1: чёрные лучше на 1.0
  ev(line(-90, null, ['d2d4']), line(-95, null, ['e2e4'], 2)),      // 2: белые немного хуже
  ev(line(null, 1, ['d8h4']), line(80, null, ['a7a6'], 2)),         // 3: чёрные ставят мат в 1
  null,                                                             // 4: мат (терминальная позиция)
]

describe('positionScore', () => {
  it('переводит оценку в точку зрения белых', () => {
    expect(positionScore(game.records[0].fenAfter, evals[1])).toEqual({ cp: -100, mate: null })
  })
  it('мат на доске — итог партии', () => {
    expect(positionScore(game.records[3].fenAfter, null)).toMatchObject({ final: '0-1' })
  })
  it('нет данных — null', () => {
    expect(positionScore(game.records[0].fenAfter, null)).toBeNull()
  })
})

describe('buildReport', () => {
  const report = buildReport(START_FEN, game.records, evals)
  it('классифицирует ходы', () => {
    const [f3, e5, g4, qh4] = report.moves
    expect(f3.loss).toBeGreaterThan(5)
    expect(['inaccuracy', 'mistake']).toContain(f3.cls)
    expect(e5.cls).toBe('best')
    expect(g4.cls).toBe('blunder')
    expect(qh4.cls).toBe('best')
    expect(qh4.playedIsBest).toBe(true)
  })
  it('сохраняет рекомендованный ход и вариант', () => {
    expect(report.moves[0].bestSan).toBe('e4')
    expect(report.moves[2].bestSan).toBe('d4')
  })
  it('считает точность и количество ошибок по сторонам', () => {
    expect(report.accuracy.w!).toBeLessThan(report.accuracy.b!)
    expect(report.counts.w.blunder).toBe(1)
    expect(report.counts.b.blunder).toBe(0)
  })
  it('ключевые моменты и неудачные решения содержат грубую ошибку', () => {
    expect(report.keyMoments.map(m => m.record.san)).toContain('g4')
    expect(report.worstDecisions[0].record.san).toBe('g4')
  })
  it('график шансов белых: от равенства к поражению', () => {
    expect(report.graph).toHaveLength(5)
    expect(report.graph[4]).toBe(0)
    expect(report.graph[0]!).toBeGreaterThan(50)
  })
  it('позиции без анализа пропускаются, а не ломают отчёт', () => {
    const partial = buildReport(START_FEN, game.records, [evals[0], null, null, null, null])
    expect(partial.moves.length).toBeLessThan(4)
  })
  it('критические позиции фильтруются по стороне', () => {
    expect(criticalMoves(report, 'w').map(m => m.record.san)).toContain('g4')
    expect(criticalMoves(report, 'b')).toHaveLength(0)
    expect(criticalMoves(report, 'both').length).toBeGreaterThanOrEqual(1)
  })
  it('пороги настраиваются и влияют на классификацию', () => {
    const strict = buildReport(START_FEN, game.records, evals, { best: 1, inaccuracy: 1, mistake: 2, blunder: 3 })
    expect(strict.moves[0].cls).toBe('blunder')
  })
})

describe('особые оценки ходов', () => {
  const ev1 = (cp: number | null, mate: number | null, pv: string[]): PositionEval => ev(line(cp, mate, pv))
  const FEN = '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1'
  const two = (best: number, second: number, pv: string[]): PositionEval => ({
    depth: 12, lines: [line(best, null, pv), line(second, null, ['e1e2'], 2)],
  })

  it('блестящий: лучший ход с жертвой коня, позиция не хуже равной', () => {
    const r = replay(FEN, ['f3d4'])
    const m = assessMove(r.records[0], 10, ev1(30, null, ['f3d4', 'e5d4', 'e1d2', 'e8e7']), ev1(-20, null, ['e8e7']))!
    expect(m.sacrifice).toBeGreaterThanOrEqual(2)
    expect(m.cls).toBe('brilliant')
  })
  it('жертва, после которой позиция проиграна, — не блестящий', () => {
    const r = replay(FEN, ['f3d4'])
    const m = assessMove(r.records[0], 10, ev1(30, null, ['f3d4', 'e5d4', 'e1d2', 'e8e7']), ev1(500, null, ['e8e7']))!
    expect(m.cls).not.toBe('brilliant')
  })
  it('сильный: единственный хороший ход', () => {
    const r = replay(FEN, ['e1d2'])
    const m = assessMove(r.records[0], 10, two(50, -400, ['e1d2']), ev1(-50, null, ['e8e7']))!
    expect(m.cls).toBe('great')
  })
  it('обычный лучший ход при близких альтернативах — просто лучший', () => {
    const r = replay(FEN, ['e1d2'])
    const m = assessMove(r.records[0], 10, two(50, 40, ['e1d2']), ev1(-50, null, ['e8e7']))!
    expect(m.cls).toBe('best')
  })
  it('упущенный шанс: соперник ошибся, а ход не использует преимущество', () => {
    const r = replay(FEN, ['e1d2'])
    const evBefore = ev1(300, null, ['f3d4'])
    const evAfter = ev1(-100, null, ['e8e7'])
    expect(assessMove(r.records[0], 10, evBefore, evAfter)!.cls).toBe('blunder')
    expect(assessMove(r.records[0], 10, evBefore, evAfter, undefined, { prevLoss: 20 })!.cls).toBe('miss')
  })
  it('в отчёте «упущенный шанс» определяется по предыдущему ходу', () => {
    const report = buildReport(START_FEN, game.records, evals)
    expect(Object.keys(report.counts.w)).toEqual(expect.arrayContaining(['brilliant', 'great', 'book', 'miss', 'blunder']))
  })
  it('дебютный ход: е4 с начальной позиции', () => {
    const r = replay(START_FEN, ['e2e4'])
    const m = assessMove(r.records[0], 0, ev1(30, null, ['e2e4']), ev1(-30, null, ['e7e5']))!
    expect(m.cls).toBe('book')
  })
})
