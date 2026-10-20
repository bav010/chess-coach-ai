// Облачный аккаунт: вход по почте и паролю и синхронизация прогресса через Supabase.
// Работает из браузера (сайт остаётся статическим). Адрес проекта и публичный ключ задаются при сборке:
// VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. Без них облачные функции выключены, а приложение работает как раньше.
import type { SupabaseClient, User } from '@supabase/supabase-js'
import {
  applySnapshot, collectSnapshot, isSnapshot, loadMeta, mergeSnapshots, saveMeta, snapshotHash, type Snapshot,
} from './sync'
import { bindProfile, createProfile, guestProfileId, loadProfiles, switchProfile, type Avatar } from './profile'
import { LocalizedError, msgText, type Msg } from '../i18n/errors'

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const KEY_ = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
export const cloudConfigured = URL_ !== '' && KEY_ !== ''
export const MIN_PASSWORD = 8

export type CloudUser = { id: string; email: string }
const toUser = (u: User | null | undefined): CloudUser | null => (u ? { id: u.id, email: u.email ?? '' } : null)

let clientPromise: Promise<SupabaseClient> | null = null
export function getClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new LocalizedError('app.cloud.err.notConfigured'))
  clientPromise ??= import('@supabase/supabase-js').then(m => m.createClient(URL_, KEY_, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }))
  return clientPromise
}

/** Сообщение об ошибке авторизации: ключ перевода + параметры (переводится при показе). */
export function authError(e: unknown): Msg {
  if (e instanceof LocalizedError) return { key: e.key, params: e.params }
  const raw = e instanceof Error ? e.message : String(e ?? '')
  const m = raw.toLowerCase()
  if (m.includes('invalid login')) return { key: 'app.cloud.err.invalid' }
  if (m.includes('already registered') || m.includes('already been registered')) return { key: 'app.cloud.err.exists' }
  if (m.includes('not confirmed')) return { key: 'app.cloud.err.notConfirmed' }
  if (m.includes('password should be') || m.includes('weak')) return { key: 'app.cloud.err.weak', params: { n: MIN_PASSWORD } }
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes')) return { key: 'app.cloud.err.rate' }
  if (m.includes('valid email') || m.includes('invalid email')) return { key: 'app.cloud.err.email' }
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return { key: 'app.cloud.err.network' }
  if (m.includes('same password') || m.includes('different from the old')) return { key: 'app.cloud.err.samePass' }
  return raw ? { key: 'app.cloud.err.other', params: { msg: raw } } : { key: 'app.cloud.err.unknown' }
}
export const authErrorText = (e: unknown): string => msgText(authError(e))

/** Проверка формы входа: возвращает ошибку с ключом перевода или null. */
export function validateCredentials(email: string, password: string): LocalizedError | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return new LocalizedError('app.cloud.err.email')
  if (password.length < MIN_PASSWORD) return new LocalizedError('app.cloud.err.passMin', { n: MIN_PASSWORD })
  return null
}

export async function getUser(): Promise<CloudUser | null> {
  const c = await getClient()
  const { data } = await c.auth.getSession()
  return toUser(data.session?.user)
}

export async function signUp(email: string, password: string): Promise<{ user: CloudUser | null; needsConfirm: boolean }> {
  const c = await getClient()
  const { data, error } = await c.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
  if (error) throw error
  // при включённом подтверждении почты сессии нет; у уже занятой почты identities пуст
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered')
  return { user: toUser(data.session?.user), needsConfirm: !data.session }
}

export async function signIn(email: string, password: string): Promise<CloudUser> {
  const c = await getClient()
  const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
  const u = toUser(data.user)
  if (!u) throw new LocalizedError('app.cloud.err.signinFail')
  return u
}

export async function signOut() { const c = await getClient(); await c.auth.signOut() }

export async function resetPassword(email: string) {
  const c = await getClient()
  const { error } = await c.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const c = await getClient()
  const { error } = await c.auth.updateUser({ password })
  if (error) throw error
}

/** Удаляет аккаунт и облачные данные (функция delete_my_account из docs/supabase.sql). Локальные данные остаются. */
export async function deleteAccount() {
  const c = await getClient()
  const { error } = await c.rpc('delete_my_account')
  if (error) throw error
  await c.auth.signOut()
}

export type AuthEvent = 'signed_in' | 'signed_out' | 'recovery'
export async function onAuth(cb: (ev: AuthEvent, user: CloudUser | null) => void): Promise<() => void> {
  const c = await getClient()
  const { data } = c.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') cb('recovery', toUser(session?.user))
    else if (event === 'SIGNED_IN') cb('signed_in', toUser(session?.user))
    else if (event === 'SIGNED_OUT') cb('signed_out', null)
  })
  return () => data.subscription.unsubscribe()
}

