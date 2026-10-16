import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { START_FEN, captures, chessAtPly, fenAtPly, hasMatingMaterial, phaseOf, replay, statusOf } from './game'

const uci = (s: string) => s.split(' ')

describe('replay', () => {
  it('строит записи ходов с SAN и позициями', () => {
    const r = replay(START_FEN, uci('e2e4 e7e5 g1f3'))
    expect(r.records.map(m => m.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(r.records[0].fenBefore).toBe(START_FEN)
    expect(r.records[2].color).toBe('w')
    expect(r.rejected).toBe(0)
  })
  it('отбрасывает нелегальные ходы и всё после них', () => {
    const r = replay(START_FEN, uci('e2e4 e2e4 d7d5'))
    expect(r.records).toHaveLength(1)
    expect(r.rejected).toBe(2)
  })
  it('fenAtPly возвращает позицию на нужном полуходе', () => {
    const r = replay(START_FEN, uci('e2e4 e7e5'))
    expect(fenAtPly(START_FEN, r.records, 0)).toBe(START_FEN)
    expect(fenAtPly(START_FEN, r.records, 1)).toBe(r.records[0].fenAfter)
    expect(fenAtPly(START_FEN, r.records, 99)).toBe(r.records[1].fenAfter)
  })
})

describe('captures и материальный баланс', () => {
  it('считает обычные взятия', () => {
    // 1.e4 d5 2.exd5 Qxd5 — белые взяли пешку, чёрные взяли пешку
    const r = replay(START_FEN, uci('e2e4 d7d5 e4d5 d8d5'))
    const c = captures(r.records)
    expect(c.byWhite).toEqual(['p'])
    expect(c.byBlack).toEqual(['p'])
    expect(c.balance).toBe(0)
  })
  it('учитывает взятие на проходе', () => {
    const r = replay(START_FEN, uci('e2e4 a7a6 e4e5 d7d5 e5d6'))
    expect(r.records[4].captured).toBe('p')
    const c = captures(r.records)
    expect(c.byWhite).toEqual(['p'])
    expect(c.balance).toBe(1)
  })
  it('баланс: плюс — белым, минус — чёрным; ферзь = 9, ладья = 5', () => {
    // белые теряют ферзя за пешку
    const r = replay('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', uci('d1d5 e8d8'))
    expect(captures(r.records).balance).toBe(1)
    // ладья (5) берёт ферзя (9), король берёт ладью: белые взяли 5, чёрные взяли 9
    const r2 = replay('4k3/3r4/8/8/8/8/8/3QK3 b - - 0 1', uci('d7d1 e1d1'))
    expect(captures(r2.records).balance).toBe(-4)
  })
  it('пересчитывается для любого полухода (отмена и навигация)', () => {
    const r = replay(START_FEN, uci('e2e4 d7d5 e4d5 d8d5'))
    expect(captures(r.records, 2).balance).toBe(0)
    expect(captures(r.records, 3).balance).toBe(1)
    expect(captures(r.records, 0).byWhite).toEqual([])
  })
  it('баланс не зависит от оценки движка и не считает короля', () => {
    const r = replay('4k3/8/8/8/8/8/3r4/3QK3 w - - 0 1', uci('d1d2 e8d8'))
    expect(captures(r.records).balance).toBe(5)
  })
})

describe('статус партии', () => {
  it('мат', () => {
    const r = replay(START_FEN, uci('f2f3 e7e5 g2g4 d8h4'))
    expect(statusOf(r.chess)).toEqual({ over: true, result: '0-1', reason: 'checkmate' })
  })
  it('пат', () => {
    const c = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(statusOf(c)).toEqual({ over: true, result: '1/2-1/2', reason: 'stalemate' })
  })
  it('недостаточный материал', () => {
    expect(statusOf(new Chess('8/8/8/4k3/8/3K4/8/8 w - - 0 1'))).toMatchObject({ over: true, reason: 'insufficient' })
  })
  it('троекратное повторение (по истории ходов)', () => {
    const r = replay(START_FEN, uci('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8'))
    expect(statusOf(r.chess)).toMatchObject({ over: true, reason: 'threefold' })
    // после двух повторений ещё не ничья
    expect(statusOf(chessAtPly(START_FEN, uci('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8'), 4)).over).toBe(false)
  })
  it('правило 50 ходов', () => {
    const c = new Chess('8/8/4k3/8/8/4K3/8/R7 w - - 100 80')
    expect(statusOf(c)).toMatchObject({ over: true, reason: 'fifty' })
  })
  it('игра продолжается в обычной позиции', () => {
    expect(statusOf(new Chess()).over).toBe(false)
  })
})

describe('hasMatingMaterial (падение флага)', () => {
  const has = (fen: string, c: 'w' | 'b') => hasMatingMaterial(new Chess(fen), c)
  it('голый король и один конь/слон — недостаточно', () => {
    expect(has('4k3/8/8/8/8/8/8/3NK3 w - - 0 1', 'w')).toBe(false)
    expect(has('4k3/8/8/8/8/8/8/3BK3 w - - 0 1', 'w')).toBe(false)
  })
  it('пешка, ладья, ферзь — достаточно', () => {
    expect(has('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'w')).toBe(true)
    expect(has('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'w')).toBe(true)
  })
  it('слон + конь достаточно; два слона: нет, если поля одного цвета', () => {
    expect(has('4k3/8/8/8/8/8/8/2BNK3 w - - 0 1', 'w')).toBe(true)
    expect(has('4k3/8/8/8/8/4B3/8/2B1K3 w - - 0 1', 'w')).toBe(false) // c1 и e3 — поля одного цвета
    expect(has('4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1', 'w')).toBe(true) // c1 и f1 — разных цветов
  })
})

describe('phaseOf', () => {
  it('дебют, миттельшпиль, эндшпиль', () => {
    expect(phaseOf(START_FEN, 0)).toBe('opening')
    expect(phaseOf(START_FEN, 30)).toBe('middlegame')
    expect(phaseOf('8/8/4k3/8/8/4K3/8/R7 w - - 0 1', 5)).toBe('endgame')
  })
})
