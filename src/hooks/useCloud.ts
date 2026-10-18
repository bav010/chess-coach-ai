import { useCallback, useEffect, useRef, useState } from 'react'
import {
  attachProfile, authErrorText, cloudConfigured, deleteAccount, getUser, onAuth, pushIfChanged, resetPassword, signIn, signOut, signUp,
  syncFull, updatePassword, validateCredentials, type CloudUser,
} from '../lib/cloud'
import { loadMeta } from '../lib/sync'

export type CloudStatus = 'off' | 'loading' | 'out' | 'in'
export type CloudState = {
  status: CloudStatus
  user: CloudUser | null
  busy: boolean
  lastSync: number
  error: string
  info: string
  /** Пользователь пришёл по ссылке «сбросить пароль» и должен задать новый. */
  recovery: boolean
}
export type CloudApi = CloudState & {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  forgot: (email: string) => Promise<void>
  newPassword: (password: string) => Promise<void>
  syncNow: () => Promise<void>
  removeAccount: () => Promise<void>
  clearMessages: () => void
}

const RELOAD_FLAG = 'cca-sync-reload'
/** Перезагрузка после того, как синхронизация изменила локальные данные; не чаще раза в 30 с, чтобы не зациклиться. */
function reloadOnce(): boolean {
  try {
    const t = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0)
    if (Date.now() - t < 30_000) return false
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch { /* ничего */ }
  window.location.reload()
  return true
}

/** Вход по почте и паролю, синхронизация при входе, периодическая отправка изменений. */
export function useCloud(changeToken: unknown): CloudApi {
  const [st, setSt] = useState<CloudState>({ status: cloudConfigured ? 'loading' : 'off', user: null, busy: false, lastSync: loadMeta().lastSyncAt, error: '', info: '', recovery: false })
  const userRef = useRef<CloudUser | null>(null)
  const syncedFor = useRef<string | null>(null)
  const patch = useCallback((p: Partial<CloudState>) => setSt(s => ({ ...s, ...p })), [])

  const handleSignedIn = useCallback(async (user: CloudUser) => {
    userRef.current = user
    patch({ status: 'in', user, error: '' })
    if (syncedFor.current === user.id) return
    syncedFor.current = user.id
    if (attachProfile(user)) return // идёт переключение профиля с перезагрузкой
    patch({ busy: true })
    try {
      const r = await syncFull(user)
      patch({ lastSync: r.at, busy: false, info: 'Данные синхронизированы.' })
      if (r.changed) reloadOnce()
    } catch (e) { patch({ busy: false, error: `Не удалось синхронизировать: ${authErrorText(e)}` }) }
  }, [patch])

  useEffect(() => {
    if (!cloudConfigured) return
    let off = () => {}
    let alive = true
    void (async () => {
      try {
        off = await onAuth((ev, user) => {
          if (!alive) return
          if (ev === 'recovery') patch({ recovery: true, status: user ? 'in' : 'out', user })
          else if (ev === 'signed_in' && user) void handleSignedIn(user)
          else if (ev === 'signed_out') { userRef.current = null; syncedFor.current = null; patch({ status: 'out', user: null, info: '' }) }
        })
        const u = await getUser()
        if (!alive) return
        if (u) await handleSignedIn(u); else patch({ status: 'out' })
      } catch (e) { if (alive) patch({ status: 'out', error: authErrorText(e) }) }
    })()
    return () => { alive = false; off() }
  }, [handleSignedIn, patch])

  // отправка локальных изменений: по таймеру и через несколько секунд после изменения данных
  useEffect(() => {
    if (st.status !== 'in') return
    const push = () => { const u = userRef.current; if (u) void pushIfChanged(u).then(ok => { if (ok) patch({ lastSync: Date.now() }) }).catch(() => undefined) }
    const id = window.setInterval(push, 60_000)
    const t = window.setTimeout(push, 4000)
    return () => { clearInterval(id); clearTimeout(t) }
  }, [st.status, changeToken, patch])

  const run = useCallback(async (fn: () => Promise<void>) => {
    patch({ busy: true, error: '', info: '' })
    try { await fn() } catch (e) { patch({ error: authErrorText(e) }) } finally { patch({ busy: false }) }
  }, [patch])

  return {
    ...st,
    clearMessages: () => patch({ error: '', info: '' }),
    login: (email, password) => run(async () => {
      const bad = validateCredentials(email, password); if (bad) throw new Error(bad)
      const u = await signIn(email, password); await handleSignedIn(u)
    }),
    register: (email, password) => run(async () => {
      const bad = validateCredentials(email, password); if (bad) throw new Error(bad)
      const r = await signUp(email, password)
      if (r.user) await handleSignedIn(r.user)
      else patch({ info: 'Мы отправили письмо со ссылкой для подтверждения. Откройте его, затем войдите.' })
    }),
    logout: () => run(async () => { await signOut(); patch({ status: 'out', user: null, info: 'Вы вышли. Данные остались на этом устройстве.' }) }),
    forgot: email => run(async () => { await resetPassword(email); patch({ info: 'Если такая почта зарегистрирована, мы отправили письмо со ссылкой для сброса пароля.' }) }),
    newPassword: password => run(async () => {
      if (password.length < 8) throw new Error('Пароль — минимум 8 символов.')
      await updatePassword(password); patch({ recovery: false, info: 'Пароль изменён.' })
    }),
    syncNow: () => run(async () => {
      const u = userRef.current; if (!u) return
      const r = await syncFull(u); patch({ lastSync: r.at, info: r.changed ? 'Получены данные с другого устройства — обновляю страницу…' : 'Данные синхронизированы.' })
      if (r.changed) window.setTimeout(() => window.location.reload(), 600)
    }),
    removeAccount: () => run(async () => { await deleteAccount(); syncedFor.current = null; userRef.current = null; patch({ status: 'out', user: null, info: 'Аккаунт и облачные данные удалены. Локальные данные остались на этом устройстве.' }) }),
  }
}
