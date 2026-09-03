/** Business time zone (§16: official time is server time, displayed in JST). */
export const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE ?? "Asia/Tokyo";

const dateFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** YYYY-MM-DD in the business time zone (used for work_date). */
export function toWorkDate(d: Date): string {
  return dateFmt.format(d);
}

export function formatTime(d: Date | null | undefined): string {
  return d ? timeFmt.format(d) : "";
}

export function formatDateTime(d: Date | null | undefined): string {
  return d ? dateTimeFmt.format(d) : "";
}

/** Parse "YYYY-MM-DDTHH:mm" (business time zone) into a Date. */
export function parseLocalDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Compute the UTC instant that corresponds to this wall time in the business TZ.
  const guess = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(s ?? 0));
  const offset = tzOffsetMs(new Date(guess));
  return new Date(guess - offset);
}

function tzOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => +(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - at.getTime();
}

/** "YYYY-MM-DDTHH:mm" for <input type=datetime-local>. */
export function toLocalInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return parts.replace(" ", "T");
}
