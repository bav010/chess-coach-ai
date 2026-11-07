import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Plugin } from 'vite'

/** Список файлов из public/, которые нужны для работы без сети (движок, иконки, манифест). */
function publicFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(path.join(root, 'public'), p).split(path.sep).join('/')) } }
  walk(path.join(root, 'public'))
  return out.filter(f => !f.endsWith('.txt') && f !== 'sw.js')
}

/** Генерирует sw.js из pwa/sw.template.js: подставляет файлы сборки + public и хэш версии (меняется при любом изменении файлов). */
export function pwa(): Plugin {
  let root = process.cwd()
  return {
    name: 'chess-coach-pwa',
    apply: 'build',
    configResolved(c) { root = c.root },
    generateBundle(_o, bundle) {
      const files = ['', 'index.html', ...Object.keys(bundle).filter(f => !f.endsWith('.map')), ...publicFiles(root)]
      const unique = [...new Set(files)]
      const hash = crypto.createHash('sha256')
      for (const f of unique) { const b = bundle[f]; hash.update(f); if (b) hash.update(b.type === 'chunk' ? b.code : Buffer.from(b.source)) }
      for (const f of publicFiles(root)) hash.update(fs.readFileSync(path.join(root, 'public', f)))
      const tpl = fs.readFileSync(path.join(root, 'pwa', 'sw.template.js'), 'utf8')
      const source = tpl.replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12))).replace("'__PRECACHE__'", JSON.stringify(unique))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
