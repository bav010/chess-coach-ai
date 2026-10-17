// @ts-nocheck
// Генератор задач (одноразовый инструмент разработчика, в сборку сайта не входит):
//   npx vite-node scripts/gen-puzzles.ts -- <seed> <out.jsonl> <hours> [path/to/stockfish.js]
// Самоигра ослабленного Stockfish → позиции → быстрый отбор → фильтр по темам → глубокая проверка (depth 20).
// Генератор задач: самоигра ослабленного Stockfish → кандидаты → глубокая проверка → jsonl
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { Chess } from 'chess.js'
import { detectThemes } from '../src/lib/puzzleThemes'

const dd = process.argv.indexOf('--')
const args = dd >= 0 ? process.argv.slice(dd + 1) : process.argv.slice(2)
const seed0 = +args[0] || 1
const outFile = args[1] || `raw-${seed0}.jsonl`
const hours = +args[2] || 0.5
const SF = args[3] || 'sf.cjs' // CommonJS-копия Stockfish.js (node sf.cjs), лежащая рядом с sf.wasm
let s = seed0 * 9301 + 49297
const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }

class Eng {
  constructor() { this.p = spawn(process.execPath, [SF], { stdio: ['pipe', 'pipe', 'ignore'] }); this.buf = ''; this.waiters = []
    this.p.stdout.on('data', d => { this.buf += d; const ls = this.buf.split('\n'); this.buf = ls.pop(); for (const l of ls) for (const w of [...this.waiters]) if (w(l.trim())) this.waiters.splice(this.waiters.indexOf(w), 1) }) }
  send(c) { this.p.stdin.write(c + '\n') }
  wait(pred) { return new Promise(res => this.waiters.push(l => { const r = pred(l); if (r) { res(r === true ? l : r); return true } return false })) }
  async init() { this.send('uci'); await this.wait(l => l === 'uciok'); this.send('setoption name Hash value 32'); await this.ready() }
  async ready() { this.send('isready'); await this.wait(l => l === 'readyok') }
  async opt(n, v) { this.send(`setoption name ${n} value ${v}`) }
  // возвращает линии [{pv:[uci], cp, mate, depth}] с точки зрения стороны, которая ходит
  async search(fen, go, multipv) {
    this.send(`setoption name MultiPV value ${multipv}`)
    const lines = {}
    const h = l => { if (l.startsWith('info') && / pv /.test(l) && !/bound/.test(l)) {
      const mp = +(/multipv (\d+)/.exec(l)?.[1] ?? 1), d = +/depth (\d+)/.exec(l)[1]
      const cp = /score cp (-?\d+)/.exec(l), m = /score mate (-?\d+)/.exec(l)
      lines[mp] = { pv: l.split(' pv ')[1].split(' '), cp: cp ? +cp[1] : null, mate: m ? +m[1] : null, depth: d } } return false }
    this.waiters.push(h)
    this.send(`position fen ${fen}`)
    const w = this.wait(l => l.startsWith('bestmove') ? l.split(' ')[1] : false)
    this.send(go)
    const best = await w
    this.waiters.splice(this.waiters.indexOf(h), 1)
    return { best, lines: Object.keys(lines).sort((a, b) => a - b).map(k => lines[k]) }
  }
  quit() { this.send('quit'); this.p.kill() }
}

const win = l => l.mate !== null ? (l.mate > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * l.cp)) - 1)
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const mat = (c, color) => { let t = 0; for (const r of c.board()) for (const x of r) if (x) t += (x.color === color ? 1 : -1) * VAL[x.type]; return t }

const player = new Eng(), judge = new Eng()
await player.init(); await judge.init()
await player.opt('UCI_LimitStrength', 'true')

function followPv(fen, pv, n) { const c = new Chess(fen); const out = []; for (const u of pv.slice(0, n)) { try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) } catch { break } out.push(u) } return out }

function classify(lines) {
  const [a, b] = lines
  if (!a) return null
  if (a.mate !== null && a.mate > 0 && a.mate <= 4) {
    if (!b || b.mate === null || b.mate < 0 || b.mate > a.mate + 1 || b.mate <= 0) {
      if (!b || b.mate === null || b.mate <= 0 || b.mate > a.mate + 1) return { kind: 'mate', mate: a.mate }
    }
    return null
  }
  if (a.mate !== null) return null
  if (!b) return null
  const wa = win(a), wb = win(b)
  if (a.cp >= 220 && wa - wb >= 18 && b.cp < 150) return { kind: 'win', mate: null }
  if (a.cp >= -120 && a.cp <= 120 && b.mate === null && b.cp <= -350 && lines[2] && (lines[2].mate !== null ? lines[2].mate < 0 : lines[2].cp <= -300)) return { kind: 'defense', mate: null }
  if (a.cp >= -120 && a.cp <= 120 && b.mate !== null && b.mate < 0) return { kind: 'defense', mate: null }
  return null
}

const seen = new Set()
const t0 = Date.now()
let games = 0, found = 0
const out = fs.createWriteStream(outFile, { flags: 'a' })

