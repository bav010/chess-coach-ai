// Сборка каталога дебютов из lichess-org/chess-openings (CC0, https://github.com/lichess-org/chess-openings):
//   скачайте a.tsv … e.tsv в папку и выполните
//   npx vite-node scripts/build-openings.ts -- <папка с tsv>
// Результат — src/data/openings.json: [[eco, name, "e2e4 e7e5 …"], …]. Каждая линия повторно проверяется chess.js.
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

const dd = process.argv.indexOf('--')
const dir = process.argv[dd >= 0 ? dd + 1 : 2]
const out: [string, string, string][] = []
let bad = 0
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const lines = fs.readFileSync(path.join(dir, `${f}.tsv`), 'utf8').split('\n').slice(1).filter(Boolean)
  for (const l of lines) {
    const [eco, name, pgn] = l.split('\t')
    const c = new Chess()
    try {
      c.loadPgn(pgn)
      out.push([eco, name, c.history({ verbose: true }).map(m => `${m.from}${m.to}${m.promotion ?? ''}`).join(' ')])
    } catch { bad++ }
  }
}
fs.writeFileSync('src/data/openings.json', JSON.stringify(out))
console.log('openings', out.length, 'skipped', bad)
