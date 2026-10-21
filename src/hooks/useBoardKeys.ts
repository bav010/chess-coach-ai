import { useEffect, useRef } from 'react'

export type BoardKeyHandlers = { prev?: () => void; next?: () => void; first?: () => void; last?: () => void; flip?: () => void }
const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) }

/** Горячие клавиши доски: ← → шаг по ходам, Home/End — к началу/концу, F — перевернуть доску. Работают только когда enabled. */
export function useBoardKeys(enabled: boolean, h: BoardKeyHandlers) {
  const ref = useRef(h)
  ref.current = h
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      const x = ref.current
      const run = (f?: () => void) => { if (f) { e.preventDefault(); f() } }
      if (e.key === 'ArrowLeft') run(x.prev)
      else if (e.key === 'ArrowRight') run(x.next)
      else if (e.key === 'Home') run(x.first)
      else if (e.key === 'End') run(x.last)
      else if (e.key === 'f' || e.key === 'F') run(x.flip)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
