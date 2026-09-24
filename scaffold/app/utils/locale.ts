// Dates and Nuxt UI's own labels follow `locale` in app/app.config.ts (e.g. 'vi-VN', 'en-GB').
// Nuxt UI takes it through <UApp :locale> (month names, date field order, built-in labels),
// and every date the app shows goes through formatDate() below. Never hard-code a locale.
// The page's language (<html lang>) is `lang`, the language the app's own words are written in.
import { en, en_gb, vi } from '@nuxt/ui/locale'

// Only these Nuxt UI language packs are bundled. To support another, import it and add it here.
const UI_LOCALES = { en, 'en-gb': en_gb, vi }

// 'vi-VN' → Nuxt UI's `vi`; tries the exact tag, then the language, then English.
export function uiLocaleFor(tag: string) {
  const t = tag.toLowerCase() as keyof typeof UI_LOCALES
  return UI_LOCALES[t] ?? UI_LOCALES[t.split('-')[0] as keyof typeof UI_LOCALES] ?? en
}

const STYLES = {
  // 3 thg 11, 2026 (vi-VN) · 3 Nov 2026 (en-GB)
  day: { day: 'numeric', month: 'short', year: 'numeric' },
  // 09:05 3 thg 11, 2026 (vi-VN) · 3 Nov 2026, 09:05 (en-GB)
  dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

// A date for people to read, in the app's locale.
// - 'YYYY-MM-DD' strings are calendar days (no time), shown as that exact day everywhere.
// - Moments in time are shown in the app's timeZone, so the server and the browser render the same text.
export function formatDate(value: string | Date, style: keyof typeof STYLES = 'day') {
  const { locale, timeZone } = useAppConfig()
  const isDay = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = isDay ? new Date(`${value}T00:00:00Z`) : new Date(value)
  return date.toLocaleString(locale, { ...STYLES[style], timeZone: isDay ? 'UTC' : timeZone })
}
