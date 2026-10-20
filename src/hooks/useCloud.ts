import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MIN_PASSWORD, attachProfile, authError, checkServer, cloudConfigured, deleteAccount, getUser, leaveToGuest, onAuth, pushIfChanged, remoteHasNews,
  resetPassword, signIn, signOut, signUp, syncFull, updatePassword, validateCredentials, type CloudUser,
} from '../lib/cloud'
import { LocalizedError, type Msg } from '../i18n/errors'
import { loadMeta } from '../lib/sync'

export type CloudStatus = 'off' | 'loading' | 'out' | 'in'
export type CloudState = {
  status: CloudStatus
  user: CloudUser | null
  busy: boolean
  lastSync: number
  /** Сообщения хранятся как ключ+параметры и переводятся при показе (смена языка обновляет их). */
  error: Msg | null
  info: Msg | null
  /** В облаке есть более новый прогресс с другого устройства (локальные данные не тронуты). */
  news: boolean
  /** Пользователь пришёл по ссылке «сбросить пароль» и должен задать новый. */
  recovery: boolean
}
export type CloudApi = CloudState & {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  forgot: (email: string) => Promise<void>
  newPassword: (password: string) => Promise<void>
  /** Забрать прогресс с другого устройства и обновить страницу. */
  applyNews: () => Promise<void>
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

/**
 * Вход по почте и паролю и полностью автоматическая синхронизация:
 * при входе и запуске — загрузка и объединение, затем отправка изменений (по таймеру, после изменений, при сворачивании вкладки),
 * проверка новостей с других устройств (при возврате на вкладку и по таймеру).
 */
export function useCloud(changeToken: unknown): CloudApi {
  const [st, setSt] = useState<CloudState>({ status: cloudConfigured ? 'loading' : 'off', user: null, busy: false, lastSync: loadMeta().lastSyncAt, error: null, info: null, news: false, recovery: false })
  const userRef = useRef<CloudUser | null>(null)
  const syncedFor = useRef<string | null>(null)
  const patch = useCallback((p: Partial<CloudState>) => setSt(s => ({ ...s, ...p })), [])

  const handleSignedIn = useCallback(async (user: CloudUser) => {
    userRef.current = user
    patch({ status: 'in', user, error: null })
    if (syncedFor.current === user.id) return
    syncedFor.current = user.id
    if (attachProfile(user)) return // идёт переключение профиля с перезагрузкой
    patch({ busy: true })
    try {
      const r = await syncFull(user)
      patch({ lastSync: r.at, busy: false, info: { key: 'app.cloud.msg.synced' } })
      if (r.changed) reloadOnce()
    } catch (e) { patch({ busy: false, error: authError(e) }) }
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
          else if (ev === 'signed_out') { userRef.current = null; syncedFor.current = null; patch({ status: 'out', user: null, info: null, news: false }) }
        })
        const u = await getUser()
        if (!alive) return
        if (u) await handleSignedIn(u); else patch({ status: 'out' })
      } catch (e) { if (alive) patch({ status: 'out', error: authError(e) }) }
    })()
    return () => { alive = false; off() }
  }, [handleSignedIn, patch])

  // отправка локальных изменений: по таймеру, через несколько секунд после изменения данных и когда вкладка скрывается
  useEffect(() => {
    if (st.status !== 'in') return
    const push = () => { const u = userRef.current; if (u) void pushIfChanged(u).then(ok => { if (ok) patch({ lastSync: Date.now() }) }).catch(() => undefined) }
    const onHide = () => { if (document.visibilityState === 'hidden') push() }
    const id = window.setInterval(push, 60_000)
    const t = window.setTimeout(push, 4000)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', push)
    return () => { clearInterval(id); clearTimeout(t); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', push) }
  }, [st.status, changeToken, patch])

  // проверка прогресса с других устройств: при возврате на вкладку и раз в 3 минуты (данные не трогаем — только показываем плашку)
  useEffect(() => {
    if (st.status !== 'in') return
    const check = () => { const u = userRef.current; if (u && document.visibilityState === 'visible') void remoteHasNews(u).then(n => patch({ news: n })).catch(() => undefined) }
    const id = window.setInterval(check, 180_000)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check) }
  }, [st.status, patch])

  const run = useCallback(async (fn: () => Promise<void>) => {
    patch({ busy: true, error: null, info: null })
    try { await fn() } catch (e) { patch({ error: authError(e) }) } finally { patch({ busy: false }) }
  }, [patch])

  return {
    ...st,
    clearMessages: () => patch({ error: null, info: null }),
    login: (email, password) => run(async () => {
      const bad = validateCredentials(email, password); if (bad) throw bad
      const u = await signIn(email, password); await handleSignedIn(u)
    }),
    register: (email, password) => run(async () => {
      const bad = validateCredentials(email, password); if (bad) throw bad
      const r = await signUp(email, password)
      if (r.user) await handleSignedIn(r.user)
      else patch({ info: { key: 'app.cloud.msg.confirmMail' } })
    }),
    logout: () => run(async () => {
      // последняя отправка перед выходом, затем переключаемся на «гостевой» профиль: данные аккаунта на устройстве скрываются
      const u = userRef.current
      if (u) { try { await pushIfChanged(u) } catch { /* без связи — данные останутся в профиле аккаунта */ } }
      await signOut(); leaveToGuest()
    }),
    forgot: email => run(async () => { await resetPassword(email); patch({ info: { key: 'app.cloud.msg.resetMail' } }) }),
    newPassword: password => run(async () => {
      if (password.length < MIN_PASSWORD) throw new LocalizedError('app.cloud.err.passMin', { n: MIN_PASSWORD })
      await updatePassword(password); patch({ recovery: false, info: { key: 'app.cloud.msg.passChanged' } })
    }),
    applyNews: () => run(async () => {
      const u = userRef.current; if (!u) return
      const r = await syncFull(u); patch({ lastSync: r.at, news: false })
      if (r.changed) window.setTimeout(() => window.location.reload(), 300)
    }),
    removeAccount: () => run(async () => { await deleteAccount(); syncedFor.current = null; userRef.current = null; patch({ status: 'out', user: null, info: { key: 'app.cloud.msg.deleted' } }); leaveToGuest() }),
  }
}

export type ServerState = 'checking' | 'online' | 'offline'
/** Состояние облачного сервера: проверка при запуске, раз в минуту, при возврате на вкладку и при смене сети. Без облака всегда «online». */
export function useServerStatus(): ServerState {
  const [state, setState] = useState<ServerState>(cloudConfigured ? 'checking' : 'online')
  useEffect(() => {
    if (!cloudConfigured) return
    let alive = true
    const run = () => { void checkServer().then(ok => { if (alive) setState(ok ? 'online' : 'offline') }) }
    const onVis = () => { if (document.visibilityState === 'visible') run() }
    const onOff = () => setState('offline')
    run()
    const id = window.setInterval(run, 60_000)
    window.addEventListener('online', run); window.addEventListener('offline', onOff); document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(id); window.removeEventListener('online', run); window.removeEventListener('offline', onOff); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return state
}
