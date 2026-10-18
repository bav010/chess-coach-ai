// Облачный аккаунт: вход по почте и паролю и синхронизация прогресса через Supabase.
// Работает из браузера (сайт остаётся статическим). Адрес проекта и публичный ключ задаются при сборке:
// VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. Без них облачные функции выключены, а приложение работает как раньше.
import type { SupabaseClient, User } from '@supabase/supabase-js'
import {
  applySnapshot, collectSnapshot, isSnapshot, loadMeta, mergeSnapshots, saveMeta, snapshotHash, type Snapshot,
} from './sync'
import { bindProfile, createProfile, loadProfiles, switchProfile, type Avatar } from './profile'

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const KEY_ = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
export const cloudConfigured = URL_ !== '' && KEY_ !== ''
export const MIN_PASSWORD = 8

export type CloudUser = { id: string; email: string }
const toUser = (u: User | null | undefined): CloudUser | null => (u ? { id: u.id, email: u.email ?? '' } : null)

let clientPromise: Promise<SupabaseClient> | null = null
export function getClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new Error('Облако не настроено.'))
  clientPromise ??= import('@supabase/supabase-js').then(m => m.createClient(URL_, KEY_, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }))
  return clientPromise
}

/** Понятные русские тексты для частых ошибок авторизации. */
export function authErrorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '')
  if (/^[А-Яа-я]/.test(raw)) return raw // наши собственные тексты (проверка формы)
  const m = raw.toLowerCase()
  if (m.includes('invalid login')) return 'Неверная почта или пароль.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Эта почта уже зарегистрирована — войдите.'
  if (m.includes('not confirmed')) return 'Почта не подтверждена: откройте письмо со ссылкой и войдите снова.'
  if (m.includes('password should be') || m.includes('weak')) return `Пароль слишком простой: минимум ${MIN_PASSWORD} символов.`
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes')) return 'Слишком много попыток. Подождите минуту и повторите.'
  if (m.includes('valid email') || m.includes('invalid email')) return 'Проверьте адрес почты.'
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Нет связи с сервером. Проверьте интернет.'
  if (m.includes('same password') || m.includes('different from the old')) return 'Новый пароль должен отличаться от старого.'
  return e instanceof Error && e.message ? `Ошибка: ${e.message}` : 'Что-то пошло не так. Повторите попытку.'
}

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Проверьте адрес почты.'
  if (password.length < MIN_PASSWORD) return `Пароль — минимум ${MIN_PASSWORD} символов.`
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
  if (!u) throw new Error('Не удалось войти.')
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
  const s = createProfile(user.email.split('@')[0] || 'Игрок', avatar)
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
