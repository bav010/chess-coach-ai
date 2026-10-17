// Определение тактической темы по проверенной линии решения. Работает только с геометрией позиции
// (кто кого атакует, что связано, какая линия открылась) и с проверенным движком вариантом, поэтому
// тема ставится лишь там, где её можно показать на доске. Используется при подготовке базы задач
// и в тестах; само приложение берёт готовые темы и пояснения из src/data/puzzles.json.
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { PIECE_VALUE, splitUci } from './game'
import { sacrificeValue } from './tactics'

export type ThemeId = 'fork' | 'pin' | 'doubleAttack' | 'discovered' | 'deflection' | 'mateCombo' | 'defense' | 'mate'

export const THEME_LABEL: Record<ThemeId, string> = {
  fork: 'Вилка',
  pin: 'Связка',
  doubleAttack: 'Двойное нападение',
  discovered: 'Вскрытое нападение',
  deflection: 'Отвлечение защитника',
  mateCombo: 'Матовые комбинации',
  defense: 'Тактическая защита',
  mate: 'Мат',
}

/** Темы, которые выбирает пользователь (мат — отдельным фильтром по длине). */
export const THEME_ORDER: ThemeId[] = ['fork', 'pin', 'doubleAttack', 'discovered', 'deflection', 'mateCombo', 'defense']

export const THEME_IDEA: Record<ThemeId, string> = {
  fork: 'Одним ходом атакуйте сразу две цели — соперник сможет спасти только одну.',
  pin: 'Ищите фигуру, которая прикрывает более ценную: связав её, можно выиграть материал.',
  doubleAttack: 'Создайте две угрозы одновременно — защититься от обеих не получится.',
  discovered: 'Уберите свою фигуру с линии так, чтобы за ней открылась атака другой фигуры.',
  deflection: 'Заставьте защитника покинуть свой пост — то, что он защищал, останется без прикрытия.',
  mateCombo: 'Ищите принудительные шахи и жертвы, которые не оставляют королю полей для отступления.',
  defense: 'У соперника есть угроза. Найдите единственный ход, который её отражает.',
  mate: 'Ищите шахи: король соперника должен остаться без полей и защиты.',
}

