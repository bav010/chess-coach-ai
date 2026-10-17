import { describe, expect, it } from 'vitest'
import { badgePositions } from './Board'

describe('badgePositions', () => {
  it('кружки стрелок с общей целью не накладываются друг на друга', () => {
    // шесть стрелок, две из них приходят в одну клетку (как g2→g4 и c8→g4)
    const pts = [
      { x1: 6.5, y1: 6.5, x2: 6.5, y2: 4.5 }, { x1: 3.5, y1: 1.5, x2: 3.5, y2: 3.5 },
      { x1: 5.5, y1: 7.5, x2: 6.5, y2: 6.5 }, { x1: 2.5, y1: 0.5, x2: 6.5, y2: 4.5 },
      { x1: 2.5, y1: 6.5, x2: 2.5, y2: 4.5 }, { x1: 3.5, y1: 3.5, x2: 3.5, y2: 4.5 },
    ]
    const pos = badgePositions(pts)
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      expect(Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]), `${i}-${j}`).toBeGreaterThanOrEqual(0.4)
    }
  })
  it('одиночная стрелка — кружок у острия', () => {
    expect(badgePositions([{ x1: 0.5, y1: 0.5, x2: 3.5, y2: 0.5 }])[0]).toEqual([3.8, 0.2])
  })
})
