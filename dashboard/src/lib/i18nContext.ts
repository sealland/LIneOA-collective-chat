import { createContext, useContext } from 'react';
import { messages, type Locale } from './messages';
import { tipsByLocale, type TipKey } from './tips';

export type Messages = (typeof messages)['th'];

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
  tip: (key: TipKey | string) => string;
};

/** Stable module — do not colocate with LocaleProvider (Vite HMR desyncs context otherwise). */
export const I18nContext = createContext<I18nContextValue | null>(null);

const devFallback: I18nContextValue = {
  locale: 'th',
  setLocale: () => {},
  t: messages.th,
  tip: (key) => {
    const pack = tipsByLocale.th;
    if (key in pack) return pack[key as TipKey];
    return String(key);
  },
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // After Vite HMR on i18n.tsx the provider can briefly use a different module instance.
    if (import.meta.env.DEV) return devFallback;
    throw new Error('useI18n must be used within LocaleProvider');
  }
  return ctx;
}
