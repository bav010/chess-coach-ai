import { getLang } from '../i18n'

// Русские названия основных семейств дебютов (остальные части названия — как в каталоге, на английском).
const FAMILY: Record<string, string> = {
  'Sicilian Defense': 'Сицилианская защита', 'Ruy Lopez': 'Испанская партия', 'French Defense': 'Французская защита',
  "Queen's Gambit Declined": 'Отказанный ферзевый гамбит', "Queen's Gambit Accepted": 'Принятый ферзевый гамбит',
  "Queen's Gambit": 'Ферзевый гамбит', 'Italian Game': 'Итальянская партия', 'English Opening': 'Английское начало',
  "King's Gambit Accepted": 'Принятый королевский гамбит', "King's Gambit Declined": 'Отказанный королевский гамбит',
  "King's Gambit": 'Королевский гамбит', "King's Indian Defense": 'Староиндийская защита (КИЗ)', 'Caro-Kann Defense': 'Защита Каро-Канн',
  'Nimzo-Indian Defense': 'Защита Нимцовича', "Queen's Pawn Game": 'Игра ферзевой пешки', "Queen's Indian Defense": 'Ферзевоиндийская защита',
  'Semi-Slav Defense': 'Полуславянская защита', 'Dutch Defense': 'Голландская защита', 'Benoni Defense': 'Защита Бенони',
  'Grünfeld Defense': 'Защита Грюнфельда', 'Alekhine Defense': 'Защита Алёхина', 'Scotch Game': 'Шотландская партия',
  'Indian Defense': 'Индийская защита', 'Slav Defense': 'Славянская защита', "Petrov's Defense": 'Русская партия (защита Петрова)',
  'Four Knights Game': 'Партия четырёх коней', 'Zukertort Opening': 'Дебют Цукерторта', 'Scandinavian Defense': 'Скандинавская защита',
  'Philidor Defense': 'Защита Филидора', 'Réti Opening': 'Дебют Рети', 'Nimzowitsch Defense': 'Защита Нимцовича (1.e4 Nc6)',
  'Vienna Game': 'Венская партия', "Bishop's Opening": 'Дебют слона', 'Modern Defense': 'Современная защита', "King's Pawn Game": 'Игра королевской пешки',
  'Catalan Opening': 'Каталонское начало', 'Pirc Defense': 'Защита Пирца', 'Bird Opening': 'Дебют Бёрда', 'Tarrasch Defense': 'Защита Тарраша',
  'Polish Opening': 'Польский дебют', "King's Indian Attack": 'Староиндийская атака', 'Neo-Grünfeld Defense': 'Новогрюнфельдовская защита',
  'Blackmar-Diemer Gambit': 'Гамбит Блэкмара — Димера', 'Bogo-Indian Defense': 'Богоиндийская защита', 'Hungarian Opening': 'Венгерский дебют',
  'Grob Opening': 'Дебют Гроба', 'Nimzo-Larsen Attack': 'Атака Нимцовича — Ларсена', 'Center Game': 'Центральная партия',
  'Latvian Gambit': 'Латышский гамбит', 'Ponziani Opening': 'Дебют Понциани', 'Vienna Gambit': 'Венский гамбит', 'Old Indian Defense': 'Старая индийская защита',
  'Trompowsky Attack': 'Атака Тромповского', 'Benko Gambit': 'Гамбит Бенко', 'Englund Gambit': 'Гамбит Энглунда', 'London System': 'Лондонская система',
  'Danish Gambit': 'Датский гамбит', 'Evans Gambit': 'Гамбит Эванса', 'Two Knights Defense': 'Защита двух коней', 'Giuoco Piano': 'Джуоко Пиано',
  'Colle System': 'Система Колле', 'Budapest Defense': 'Будапештский гамбит', 'Torre Attack': 'Атака Торре', 'Stonewall Attack': 'Атака «Стоунволл»',
}

/**
 * Opening name in the current language. English: the catalog original; Russian: «Sicilian Defense: Najdorf Variation»
 * → «Сицилианская защита: Najdorf Variation». (Name kept as `ruName` for existing callers.)
 */
export function ruName(name: string): string {
  return getLang() === 'en' ? name : ruNameStatic(name)
}

/** Always the Russian form (independent of the UI language) — use it to build search indexes so Russian queries work in any language. */
export function ruNameStatic(name: string): string {
  const i = name.indexOf(':')
  const family = i < 0 ? name : name.slice(0, i)
  const rest = i < 0 ? '' : name.slice(i)
  const ru = FAMILY[family]
  return ru ? `${ru}${rest}` : name
}

/** Language-neutral alias of ruName. */
export const openingName = ruName
