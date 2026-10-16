import { useCallback, useState } from 'react'
import { loadPrefs, savePrefs, type Prefs } from '../lib/prefs'

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs())
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      savePrefs(next)
      return next
    })
  }, [])
  return [prefs, update]
}
