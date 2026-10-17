import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import {
  ANY_FILTER, hintFor, judgeMove, matches, pickNext, solutionSan, solverMoves, type Evaluate, type Puzzle,
} from './puzzles'
import { EMPTY_STATS, loadPuzzleStats, recordOutcome, savePuzzleStats, successPercent, weakThemes } from './puzzleStats'
import { detectThemes } from './puzzleThemes'
import PUZZLES from '../data/puzzles.json'

// Мат в 1: ладья a1-a8
const M1: Puzzle = { id: 'm1', fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', line: ['a1a8'], themes: ['mate'], kind: 'mate', mate: 1, level: 1, cp: null, why: [] }
// Мат в 2 (Qg7+? нет) — простая задача: король f6, ферзь, ладья
const M2: Puzzle = { id: 'm2', fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', line: ['g1g7'], themes: ['mate'], kind: 'mate', mate: 1, level: 1, cp: null, why: [] }
const never: Evaluate = async () => { throw new Error('движок не должен вызываться') }

describe('judgeMove: сохранённое решение и мат', () => {
  it('верный ход по решению принимается без движка', async () => {
    const j = await judgeMove(M1, [], M1.fen, 'a1a8', never)
    expect(j).toEqual({ type: 'correct', reply: null, done: true, alt: false })
  })
  it('другой мат тоже принимается (проверка шахматной библиотекой)', async () => {
    const fen = '6k1/5ppp/8/8/8/8/1R6/R3K3 w - - 0 1'
    const p: Puzzle = { ...M1, fen, line: ['a1a8'] }
    const j = await judgeMove(p, [], fen, 'b2b8', never)
    expect(j.type).toBe('correct')
  })
  it('неверный ход в задаче «мат в 1» — ошибка, не успех', async () => {
    const j = await judgeMove(M1, [], M1.fen, 'a1a2', never)
    expect(j.type).toBe('wrong')
  })
  it('недопустимый ход — ошибка', async () => {
    expect((await judgeMove(M1, [], M1.fen, 'a1h8', never)).type).toBe('wrong')
  })
  it('если движок недоступен, неизвестный ход не засчитывается', async () => {
    const p: Puzzle = { ...M1, mate: 2, line: ['a1a8', 'g8h8', 'a8a7'] }
    const j = await judgeMove(p, [], M1.fen, 'e1e2', never)
    expect(j.type).toBe('unverified')
  })
})

describe('judgeMove: мат в 2 и альтернативы', () => {
  // Белые: Rb1? Подбираем позицию: Kg6, Rb1; чёрный Kh8 — Rb8# (мат в 1) …
  const p2: Puzzle = {
    id: 'x', fen: '7k/8/6K1/8/8/8/8/1R6 w - - 0 1', line: ['b1b7', 'h8g8', 'b7b8'], themes: ['mate', 'mateCombo'], kind: 'mate', mate: 2, level: 2, cp: null, why: [],
  }
  it('первый ход решения → ответ соперника, ещё не конец', async () => {
    const j = await judgeMove(p2, [], p2.fen, 'b1b7', never)
    expect(j).toEqual({ type: 'correct', reply: 'h8g8', done: false, alt: false })
  })
  it('второй ход решения заканчивает задачу', async () => {
    const j = await judgeMove(p2, ['b1b7', 'h8g8'], new Chess(p2.fen).fen() && (() => { const c = new Chess(p2.fen); c.move({ from: 'b1', to: 'b7' }); c.move({ from: 'h8', to: 'g8' }); return c.fen() })(), 'b7b8', never)
    expect(j).toMatchObject({ type: 'correct', done: true })
  })
  it('альтернативный первый ход принимается, только если движок видит мат не длиннее', async () => {
    const ok: Evaluate = async () => ({ cp: null, mate: -1, bestMove: 'h8g8' })
    const bad: Evaluate = async () => ({ cp: -50, mate: null, bestMove: 'h8g8' })
    const slow: Evaluate = async () => ({ cp: null, mate: -3, bestMove: 'h8g8' })
    expect((await judgeMove(p2, [], p2.fen, 'b1b6', ok)).type).toBe('correct')
    expect((await judgeMove(p2, [], p2.fen, 'b1b6', bad)).type).toBe('wrong')
    expect((await judgeMove(p2, [], p2.fen, 'b1b6', slow)).type).toBe('wrong')
  })
})

describe('judgeMove: выигрыш материала и защита', () => {
  const win: Puzzle = { id: 'w', fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', line: ['d1d5'], themes: ['fork'], kind: 'win', mate: null, level: 1, cp: 900, why: [] }
  it('альтернатива с таким же выигрышем принимается, с потерей — нет', async () => {
    const good: Evaluate = async () => ({ cp: -880, mate: null, bestMove: null })
    const poor: Evaluate = async () => ({ cp: -50, mate: null, bestMove: null })
    expect((await judgeMove(win, [], win.fen, 'd1d2', good)).type).toBe('correct')
    expect((await judgeMove(win, [], win.fen, 'd1d2', poor)).type).toBe('wrong')
  })
  it('в защите допустим любой ход, сохраняющий оценку', async () => {
    const def: Puzzle = { ...win, kind: 'defense', cp: 0, themes: ['defense'] }
    const keeps: Evaluate = async () => ({ cp: 20, mate: null, bestMove: 'e8d8' })
    const loses: Evaluate = async () => ({ cp: 600, mate: null, bestMove: 'e8d8' })
    expect((await judgeMove(def, [], def.fen, 'e1e2', keeps)).type).toBe('correct')
    expect((await judgeMove(def, [], def.fen, 'e1e2', loses)).type).toBe('wrong')
  })
})

describe('подсказки', () => {
  it('идут от общей идеи к полю и к самому ходу', () => {
    const h1 = hintFor(M1, M1.fen, 1)
    const h2 = hintFor(M1, M1.fen, 2)
    const h3 = hintFor(M1, M1.fen, 3)
    expect(h1.text).toMatch(/мат в 1/)
    expect(h1.text).not.toMatch(/a8/)
    expect(h2.square).toBe('a1')
    expect(h2.text).not.toMatch(/a8/)
    expect(h3.target).toBe('a8')
    expect(h3.text).toMatch(/Ra8#/)
  })
  it('решение записывается ходами', () => {
    expect(solutionSan(M1)).toBe('1.Ra8#')
    expect(solverMoves(M1)).toBe(1)
  })
})

describe('фильтры и выбор', () => {
  const ps: Puzzle[] = [M1, { ...M2, id: 'f', themes: ['fork'], kind: 'win', mate: null, level: 2 }]
  it('фильтрует по теме, сложности и типу', () => {
    expect(matches(M1, { ...ANY_FILTER, theme: 'fork' })).toBe(false)
    expect(matches(ps[1], { ...ANY_FILTER, theme: 'fork' })).toBe(true)
    expect(matches(M1, { ...ANY_FILTER, mate: 'm1' })).toBe(true)
    expect(matches(M1, { ...ANY_FILTER, mate: 'material' })).toBe(false)
    expect(matches(ps[1], { ...ANY_FILTER, level: 2 })).toBe(true)
  })
  it('сначала предлагает нерешённые и не повторяет текущую', () => {
    const s = recordOutcome(EMPTY_STATS, { puzzleId: 'm1', themes: ['mate'], result: 'solved', hintsUsed: 0, timeMs: 1000 })
    expect(pickNext(ps, ANY_FILTER, s, null)?.id).toBe('f')
    expect(pickNext(ps, ANY_FILTER, EMPTY_STATS, 'm1')?.id).toBe('f')
    expect(pickNext(ps, { ...ANY_FILTER, theme: 'pin' }, EMPTY_STATS, null)).toBeNull()
  })
})

describe('статистика', () => {
  it('ошибка не засчитывается как успех; решение — засчитывается', () => {
    let s = recordOutcome(EMPTY_STATS, { puzzleId: 'a', themes: ['fork'], result: 'failed', hintsUsed: 0, timeMs: 5000 })
    expect(s.solved).toBe(0); expect(s.attempted).toBe(1); expect(successPercent(s)).toBe(0)
    s = recordOutcome(s, { puzzleId: 'b', themes: ['fork', 'pin'], result: 'solved', hintsUsed: 1, timeMs: 7000 })
    expect(s.solved).toBe(1); expect(s.clean).toBe(0); expect(successPercent(s)).toBe(50)
    expect(s.byTheme.fork).toMatchObject({ tried: 2, solved: 1 })
    expect(s.timeMs).toBe(12000)
    expect(s.failedIds).toEqual(['a']); expect(s.solvedIds).toEqual(['b'])
  })
  it('слабые темы — по низкому проценту, при достаточном числе попыток', () => {
    let s = EMPTY_STATS
    for (const r of ['failed', 'failed', 'solved'] as const) s = recordOutcome(s, { puzzleId: r + Math.random(), themes: ['pin'], result: r, hintsUsed: 0, timeMs: 1 })
    s = recordOutcome(s, { puzzleId: 'z', themes: ['fork'], result: 'failed', hintsUsed: 0, timeMs: 1 })
    const w = weakThemes(s)
    expect(w.map(x => x.theme)).toEqual(['pin'])
    expect(w[0].percent).toBe(33)
  })
  it('сохраняется и читается из localStorage (перезапуск)', () => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    const s = recordOutcome(EMPTY_STATS, { puzzleId: 'a', themes: ['fork'], result: 'solved', hintsUsed: 0, timeMs: 4000 })
    savePuzzleStats(s)
    expect(loadPuzzleStats()).toEqual(s)
    store.set('chess-coach-ai:puzzles:v1', '{битый json')
    expect(loadPuzzleStats()).toEqual(EMPTY_STATS)
  })
})

describe('определение тем', () => {
  it('вилка конём: ход Nc7+ атакует короля и ладью', () => {
    const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'
    const d = detectThemes(fen, ['d5c7', 'e8d8', 'c7a8'], { mate: null })
    expect(d.themes).toContain('fork')
  })
  it('связка: слон связывает коня с королём и затем выигрывает его', () => {
    const d = detectThemes('4k3/3n4/8/8/8/8/4B3/4K3 w - - 0 1', ['e2b5', 'e8f8', 'b5d7'], { mate: null })
    expect(d.themes).toContain('pin')
    expect(d.explain.join(' ')).toMatch(/Связка/)
  })
  it('без выигрыша связанной фигуры связка не объявляется', () => {
    const d = detectThemes('4k3/3n4/8/8/8/8/4B3/4K3 w - - 0 1', ['e2b5', 'e8f8', 'e1d1'], { mate: null })
    expect(d.themes).not.toContain('pin')
  })
})

describe('база задач', () => {
  const puzzles = PUZZLES as unknown as Puzzle[]
  it('не пуста, id уникальны, все решения легальны и заканчиваются матом/выигрышем', () => {
    expect(puzzles.length).toBeGreaterThan(30)
    expect(new Set(puzzles.map(p => p.id)).size).toBe(puzzles.length)
    for (const p of puzzles) {
      const c = new Chess(p.fen)
      for (const u of p.line) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      if (p.kind === 'mate') expect(c.isCheckmate(), p.id).toBe(true)
      expect(p.themes.length, p.id).toBeGreaterThan(0)
      expect(p.why.length, p.id).toBeGreaterThan(0)
    }
  })
  it('есть задачи для каждой темы, сложности и длины мата', () => {
    for (const t of ['fork', 'pin', 'doubleAttack', 'discovered', 'deflection', 'mateCombo', 'defense'] as const) {
      expect(puzzles.filter(p => p.themes.includes(t)).length, t).toBeGreaterThan(0)
    }
    for (const l of [1, 2, 3]) expect(puzzles.filter(p => p.level === l).length, `level ${l}`).toBeGreaterThan(0)
    for (const m of [1, 2, 3]) expect(puzzles.filter(p => p.mate === m).length, `mate ${m}`).toBeGreaterThan(0)
  })
})
