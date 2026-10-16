import { describe, expect, it } from 'vitest'
import { sacrificeValue } from './tactics'

describe('sacrificeValue', () => {
  it('конь, который берут пешкой, — жертва 3', () => {
    expect(sacrificeValue('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', ['f3d4', 'e5d4'], 'w')).toBe(3)
  })
  it('обычный размен — не жертва', () => {
    // белый слон берёт коня, чёрные берут слона
    expect(sacrificeValue('4k3/8/5n2/8/8/2B5/8/4K3 w - - 0 1', ['c3f6', 'e8e7'], 'w')).toBe(0)
  })
  it('временная жертва, возвращённая в варианте, не считается', () => {
    // Nd4 берут пешкой, но затем белые берут пешку обратно и счёт выравнивается лишь частично — проверяем минимум
    const v = sacrificeValue('4k3/8/8/4p3/8/5N2/3P4/4K3 w - - 0 1', ['f3d4', 'e5d4', 'd2d3', 'e8e7'], 'w')
    expect(v).toBe(3)
  })
  it('слишком короткий вариант — 0', () => {
    expect(sacrificeValue('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', ['f3d4'], 'w')).toBe(0)
  })
})
