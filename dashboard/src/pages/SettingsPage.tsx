import { useI18n } from '../lib/i18n';
import { CollectorSettingsPanel } from '../components/CollectorSettingsPanel';

export function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div>
          <h2>{t.settingsTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t.settingsSubtitle}</p>
        </div>
      </div>
      <CollectorSettingsPanel />
    </div>
  );
}
