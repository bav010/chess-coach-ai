import { Chess } from 'chess.js'
import { START_FEN } from './game'

export type ParsedPgn = {
  startFen: string
  ucis: string[]
  white: string | null
  black: string | null
  result: string | null
}

/** Разбор PGN (в т.ч. с заголовком FEN). Бросает Error с понятным текстом, если партию прочитать нельзя. */
export function parsePgn(text: string): ParsedPgn {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Вставьте PGN или выберите файл.')
  const chess = new Chess()
  try {
    chess.loadPgn(trimmed)
  } catch (e) {
    throw new Error(`Не удалось прочитать PGN: ${e instanceof Error ? e.message.split('\n')[0] : 'неверный формат'}`)
  }
  const headers = chess.getHeaders()
  const history = chess.history({ verbose: true })
  if (history.length === 0) throw new Error('В PGN нет ходов.')
  const fen = headers.FEN && headers.SetUp !== '0' ? headers.FEN : START_FEN
  const pick = (v: string | null | undefined) => (v && v !== '?' ? v : null)
  return {
    startFen: fen,
    ucis: history.map(m => `${m.from}${m.to}${m.promotion ?? ''}`),
    white: pick(headers.White),
    black: pick(headers.Black),
    result: pick(headers.Result),
  }
}

/** PGN партии с заголовками. */
export function toPgn(startFen: string, ucis: readonly string[], headers: Record<string, string>): string {
  const chess = new Chess(startFen)
  for (const uci of ucis) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  }
  for (const [k, v] of Object.entries(headers)) chess.setHeader(k, v)
  return chess.pgn()
}
