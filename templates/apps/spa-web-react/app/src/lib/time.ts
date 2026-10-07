const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "2 hours ago" for the last week, a plain date after that. Put the absolute time in a title attribute. */
export function formatCreated(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = t - now;
  if (Math.abs(diff) < 7 * 86_400_000) {
    for (const [unit, ms] of UNITS) {
      if (Math.abs(diff) >= ms) return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(diff / ms), unit);
    }
    return "just now";
  }
  return new Date(t).toLocaleDateString("en", { dateStyle: "medium" });
}
