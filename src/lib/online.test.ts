import { describe, expect, it } from 'vitest'
import { chessOf, clockOffset, formatClock, inviteLink, isMyTurn, isNewer, mySide, onlineErrorKey, outcomeFor, parseCode, remainingMs, ruleOutcome, tryMove, turnOf, type OnlineGame } from './online'

const base: OnlineGame = { id: 'i', code: 'abcdef12', creator: 'A', white: 'A', black: 'B', white_name: 'Ann', black_name: 'Bob', moves: [], base_ms: 300000, inc_ms: 3000, white_ms: 300000, black_ms: 300000, turn_started: '2026-11-01T10:00:00.000Z', status: 'active', result: null, reason: null, draw_offer: null }
const g = (p: Partial<OnlineGame> = {}): OnlineGame => ({ ...base, ...p })
const T0 = Date.parse('2026-11-01T10:00:00.000Z')

describe('приглашения', () => {
  it('код берётся из ссылки и из чистого кода', () => {
    expect(parseCode('ABCDEF12')).toBe('abcdef12')
    expect(parseCode('https://x.github.io/chess-coach-ai/#/online/abcdef12')).toBe('abcdef12')
    expect(parseCode('  abcdef12  ')).toBe('abcdef12')
    expect(parseCode('abc')).toBeNull()
    expect(parseCode('abcdef123')).toBeNull()
  })
  it('ссылка строится от адреса сайта', () => expect(inviteLink('abcdef12', { origin: 'https://x.io', pathname: '/chess-coach-ai/' })).toBe('https://x.io/chess-coach-ai/#/online/abcdef12'))
})

describe('стороны и очередь', () => {
  it('сторона игрока и чей ход', () => {
    expect(mySide(g(), 'A')).toBe('w'); expect(mySide(g(), 'B')).toBe('b'); expect(mySide(g(), 'C')).toBeNull(); expect(mySide(g(), null)).toBeNull()
    expect(turnOf(g())).toBe('w'); expect(turnOf(g({ moves: ['e2e4'] }))).toBe('b')
    expect(isMyTurn(g(), 'w')).toBe(true); expect(isMyTurn(g(), 'b')).toBe(false)
    expect(isMyTurn(g({ status: 'finished' }), 'w')).toBe(false)
  })
})

describe('часы', () => {
  it('идут только у стороны, чей ход, с поправкой на время сервера', () => {
    expect(remainingMs(g(), 'w', T0 + 10_000, 0)).toBe(290_000)
    expect(remainingMs(g(), 'b', T0 + 10_000, 0)).toBe(300_000)
    expect(remainingMs(g(), 'w', T0 + 10_000, 5_000)).toBe(285_000) // сервер впереди на 5 с
  })
  it('не уходят в минус; без часов — null; после конца стоят', () => {
    expect(remainingMs(g({ white_ms: 1000 }), 'w', T0 + 9_000, 0)).toBe(0)
    expect(remainingMs(g({ base_ms: 0 }), 'w', T0, 0)).toBeNull()
    expect(remainingMs(g({ status: 'finished' }), 'w', T0 + 60_000, 0)).toBe(300_000)
  })
  it('поправка берётся из ответа сервера', () => {
    expect(clockOffset({ server_now: '2026-11-01T10:00:05.000Z' }, T0)).toBe(5000)
    expect(clockOffset({}, T0)).toBeNull()
  })
  it('формат: секунды и десятые при малом остатке', () => {
    expect(formatClock(300_000)).toBe('5:00'); expect(formatClock(61_500)).toBe('1:02'); expect(formatClock(9_400)).toBe('0:09.4')
  })
})

describe('позиция и результат', () => {
  it('ход проверяется, мат определяется', () => {
    const c = chessOf(g({ moves: ['f2f3', 'e7e5', 'g2g4'] }))
    expect(tryMove(c, 'd8h4')).not.toBeNull()
    expect(tryMove(c, 'e1e5')).toBeNull()
    const mate = g({ moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] })
    expect(ruleOutcome(mate)).toEqual({ result: '0-1', reason: 'checkmate' })
    expect(ruleOutcome(g({ moves: ['e2e4'] }))).toBeNull()
  })
  it('итог с точки зрения игрока', () => {
    const w = g({ status: 'finished', result: '1-0' })
    expect(outcomeFor(w, 'w')).toBe('win'); expect(outcomeFor(w, 'b')).toBe('loss')
    expect(outcomeFor(g({ status: 'finished', result: '1/2-1/2' }), 'b')).toBe('draw')
    expect(outcomeFor(g({ status: 'finished', result: null }), 'w')).toBeNull()
    expect(outcomeFor(g(), 'w')).toBeNull()
  })
})

describe('обновления и ошибки', () => {
  it('старое событие не затирает новое', () => {
    const cur = g({ moves: ['e2e4', 'e7e5'], updated_at: '2026-11-01T10:00:02Z' })
    expect(isNewer(g({ moves: ['e2e4'], updated_at: '2026-11-01T10:00:01Z' }), cur)).toBe(false)
    expect(isNewer(g({ moves: ['e2e4', 'e7e5', 'g1f3'], updated_at: '2026-11-01T10:00:03Z' }), cur)).toBe(true)
    expect(isNewer(g({ status: 'active', moves: ['e2e4', 'e7e5'] }), g({ status: 'finished', moves: ['e2e4', 'e7e5'] }))).toBe(false)
    expect(isNewer(g(), null)).toBe(true)
  })
  it('ошибки сервера превращаются в ключи перевода', () => {
    expect(onlineErrorKey({ message: 'not_found' })).toBe('online.err.not_found')
    expect(onlineErrorKey(new Error('full'))).toBe('online.err.full')
    expect(onlineErrorKey(new Error('Failed to fetch'))).toBe('online.err.network')
    expect(onlineErrorKey({ message: 'Could not find the function public.online_get in the schema cache' })).toBe('online.err.setup')
    expect(onlineErrorKey('???')).toBe('online.err.other')
  })
})
