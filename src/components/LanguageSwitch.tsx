import { LANGS, LANG_NAMES, useI18n, type Lang } from '../i18n'

/** Выбор языка интерфейса. compact — две кнопки EN/RU для шапки; иначе список с полными названиями для настроек. */
export default function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n()
  if (compact) return <div className="lang-switch" role="group" aria-label={t('app.lang.aria')} data-testid="lang-switch">
    {LANGS.map((l: Lang) => <button key={l} type="button" className={`lang-btn ${lang === l ? 'active' : ''}`} aria-pressed={lang === l} onClick={() => setLang(l)} data-testid={`lang-${l}`}
      title={LANG_NAMES[l]}>{t(l === 'en' ? 'app.lang.short.en' : 'app.lang.short.ru')}</button>)}
  </div>
  return <div className="acc-row" role="group" aria-label={t('app.lang.aria')} data-testid="lang-settings">
    {LANGS.map((l: Lang) => <button key={l} type="button" className={`chip ${lang === l ? 'active' : ''}`} aria-pressed={lang === l} onClick={() => setLang(l)} data-testid={`setlang-${l}`}>{LANG_NAMES[l]}</button>)}
  </div>
}
