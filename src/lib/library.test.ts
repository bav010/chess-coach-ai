import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_LIB, MAX_GAMES, asSessions, cleanNicks, colorOf, filterGames, importPgn, loadLibrary, mergeLibrary, NO_FILTER, outcomeFor, saveLibrary, splitPgn, summary } from './library'
import { deriveGame } from './gameStats'
import { parsePgn } from './pgn'

const G1 = `[Event "Rated Blitz game"]
[Site "https://lichess.org/aaaa1111"]
[Date "2026.11.02"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[WhiteElo "1500"]
[BlackElo "1480"]
[TimeControl "300+3"]

1. e4 { [%clk 0:05:00] } e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`

const G2 = `[Event "Rated Blitz game"]
[Site "https://lichess.org/bbbb2222"]
[Date "2026.11.03"]
[White "Carl"]
[Black "alice"]
[Result "0-1"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 0-1`

const G3 = `[Event "Casual"]
[Date "2026.11.04"]
[White "Alice"]
[Black "Dan"]
[Result "1/2-1/2"]

1. e4 c5 2. Nf3 d6 1/2-1/2`

const MANY = `${G1}\n\n${G2}\n\n${G3}\n`

beforeEach(() => {
  const m = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear() })
})

describe('splitPgn', () => {
  it('делит несколько партий и игнорирует пустой ввод', () => {
    expect(splitPgn(MANY)).toHaveLength(3)
    expect(splitPgn('   \n ')).toEqual([])
    expect(splitPgn(MANY.replace(/\n/g, '\r\n'))).toHaveLength(3)
  })
  it('одна партия остаётся одной', () => { expect(splitPgn(G1)).toHaveLength(1) })
})

describe('importPgn', () => {
  it('читает партии, чистит комментарии и сортирует по дате (новые сверху)', () => {
    const r = importPgn(EMPTY_LIB, MANY)
    expect(r.added).toBe(3); expect(r.failed).toBe(0); expect(r.duplicates).toBe(0)
    expect(r.store.games.map(g => g.black)).toEqual(['Dan', 'alice', 'Bob'])
    expect(r.store.games[0].date).toBe('2026-11-04')
    const g1 = r.store.games.find(g => g.black === 'Bob')!
    expect(g1).toMatchObject({ result: '1-0', whiteElo: 1500, blackElo: 1480, tc: '300+3', plies: 10 })
    expect(g1.pgn).not.toContain('%clk')
    expect(parsePgn(g1.pgn).ucis).toHaveLength(10)
  })
  it('повторный импорт не дублирует партии', () => {
    const a = importPgn(EMPTY_LIB, MANY).store
    const b = importPgn(a, G1)
    expect(b.added).toBe(0); expect(b.duplicates).toBe(1); expect(b.store.games).toHaveLength(3)
  })
  it('считает нечитаемые партии и не падает', () => {
    const r = importPgn(EMPTY_LIB, `${G1}\n\n[Event "x"]\n[White "a"]\n\nthis is not chess\n`)
    expect(r.added).toBe(1); expect(r.failed).toBe(1)
  })
  it('незавершённая партия получает результат in_progress', () => {
    const r = importPgn(EMPTY_LIB, '[Event "x"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n1. e4 e5 *')
    expect(r.store.games[0].result).toBe('in_progress')
  })
  it('ограничивает размер библиотеки', () => {
    let store = EMPTY_LIB
    const lines: string[] = []
    for (let i = 0; i < MAX_GAMES + 5; i++) lines.push(`[Event "g${i}"]\n[Date "2026.01.01"]\n[White "w${i}"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 ${i % 2 ? 'Nc6' : 'd6'} ${i % 3 ? '3. Bc4' : '3. Bb5'} ${['Bc5', 'Nf6', 'a6', 'h6', 'Be7', 'd6', 'g6'][i % 7]} 1-0`)
    // партии отличаются ходами не всегда — повторы отсеются, но размер не должен превышать лимит
    store = importPgn(store, lines.join('\n\n')).store
    expect(store.games.length).toBeLessThanOrEqual(MAX_GAMES)
  })
})

