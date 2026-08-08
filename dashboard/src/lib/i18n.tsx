import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { messages, type Locale } from './messages';
import { tipsByLocale, type TipKey } from './tips';
import { I18nContext, type I18nContextValue, type Messages } from './i18nContext';

export { useI18n } from './i18nContext';
export type { Locale } from './messages';

const STORAGE_KEY = 'line-oa-dashboard-locale';

function readStoredLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'th') return v;
  } catch {
    /* ignore */
  }
  return 'th';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    typeof window === 'undefined' ? 'th' : readStoredLocale()
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = next === 'th' ? 'th' : 'en';
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dict = messages[locale] as Messages;
    return {
      locale,
      setLocale,
      t: dict,
      tip: (key) => {
        const pack = tipsByLocale[locale];
        if (key in pack) return pack[key as TipKey];
        return String(key);
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
