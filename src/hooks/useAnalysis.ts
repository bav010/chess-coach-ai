import { useEffect, useRef, useState } from 'react'
import { analysisEngine } from '../engine'
import { errorText } from '../i18n/errors'
import { getCached, isTerminalFen, peekCache, putCache, type CacheEntry } from '../lib/analysisCache'

export type AnalysisOptions = {
  /** Позиции по приоритету: сначала текущая, затем соседние (например, позиция перед ходом). */
  fens: string[]
  enabled: boolean
  /** Сколько вариантов запрашивать для текущей позиции (для остальных — один). */
  multipv: number
}

export type AnalysisState = {
  /** Текущий результат для позиции из кэша (может быть неполным, пока идёт поиск). */
  get: (fen: string) => CacheEntry | undefined
  busy: boolean
  error: string | null
}

const PRIMARY = { depth: 22, movetime: 6000 }
const SECONDARY = { depth: 16, movetime: 3000 }

/**
 * Автоматический анализ: при смене позиции отменяет устаревший поиск, не считает повторно то, что уже
 * есть в кэше, и по очереди считает дополнительные позиции. Использует только движок анализа.
 */
export function usePositionAnalysis({ fens, enabled, multipv }: AnalysisOptions): AnalysisState {
  const [, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ e: unknown } | null>(null)
  const key = `${enabled}|${multipv}|${fens.join('|')}`
  const fensRef = useRef(fens)
  fensRef.current = fens

  useEffect(() => {
    if (!enabled) return
    const list = fensRef.current
    const ac = new AbortController()
    let alive = true
    const bump = () => { if (alive) setVersion(v => v + 1) }

    ;(async () => {
      setError(null)
      for (let i = 0; i < list.length; i++) {
        const fen = list[i]
        const mp = i === 0 ? multipv : 1
        const limits = i === 0 ? PRIMARY : SECONDARY
        if (isTerminalFen(fen) || getCached(fen, mp, limits.movetime)) continue
        if (alive) setBusy(true)
        const result = await analysisEngine.analyse(fen, {
          depth: limits.depth,
          movetime: limits.movetime,
          multipv: mp,
          signal: ac.signal,
          onProgress: a => { if (alive) { putCache(fen, a, mp, limits.movetime, false); bump() } },
        })
        if (ac.signal.aborted) return
        putCache(fen, result, mp, limits.movetime, true)
        bump()
      }
    })()
      .catch(e => { if (alive) setError({ e }) })
      .finally(() => { if (alive) setBusy(false) })

    return () => { alive = false; ac.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // текст ошибки строится при каждом вызове — следует за языком интерфейса
  return { get: peekCache, busy: busy && enabled, error: error ? errorText(error.e, 'analysis.err.analysis') : null }
}
