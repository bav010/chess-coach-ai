import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { MAX_ITEMS, addMistakes, countMistakes, EMPTY_MISTAKES, extractMistakes, gradeMistake, mergeMistakes, planMistakes, type MistakeItem } from './mistakes'
import { replay } from './game'

const item = (n: number, at = '2026-01-01T00:00:00Z'): MistakeItem => ({ id: `g#${n}`, gameKey: 'g', ply: n, fen: new Chess().fen(), color: 'w', bestUci: 'e2e4', bestSan: 'e4', playedSan: 'a3', cls: 'mistake', loss: 12, at })
const NOW = 1_000_000_000_000

describe('банк ошибок', () => {
  it('не дублирует и не перезаписывает', () => {
    const a = addMistakes(EMPTY_MISTAKES, [item(1), item(2)])
    const b = addMistakes(a, [{ ...item(1), loss: 99 }])
    expect(b).toBe(a)
    expect(Object.keys(b.items)).toHaveLength(2)
  })
  it('новые идут от свежих партий к старым', () => {
    const s = addMistakes(EMPTY_MISTAKES, [item(1, '2026-01-01'), { ...item(2, '2026-02-01') }])
    expect(planMistakes(s, NOW).map(m => m.id)).toEqual(['g#2', 'g#1'])
  })
  it('верный ответ откладывает, неверный возвращает через 10 минут', () => {
    let s = addMistakes(EMPTY_MISTAKES, [item(1)])
    s = gradeMistake(s, 'g#1', true, NOW)
    expect(s.cards['g#1'].due).toBeGreaterThan(NOW + 3_600_000)
    expect(planMistakes(s, NOW)).toHaveLength(0)
    expect(planMistakes(s, NOW + 2 * 86_400_000)).toHaveLength(1)
    s = gradeMistake(s, 'g#1', false, NOW)
    expect(s.cards['g#1'].due).toBe(NOW + 600_000)
  })
  it('счётчики', () => {
    let s = addMistakes(EMPTY_MISTAKES, [item(1), item(2), item(3)])
    s = gradeMistake(s, 'g#1', true, NOW)
    s = gradeMistake(s, 'g#2', false, NOW)
    expect(countMistakes(s, NOW + 700_000)).toEqual({ total: 3, due: 1, fresh: 1, learned: 0 })
  })
  it('оценка неизвестной задачи ничего не меняет', () => {
    expect(gradeMistake(EMPTY_MISTAKES, 'nope', true, NOW)).toBe(EMPTY_MISTAKES)
  })
  it('лимит: сначала уходят выученные, затем самые старые', () => {
    const many = Array.from({ length: MAX_ITEMS }, (_, i) => item(i, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`))
    let s = addMistakes(EMPTY_MISTAKES, many)
    s = { ...s, cards: { 'g#5': { ivl: 30, ease: 2.5, due: NOW + 1, reps: 4, lapses: 0, correct: 4, wrong: 0, last: NOW } } }
    s = addMistakes(s, [item(900, '2026-03-01')])
    expect(Object.keys(s.items)).toHaveLength(MAX_ITEMS)
    expect(s.items['g#5']).toBeUndefined()
    expect(s.items['g#900']).toBeDefined()
  })
  it('слияние: задачи объединяются, прогресс берётся у более свежей карточки', () => {
    const a = gradeMistake(addMistakes(EMPTY_MISTAKES, [item(1)]), 'g#1', true, NOW)
    const b = gradeMistake(addMistakes(EMPTY_MISTAKES, [item(1), item(2)]), 'g#1', false, NOW + 5)
    const m = mergeMistakes(a, b)
    expect(Object.keys(m.items).sort()).toEqual(['g#1', 'g#2'])
    expect(m.cards['g#1'].wrong).toBe(1)
  })
})

describe('extractMistakes', () => {
  it('без цвета пользователя ничего не извлекает', () => {
    expect(extractMistakes(new Chess().fen(), [], [], null, 'k', 'x')).toEqual([])
  })
  it('находит ошибку, если лучший ход известен', () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#: чёрные ошиблись; оценки заданы вручную
    const start = new Chess().fen()
    const ucis = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']
    const { records } = replay(start, ucis)
    expect(records).toHaveLength(7)
    const ev = (cp: number, best: string) => ({ depth: 12, lines: [{ multipv: 1, depth: 12, cp, mate: null, pv: [best] }, { multipv: 2, depth: 12, cp: cp - 300, mate: null, pv: ['a7a6'] }] })
    // оценки с точки зрения стороны, чей ход: после 5...Nf6 чёрные должны были играть g7g6 (cp 0), а после ошибки ход белых даёт мат
    const evals = [ev(30, 'e2e4'), ev(-30, 'e7e5'), ev(30, 'g1f3'), ev(-30, 'b8c6'), ev(30, 'g1f3'), ev(-20, 'g7g6'),
      { depth: 12, lines: [{ multipv: 1, depth: 12, cp: null, mate: 1, pv: ['h5f7'] }] }, { depth: 0, lines: [] }]
    const found = extractMistakes(start, ucis, evals as never, 'b', 'k', '2026-01-01')
    expect(found.every(m => m.color === 'b' && m.id.startsWith('k#'))).toBe(true)
    expect(found.map(m => [m.ply, m.cls, m.bestUci])).toEqual([[6, 'blunder', 'g7g6']])
    for (const m of found) expect(m.bestUci).not.toBe(records[m.ply - 1].uci)
  })
})
