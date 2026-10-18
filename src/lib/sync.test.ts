import { describe, it, expect } from 'vitest'
import { mergeOpenings, mergePuzzles, mergeSnapshots, snapshotHash, isSnapshot, type Snapshot } from './sync'
import { EMPTY_STATS, type PuzzleStats } from './puzzleStats'
import { EMPTY_OPENINGS, type OpeningsData } from './openingsStore'
import { newCard } from './srs'
import type { GameStat } from './gameStats'
import { DEFAULT_PREFS } from './prefs'

const game = (k: string, at: string): GameStat => ({ key: k, at, src: 'bot', color: 'w', result: '1-0', outcome: 'win', opp: 1000, tc: '-', plies: 20, endgame: false })
const snap = (o: Partial<Snapshot> = {}): Snapshot => ({
  v: 1, updatedAt: '', profile: { name: 'Игрок', avatar: { emoji: '♞', color: '#fff' } }, prefs: DEFAULT_PREFS, games: [], sessions: [],
  puzzles: EMPTY_STATS, openings: EMPTY_OPENINGS, gamesResetAt: null, ...o,
})
const pz = (o: Partial<PuzzleStats>): PuzzleStats => ({ ...EMPTY_STATS, ...o })

describe('слияние задач', () => {
  it('берётся прогресс, где больше попыток; решённые id объединяются', () => {
    const m = mergePuzzles(pz({ attempted: 5, solved: 3, solvedIds: ['a', 'b', 'c'], failedIds: ['x'] }), pz({ attempted: 9, solved: 7, solvedIds: ['d', 'x'], failedIds: ['y'] }))
    expect(m.attempted).toBe(9); expect(m.solved).toBe(7)
    expect(m.solvedIds.sort()).toEqual(['a', 'b', 'c', 'd', 'x']); expect(m.failedIds).toEqual(['y'])
  })
  it('идемпотентно', () => {
    const a = pz({ attempted: 4, solved: 2, solvedIds: ['a'], failedIds: ['b'] })
    expect(mergePuzzles(a, a)).toEqual(a)
  })
})

describe('слияние дебютов', () => {
  const rep = (id: string, lines: string[]) => ({ id, name: id, side: 'w' as const, lines: lines.map(l => ({ id: l, name: l, moves: ['e2e4'], note: '' })), notes: {} })
  const op = (o: Partial<OpeningsData>): OpeningsData => ({ ...EMPTY_OPENINGS, ...o })
  it('объединяет репертуары и линии, карточки — по более свежему ответу, уроки — «пройден» побеждает', () => {
    const c1 = { ...newCard(1), last: 10, ivl: 3 }, c2 = { ...newCard(1), last: 20, ivl: 7 }
    const a = op({ repertoires: [rep('r1', ['l1'])], cards: { k1: c1, k2: c1 }, lessons: { italian: { done: false, runs: 1, mistakes: 2 } }, stats: { answered: 5, correct: 4, timeMs: 10, sessions: 1 }, activeId: 'r1' })
    const b = op({ repertoires: [rep('r1', ['l1', 'l2']), rep('r2', ['l3'])], cards: { k1: c2 }, lessons: { italian: { done: true, runs: 3, mistakes: 0 }, london: { done: true, runs: 1, mistakes: 0 } }, stats: { answered: 9, correct: 5, timeMs: 5, sessions: 2 } })
    const m = mergeOpenings(a, b)
    expect(m.repertoires.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(m.repertoires[0].lines.map(l => l.id)).toEqual(['l1', 'l2'])
    expect(m.cards.k1.ivl).toBe(7); expect(m.cards.k2.ivl).toBe(3)
    expect(m.lessons.italian).toEqual({ done: true, runs: 3, mistakes: 0 }); expect(m.lessons.london.done).toBe(true)
    expect(m.stats).toEqual({ answered: 9, correct: 5, timeMs: 10, sessions: 2 })
    expect(mergeOpenings(m, m)).toEqual(m)
  })
})

describe('слияние снимков', () => {
  it('партии объединяются без дублей; результат не зависит от порядка', () => {
    const a = snap({ games: [game('1', '2026-10-01T00:00:00Z'), game('2', '2026-10-02T00:00:00Z')] })
    const b = snap({ games: [game('2', '2026-10-02T00:00:00Z'), game('3', '2026-10-03T00:00:00Z')] })
    const ab = mergeSnapshots(a, b), ba = mergeSnapshots(b, a)
    expect(ab.games).toHaveLength(3)
    expect(snapshotHash(ab)).toBe(snapshotHash(ba))
    expect(snapshotHash(mergeSnapshots(ab, ab))).toBe(snapshotHash(ab))
  })
  it('сброс статистики доходит до другого устройства', () => {
    const a = snap({ games: [game('1', '2026-10-01T00:00:00Z')] })
    const b = snap({ games: [game('1', '2026-10-01T00:00:00Z'), game('9', '2026-10-09T00:00:00Z')], gamesResetAt: '2026-10-05T00:00:00Z' })
    const m = mergeSnapshots(a, b)
    expect(m.games.map(g => g.key)).toEqual(['9']); expect(m.gamesResetAt).toBe('2026-10-05T00:00:00Z')
  })
  it('сессии объединяются по PGN, настройки — локальные или облачные по флагу', () => {
    const s = (pgn: string, t: string) => ({ id: 1, created_at: t, result: '1-0' as const, plies: 2, pgn })
    const a = snap({ sessions: [s('A', '2026-10-01T00:00:00Z')], profile: { name: 'Лок', avatar: { emoji: '♞', color: '#fff' } } })
    const b = snap({ sessions: [s('A', '2026-10-01T00:00:00Z'), s('B', '2026-10-02T00:00:00Z')], profile: { name: 'Облако', avatar: { emoji: '♛', color: '#000' } } })
    expect(mergeSnapshots(a, b).sessions.map(x => x.pgn)).toEqual(['B', 'A'])
    expect(mergeSnapshots(a, b).profile.name).toBe('Лок')
    expect(mergeSnapshots(a, b, true).profile.name).toBe('Облако')
  })
  it('проверка формата облачных данных', () => {
    expect(isSnapshot(snap())).toBe(true); expect(isSnapshot({ v: 2 })).toBe(false); expect(isSnapshot(null)).toBe(false)
  })
})
