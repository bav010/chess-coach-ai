// Текстовые объяснения хода. Stockfish сам объяснений не даёт: здесь только факты, которые можно
// проверить по позиции (взятие, шах, мат) и по числам анализа (оценка до/после, лучший ход, вариант).
// Если причину надёжно определить нельзя, показывается ход, вариант и оценка без выдуманных причин.
import { Chess } from 'chess.js'
import { CLASS_LABEL, isBad } from './classify'
import { forColor, formatScore } from './eval'
import { colorGen, colorName, PIECE_NAME } from './glyphs'
import { splitUci } from './game'
import type { ReviewMove } from './review'
import { t } from '../i18n'

function bestMoveFacts(m: ReviewMove): string[] {
  if (!m.bestUci) return []
  const facts: string[] = []
  try {
    const chess = new Chess(m.record.fenBefore)
    const best = chess.move(splitUci(m.bestUci))
    if (best.captured && !m.record.captured) facts.push(t('analysis.explain.bestCapture', { piece: PIECE_NAME[best.captured] }))
    if (best.san.endsWith('#')) facts.push(t('analysis.explain.bestMate'))
    else if (best.san.endsWith('+')) facts.push(t('analysis.explain.bestCheck'))
    if (best.promotion) facts.push(t('analysis.explain.bestPromo'))
  } catch { /* нелегальный ход из устаревшего кэша — просто без фактов */ }
  return facts
}

/** Список коротких предложений о ходе. */
export function explainMove(m: ReviewMove): string[] {
  const own = m.record.color
  const before = forColor(m.before, own)
  const after = forColor(m.after, own)
  const lines: string[] = []

  lines.push(t('analysis.explain.played', { san: m.record.san, color: colorName(own), label: CLASS_LABEL[m.cls].toLowerCase() }))
  lines.push(t('analysis.explain.evalChanged', { color: colorGen(own), from: formatScore(before), to: formatScore(after) }))

  if (m.cls === 'brilliant') {
    lines.push(t('analysis.explain.sacrifice', { n: m.sacrifice }))
  }
  if (m.cls === 'great' && m.gapToSecond !== null) {
    lines.push(t('analysis.explain.onlyMove', { n: m.gapToSecond.toFixed(0) }))
  }
  if (m.cls === 'book') lines.push(t('analysis.explain.book'))
  if (m.cls === 'miss') {
    const hadMate = m.before.mate !== null && m.before.mate * (own === 'w' ? 1 : -1) > 0
    if (!hadMate) lines.push(t('analysis.explain.missed'))
  }
  if (m.playedIsBest) return lines

  if (m.bestSan) {
    lines.push(m.pvSan.length > 1
      ? t('analysis.explain.recommendedPv', { san: m.bestSan, pv: m.pvSan.join(' ') })
      : t('analysis.explain.recommended', { san: m.bestSan }))
  }

  if (isBad(m.cls)) {
    if (before.mate !== null && before.mate > 0 && !(after.mate !== null && after.mate > 0)) {
      lines.push(t('analysis.explain.mateMissed', { n: before.mate }))
    }
    if (after.mate !== null && after.mate < 0) {
      lines.push(t('analysis.explain.mateAllowed', { n: -after.mate }))
    }
    lines.push(...bestMoveFacts(m))
    lines.push(t('analysis.explain.loss', { n: m.loss.toFixed(0) }))
  }
  return lines
}
