import { useEffect, useId, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useI18n } from '../lib/i18n';
import { formatDateRangeDisplay } from '../lib/dateRange';

type Props = {
  from: string;
  to: string;
  dates: string[];
  onRangeChange: (from: string, to: string) => void;
};

const WEEKDAYS_TH = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const WEEKDAYS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DateRangePicker({ from, to, dates, onRangeChange }: Props) {
  const { t, locale } = useI18n();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cursorMonth, setCursorMonth] = useState(() => dayjs(from).startOf('month'));
  const [draftFrom, setDraftFrom] = useState<string | null>(null);

  const available = useMemo(() => new Set(dates), [dates]);
  const weekdays = locale === 'en' ? WEEKDAYS_EN : WEEKDAYS_TH;

  useEffect(() => {
    if (!open) return;
    setCursorMonth(dayjs(from).startOf('month'));
    setDraftFrom(null);
  }, [open, from]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const start = cursorMonth.startOf('month');
    const mondayOffset = (start.day() + 6) % 7;
    const gridStart = start.subtract(mondayOffset, 'day');
    return Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day'));
  }, [cursorMonth]);

  function pickDay(iso: string) {
    if (!draftFrom) {
      setDraftFrom(iso);
      return;
    }
    let nextFrom = draftFrom;
    let nextTo = iso;
    if (nextFrom > nextTo) {
      const swap = nextFrom;
      nextFrom = nextTo;
      nextTo = swap;
    }
    onRangeChange(nextFrom, nextTo);
    setDraftFrom(null);
    setOpen(false);
  }

  function dayClass(iso: string, inMonth: boolean): string {
    const classes = ['date-cal__day'];
    if (!inMonth) classes.push('is-outside');
    if (available.has(iso)) classes.push('has-data');
    if (draftFrom) {
      if (iso === draftFrom) classes.push('is-start', 'is-end', 'is-selected');
    } else {
      if (iso >= from && iso <= to) classes.push('in-range');
      if (iso === from) classes.push('is-start', 'is-selected');
      if (iso === to) classes.push('is-end', 'is-selected');
    }
    if (iso === dayjs().format('YYYY-MM-DD')) classes.push('is-today');
    return classes.join(' ');
  }

  const monthLabel =
    locale === 'en'
      ? cursorMonth.format('MMMM YYYY')
      : cursorMonth.toDate().toLocaleDateString('th-TH', {
          month: 'long',
          year: 'numeric',
        });

  return (
    <div className="date-cal-root" ref={rootRef}>
      <button
        type="button"
        className={`date-cal-trigger${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="date-cal-trigger__value font-mono">
          {formatDateRangeDisplay(from, to)}
        </span>
        <span className="date-cal-trigger__hint" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="date-cal" id={panelId} role="dialog" aria-label={t.dateRange}>
          <div className="date-cal__nav">
            <button
              type="button"
              className="date-cal__nav-btn"
              aria-label={t.calPrevMonth}
              onClick={() => setCursorMonth((m) => m.subtract(1, 'month'))}
            >
              ‹
            </button>
            <p className="date-cal__month">{monthLabel}</p>
            <button
              type="button"
              className="date-cal__nav-btn"
              aria-label={t.calNextMonth}
              onClick={() => setCursorMonth((m) => m.add(1, 'month'))}
            >
              ›
            </button>
          </div>
          <div className="date-cal__weekdays">
            {weekdays.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="date-cal__grid">
            {cells.map((d) => {
              const iso = d.format('YYYY-MM-DD');
              const inMonth = d.month() === cursorMonth.month();
              return (
                <button
                  key={iso}
                  type="button"
                  className={dayClass(iso, inMonth)}
                  onClick={() => pickDay(iso)}
                >
                  {d.date()}
                </button>
              );
            })}
          </div>
          <p className="date-cal__help">{draftFrom ? t.calPickEnd : t.calPickStart}</p>
        </div>
      ) : null}
    </div>
  );
}
