import { describe, expect, it } from 'vitest'
import { setLang } from '../i18n'
import { START_FEN } from './game'
import { parsePgn, toPgn } from './pgn'

describe('parsePgn', () => {
  it('читает ходы и заголовки', () => {
    const r = parsePgn('[White "Иван"]\n[Black "Пётр"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0')
    expect(r.ucis).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6'])
    expect(r.white).toBe('Иван')
    expect(r.result).toBe('1-0')
    expect(r.startFen).toBe(START_FEN)
  })
  it('поддерживает превращение и рокировку', () => {
    const r = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6')
    expect(r.ucis).toContain('e1g1')
    const p = parsePgn('[SetUp "1"]\n[FEN "8/P6k/8/8/8/8/8/K7 w - - 0 1"]\n\n1. a8=Q+ Kg7')
    expect(p.ucis[0]).toBe('a7a8q')
    expect(p.startFen).toBe('8/P6k/8/8/8/8/8/K7 w - - 0 1')
  })
  it('понятные ошибки', () => {
    expect(() => parsePgn('')).toThrow(/Paste a PGN/)
    setLang('ru')
    expect(() => parsePgn('')).toThrow(/Вставьте/)
    setLang('en')
    expect(() => parsePgn('это не PGN')).toThrow()
    expect(() => parsePgn('1. e4 e4')).toThrow(/PGN/)
  })
  it('toPgn → parsePgn возвращает те же ходы', () => {
    const ucis = ['d2d4', 'd7d5', 'c2c4']
    expect(parsePgn(toPgn(START_FEN, ucis, { White: 'A', Black: 'B' })).ucis).toEqual(ucis)
  })
})