// ---------- привязка локального профиля к облачному аккаунту ----------
/**
 * Определяет, какой локальный профиль принадлежит этому пользователю: уже привязанный — переключаемся на него;
 * иначе привязываем текущий профиль (если он ничей), иначе создаём новый. Возвращает true, если идёт перезагрузка.
 */
export function attachProfile(user: CloudUser): boolean {
  const st = loadProfiles()
  const bound = st.list.find(p => p.cloud?.userId === user.id)
  if (bound) {
    if (bound.cloud?.email !== user.email) bindProfile(bound.id, { userId: user.id, email: user.email })
    if (bound.id !== st.current) { switchProfile(bound.id); return true }
    return false
  }
  const cur = st.list.find(p => p.id === st.current)
  if (cur && !cur.cloud) { bindProfile(cur.id, { userId: user.id, email: user.email }); return false }
  const avatar: Avatar = { emoji: '♞', color: '#6cb8ff' }
  const s = createProfile(user.email.split('@')[0] || 'Player', avatar)
  const created = s.list[s.list.length - 1]
  bindProfile(created.id, { userId: user.id, email: user.email })
  switchProfile(created.id)
  return true
}

// ---------- синхронизация ----------
const TABLE = 'user_data'

async function fetchRemote(c: SupabaseClient, userId: string): Promise<{ snap: Snapshot | null; updatedAt: number }> {
  const { data, error } = await c.from(TABLE).select('data, updated_at').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return { snap: null, updatedAt: 0 }
  return { snap: isSnapshot(data.data) ? data.data : null, updatedAt: Date.parse(data.updated_at as string) || 0 }
}

async function pushSnapshot(c: SupabaseClient, userId: string, snap: Snapshot) {
  const now = new Date().toISOString()
  const { error } = await c.from(TABLE).upsert({ user_id: userId, data: { ...snap, updatedAt: now }, updated_at: now }, { onConflict: 'user_id' })
  if (error) throw error
}

/** Полная синхронизация: подтягивает облако в локальные данные, объединяет и отправляет результат обратно. */
export async function syncFull(user: CloudUser): Promise<{ changed: boolean; at: number }> {
  const c = await getClient()
  const { snap: remote, updatedAt } = await fetchRemote(c, user.id)
  const local = collectSnapshot()
  const meta = loadMeta()
  const merged = remote ? mergeSnapshots(local, remote, updatedAt > meta.lastPushAt) : local
  const changed = snapshotHash(merged) !== snapshotHash(local)
  if (changed) applySnapshot(merged)
  await pushSnapshot(c, user.id, merged)
  const at = Date.now()
  saveMeta({ pushedHash: snapshotHash(merged), lastPushAt: at, lastSyncAt: at })
  return { changed, at }
}

/**
 * Лёгкая отправка локальных изменений: облачные данные объединяются с локальными и записываются обратно,
 * поэтому изменения с другого устройства не затираются. Локальное хранилище не трогаем (оно открыто на экране).
 */
export async function pushIfChanged(user: CloudUser): Promise<boolean> {
  const local = collectSnapshot()
  const h = snapshotHash(local)
  if (h === loadMeta().pushedHash) return false
  const c = await getClient()
  const { snap: remote } = await fetchRemote(c, user.id)
  await pushSnapshot(c, user.id, remote ? mergeSnapshots(local, remote, false) : local)
  const at = Date.now()
  saveMeta({ pushedHash: h, lastPushAt: at, lastSyncAt: at })
  return true
}

/** Есть ли в облаке то, чего нет на этом устройстве (изменения с другого устройства). Локальные данные не трогает. */
export async function remoteHasNews(user: CloudUser): Promise<boolean> {
  const c = await getClient()
  const { snap: remote } = await fetchRemote(c, user.id)
  if (!remote) return false
  const local = collectSnapshot()
  return snapshotHash(mergeSnapshots(local, remote, false)) !== snapshotHash(local)
}

/** После выхода показываем «гостевой» профиль (данные аккаунта на устройстве скрываются). Страница перезагружается. */
export function leaveToGuest() { switchProfile(guestProfileId()) }

/** Отвечает ли облачный сервер (Supabase). Любой HTTP-ответ без ошибки сервера считается «онлайн»; сеть/таймаут/5xx — «недоступен». */
export async function checkServer(timeoutMs = 6000): Promise<boolean> {
  if (!cloudConfigured) return true
  const ctl = new AbortController()
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: KEY_ }, signal: ctl.signal, cache: 'no-store' })
    return r.status < 500
  } catch { return false } finally { clearTimeout(timer) }
}
