// Локальные аккаунты (профили) в одном браузере: у каждого своя статистика, партии, задачи, дебюты и настройки.
// Пароля нет — это разделение данных на устройстве, а не облачная учётная запись. Данные профиля по умолчанию
// лежат под прежними ключами localStorage, поэтому ничего из сохранённого ранее не теряется.

export type Avatar = { emoji: string; color: string; image?: string }
/** Привязка локального профиля к облачному аккаунту (вход по почте и паролю). */
export type CloudLink = { userId: string; email: string }
export type Profile = { id: string; name: string; avatar: Avatar; created: string; cloud?: CloudLink }
export type ProfileStore = { v: 1; current: string; list: Profile[] }

export const DEFAULT_ID = 'default'
const KEY = 'chess-coach-ai:profiles:v1'
export const AVATAR_EMOJI = ['♞', '♛', '♚', '♜', '♝', '♟', '🦊', '🐼', '🦉', '🐉', '🚀', '⭐']
export const AVATAR_COLORS = ['#d3ff72', '#6cb8ff', '#ff9a52', '#ff7ad9', '#b79cff', '#4fd1a5', '#ffd166', '#c4c7ce']
export const NAME_MAX = 24

export const defaultProfile = (): Profile => ({ id: DEFAULT_ID, name: 'Игрок', avatar: { emoji: '♞', color: '#d3ff72' }, created: new Date(0).toISOString() })

function read(): ProfileStore {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    const d = raw ? (JSON.parse(raw) as Partial<ProfileStore>) : null
    const list = Array.isArray(d?.list) ? d!.list.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.avatar && typeof p.avatar.emoji === 'string') : []
    if (!list.some(p => p.id === DEFAULT_ID)) list.unshift(defaultProfile())
    const current = list.some(p => p.id === d?.current) ? (d!.current as string) : DEFAULT_ID
    return { v: 1, current, list }
  } catch { return { v: 1, current: DEFAULT_ID, list: [defaultProfile()] } }
}

export function loadProfiles(): ProfileStore { return read() }

function write(s: ProfileStore) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* хранилище недоступно */ }
}

let activeId: string | null = null
export function activeProfileId(): string {
  if (activeId === null) activeId = read().current
  return activeId
}

/** Ключ localStorage с учётом профиля: у профиля по умолчанию — прежний ключ, у остальных — с суффиксом. */
export function pk(base: string): string {
  const id = activeProfileId()
  return id === DEFAULT_ID ? base : `${base}@${id}`
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

export function createProfile(name: string, avatar: Avatar): ProfileStore {
  const s = read()
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  s.list.push({ id, name: cleanName(name) || 'Игрок', avatar, created: new Date().toISOString() })
  write(s)
  return s
}

export function updateProfile(id: string, patch: Partial<Pick<Profile, 'name' | 'avatar'>>): ProfileStore {
  const s = read()
  s.list = s.list.map(p => (p.id === id ? { ...p, ...(patch.name !== undefined ? { name: cleanName(patch.name) || p.name } : {}), ...(patch.avatar ? { avatar: patch.avatar } : {}) } : p))
  write(s)
  return s
}

/** Привязывает профиль к облачному аккаунту (или отвязывает при null). */
export function bindProfile(id: string, cloud: CloudLink | null): ProfileStore {
  const s = read()
  s.list = s.list.map(p => {
    if (p.id !== id) return p
    const { cloud: _old, ...rest } = p
    void _old
    return cloud ? { ...rest, cloud } : rest
  })
  write(s)
  return s
}

/** Удаляет профиль вместе со всеми его данными. Профиль по умолчанию удалить нельзя. */
export function deleteProfile(id: string): ProfileStore {
  const s = read()
  if (id === DEFAULT_ID) return s
  s.list = s.list.filter(p => p.id !== id)
  if (s.current === id) s.current = DEFAULT_ID
  write(s)
  try {
    for (const k of Object.keys(localStorage)) if (k.endsWith(`@${id}`)) localStorage.removeItem(k)
  } catch { /* ничего */ }
  return s
}

/** Переключает профиль; страница перезагружается, чтобы все разделы подхватили данные нового профиля. */
export function switchProfile(id: string) {
  const s = read()
  if (!s.list.some(p => p.id === id)) return
  s.current = id
  write(s)
  window.location.reload()
}

/** Сжимает выбранное изображение до квадрата 96×96 (JPEG) — чтобы аватар занимал в хранилище несколько КБ. */
export function imageToAvatar(file: File, size = 96): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Выберите файл изображения.')); return }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = size; c.height = size
      const ctx = c.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Не удалось обработать изображение.')); return }
      const m = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть изображение.')) }
    img.src = url
  })
}
