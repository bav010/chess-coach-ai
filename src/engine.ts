// Обёртка над Stockfish.js (WASM) в Web Worker. Общается с движком по протоколу UCI.
// Используется однопоточная lite-сборка: ей не нужны специальные HTTP-заголовки,
// поэтому она работает на любом статическом хостинге, включая GitHub Pages.

export type Analysis = {
  bestMoveUci: string | null
  pvUci: string[]
  /** Оценка в сантипешках с точки зрения стороны, чей ход (null, если найден мат). */
  cp: number | null
  /** Ходов до мата: > 0 — мат ставит сторона, чей ход; < 0 — ей ставят мат. */
  mate: number | null
  depth: number
}

export type AnalyseOptions = {
  depth?: number
  /** Максимум времени на анализ, мс. */
  movetime?: number
  /** Вызывается на каждой новой глубине — удобно для «живой» оценки. */
  onProgress?: (a: Analysis) => void
}

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

export class Engine {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private listeners = new Set<(line: string) => void>()
  private queue: Promise<unknown> = Promise.resolve()

  private send(cmd: string) {
    this.worker?.postMessage(cmd)
  }

  private waitFor(match: (line: string) => boolean): Promise<void> {
    return new Promise(resolve => {
      const listener = (line: string) => {
        if (match(line)) { this.listeners.delete(listener); resolve() }
      }
      this.listeners.add(listener)
    })
  }

  /** Загружает движок (один раз). Безопасно вызывать многократно. */
  start(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = new Promise<void>((resolve, reject) => {
      let worker: Worker
      try {
        worker = new Worker(ENGINE_URL)
      } catch (e) {
        this.ready = null
        reject(e instanceof Error ? e : new Error('Не удалось создать Worker'))
        return
      }
      this.worker = worker
      worker.onmessage = ev => {
        const line = String(ev.data)
        this.listeners.forEach(l => l(line))
      }
      worker.onerror = () => {
        this.ready = null
        this.worker = null
        reject(new Error('Не удалось загрузить движок Stockfish'))
      }
      const uciOk = this.waitFor(l => l === 'uciok')
      this.send('uci')
      uciOk
        .then(() => {
          const readyOk = this.waitFor(l => l === 'readyok')
          this.send('isready')
          return readyOk
        })
        .then(resolve, reject)
    })
    return this.ready
  }

  /** Прерывает текущий анализ; промис analyse() завершится с лучшим найденным ходом. */
  stop() {
    this.send('stop')
  }

  /** Анализ позиции. Запросы выполняются по очереди. */
  analyse(fen: string, { depth = 14, movetime = 4000, onProgress }: AnalyseOptions = {}): Promise<Analysis> {
    const run = async (): Promise<Analysis> => {
      await this.start()
      return new Promise<Analysis>(resolve => {
        let last: Analysis = { bestMoveUci: null, pvUci: [], cp: null, mate: null, depth: 0 }
        const listener = (line: string) => {
          if (line.startsWith('info ') && line.includes(' pv ')) {
            const d = /\bdepth (\d+)/.exec(line)
            const s = /\bscore (cp|mate) (-?\d+)/.exec(line)
            const pv = /\bpv (.+)$/.exec(line)
            if (d && s && pv) {
              last = {
                bestMoveUci: last.bestMoveUci,
                pvUci: pv[1].trim().split(/\s+/),
                cp: s[1] === 'cp' ? Number(s[2]) : null,
                mate: s[1] === 'mate' ? Number(s[2]) : null,
                depth: Number(d[1]),
              }
              onProgress?.(last)
            }
          } else if (line.startsWith('bestmove')) {
            this.listeners.delete(listener)
            const m = /^bestmove (\S+)/.exec(line)?.[1]
            resolve({ ...last, bestMoveUci: m && m !== '(none)' ? m : null })
          }
        }
        this.listeners.add(listener)
        this.send('ucinewgame')
        this.send(`position fen ${fen}`)
        this.send(`go depth ${depth} movetime ${movetime}`)
      })
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }

  terminate() {
    this.worker?.terminate()
    this.worker = null
    this.ready = null
    this.listeners.clear()
  }
}

export const engine = new Engine()
