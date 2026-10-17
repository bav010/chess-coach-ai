// Сборка базы задач из сырых результатов генератора (scripts/gen-puzzles.mjs):
//   npx vite-node scripts/build-puzzles.ts -- raw-1.jsonl raw-2.jsonl
// Каждая запись сырых данных уже проверена движком (мат — по `score mate`, выигрыш — разрыв с вторым вариантом,
// защита — реальная угроза). Здесь повторно проверяется легальность и итог решения шахматной библиотекой,
// определяются темы и пишутся пояснения. Позиции без распознанной темы в базу не попадают.
import fs from 'node:fs'
import { Chess } from 'chess.js'
import { balance, detectThemes, type ThemeId } from '../src/lib/puzzleThemes'
import { splitUci } from '../src/lib/game'
import type { Puzzle } from '../src/lib/puzzles'

const files = process.argv.slice(2).filter(a => a !== '--' && a.endsWith('.jsonl'))
type Raw = { fen: string; solver: 'w' | 'b'; kind: 'mate' | 'win' | 'defense'; mate: number | null; line: string[]; cp: number | null; stableDepth: number }

const raws: Raw[] = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Raw))
const seen = new Set<string>()
const out: Puzzle[] = []
const hash = (s: string) => { let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return (h >>> 0).toString(36) }
const userThemes: ThemeId[] = ['fork', 'pin', 'doubleAttack', 'discovered', 'deflection', 'mateCombo', 'defense']
let dropped = { illegal: 0, noTheme: 0, dup: 0, bad: 0 }

for (const r of raws) {
  const key = r.fen.split(' ').slice(0, 4).join(' ')
  if (seen.has(key)) { dropped.dup++; continue }
  seen.add(key)
  // легальность и итог
  const c = new Chess(r.fen)
  const solver = c.turn()
  const base = balance(c, solver)
  try { for (const u of r.line) c.move(splitUci(u)) } catch { dropped.illegal++; continue }
  if (r.kind === 'mate' && !c.isCheckmate()) { dropped.bad++; continue }
  const gain = balance(c, solver) - base
  if (r.kind === 'win' && gain < 2) { dropped.bad++; continue }

  const det = detectThemes(r.fen, r.line, { mate: r.kind === 'mate' ? r.mate : null, defense: r.kind === 'defense' })
  if (!det.themes.some(t => userThemes.includes(t)) && !(r.kind === 'mate' && r.mate === 1)) { dropped.noTheme++; continue }

  const why = [...det.explain]
  if (r.kind === 'win') why.push(`Итог: вы выигрываете материал (+${gain}).`)
  const long = r.line.length >= 5
  const level: 1 | 2 | 3 = r.stableDepth >= 8 || long ? 3 : r.stableDepth <= 3 && r.line.length <= 3 ? 1 : 2
  out.push({ id: `p${hash(key)}`, fen: r.fen, line: r.line, themes: det.themes, kind: r.kind, mate: r.kind === 'mate' ? r.mate : null, level, cp: r.cp, why })
}

// ограничение размера: не больше N на главную тему, чтобы база была сбалансирована
const CAP = 70
const per: Record<string, number> = {}
const final = out.filter(p => {
  const k = p.mate === 1 ? 'm1' : p.themes.find(t => userThemes.includes(t)) ?? 'x'
  per[k] = (per[k] ?? 0) + 1
  return per[k] <= CAP
})
fs.writeFileSync('src/data/puzzles.json', JSON.stringify(final))
const tc: Record<string, number> = {}
for (const p of final) for (const t of p.themes) tc[t] = (tc[t] ?? 0) + 1
console.log('raw', raws.length, 'dropped', dropped, 'kept', final.length, 'themes', tc, 'levels', [1, 2, 3].map(l => final.filter(p => p.level === l).length))
