import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, PIECE_SETS } from './appearance'
import { pieceUrl } from '../components/Piece'

describe('piece sets', () => {
  it('defaults are sane', () => {
    expect(PIECE_SETS).toContain(DEFAULT_APPEARANCE.pieces)
    expect(DEFAULT_APPEARANCE.pieceScale).toBeGreaterThanOrEqual(0.7)
    expect(DEFAULT_APPEARANCE.pieceScale).toBeLessThanOrEqual(1)
  })
  it('every image set has all 12 pieces', () => {
    for (const s of PIECE_SETS.filter(x => x !== 'glyph'))
      for (const c of ['w', 'b'] as const) for (const t of ['k', 'q', 'r', 'b', 'n', 'p'] as const)
        expect(pieceUrl(s, c, t), `${s}/${c}${t}`).toBeTruthy()
  })
})
