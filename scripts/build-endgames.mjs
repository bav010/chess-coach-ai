// Генератор набора эндшпилей (инструмент разработчика, в сборку сайта не входит):
//   node scripts/build-endgames.mjs <путь/к/sf.cjs> [out.json]
// Каждая позиция в наборе проверена движком Stockfish: для «выигрыша» движок обязан показывать мат или оценку ≥ +3 пешки
// в пользу стороны ученика на большой глубине, для «ничьей» — оценку около нуля. Позиции, не прошедшие проверку, отбрасываются.
// Теоретические позиции (Лусена, Филидор…) записаны вручную, остальные генерируются случайно с фиксированным зерном.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

const SF = process.argv[2] || 'sf.cjs'
const OUT = process.argv[3] || 'src/data/endgames.json'

class Eng {
  constructor() { this.p = spawn(process.execPath, [path.resolve(SF)], { cwd: path.dirname(path.resolve(SF)), stdio: ['pipe', 'pipe', 'ignore'] }); this.buf = ''; this.cb = null
    this.p.stdout.on('data', d => { this.buf += d; const ls = this.buf.split('\n'); this.buf = ls.pop(); for (const l of ls) this.cb?.(l.trim()) }) }
  send(c) { this.p.stdin.write(c + '\n') }
  wait(pred) { return new Promise(res => { this.cb = l => { if (pred(l)) { this.cb = null; res(l) } } }) }
  async init() { this.send('uci'); await this.wait(l => l === 'uciok'); this.send('setoption name Hash value 64'); this.send('isready'); await this.wait(l => l === 'readyok') }
  // оценка с точки зрения стороны, чей ход
  async eval(fen, depth) {
    this.send('ucinewgame'); this.send(`position fen ${fen}`)
    let last = null
    const bm = await new Promise(res => {
      this.cb = l => {
        if (l.startsWith('info') && / pv /.test(l) && !/bound/.test(l)) { const cp = /score cp (-?\d+)/.exec(l), m = /score mate (-?\d+)/.exec(l); last = { cp: cp ? +cp[1] : null, mate: m ? +m[1] : null, depth: +/depth (\d+)/.exec(l)[1] } }
        else if (l.startsWith('bestmove')) { this.cb = null; res(l) }
      }
      this.send(`go depth ${depth}`)
    })
    return { ...last, best: bm.split(' ')[1] }
  }
  quit() { this.send('quit'); this.p.kill() }
}

let seed = 20261107
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const pick = a => a[Math.floor(rnd() * a.length)]
const SQ = []; for (const f of 'abcdefgh') for (let r = 1; r <= 8; r++) SQ.push(f + r)
const dist = (a, b) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(+a[1] - +b[1]))

// случайная позиция: белые — список фигур, чёрные — только король; ход белых; законная и не оконченная
function randomPos(whitePieces, blackPieces = [], pawnRanks = [2, 6]) {
  for (let tries = 0; tries < 2000; tries++) {
    const used = new Set(), place = () => { for (;;) { const s = pick(SQ); if (!used.has(s)) { used.add(s); return s } } }
    const board = {}
    board.K = place(); board.k = place()
    if (dist(board.K, board.k) < 2) continue
    const items = []
    for (const p of whitePieces) { let s = place(); if (p === 'P') { while (+s[1] < pawnRanks[0] || +s[1] > pawnRanks[1]) { used.delete(s); s = place() } } items.push([p, s]) }
    for (const p of blackPieces) { let s = place(); if (p === 'p') { while (+s[1] < 2 || +s[1] > 7) { used.delete(s); s = place() } } items.push([p, s]) }
    const grid = Array.from({ length: 8 }, () => Array(8).fill(null))
    const put = (ch, s) => { grid[8 - +s[1]][s.charCodeAt(0) - 97] = ch }
    put('K', board.K); put('k', board.k); for (const [p, s] of items) put(p, s)
    const fen = grid.map(r => { let o = '', n = 0; for (const x of r) { if (!x) n++; else { if (n) { o += n; n = 0 } o += x } } return o + (n || '') }).join('/') + ' w - - 0 1'
    let c; try { c = new Chess(fen) } catch { continue }
    if (c.isGameOver() || c.isAttacked(board.k, 'w')) continue
    return fen
  }
  throw new Error('no position')
}

const groups = []
const entries = []
const eng = new Eng(); await eng.init()
const userScore = (r, stmIsUser) => { const sign = stmIsUser ? 1 : -1; return { cp: r.cp === null ? null : r.cp * sign, mate: r.mate === null ? null : r.mate * sign } }
const isWin = s => (s.mate !== null && s.mate > 0) || (s.cp !== null && s.cp >= 300)
const isDraw = s => s.mate === null && s.cp !== null && Math.abs(s.cp) <= 15