async function verify(fen, cand) {
  const deep = await judge.search(fen, 'go depth 20 movetime 3000', 3)
  const k = classify(deep.lines)
  if (!k || k.kind !== cand.kind) return null
  if (k.kind === 'mate' && k.mate !== cand.mate) return null
  const best = deep.lines[0]
  const chess = new Chess(fen)
  const solver = chess.turn()
  let line
  if (k.kind === 'mate') line = followPv(fen, best.pv, k.mate * 2 - 1)
  else {
    const pv = followPv(fen, best.pv, 7)
    // обрезаем: после ответа соперника выигрыш ≥2 и дальше не берём
    const c = new Chess(fen); const base = mat(c, solver); line = []
    let cut = null
    for (let i = 0; i < pv.length; i++) {
      c.move({ from: pv[i].slice(0, 2), to: pv[i].slice(2, 4), promotion: pv[i][4] }); line.push(pv[i])
      if (i % 2 === 1 || i === pv.length - 1) {
        const nextIsSolverCapture = i + 1 < pv.length && (() => { const t = new Chess(c.fen()); const m = t.move({ from: pv[i + 1].slice(0, 2), to: pv[i + 1].slice(2, 4), promotion: pv[i + 1][4] }); return !!m.captured })()
        if (k.kind === 'win' && mat(c, solver) - base >= 2 && !nextIsSolverCapture) { cut = i + 1; break }
        if (k.kind === 'defense' && i === 1) { cut = 2; break }
      }
    }
    if (cut === null) { if (k.kind === 'win') return null; cut = Math.min(2, line.length) }
    line = line.slice(0, cut)
    if (k.kind === 'win' && line.length % 2 === 0 && line.length < 2) return null
  }
  if (line.length < 1) return null
  if (k.kind === 'defense') {
    // реальная угроза: если пропустить ход, соперник выигрывает
    if (chess.inCheck()) return null
    const parts = fen.split(' '); parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-'
    let nf = parts.join(' ')
    try { new Chess(nf) } catch { return null }
    const t = await judge.search(nf, 'go depth 16 movetime 1500', 1)
    const l = t.lines[0]; if (!l) return null
    if (!(l.mate !== null ? l.mate > 0 : l.cp >= 300)) return null
  }
  // трудность: наименьшая глубина, начиная с которой лучший ход стабильно совпадает с решением
  const sol = line[0]
  let stable = 99, lastBad = 0
  for (let d = 1; d <= 14; d++) {
    const r = await judge.search(fen, `go depth ${d}`, 1)
    if (r.best !== sol) lastBad = d
  }
  stable = lastBad + 1
  return { fen, solver, kind: k.kind, mate: k.mate, line, cp: best.cp, wm: best.mate, gap: deep.lines[1] ? Math.round(win(best) - win(deep.lines[1])) : null, stableDepth: stable }
}

const deadline = t0 + hours * 3600_000
while (Date.now() < deadline) {
  player.send('ucinewgame'); judge.send('ucinewgame')
  const chess = new Chess()
  games++
  const elo = 1320 + Math.floor(rnd() * 400)
  await player.opt('UCI_Elo', elo)
  let ply = 0
  while (!chess.isGameOver() && ply < 110) {
    const fen = chess.fen()
    const mv = chess.moves({ verbose: true })
    // ходы дебюта — случайные из лучших
    const r = await player.search(fen, `go movetime ${ply < 8 ? 25 : 35}`, 7)
    let pick = r.best
    const pool = r.lines.filter(l => ply < 6 ? true : win(l) >= win(r.lines[0]) - (ply < 14 ? 15 : 22))
    if (ply < 14 && pool.length) pick = pool[Math.floor(rnd() * pool.length)].pv[0]
    else if (rnd() < 0.55 && pool.length) pick = pool[Math.floor(rnd() * pool.length)].pv[0]
    // позиция для проверки — перед ходом
    if (ply >= 10 && !seen.has(fen.split(' ').slice(0, 4).join(' '))) {
      seen.add(fen.split(' ').slice(0, 4).join(' '))
      const q = await judge.search(fen, 'go depth 11', 3)
      const k = classify(q.lines)
      let themed = false
      if (k) {
        if (k.kind === 'win') {
          try {
            const pv = followPv(fen, q.lines[0].pv, 5)
            const d = detectThemes(fen, pv, { mate: null, requireCapture: false })
            themed = d.themes.some(t => ['fork', 'pin', 'doubleAttack', 'discovered', 'deflection'].includes(t))
          } catch { themed = false }
        } else themed = !process.env.ONLYWIN
      }
      if (k && themed) {
        const v = await verify(fen, k)
        if (v) { found++; out.write(JSON.stringify(v) + '\n') }
      }
    }
    try { chess.move({ from: pick.slice(0, 2), to: pick.slice(2, 4), promotion: pick[4] }) } catch { break }
    ply++
  }
  if (games % 5 === 0) console.log(`seed ${seed0}: games ${games}, puzzles ${found}, ${Math.round((Date.now() - t0) / 60000)} min`)
}
player.quit(); judge.quit(); out.end()
