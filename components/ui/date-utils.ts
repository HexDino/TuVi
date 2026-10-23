export interface Ymd {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function toIsoDate({ year, month, day }: Ymd): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIsoDate(input: string): Ymd | null {
  const m = ISO_DATE.exec(input.trim());
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

export function formatViDate(input: string): string {
  const ymd = parseIsoDate(input);
  if (!ymd) return '';
  return `${String(ymd.day).padStart(2, '0')}/${String(ymd.month).padStart(2, '0')}/${ymd.year}`;
}

function fromDate(date: Date): Ymd {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function addDays({ year, month, day }: Ymd, delta: number): Ymd {
  return fromDate(new Date(year, month - 1, day + delta));
}

export function addMonths({ year, month, day }: Ymd, delta: number): Ymd {
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12 + 1;
  return { year: nextYear, month: nextMonth, day: Math.min(day, daysInMonth(nextYear, nextMonth)) };
}

/** 0 = Thứ 2 … 6 = Chủ nhật. */
export function weekdayIndexMonday(year: number, month: number, day: number): number {
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

export function startOfWeekMonday(ymd: Ymd): Ymd {
  return addDays(ymd, -weekdayIndexMonday(ymd.year, ymd.month, ymd.day));
}

export function endOfWeekSunday(ymd: Ymd): Ymd {
  return addDays(startOfWeekMonday(ymd), 6);
}

export function todayIso(now = new Date()): string {
  return toIsoDate(fromDate(now));
}

export function clampIso(iso: string, min: string, max: string): string {
  if (!parseIsoDate(iso)) return min;
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

/** Năm đầu thập niên chứa `year` (1992 → 1990). */
export function decadeStart(year: number): number {
  return Math.floor(year / 10) * 10;
}

/** Trang thập niên kế/cũ, kẹp trong khoảng năm cho phép. */
export function shiftDecadePage(start: number, delta: number, minYear: number, maxYear: number): number {
  const minPage = decadeStart(minYear);
  const maxPage = decadeStart(maxYear);
  return Math.min(maxPage, Math.max(minPage, start + delta * 10));
}
