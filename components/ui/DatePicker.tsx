'use client';

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import {
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  decadeStart,
  endOfWeekSunday,
  formatViDate,
  parseIsoDate,
  shiftDecadePage,
  startOfWeekMonday,
  toIsoDate,
  todayIso,
  weekdayIndexMonday,
  type Ymd,
} from './date-utils';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTHS = Array.from({ length: 12 }, (_, index) => `Tháng ${index + 1}`);

interface DatePickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
}

export function DatePicker({
  id,
  label,
  value,
  onChange,
  min = '1900-01-31',
  max = '2100-12-31',
}: DatePickerProps) {
  const fallback = parseIsoDate(todayIso())!;
  const initial = parseIsoDate(value) ?? fallback;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [view, setView] = useState({ year: initial.year, month: initial.month });
  const [yearPage, setYearPage] = useState(() => decadeStart(initial.year));
  const [activeIso, setActiveIso] = useState(() =>
    clampIso(parseIsoDate(value) ? value : todayIso(), min, max),
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusNextRef = useRef(false);
  const focusTitleRef = useRef(false);

  const display = formatViDate(value);
  const today = todayIso();
  const todayYear = parseIsoDate(today)!.year;

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'days' || !focusNextRef.current) return;
    focusNextRef.current = false;
    dayRefs.current.get(activeIso)?.focus();
  }, [open, mode, activeIso]);

  useEffect(() => {
    if (!focusTitleRef.current) return;
    focusTitleRef.current = false;
    titleRef.current?.focus();
  }, [mode]);

  const openPicker = () => {
    const base = clampIso(parseIsoDate(value) ? value : today, min, max);
    const parsed = parseIsoDate(base)!;
    setView({ year: parsed.year, month: parsed.month });
    setYearPage(decadeStart(parsed.year));
    setActiveIso(base);
    setMode('days');
    focusNextRef.current = true;
    setOpen(true);
  };

  const chooseDay = (iso: string) => {
    onChange(iso);
    close(true);
  };

  const canShiftMonth = (delta: number) => {
    const target = addMonths({ year: view.year, month: view.month, day: 1 }, delta);
    const firstIso = toIsoDate({ year: target.year, month: target.month, day: 1 });
    const lastIso = toIsoDate({
      year: target.year,
      month: target.month,
      day: daysInMonth(target.year, target.month),
    });
    return lastIso >= min && firstIso <= max;
  };

  const shiftMonth = (delta: number) => {
    const target = addMonths({ year: view.year, month: view.month, day: 1 }, delta);
    const activeDay = parseIsoDate(activeIso)?.day ?? 1;
    const candidate = toIsoDate({
      year: target.year,
      month: target.month,
      day: Math.min(activeDay, daysInMonth(target.year, target.month)),
    });
    const iso = clampIso(candidate, min, max);
    const parsed = parseIsoDate(iso)!;
    setView({ year: parsed.year, month: parsed.month });
    setActiveIso(iso);
  };

  const minYear = parseIsoDate(min)?.year ?? 1900;
  const maxYear = parseIsoDate(max)?.year ?? 2100;

  const shiftYear = (delta: number) => {
    const year = Math.min(maxYear, Math.max(minYear, view.year + delta));
    const day = Math.min(parseIsoDate(activeIso)?.day ?? 1, daysInMonth(year, view.month));
    const iso = clampIso(toIsoDate({ year, month: view.month, day }), min, max);
    const parsed = parseIsoDate(iso)!;
    setView({ year: parsed.year, month: parsed.month });
    setActiveIso(iso);
  };

  const chooseMonth = (month: number) => {
    const day = Math.min(parseIsoDate(activeIso)?.day ?? 1, daysInMonth(view.year, month));
    const iso = clampIso(toIsoDate({ year: view.year, month, day }), min, max);
    const parsed = parseIsoDate(iso)!;
    setView({ year: parsed.year, month: parsed.month });
    setActiveIso(iso);
    setMode('days');
    focusNextRef.current = true;
  };

  const chooseYear = (year: number) => {
    const day = Math.min(parseIsoDate(activeIso)?.day ?? 1, daysInMonth(year, view.month));
    const iso = clampIso(toIsoDate({ year, month: view.month, day }), min, max);
    const parsed = parseIsoDate(iso)!;
    setView({ year: parsed.year, month: parsed.month });
    setActiveIso(iso);
    setMode('months');
    focusTitleRef.current = true;
  };

  const minPage = decadeStart(minYear);
  const maxPage = decadeStart(maxYear);
  const pageEnd = Math.min(yearPage + 9, maxYear);
  const pageLabel = yearPage === pageEnd ? String(yearPage) : `${yearPage}–${pageEnd}`;

  const shiftBack = () => {
    if (mode === 'days') shiftMonth(-1);
    else if (mode === 'months') shiftYear(-1);
    else setYearPage((page) => shiftDecadePage(page, -1, minYear, maxYear));
  };

  const shiftForward = () => {
    if (mode === 'days') shiftMonth(1);
    else if (mode === 'months') shiftYear(1);
    else setYearPage((page) => shiftDecadePage(page, 1, minYear, maxYear));
  };

  const canGoBack =
    mode === 'days' ? canShiftMonth(-1) : mode === 'months' ? view.year > minYear : yearPage > minPage;
  const canGoForward =
    mode === 'days'
      ? canShiftMonth(1)
      : mode === 'months'
        ? view.year < maxYear
        : yearPage < maxPage;

  const onTitleClick = () => {
    if (mode === 'days') {
      setMode('months');
    } else if (mode === 'months') {
      setYearPage(decadeStart(view.year));
      setMode('years');
    } else {
      setMode('months');
    }
  };

  const onDaysKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = parseIsoDate(activeIso);
    if (!current) return;

    let next: Ymd | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(current, -1);
        break;
      case 'ArrowRight':
        next = addDays(current, 1);
        break;
      case 'ArrowUp':
        next = addDays(current, -7);
        break;
      case 'ArrowDown':
        next = addDays(current, 7);
        break;
      case 'Home':
        next = startOfWeekMonday(current);
        break;
      case 'End':
        next = endOfWeekSunday(current);
        break;
      case 'PageUp':
        next = addMonths(current, -1);
        break;
      case 'PageDown':
        next = addMonths(current, 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    const iso = clampIso(toIsoDate(next), min, max);
    const parsed = parseIsoDate(iso)!;
    setView({ year: parsed.year, month: parsed.month });
    setActiveIso(iso);
    focusNextRef.current = true;
  };

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  };

  const onRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!open) return;
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    setOpen(false);
  };

  const offset = weekdayIndexMonday(view.year, view.month, 1);
  const dayCount = daysInMonth(view.year, view.month);
  const cellCount = Math.ceil((offset + dayCount) / 7) * 7;

  return (
    <div className="ctl dp" ref={rootRef} onKeyDown={onRootKeyDown} onBlur={onRootBlur}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="ctl-trigger dp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${display || 'chưa chọn'}`}
        onClick={() => (open ? close(false) : openPicker())}
      >
        <span className={display ? 'dp-value' : 'dp-value is-empty'}>{display || 'Chọn ngày'}</span>
        <CalendarIcon />
      </button>

      {open && (
        <div className="dp-popover" role="dialog" aria-label={`Chọn ${label.toLowerCase()}`}>
          <div className="dp-head">
            <button
              type="button"
              className="dp-nav"
              aria-label={
                mode === 'days' ? 'Tháng trước' : mode === 'months' ? 'Năm trước' : 'Thập niên trước'
              }
              disabled={!canGoBack}
              onClick={shiftBack}
            >
              ‹
            </button>
            <button
              ref={titleRef}
              type="button"
              className="dp-title"
              aria-label={
                mode === 'days'
                  ? 'Chọn tháng và năm'
                  : mode === 'months'
                    ? 'Chọn năm'
                    : 'Quay lại chọn tháng'
              }
              aria-expanded={mode !== 'years'}
              onClick={onTitleClick}
            >
              {mode === 'days'
                ? `Tháng ${view.month} · ${view.year}`
                : mode === 'months'
                  ? `Năm ${view.year}`
                  : pageLabel}
              <span className="dp-caret" aria-hidden="true">
                {mode === 'years' ? '▴' : '▾'}
              </span>
            </button>
            <button
              type="button"
              className="dp-nav"
              aria-label={
                mode === 'days' ? 'Tháng sau' : mode === 'months' ? 'Năm sau' : 'Thập niên sau'
              }
              disabled={!canGoForward}
              onClick={shiftForward}
            >
              ›
            </button>
          </div>

          {mode === 'days' ? (
            <>
              <div className="dp-weekdays" aria-hidden="true">
                {WEEKDAYS.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div
                className="dp-days"
                role="group"
                aria-label="Các ngày trong tháng"
                onKeyDown={onDaysKeyDown}
              >
                {Array.from({ length: cellCount }, (_, index) => {
                  const day = index - offset + 1;
                  if (day < 1 || day > dayCount) {
                    return <span key={`blank-${index}`} className="dp-blank" aria-hidden="true" />;
                  }

                  const iso = toIsoDate({ year: view.year, month: view.month, day });
                  const disabled = iso < min || iso > max;

                  return (
                    <button
                      key={iso}
                      type="button"
                      className="dp-day"
                      ref={(node) => {
                        if (node) dayRefs.current.set(iso, node);
                        else dayRefs.current.delete(iso);
                      }}
                      data-active={iso === activeIso}
                      data-selected={iso === value}
                      data-today={iso === today}
                      tabIndex={iso === activeIso ? 0 : -1}
                      aria-label={formatViDate(iso)}
                      aria-current={iso === today ? 'date' : undefined}
                      disabled={disabled}
                      onClick={() => chooseDay(iso)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          ) : mode === 'months' ? (
            <div className="dp-months" role="group" aria-label="Chọn tháng">
              {MONTHS.map((monthLabel, index) => (
                <button
                  key={monthLabel}
                  type="button"
                  className="dp-month"
                  data-active={index + 1 === view.month}
                  aria-pressed={index + 1 === view.month}
                  onClick={() => chooseMonth(index + 1)}
                >
                  {monthLabel}
                </button>
              ))}
            </div>
          ) : (
            <div className="dp-years" role="group" aria-label="Chọn năm">
              {Array.from({ length: 10 }, (_, index) => {
                const year = yearPage + index;
                return (
                  <button
                    key={year}
                    type="button"
                    className="dp-year"
                    data-active={year === view.year}
                    data-today={year === todayYear}
                    aria-pressed={year === view.year}
                    disabled={year < minYear || year > maxYear}
                    onClick={() => chooseYear(year)}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="dp-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}
