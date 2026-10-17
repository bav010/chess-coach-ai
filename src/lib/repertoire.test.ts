import { describe, expect, it } from 'vitest'
import { addLine, cardSpecs, lineCardIds, newRepertoire, removeLine, repMovesAt, setNote, validLine } from './repertoire'
import { countCards, planDrill } from './drill'
import { isDue, mastery, newCard, schedule, urgency } from './srs'

const E4 = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']
const E4B = ['e2e4', 'c7c5', 'g1f3']

describe('репертуар', () => {
  it('добавление, дубли, продолжение и недопустимые линии', () => {
    let r = newRepertoire('Белые', 'w')
    let a = addLine(r, E4.slice(0, 3), 'Открытая игра'); expect(a.status).toBe('added'); r = a.rep
    a = addLine(r, E4.slice(0, 2), 'x'); expect(a.status).toBe('exists')
    a = addLine(r, E4, 'Испанская'); expect(a.status).toBe('extended'); r = a.rep
    expect(r.lines).toHaveLength(1); expect(r.lines[0].moves).toHaveLength(5)
    expect(addLine(r, ['e2e5'], 'bad').status).toBe('invalid')
    r = addLine(r, E4B, 'Сицилианская').rep
    expect(r.lines).toHaveLength(2)
    expect(removeLine(r, r.lines[0].id).lines).toHaveLength(1)
    expect(validLine(['e2e4', 'e7e5'])).toBe(true)
  })
  it('заметки и ходы репертуара из позиции', () => {
    let r = newRepertoire('Б', 'w')
    r = addLine(r, E4, 'a').rep; r = addLine(r, E4B, 'b').rep
    expect(repMovesAt(r, ['e2e4']).sort()).toEqual(['c7c5', 'e7e5'])
    expect(repMovesAt(r, [])).toEqual(['e2e4'])
    r = setNote(r, 'k', 'идея'); expect(r.notes.k).toBe('идея'); expect(setNote(r, 'k', ' ').notes.k).toBeUndefined()
  })
  it('карточки только в позициях, где ходит пользователь; ходы объединяются', () => {
    let r = newRepertoire('Б', 'w')
    r = addLine(r, E4, 'a').rep; r = addLine(r, ['e2e4', 'e7e5', 'g1f3', 'g8f6'], 'b').rep
    const specs = cardSpecs(r)
    expect(specs.map(s => s.path.length).sort()).toEqual([0, 2, 4])
    const second = specs.find(s => s.path.length === 2)!
    expect(second.expected).toEqual(['g1f3'])
    expect(specs.every(s => s.turn === 'w')).toBe(true)
    const black = newRepertoire('Ч', 'b'); const b = addLine(black, E4B, 'x').rep
    expect(cardSpecs(b).map(s => s.path.length)).toEqual([1])
    expect(lineCardIds(r, r.lines[0])).toHaveLength(3)
  })
})

describe('интервальное повторение', () => {
  const T = 1_000_000_000_000
  it('ошибка возвращает карточку скоро, верные ответы растят интервал', () => {
    let c = newCard(T)
    expect(isDue(c, T)).toBe(true); expect(mastery(c)).toBe('new')
    c = schedule(c, 'good', T); expect(c.ivl).toBe(1); expect(isDue(c, T + 1000)).toBe(false)
    c = schedule(c, 'good', T); expect(c.ivl).toBe(3)
    c = schedule(c, 'good', T); expect(c.ivl).toBeGreaterThan(7); expect(mastery(c)).toBe('learned')
    const lapsed = schedule(c, 'again', T)
    expect(lapsed.due - T).toBe(10 * 60_000); expect(lapsed.ease).toBeLessThan(c.ease); expect(lapsed.lapses).toBe(1)
    expect(mastery(lapsed)).toBe('learning')
  })
  it('с подсказкой интервал растёт медленнее, а трудные карточки срочнее', () => {
    let good = newCard(T), hard = newCard(T)
    for (let i = 0; i < 4; i++) { good = schedule(good, 'good', T); hard = schedule(hard, 'hard', T) }
    expect(hard.ivl).toBeLessThan(good.ivl)
    const diff = schedule(newCard(T), 'again', T)
    expect(urgency(diff, T + 86_400_000)).toBeGreaterThan(urgency(good, T + 86_400_000))
    expect(schedule({ ...newCard(T), ease: 1.3 }, 'again', T).ease).toBe(1.3)
  })
  it('план тренировки покрывает карточки, которым пора, и пропускает усвоенное', () => {
    let r = newRepertoire('Б', 'w')
    r = addLine(r, E4, 'a').rep; r = addLine(r, E4B, 'b').rep
    const plan = planDrill(r, {}, T, 'due')
    expect(plan.lines.length).toBe(2); expect(plan.newCards).toBeGreaterThan(0)
    // все карточки изучены и отложены → на сегодня ничего
    const cards: Record<string, ReturnType<typeof newCard>> = {}
    for (const l of r.lines) for (const id of lineCardIds(r, l)) cards[id] = schedule(schedule(newCard(T), 'good', T), 'good', T)
    expect(planDrill(r, cards, T, 'due').lines).toHaveLength(0)
    expect(planDrill(r, cards, T, 'all').lines).toHaveLength(2)
    expect(countCards(r, cards, T).due).toBe(0)
    // через месяц всё снова пора
    expect(planDrill(r, cards, T + 40 * 86_400_000, 'due').lines.length).toBe(2)
  })
})
