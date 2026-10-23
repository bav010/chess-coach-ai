import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyBackup, describeBackup, makeBackup, parseBackup } from './backup'
import { loadGames, saveGames, type GameStat } from './gameStats'
import { addMistakes, loadMistakes, saveMistakes, EMPTY_MISTAKES, type MistakeItem } from './mistakes'
import { loadActivity, markActive } from './activity'

const game = (key: string, at = '2026-01-01T00:00:00Z'): GameStat => ({ key, at, src: 'bot', color: 'w', result: '1-0', outcome: 'win', opp: 1200, tc: '-', plies: 20, endgame: false })
const mistake = (n: number): MistakeItem => ({ id: `g#${n}`, gameKey: 'g', ply: n, fen: 'x', color: 'w', bestUci: 'e2e4', bestSan: 'e4', playedSan: 'a3', cls: 'mistake', loss: 10, at: '2026-01-01' })

beforeEach(() => {
  const m = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear() })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener: () => undefined }), addEventListener: () => undefined })
})

describe('резервная копия v2', () => {
  it('круг: выгрузка и восстановление в пустое хранилище возвращает данные', () => {
    saveGames([game('a'), game('b')])
    saveMistakes(addMistakes(EMPTY_MISTAKES, [mistake(1), mistake(2)]))
    markActive(new Date('2026-10-22T12:00:00'))
    const text = JSON.stringify(makeBackup())
    localStorage.clear()
    const b = parseBackup(text)
    expect(describeBackup(b)).toMatchObject({ games: 2, mistakes: 2 })
    applyBackup(b)
    expect(loadGames().map(g => g.key).sort()).toEqual(['a', 'b'])
    expect(Object.keys(loadMistakes().items)).toHaveLength(2)
    expect(loadActivity().days).toEqual(['2026-10-22'])
  })
  it('восстановление объединяет: текущие данные не пропадают, дублей нет', () => {
    saveGames([game('a'), game('c')])
    saveMistakes(addMistakes(EMPTY_MISTAKES, [mistake(3)]))
    const b = parseBackup(JSON.stringify({ ...makeBackup(), games: [game('a'), game('b')], mistakes: addMistakes(EMPTY_MISTAKES, [mistake(1)]) }))
    applyBackup(b)
    applyBackup(b) // повторное восстановление ничего не дублирует
    expect(loadGames().map(g => g.key).sort()).toEqual(['a', 'b', 'c'])
    expect(Object.keys(loadMistakes().items).sort()).toEqual(['g#1', 'g#3'])
  })
  it('файл версии 1 по-прежнему читается', () => {
    const b = parseBackup('{"app":"chess-coach-ai","kind":"backup","v":1,"games":[],"sessions":[]}')
    expect(describeBackup(b)).toMatchObject({ games: 0, mistakes: 0, hasSettings: false })
    expect(() => applyBackup(b)).not.toThrow()
  })
  it('чужой файл и не-JSON отклоняются', () => {
    expect(() => parseBackup('nope')).toThrow()
    expect(() => parseBackup('{"app":"x"}')).toThrow()
  })
})
