// Русские строки: область "palette".
import type { en } from '../en/palette'
export const ru: Record<keyof typeof en, string> & Record<string, string> = {
  "palette.open": "Быстрый переход",
  "palette.openTip": "Быстрый переход (Ctrl+K)",
  "palette.placeholder": "Введите раздел или действие…",
  "palette.aria": "Быстрый переход",
  "palette.results": "Результаты",
  "palette.none": "Ничего не найдено",
  "palette.group.go": "Перейти",
  "palette.group.actions": "Действия",
  "palette.daily": "Задача дня",
  "palette.theme.dark": "Тема: тёмная",
  "palette.theme.light": "Тема: светлая",
  "palette.theme.system": "Тема: как в системе",
  "palette.lang.en": "Язык: English",
  "palette.lang.ru": "Язык: Русский",
  "palette.hint.nav": "↑ ↓ — выбор",
  "palette.hint.enter": "Enter — открыть",
  "palette.hint.esc": "Esc — закрыть",
  "help.keys.palette": "Быстрый переход к любому разделу или действию",
}