const NOM: Record<PieceSymbol, string> = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' }
const ACC: Record<PieceSymbol, string> = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' }
const INS: Record<PieceSymbol, string> = { p: 'пешкой', n: 'конём', b: 'слоном', r: 'ладьёй', q: 'ферзём', k: 'королём' }
const GEN: Record<PieceSymbol, string> = { p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля' }

type Pc = { type: PieceSymbol; color: Color; square: Square }

const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w')

function piecesOf(chess: Chess, color: Color): Pc[] {
  const out: Pc[] = []
  for (const row of chess.board()) for (const c of row) if (c && c.color === color) out.push({ type: c.type, color: c.color, square: c.square })
  return out
}

export function balance(chess: Chess, color: Color): number {
  let sum = 0
  for (const row of chess.board()) for (const c of row) if (c) sum += (c.color === color ? 1 : -1) * PIECE_VALUE[c.type]
  return sum
}

/** Позиции после каждого полухода линии (индекс 0 — исходная). */
export function states(startFen: string, line: readonly string[]): Chess[] {
  const out: Chess[] = [new Chess(startFen)]
  for (const uci of line) {
    const next = new Chess(out[out.length - 1].fen())
    next.move(splitUci(uci))
    out.push(next)
  }
  return out
}

const file = (sq: Square) => sq.charCodeAt(0) - 97
const rank = (sq: Square) => Number(sq[1]) - 1
const sqOf = (f: number, r: number): Square | null => (f < 0 || f > 7 || r < 0 || r > 7 ? null : (`${'abcdefgh'[f]}${r + 1}` as Square))

const DIRS: Record<'b' | 'r' | 'q', [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
}

type Pin = { slider: Pc; pinned: Pc; behind: Pc }

/** Связки, созданные фигурами цвета `by`: слайдер — связанная фигура соперника — король или более ценная фигура. */
export function pinsBy(chess: Chess, by: Color): Pin[] {
  const out: Pin[] = []
  for (const s of piecesOf(chess, by)) {
    if (s.type !== 'b' && s.type !== 'r' && s.type !== 'q') continue
    for (const [df, dr] of DIRS[s.type]) {
      let f = file(s.square) + df, r = rank(s.square) + dr
      let first: Pc | null = null
      for (;;) {
        const sq = sqOf(f, r)
        if (!sq) break
        const p = chess.get(sq)
        if (p) {
          const pc: Pc = { type: p.type, color: p.color, square: sq }
          if (!first) {
            if (p.color === by) break
            first = pc
          } else {
            if (p.color !== by && first.type !== 'k' && (pc.type === 'k' || PIECE_VALUE[pc.type] > PIECE_VALUE[first.type])) {
              out.push({ slider: s, pinned: first, behind: pc })
            }
            break
          }
        }
        f += df; r += dr
      }
    }
  }
  return out
}

/** Фигуры соперника под боем и при этом «слабые»: король, незащищённые или более ценные, чем самый дешёвый атакующий. */
function weakTargets(chess: Chess, by: Color): { target: Pc; attackers: Square[] }[] {
  const out: { target: Pc; attackers: Square[] }[] = []
  for (const x of piecesOf(chess, opp(by))) {
    const att = chess.attackers(x.square, by)
    if (att.length === 0) continue
    const cheapest = Math.min(...att.map(a => PIECE_VALUE[chess.get(a)!.type]))
    const undefended = chess.attackers(x.square, opp(by)).length === 0
    if (x.type === 'k' || (x.type !== 'p' && (undefended || PIECE_VALUE[x.type] > cheapest))) out.push({ target: x, attackers: att })
  }
  return out
}

export type Detection = { themes: ThemeId[]; explain: string[] }

export type DetectOptions = {
  /** Ходов до мата (если решение — мат). */
  mate: number | null
  /** Задача на защиту от угрозы. */
  defense?: boolean
  /** Требовать, чтобы линия реально выигрывала цель (по умолчанию да). Для тестов геометрии можно отключить. */
  requireCapture?: boolean
}

/**
 * Темы линии решения. `line` — ходы UCI, начиная с хода решающего: [ход, ответ, ход, ответ, …].
 */
export function detectThemes(startFen: string, line: readonly string[], opts: DetectOptions): Detection {
  const requireCapture = opts.requireCapture ?? true
  const st = states(startFen, line)
  const solver = st[0].turn()
  const enemy = opp(solver)
  const themes: ThemeId[] = []
  const explain: string[] = []

  const m1 = splitUci(line[0])
  const before = st[0]
  const after = st[1]
  const mover = before.get(m1.from)!
  const solverCaptureSquares = new Set<string>()
  for (let i = 2; i < line.length; i += 2) {
    const mv = splitUci(line[i])
    if (st[i].get(mv.to)) solverCaptureSquares.add(mv.to)
  }
  const wins = (sq: Square) => !requireCapture || solverCaptureSquares.has(sq)
  const winsAny = (sqs: Square[]) => !requireCapture || sqs.some(s => solverCaptureSquares.has(s))
  const matesLater = line.length > 1 && st[line.length].isCheckmate()

  if (opts.defense) {
    themes.push('defense')
    explain.push('Тактическая защита: у соперника была сильная угроза, и только этот ход её отражает.')
  }

  if (opts.mate !== null) {
    themes.push('mate')
    if (opts.mate >= 2) {
      themes.push('mateCombo')
      const sac = sacrificeValue(startFen, line, solver)
      explain.push(`Матовая комбинация: мат в ${opts.mate} хода${opts.mate >= 5 ? 'х' : ''}${sac >= 2 ? ' с жертвой материала' : ''} — каждый шах отнимает у короля поля.`)
    } else {
      explain.push('Мат в один ход: король под шахом, и ему некуда отойти и нечем закрыться.')
    }
  }

  // --- вилка: ходящая фигура атакует две слабые цели
  const forkTargets = weakTargets(after, solver).filter(t => t.attackers.includes(m1.to))
  if (mover.type !== 'k' && forkTargets.length >= 2 && (winsAny(forkTargets.map(t => t.target.square)) || matesLater)) {
    themes.push('fork')
    const [a, b] = forkTargets
    explain.push(`Вилка: ${NOM[mover.type]} на ${m1.to} одновременно атакует ${ACC[a.target.type]} на ${a.target.square} и ${ACC[b.target.type]} на ${b.target.square}.`)
  }

  // --- связка: новая связка, и связанная фигура затем выигрывается
  const pinsBefore = new Set(pinsBy(before, solver).map(p => `${p.slider.square}${p.pinned.square}${p.behind.square}`))
  const newPins = pinsBy(after, solver).filter(p => !pinsBefore.has(`${p.slider.square}${p.pinned.square}${p.behind.square}`))
  const goodPin = newPins.find(p => wins(p.pinned.square))
  if (goodPin) {
    themes.push('pin')
    const abs = goodPin.behind.type === 'k'
    const behind = abs ? 'королём' : `${INS[goodPin.behind.type]}`
    explain.push(`Связка: ${NOM[goodPin.slider.type]} на ${goodPin.slider.square} связывает ${ACC[goodPin.pinned.type]} на ${goodPin.pinned.square} с ${behind} на ${goodPin.behind.square}${abs ? ' — связанная фигура не может ходить' : ' — уходя, она подставит более ценную фигуру'}.`)
  }

  // --- вскрытое нападение: другой слайдер начинает атаковать слабую цель
  for (const s of piecesOf(after, solver)) {
    if ((s.type !== 'b' && s.type !== 'r' && s.type !== 'q') || s.square === m1.from || s.square === m1.to) continue
    const found = weakTargets(after, solver).find(t => t.attackers.includes(s.square) && !before.attackers(t.target.square, solver).includes(s.square))
    if (found && (found.target.type === 'k' || wins(found.target.square) || matesLater)) {
      themes.push('discovered')
      explain.push(found.target.type === 'k'
        ? `Вскрытый шах: когда ${NOM[mover.type]} уходит с ${m1.from}, ${NOM[s.type]} на ${s.square} даёт шах королю.`
        : `Вскрытое нападение: ${NOM[mover.type]} уходит с ${m1.from}, и ${NOM[s.type]} на ${s.square} атакует ${ACC[found.target.type]} на ${found.target.square}.`)
      break
    }
  }

  // --- двойное нападение: две новые угрозы от разных фигур (не вилка)
  if (!themes.includes('fork') && !themes.includes('discovered')) {
    const old = new Set(weakTargets(before, solver).map(t => t.target.square))
    const nowT = weakTargets(after, solver).filter(t => t.target.type !== 'k')
    const fresh = nowT.filter(t => !old.has(t.target.square))
    // две угрозы после хода, хотя бы одна — новая, и обе реализуются или ведут к мату
    if (nowT.length >= 2 && fresh.length >= 1 && (winsAny(nowT.map(t => t.target.square)) || matesLater)) {
      themes.push('doubleAttack')
      const [a, b] = [fresh[0], nowT.find(t => t.target.square !== fresh[0].target.square)!]
      explain.push(`Двойное нападение: сразу две угрозы — ${ACC[a.target.type]} на ${a.target.square} и ${ACC[b.target.type]} на ${b.target.square}; защитить обе нельзя.`)
    }
  }

  // --- отвлечение защитника: жертва, защитник берёт и покидает пост, затем выигрывается то, что он защищал
  if (line.length >= 3 && mover.type !== 'k') {
    const r1 = splitUci(line[1])
    const m2 = splitUci(line[2])
    const D = st[1].get(r1.from)
    if (D && r1.to === m1.to && st[1].get(r1.to) && balance(st[2], solver) - balance(before, solver) <= -2) {
      const defended = st[1].attackers(m2.to, enemy).includes(r1.from)
      const wasCapture = !!st[2].get(m2.to)
      const mates = st[3]?.isCheckmate()
      if (defended && (wasCapture || mates)) {
        themes.push('deflection')
        explain.push(`Отвлечение: жертва ${GEN[mover.type]} на ${m1.to} уводит ${ACC[D.type]} с ${r1.from} — поле ${m2.to} остаётся без защиты.`)
      }
    }
  }

  return { themes: [...new Set(themes)], explain }
}
