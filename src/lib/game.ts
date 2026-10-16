// Единая модель партии. Источник правды — стартовая позиция и список ходов в UCI.
// Всё остальное (позиция, история, взятые фигуры, статус) вычисляется из него функциями ниже,
// поэтому доска, нотация, захваты и анализ не могут разойтись.
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export type MoveRecord = {
  uci: string
  san: string
  color: Color
  piece: PieceSymbol
  from: Square
  to: Square
  captured?: PieceSymbol
  promotion?: PieceSymbol
  fenBefore: string
  fenAfter: string
}

export type Replay = {
  /** Корректно разобранные ходы (разбор останавливается на первом нелегальном). */
  records: MoveRecord[]
  /** Позиция после последнего хода; хранит историю для правила повторений. */
  chess: Chess
  /** Сколько ходов из входного списка оказалось нелегальными и отброшено. */
  rejected: number
}

export function splitUci(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as PieceSymbol | undefined) || undefined,
  }
}

export function replay(startFen: string, ucis: readonly string[]): Replay {
  const chess = new Chess(startFen)
  const records: MoveRecord[] = []
  for (const uci of ucis) {
    const fenBefore = chess.fen()
    try {
      const m = chess.move(splitUci(uci))
      records.push({
        uci, san: m.san, color: m.color, piece: m.piece, from: m.from, to: m.to,
        captured: m.captured, promotion: m.promotion, fenBefore, fenAfter: chess.fen(),
      })
    } catch {
      return { records, chess, rejected: ucis.length - records.length }
    }
  }
  return { records, chess, rejected: 0 }
}

/** Позиция после `ply` полуходов (0 — стартовая). */
export function fenAtPly(startFen: string, records: readonly MoveRecord[], ply: number): string {
  if (ply <= 0) return startFen
  return records[Math.min(ply, records.length) - 1].fenAfter
}

/** Шахматная позиция на `ply` (для статусов, истории повторений и т.п.). */
export function chessAtPly(startFen: string, ucis: readonly string[], ply: number): Chess {
  return replay(startFen, ucis.slice(0, Math.max(0, ply))).chess
}

export type Captures = {
  /** Фигуры, взятые белыми (то есть чёрные фигуры). */
  byWhite: PieceSymbol[]
  /** Фигуры, взятые чёрными (то есть белые фигуры). */
  byBlack: PieceSymbol[]
  /** Материальный баланс по взятым фигурам: > 0 — перевес белых, < 0 — чёрных. */
  balance: number
}

const ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p']

/** Взятия (включая взятие на проходе) среди первых `upToPly` ходов. Не зависит от оценки движка. */
export function captures(records: readonly MoveRecord[], upToPly: number = records.length): Captures {
  const byWhite: PieceSymbol[] = []
  const byBlack: PieceSymbol[] = []
  for (const r of records.slice(0, upToPly)) {
    if (!r.captured) continue
    if (r.color === 'w') byWhite.push(r.captured)
    else byBlack.push(r.captured)
  }
  const sort = (a: PieceSymbol[]) => a.sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y))
  const sum = (a: PieceSymbol[]) => a.reduce((s, p) => s + PIECE_VALUE[p], 0)
  return { byWhite: sort(byWhite), byBlack: sort(byBlack), balance: sum(byWhite) - sum(byBlack) }
}

export type EndReason =
  | 'checkmate' | 'stalemate' | 'threefold' | 'fifty' | 'insufficient'
  | 'resign' | 'timeout' | 'timeout-insufficient' | 'agreed'

export type GameStatus =
  | { over: false }
  | { over: true; result: '1-0' | '0-1' | '1/2-1/2'; reason: EndReason }

/** Статус по правилам шахмат (мат, пат, троекратное повторение, 50 ходов, недостаток материала). */
export function statusOf(chess: Chess): GameStatus {
  if (chess.isCheckmate()) {
    return { over: true, result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' }
  }
  if (chess.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' }
  if (chess.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient' }
  if (chess.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', reason: 'threefold' }
  if (chess.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', reason: 'fifty' }
  return { over: false }
}

/** Чётность цвета поля: у полей одного цвета она совпадает. */
function squareParity(sq: Square): boolean {
  return ((sq.charCodeAt(0) - 97) + Number(sq[1])) % 2 === 1
}

/**
 * Может ли сторона теоретически поставить мат (нужно для правила «падение флага»:
 * если у соперника нет матующего материала, партия считается ничьей).
 * Приближение по правилам FIDE: пешка, ладья или ферзь — достаточно; два и более лёгких
 * фигур достаточно, кроме случая одних слонов одного цвета поля.
 */
export function hasMatingMaterial(chess: Chess, color: Color): boolean {
  let minors = 0
  let knights = 0
  const bishopColors = new Set<boolean>()
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color) continue
      if (cell.type === 'p' || cell.type === 'r' || cell.type === 'q') return true
      if (cell.type === 'n') { minors++; knights++ }
      if (cell.type === 'b') { minors++; bishopColors.add(squareParity(cell.square)) }
    }
  }
  if (minors >= 2) return !(knights === 0 && bishopColors.size === 1)
  return false
}

export type Phase = 'opening' | 'middlegame' | 'endgame'

/** Эвристика стадии партии: по ходам и материалу без пешек (оба цвета вместе). */
export function phaseOf(fen: string, ply: number): Phase {
  const board = new Chess(fen).board()
  let material = 0
  for (const row of board) for (const c of row) {
    if (c && c.type !== 'p' && c.type !== 'k') material += PIECE_VALUE[c.type]
  }
  if (material <= 26) return 'endgame'
  return ply < 20 ? 'opening' : 'middlegame'
}

export function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w'
}
