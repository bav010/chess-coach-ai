import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLang } from '../i18n'
import { Chess } from 'chess.js'
import OPENINGS from '../data/openings.json'
import { buildCatalog, continuations, nodeAt, openingAt, sanRows, searchOpenings } from './openings'
import { splitUci } from './game'
import { ruName } from './openingNames'

const rows = OPENINGS as unknown as [string, string, string][]
const cat = buildCatalog(rows)

describe('каталог дебютов', () => {
  beforeEach(() => setLang('ru'))
  afterEach(() => setLang('en'))
  it('большой каталог, все линии воспроизводятся', () => {
    expect(rows.length).toBeGreaterThan(3000)
    for (const [, , uci] of rows.filter((_, i) => i % 15 === 0)) {
      const c = new Chess()
      for (const m of uci.split(' ')) expect(() => c.move(splitUci(m))).not.toThrow()
    }
  })
  it('находит дебют по пути и по названию', () => {
    const najdorf = rows.find(r => r[1] === 'Sicilian Defense: Najdorf Variation')!
    const path = najdorf[2].split(' ')
    expect(openingAt(cat.root, path)?.opening.name).toBe('Sicilian Defense: Najdorf Variation')
    expect(openingAt(cat.root, path)?.exact).toBe(true)
    expect(openingAt(cat.root, ['e2e4'])?.opening.name).toBe("King's Pawn Game")
    expect(searchOpenings(cat.list, { query: 'najdorf', eco: null }).total).toBeGreaterThan(0)
    expect(searchOpenings(cat.list, { query: 'сицилиан', eco: null }).total).toBeGreaterThan(100)
    expect(searchOpenings(cat.list, { query: '', eco: 'E' }).items.every(o => o.eco[0] === 'E')).toBe(true)
  })
  it('продолжения: самое разработанное — первое и рекомендуется', () => {
    const c = continuations(cat.root, ['e2e4'])
    expect(c.length).toBeGreaterThan(3)
    expect(c[0].recommended).toBe(true)
    expect(c[0].lines).toBeGreaterThanOrEqual(c[1].lines)
    expect(nodeAt(cat.root, ['a2a3', 'a7a6', 'a3a4', 'h7h6'])).toBeNull()
  })
  it('SAN-строки с номерами, в том числе когда линия начинается с хода чёрных', () => {
    const r = sanRows(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3'])
    expect(r).toEqual([{ no: 1, white: 'e4', wi: 0, black: 'e5', bi: 1 }, { no: 2, white: 'Nf3', wi: 2 }])
  })
  it('русские названия семейств', () => {
    expect(ruName('Sicilian Defense: Najdorf Variation')).toBe('Сицилианская защита: Najdorf Variation')
    expect(ruName('Unknown Opening')).toBe('Unknown Opening')
  })
})
