// Текстовые объяснения хода. Stockfish сам объяснений не даёт: здесь только факты, которые можно
// проверить по позиции (взятие, шах, мат) и по числам анализа (оценка до/после, лучший ход, вариант).
// Если причину надёжно определить нельзя, показывается ход, вариант и оценка без выдуманных причин.
import { Chess } from 'chess.js'
import { CLASS_LABEL, isBad } from './classify'
import { forColor, formatScore } from './eval'
import { colorGen, colorName, PIECE_NAME } from './glyphs'
import { splitUci } from './game'
import type { ReviewMove } from './review'

function bestMoveFacts(m: ReviewMove): string[] {
  if (!m.bestUci) return []
  const facts: string[] = []
  try {
    const chess = new Chess(m.record.fenBefore)
    const best = chess.move(splitUci(m.bestUci))
    if (best.captured && !m.record.captured) facts.push(`Лучший ход — взятие: ${PIECE_NAME[best.captured]}.`)
    if (best.san.endsWith('#')) facts.push('Лучший ход ставит мат.')
    else if (best.san.endsWith('+')) facts.push('Лучший ход — с шахом.')
    if (best.promotion) facts.push('Лучший ход — превращение пешки.')
  } catch { /* нелегальный ход из устаревшего кэша — просто без фактов */ }
  return facts
}

/** Список коротких предложений о ходе. */
export function explainMove(m: ReviewMove): string[] {
  const own = m.record.color
  const before = forColor(m.before, own)
  const after = forColor(m.after, own)
  const lines: string[] = []

  lines.push(`Сыгран ход ${m.record.san} (${colorName(own)}): ${CLASS_LABEL[m.cls].toLowerCase()}.`)
  lines.push(`Оценка для ${colorGen(own)} изменилась: ${formatScore(before)} → ${formatScore(after)}.`)

  if (m.cls === 'brilliant') {
    lines.push(`Жертва материала (около ${m.sacrifice} в пешечном счёте), которую движок считает лучшим продолжением.`)
  }
  if (m.cls === 'great' && m.gapToSecond !== null) {
    lines.push(`Единственный сильный ход: следующий по силе вариант движка хуже примерно на ${m.gapToSecond.toFixed(0)} п. п.`)
  }
  if (m.cls === 'book') lines.push('Ход из дебютной теории (по встроенному небольшому списку дебютных линий).')
  if (m.cls === 'miss') {
    const hadMate = m.before.mate !== null && m.before.mate * (own === 'w' ? 1 : -1) > 0
    if (!hadMate) lines.push('Соперник только что ошибся, но этот ход не использует шанс в полной мере.')
  }
  if (m.playedIsBest) return lines

  if (m.bestSan) {
    const pv = m.pvSan.length > 1 ? ` Вариант: ${m.pvSan.join(' ')}.` : ''
    lines.push(`Движок рекомендовал ${m.bestSan}.${pv}`)
  }

  if (isBad(m.cls)) {
    if (before.mate !== null && before.mate > 0 && !(after.mate !== null && after.mate > 0)) {
      lines.push(`Был мат в ${before.mate} — этот ход его упускает.`)
    }
    if (after.mate !== null && after.mate < 0) {
      lines.push(`После этого хода у соперника есть мат в ${-after.mate}.`)
    }
    lines.push(...bestMoveFacts(m))
    lines.push(`Потеря: около ${m.loss.toFixed(0)} п. п. шансов на победу.`)
  }
  return lines
}