describe('сторона и результат по нику', () => {
  const nicks = ['alice']
  const games = importPgn(EMPTY_LIB, MANY).store.games
  it('ник сравнивается без учёта регистра', () => {
    expect(colorOf({ white: 'Alice', black: 'Bob' }, nicks)).toBe('w')
    expect(colorOf({ white: 'Carl', black: 'alice' }, nicks)).toBe('b')
    expect(colorOf({ white: 'Carl', black: 'Dan' }, nicks)).toBeNull()
  })
  it('ник на обеих сторонах — сторона неизвестна', () => { expect(colorOf({ white: 'alice', black: 'ALICE' }, nicks)).toBeNull() })
  it('исход для вас', () => {
    expect(games.map(g => outcomeFor(g, nicks))).toEqual(['draw', 'win', 'win'])
  })
  it('без ника исход неизвестен', () => { expect(games.every(g => outcomeFor(g, [])  === null)).toBe(true) })
  it('сводка и фильтры', () => {
    expect(summary(games, nicks)).toMatchObject({ total: 3, w: 2, d: 1, l: 0, unknown: 0, score: 83 })
    expect(filterGames(games, nicks, { ...NO_FILTER, color: 'b' })).toHaveLength(1)
    expect(filterGames(games, nicks, { ...NO_FILTER, outcome: 'draw' })).toHaveLength(1)
    expect(filterGames(games, nicks, { ...NO_FILTER, q: 'carl' })).toHaveLength(1)
    expect(filterGames(games, nicks, { ...NO_FILTER, q: '2026-11-0' })).toHaveLength(3)
  })
  it('cleanNicks убирает пустые и повторы', () => {
    expect(cleanNicks([' Alice ', 'alice', '', 'Bob'])).toEqual(['Alice', 'Bob'])
    expect(cleanNicks(['a', 'b', 'c', 'd', 'e', 'f'])).toHaveLength(5)
  })
})

describe('asSessions — подключение к «Моим дебютам»', () => {
  it('ваша сторона подписана «You», и deriveGame видит цвет и исход', () => {
    const store = { ...importPgn(EMPTY_LIB, MANY).store, nicks: ['Alice'] }
    const ses = asSessions(store)
    expect(ses).toHaveLength(3)
    const stats = ses.map(s => deriveGame(s)!)
    expect(stats.map(s => s.color).sort()).toEqual(['b', 'w', 'w'])
    expect(stats.filter(s => s.outcome === 'win')).toHaveLength(2)
  })
  it('без ника сторона неизвестна — в дебютах не учитывается', () => {
    const ses = asSessions(importPgn(EMPTY_LIB, MANY).store)
    expect(ses.every(s => deriveGame(s)!.color === null)).toBe(true)
  })
})

describe('слияние и хранение', () => {
  it('mergeLibrary объединяет партии и ники без повторов', () => {
    const a = { ...importPgn(EMPTY_LIB, G1).store, nicks: ['Alice'] }
    const b = { ...importPgn(EMPTY_LIB, `${G1}\n\n${G2}`).store, nicks: ['alice', 'Bob'] }
    const m = mergeLibrary(a, b)
    expect(m.games).toHaveLength(2); expect(m.nicks).toEqual(['Alice', 'Bob'])
  })
  it('сохранение и загрузка; повреждённые данные дают пустую библиотеку', () => {
    const s = { ...importPgn(EMPTY_LIB, MANY).store, nicks: ['Alice'] }
    saveLibrary(s)
    expect(loadLibrary()).toEqual(s)
    localStorage.setItem('chess-coach-ai:library:v1', '{oops')
    expect(loadLibrary()).toEqual(EMPTY_LIB)
  })
})
