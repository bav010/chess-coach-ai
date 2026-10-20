// Обёртка над Stockfish.js (WASM) в Web Worker. Общается с движком по протоколу UCI.
// Используется однопоточная lite-сборка: ей не нужны специальные HTTP-заголовки,
// поэтому она работает на любом статическом хостинге, включая GitHub Pages.
//
// В приложении два независимых экземпляра (два Worker'а): один для анализа и разбора партий,
// другой для ходов бота. Так анализ и игра не мешают друг другу и не сбивают настройки силы.

import { LocalizedError } from './i18n/errors'

/** Одна линия (вариант) из вывода движка. Оценка — с точки зрения стороны, чей ход. */
export type PvLine = {
  multipv: number
  depth: number
  cp: number | null
  /** Ходов до мата: > 0 — мат ставит сторона, чей ход; < 0 — ей ставят мат. */
  mate: number | null
  pv: string[]
}

export type Analysis = {
  bestMoveUci: string | null
  pvUci: string[]
  /** Оценка в сантипешках с точки зрения стороны, чей ход (null, если найден мат). */
  cp: number | null
  mate: number | null
  depth: number
  /** Все линии (MultiPV), по порядку силы. Содержит только то, что реально вернул движок. */
  lines: PvLine[]
}

export type Strength = { limitStrength: boolean; uciElo: number }

export type SearchOptions = {
  depth?: number
  /** Максимум времени на поиск, мс. */
  movetime?: number
  /** Сколько вариантов запрашивать (MultiPV). */
  multipv?: number
  /** Ослабление движка (для бота). По умолчанию — полная сила. */
  strength?: Strength
  /** Вызывается при каждом обновлении линий — удобно для «живой» оценки. */
  onProgress?: (a: Analysis) => void
  /** Отмена: поиск останавливается, промис завершается тем, что успели найти. */
  signal?: AbortSignal
}

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

const EMPTY: Analysis = { bestMoveUci: null, pvUci: [], cp: null, mate: null, depth: 0, lines: [] }

function toAnalysis(lines: PvLine[], bestMoveUci: string | null): Analysis {
  const sorted = [...lines].filter(Boolean).sort((a, b) => a.multipv - b.multipv)
  const top = sorted[0]
  if (!top) return { ...EMPTY, bestMoveUci }
  return { bestMoveUci, pvUci: top.pv, cp: top.cp, mate: top.mate, depth: top.depth, lines: sorted }
}

export class Engine {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private listeners = new Set<(line: string) => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private options = new Map<string, string>()

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

  /** Загружает движок (один раз). Безопасно вызывать многократно; после ошибки можно вызвать снова. */
  start(): Promise<void> {
    if (this.ready) return this.ready
    const attempt = new Promise<void>((resolve, reject) => {
      let worker: Worker
      try {
        worker = new Worker(ENGINE_URL)
      } catch (e) {
        reject(e instanceof Error ? e : new LocalizedError('analysis.err.worker'))
        return
      }
      this.worker = worker
      worker.onmessage = ev => {
        const line = String(ev.data)
        this.listeners.forEach(l => l(line))
      }
      worker.onerror = () => reject(new LocalizedError('analysis.err.engine'))
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
    this.ready = attempt
    attempt.catch(() => {
      if (this.ready === attempt) this.ready = null
      this.worker?.terminate()
      this.worker = null
    })
    return attempt
  }

  /** Меняет опцию UCI, только если значение изменилось. Вызывать, когда движок свободен. */
  private async setOption(name: string, value: string | number | boolean) {
    const v = String(value)
    if (this.options.get(name) === v) return
    this.options.set(name, v)
    this.send(`setoption name ${name} value ${v}`)
    const readyOk = this.waitFor(l => l === 'readyok')
    this.send('isready')
    await readyOk
  }

  /** Прерывает текущий поиск (если он идёт). */
  stop() {
    this.send('stop')
  }

  /** Новая партия: сбрасывает хеш движка. Выполняется в очереди. */
  newGame(): Promise<void> {
    const run = async () => {
      await this.start()
      const readyOk = this.waitFor(l => l === 'readyok')
      this.send('ucinewgame')
      this.send('isready')
      await readyOk
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }

  /** Анализ позиции по FEN. Запросы выполняются по очереди. */
  analyse(fen: string, opts: SearchOptions = {}): Promise<Analysis> {
    return this.enqueue(`position fen ${fen}`, opts)
  }

  /**
   * Поиск хода из позиции `startFen` после последовательности ходов `moves` (UCI).
   * Передача всей истории позволяет движку учитывать повторения позиций.
   */
  search(startFen: string, moves: readonly string[], opts: SearchOptions = {}): Promise<Analysis> {
    const position = `position fen ${startFen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`
    return this.enqueue(position, opts)
  }

  private enqueue(positionCmd: string, opts: SearchOptions): Promise<Analysis> {
    const run = () => this.run(positionCmd, opts)
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }

  private async run(positionCmd: string, opts: SearchOptions): Promise<Analysis> {
    const { depth = 14, movetime = 4000, multipv = 1, strength, onProgress, signal } = opts
    if (signal?.aborted) return EMPTY
    await this.start()
    if (signal?.aborted) return EMPTY

    await this.setOption('MultiPV', multipv)
    await this.setOption('UCI_LimitStrength', strength?.limitStrength ?? false)
    await this.setOption('UCI_Elo', strength?.uciElo ?? 3190)
    if (signal?.aborted) return EMPTY

    return new Promise<Analysis>(resolve => {
      const lines: PvLine[] = []
      const onAbort = () => this.send('stop')
      signal?.addEventListener('abort', onAbort, { once: true })

      const listener = (line: string) => {
        if (line.startsWith('info ') && line.includes(' pv ')) {
          if (/\b(lowerbound|upperbound)\b/.test(line)) return
          const d = /\bdepth (\d+)/.exec(line)
          const s = /\bscore (cp|mate) (-?\d+)/.exec(line)
          const pv = /\bpv (.+)$/.exec(line)
          const mp = /\bmultipv (\d+)/.exec(line)
          if (d && s && pv) {
            const n = mp ? Number(mp[1]) : 1
            lines[n - 1] = {
              multipv: n,
              depth: Number(d[1]),
              cp: s[1] === 'cp' ? Number(s[2]) : null,
              mate: s[1] === 'mate' ? Number(s[2]) : null,
              pv: pv[1].trim().split(/\s+/),
            }
            onProgress?.(toAnalysis(lines, null))
          }
        } else if (line.startsWith('bestmove')) {
          this.listeners.delete(listener)
          signal?.removeEventListener('abort', onAbort)
          const m = /^bestmove (\S+)/.exec(line)?.[1]
          resolve(toAnalysis(lines, m && m !== '(none)' ? m : null))
        }
      }
      this.listeners.add(listener)
      this.send(positionCmd)
      this.send(`go depth ${depth} movetime ${movetime}`)
      if (signal?.aborted) this.send('stop')
    })
  }

  terminate() {
    this.worker?.terminate()
    this.worker = null
    this.ready = null
    this.listeners.clear()
    this.options.clear()
  }
}

/** Движок анализа и разбора партий. */
export const analysisEngine = new Engine()
/** Отдельный движок для ходов бота. */
export const botEngine = new Engine()
/** Движок проверки ходов в режиме «Задачи». */
export const puzzleEngine = new Engine()