// позиция должна быть законной: оба короля, не оконченная партия, у стороны, чей ход НЕ в очереди, король не под шахом
function legal(fen) {
  try {
    const c = new Chess(fen); if (c.isGameOver()) return false
    const other = c.turn() === 'w' ? 'b' : 'w'
    const ks = c.board().flat().find(x => x && x.type === 'k' && x.color === other)
    return !!ks && !c.isAttacked(ks.square, c.turn())
  } catch { return false }
}
async function verify(fen, user, goal, depth) {
  if (!legal(fen)) return { ok: false, cp: null, mate: null, depth: 0 }
  const stmIsUser = fen.split(' ')[1] === user
  const r = await eng.eval(fen, depth); const s = userScore(r, stmIsUser)
  const ok = goal === 'win' ? isWin(s) : isDraw(s)
  return { ok, cp: s.cp, mate: s.mate, depth: r.depth }
}

// --- вручную записанные теоретические позиции (каждая проходит ту же проверку движком) ---
const CURATED = [
  { id: 'lucena', group: 'rook', goal: 'win', user: 'w', level: 3, fens: ['1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1'] },
  { id: 'philidor', group: 'rook', goal: 'draw', user: 'b', level: 3, fens: ['4k3/8/1r6/3KP3/8/8/8/R7 b - - 0 1', '4k3/8/1r6/4PK2/8/8/8/R7 b - - 0 1', '3k4/8/6r1/3PK3/8/8/8/R7 b - - 0 1'] },
  { id: 'rookpawn', group: 'pawn', goal: 'draw', user: 'b', level: 2, fens: ['1k6/8/K7/P7/8/8/8/8 b - - 0 1', '8/8/8/8/8/k7/p7/K7 w - - 0 1', '7k/8/6K1/7P/8/8/8/8 b - - 0 1'] },
  { id: 'opposition', group: 'pawn', goal: 'win', user: 'w', level: 1, fens: ['8/8/8/4k3/8/4K3/4P3/8 w - - 0 1', '8/8/4k3/8/4PK2/8/8/8 w - - 0 1', '8/8/8/3k4/8/3K4/3P4/8 w - - 0 1', '8/8/3k4/8/3PK3/8/8/8 w - - 0 1', '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', '8/4k3/8/4PK2/8/8/8/8 w - - 0 1', '3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', '8/3k4/8/3PK3/8/8/8/8 w - - 0 1'] },
  { id: 'oppdraw', group: 'pawn', goal: 'draw', user: 'b', level: 1, fens: ['8/8/8/4k3/8/4K3/4P3/8 b - - 0 1', '8/8/4k3/8/4P3/4K3/8/8 b - - 0 1', '8/4k3/8/4P3/4K3/8/8/8 b - - 0 1', '8/8/8/3k4/8/3K4/3P4/8 b - - 0 1', '3k4/8/3K4/3P4/8/8/8/8 b - - 0 1'] },
]

const report = []
for (const c of CURATED) {
  let kept = 0
  for (const fen of c.fens) {
    const v = await verify(fen, c.user, c.goal, 28)
    report.push(`${c.id} ${fen} -> ${v.ok ? 'OK' : 'REJECT'} cp=${v.cp} mate=${v.mate} d=${v.depth}`)
    if (v.ok && kept < 3) { kept++; entries.push({ id: `${c.id}${kept}`, topic: c.id, group: c.group, goal: c.goal, user: c.user, level: c.level, fen, eval: { cp: v.cp, mate: v.mate, depth: v.depth } }) }
  }
}


