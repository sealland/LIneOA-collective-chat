import { NavLink, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { type TipKey } from '../lib/tips';
import { useI18n } from '../lib/i18n';
import { CollectButton } from './CollectButton';
import { CollectorControls } from './CollectorControls';
import { DateRangePicker } from './DateRangePicker';

/** Hover/focus tooltip — portaled to body so overflow parents don't clip it. */
export function InfoTip({ tip, label }: { tip: TipKey | string; label?: string }) {
  const { tip: resolveTip } = useI18n();
  const text = resolveTip(tip);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; place: 'above' | 'below' } | null>(
    null
  );

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }
    const r = anchorRef.current.getBoundingClientRect();
    const place: 'above' | 'below' = r.top < 140 ? 'below' : 'above';
    const left = Math.min(Math.max(r.left + r.width / 2, 16 + 140), window.innerWidth - 16 - 140);
    setPos({
      top: place === 'above' ? r.top - 8 : r.bottom + 8,
      left,
      place,
    });
  }, [open, text]);

  return (
    <>
      <span
        ref={anchorRef}
        className="info-tip"
        tabIndex={0}
        role="img"
        aria-label={label ?? text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span className="info-tip__mark" aria-hidden>
          i
        </span>
      </span>
      {open && pos
        ? createPortal(
            <span
              className={`info-tip__bubble info-tip__bubble--portal info-tip__bubble--${pos.place}`}
              style={{ top: pos.top, left: pos.left }}
              role="tooltip"
            >
              {text}
            </span>,
            document.body
          )
        : null}
    </>
  );
}

export function TipLabel({
  children,
  tip,
  className = '',
}: {
  children: ReactNode;
  tip: TipKey | string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`.trim()}>
      <span>{children}</span>
      <InfoTip tip={tip} />
    </span>
  );
}

function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button
        type="button"
        onClick={() => setLocale('th')}
        className={locale === 'th' ? 'active' : undefined}
      >
        {t.langTh}
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={locale === 'en' ? 'active' : undefined}
      >
        {t.langEn}
      </button>
    </div>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 19c.8-3 2.8-4.5 5-4.5S13.2 16 14 19" />
      <circle cx="16.5" cy="9" r="2.2" />
      <path d="M15.2 19c.4-2.2 1.7-3.4 3.3-3.6 1.6.2 2.8 1.4 3.2 3.6" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M21 12c0 3.87-4.03 7-9 7a10.7 10.7 0 0 1-2.9-.4L5 20l.9-3.1A6.7 6.7 0 0 1 3 12c0-3.87 4.03-7 9-7s9 3.13 9 7Z" />
    </svg>
  );
}

function IconPulse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 12h4l2.2-6 3.6 12 2.4-6H21" />
    </svg>
  );
}

type Props = {
  from: string;
  to: string;
  dates: string[];
  onRangeChange: (from: string, to: string) => void;
  onCollectCompleted?: () => void;
  children: ReactNode;
};

export function Shell({ from, to, dates, onRangeChange, onCollectCompleted, children }: Props) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const search = params.toString();
  const nav = [
    { to: '/', label: t.navOverview, end: true as const, icon: <IconGrid /> },
    { to: '/employees', label: t.navEmployees, icon: <IconPeople /> },
    { to: '/conversations', label: t.navConversations, icon: <IconChat /> },
    { to: '/quality', label: t.navQuality, icon: <IconPulse /> },
  ];

  return (
    <div className="app-shell">
      <aside className="shell-rail">
        <div className="shell-brand">
          <span className="shell-mark" aria-hidden>
            <IconChat />
          </span>
          <div className="shell-brand-text">
            <p className="shell-eyebrow">{t.brandEyebrow}</p>
            <h1>{t.brandTitle}</h1>
          </div>
        </div>
        <p className="shell-lede">{t.brandSubtitle}</p>

        <nav className="shell-nav" aria-label="Primary">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={{ pathname: item.to, search }}
              end={'end' in item ? item.end : false}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shell-rail-foot">
          <LanguageSwitch />
          <div className="shell-date-range">
            <span className="shell-date-range__label">
              <span>{t.dateRange}</span>
              <InfoTip tip="dateRange" />
            </span>
            <DateRangePicker
              from={from}
              to={to}
              dates={dates}
              onRangeChange={onRangeChange}
            />
          </div>
          <CollectorControls />
          <CollectButton from={from} to={to} onCompleted={onCollectCompleted} />
        </div>
      </aside>

      <main className="shell-main">{children}</main>
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tip,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tip?: TipKey | string;
  tone?: 'default' | 'hero';
}) {
  return (
    <div className={tone === 'hero' ? 'metric-tile metric-tile--hero' : 'metric-tile'}>
      <p className="metric-label">
        {label}
        {tip ? <InfoTip tip={tip} label={label} /> : null}
      </p>
      <p className="metric-value">{value}</p>
      {hint ? <div className="metric-hint">{hint}</div> : null}
    </div>
  );
}

export function SectionPanel({
  title,
  tip,
  subtitle,
  children,
  className = '',
}: {
  title: ReactNode;
  tip?: TipKey | string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-head">
        <h2>{tip ? <TipLabel tip={tip}>{title}</TipLabel> : title}</h2>
        {subtitle ? <p className="text-sm text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ConcernBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    OK: 'text-[var(--ok)] bg-emerald-50 ring-1 ring-emerald-100',
    WATCH: 'text-[var(--warn)] bg-amber-50 ring-1 ring-amber-100',
    ALERT: 'text-[var(--danger)] bg-red-50 ring-1 ring-red-100',
    UNREAD: 'text-[var(--unread)] bg-sky-50 ring-1 ring-sky-100',
  };
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ${styles[level] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {level}
    </span>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="panel flex items-center gap-3 text-sm text-[var(--muted)]">
      <span className="shell-brand-dot" aria-hidden />
      {t.loading}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-[14px] border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-[var(--danger)] shadow-[var(--shadow-soft)]">
      {message}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--line-strong)] bg-[var(--panel)] px-5 py-10 text-center text-sm text-[var(--muted)]">
      {children}
    </div>
  );
}
