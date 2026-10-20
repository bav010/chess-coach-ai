import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLang } from '../i18n'
import { START_FEN, replay } from './game'
import { assessMove, type PositionEval } from './review'
import { explainMove } from './explain'

const line = (cp: number | null, mate: number | null, pv: string[]) => ({ multipv: 1, depth: 12, cp, mate, pv })
const ev = (cp: number | null, mate: number | null, pv: string[]): PositionEval => ({ depth: 12, lines: [line(cp, mate, pv)] })

describe('explainMove', () => {
  beforeEach(() => setLang('ru'))
  afterEach(() => setLang('en'))

  it('грубая ошибка с разрешённым матом: только проверяемые факты', () => {
    const r = replay(START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    const m = assessMove(r.records[2], 2, ev(-90, null, ['d2d4']), ev(null, 1, ['d8h4']))!
    const text = explainMove(m).join(' ')
    expect(m.cls).toBe('blunder')
    expect(text).toContain('Сыгран ход g4')
    expect(text).toContain('Движок рекомендовал d4')
    expect(text).toContain('мат в 1')
  })
  it('лучший ход — только ход и изменение оценки', () => {
    const r = replay('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', ['e1d2'])
    const m = assessMove(r.records[0], 0, ev(30, null, ['e1d2']), ev(-30, null, ['e8e7']))!
    expect(m.cls).toBe('best')
    expect(explainMove(m)).toHaveLength(2)
  })
  it('дебютный ход получает пометку о теории', () => {
    const r = replay(START_FEN, ['e2e4'])
    const m = assessMove(r.records[0], 0, ev(30, null, ['e2e4']), ev(-30, null, ['e7e5']))!
    expect(m.cls).toBe('book')
    expect(explainMove(m).join(' ')).toContain('дебютной теории')
  })
  it('упущенный мат', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
    const r = replay(fen, ['g1h1'])
    const m = assessMove(r.records[0], 0, ev(null, 1, ['a1a8']), ev(0, null, ['g8h8']))!
    expect(explainMove(m).join(' ')).toContain('Был мат в 1')
    expect(explainMove(m).join(' ')).toContain('Лучший ход ставит мат')
  })
  it('без оценок — null (нечего объяснять)', () => {
    const r = replay(START_FEN, ['e2e4'])
    expect(assessMove(r.records[0], 0, null, null)).toBeNull()
  })
})

describe('explainMove (English)', () => {
  beforeEach(() => setLang('en'))
  it('builds the same facts in English', () => {
    const r = replay(START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    const m = assessMove(r.records[2], 2, ev(-90, null, ['d2d4']), ev(null, 1, ['d8h4']))!
    const text = explainMove(m).join(' ')
    expect(text).toContain('Move g4 played (White): blunder.')
    expect(text).toContain('The engine recommended d4')
    expect(text).toContain('mate in 1')
  })
  it('language switch changes texts of the same move without recomputation', () => {
    const r = replay(START_FEN, ['e2e4'])
    const m = assessMove(r.records[0], 0, ev(30, null, ['e2e4']), ev(-30, null, ['e7e5']))!
    const en = explainMove(m).join(' ')
    setLang('ru')
    const ru = explainMove(m).join(' ')
    setLang('en')
    expect(en).toContain('opening theory')
    expect(ru).toContain('дебютной теории')
  })
})