// позиции из заданных наборов клеток (для «слона не того цвета» и «ферзя против пешки»)
function fromSpec(spec, side) {
  for (let t = 0; t < 500; t++) {
    const used = new Set(), put = []
    let bad = false
    for (const [ch, squares] of spec) { const free = squares.filter(q => !used.has(q)); if (!free.length) { bad = true; break } const q = pick(free); used.add(q); put.push([ch, q]) }
    if (bad) continue
    const kw = put.find(x => x[0] === 'K')[1], kb = put.find(x => x[0] === 'k')[1]
    if (dist(kw, kb) < 2) continue
    const grid = Array.from({ length: 8 }, () => Array(8).fill(null))
    for (const [ch, q] of put) grid[8 - +q[1]][q.charCodeAt(0) - 97] = ch
    const fen = grid.map(r => { let o = '', n = 0; for (const x of r) { if (!x) n++; else { if (n) { o += n; n = 0 } o += x } } return o + (n || '') }).join('/') + ` ${side} - - 0 1`
    if (legal(fen)) return fen
  }
  return null
}
const rect = (f0, f1, r0, r1) => { const o = []; for (let f = f0; f <= f1; f++) for (let r = r0; r <= r1; r++) o.push(String.fromCharCode(97 + f) + r); return o }
const LIGHT = SQ.filter(q => (q.charCodeAt(0) - 96 + +q[1]) % 2 === 1)
async function genSpec(topic, group, level, n, goal, user, side, spec, accept, depth = 30) {
  let kept = 0, tried = 0
  while (kept < n && tried < 600) {
    tried++
    const fen = fromSpec(spec, side); if (!fen) continue
    const v = await verify(fen, user, goal, depth)
    if (!v.ok || !accept(v)) continue
    if (entries.some(e => e.fen === fen)) continue
    kept++; entries.push({ id: `${topic}${kept}`, topic, group, goal, user, level, fen, eval: { cp: v.cp, mate: v.mate, depth: v.depth } })
  }
  report.push(`${topic}: kept ${kept} of ${tried} tried`)
}

// --- сгенерированные позиции ---
async function gen(topic, group, level, n, white, black, ok) {
  let kept = 0, tried = 0
  while (kept < n && tried < 400) {
    tried++
    const fen = randomPos(white, black)
    const v = await verify(fen, 'w', 'win', 22)
    if (!v.ok || !ok(v)) continue
    kept++; entries.push({ id: `${topic}${kept}`, topic, group, goal: 'win', user: 'w', level, fen, eval: { cp: v.cp, mate: v.mate, depth: v.depth } })
  }
  report.push(`${topic}: kept ${kept} of ${tried} tried`)
}
await gen('kqk', 'basic', 1, 8, ['Q'], [], v => v.mate !== null && v.mate >= 3 && v.mate <= 12)
await gen('krk', 'basic', 1, 8, ['R'], [], v => v.mate !== null && v.mate >= 5 && v.mate <= 22)
await gen('kbbk', 'basic', 2, 4, ['B', 'B'], [], v => { return true })
await gen('kbnk', 'basic', 3, 3, ['B', 'N'], [], v => true)
// слон не того цвета: белые К, светлопольный слон и пешка «h» (поле превращения h8 — тёмное); защищается чёрный король, его ход — ничья
await genSpec('wrongbishop', 'bishop', 3, 3, 'draw', 'b', 'b', [['K', rect(4, 7, 4, 7)], ['k', ['g8', 'h8', 'g7', 'h7', 'f8']], ['B', LIGHT.filter(q => !['h8'].includes(q))], ['P', ['h5', 'h6', 'h7']]], v => true)
// ферзь против пешки на 7-й: выигрыш белых не тривиальный (не короче мата в 5 ходов) и не ничейный случай коня/ладейной пешки
await genSpec('qvpawn', 'queen', 3, 4, 'win', 'w', 'w', [['K', SQ], ['k', SQ], ['Q', SQ], ['p', rect(1, 6, 2, 2)]], v => v.mate !== null && v.mate >= 6)
await gen('kqkr', 'queen', 3, 4, ['Q'], ['r'], v => true)

// KPK: пешка белых, выигрыш и ничья определяются движком на глубине 32 (сторона ученика — белые: выигрыш — атака; ничья — защита чёрных)
let w = 0, d = 0, tried = 0
while ((w < 8 || d < 8) && tried < 900) {
  tried++
  const fen = randomPos(['P'], [], [2, 6])
  const r = await eng.eval(fen, 26); const s = userScore(r, true)
  if (isWin(s) && w < 8) {
    const v = await verify(fen, 'w', 'win', 34); if (v.ok) { w++; entries.push({ id: `kpkw${w}`, topic: 'kpk', group: 'pawn', goal: 'win', user: 'w', level: 2, fen, eval: { cp: v.cp, mate: v.mate, depth: v.depth } }) }
  } else if (isDraw(s) && d < 8) {
    // чёрные защищаются: ходит белый, ученик — чёрные; смотрим ничью на большой глубине
    const v = await verify(fen, 'b', 'draw', 34); if (v.ok) { d++; entries.push({ id: `kpkd${d}`, topic: 'kpk', group: 'pawn', goal: 'draw', user: 'b', level: 2, fen, eval: { cp: v.cp, mate: v.mate, depth: v.depth } }) }
  }
}
report.push(`kpk: win ${w}, draw ${d}, tried ${tried}`)
eng.quit()
fs.writeFileSync(OUT, JSON.stringify({ generatedWith: 'Stockfish 19 (lite)', entries }, null, 1) + '\n')
console.log(report.join('\n')); console.log('total', entries.length)
