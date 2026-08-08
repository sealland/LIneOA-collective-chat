import { NavLink } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { type TipKey } from '../lib/tips';
import { useI18n } from '../lib/i18n';
import { CollectButton } from './CollectButton';

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

type Props = {
  date: string;
  dates: string[];
  onDateChange: (d: string) => void;
  onCollectCompleted?: () => void;
  children: ReactNode;
};

export function Shell({ date, dates, onDateChange, onCollectCompleted, children }: Props) {
  const { t } = useI18n();
  const nav = [
    { to: '/', label: t.navOverview, end: true as const },
    { to: '/employees', label: t.navEmployees },
    { to: '/conversations', label: t.navConversations },
    { to: '/quality', label: t.navQuality },
  ];

  return (
    <div className="app-shell mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      <header className="shell-header mb-4 flex flex-col gap-3 border-b border-[var(--line)] pb-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
          <div className="min-w-0 flex-1">
            <div className="shell-brand-mark">
              <span className="shell-brand-dot" aria-hidden />
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
                {t.brandEyebrow}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h1 className="font-display text-[1.85rem] leading-none tracking-tight text-[var(--ink)] sm:text-[2.15rem]">
                {t.brandTitle}
              </h1>
              <p className="max-w-xl text-sm leading-snug text-[var(--muted)]">{t.brandSubtitle}</p>
            </div>
          </div>

          <div className="shell-controls self-start xl:self-center">
            <LanguageSwitch />
            <label className="shell-date-field">
              <span className="inline-flex items-center gap-1">
                <span>{t.businessDate}</span>
                <InfoTip tip="businessDate" />
              </span>
              <input
                type="date"
                value={date}
                list="kpi-dates"
                onChange={(e) => onDateChange(e.target.value)}
              />
              <datalist id="kpi-dates">
                {dates.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
            <CollectButton date={date} onCompleted={onCollectCompleted} />
          </div>
        </div>

        <nav className="shell-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tip,
}: {
  label: string;
  value: string;
  hint?: string;
  tip?: TipKey | string;
}) {
  return (
    <div className="metric-tile">
      <p className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        {label}
        {tip ? <InfoTip tip={tip} label={label} /> : null}
      </p>
      <p className="metric-value mt-2 text-[var(--ink)]">{value}</p>
      {hint ? <p className="mt-1.5 text-xs leading-snug text-[var(--muted)]">{hint}</p> : null}
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
    <div className="rounded-[14px] border border-dashed border-[var(--line-strong)] bg-white/50 px-5 py-10 text-center text-sm text-[var(--muted)]">
      {children}
    </div>
  );
}
