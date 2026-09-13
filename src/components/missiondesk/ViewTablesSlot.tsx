import React, { useEffect, useState } from 'react';
import { tr } from '../../i18n/tr';
import { EmbeddedWindow } from '../../hooks/useDockableWindow';
import type { MDViewTableKey } from '../../types/missionDesk';
import { mdTheme, type MDThemeMode } from './theme';

// ─── משבצת "טבלאות מתצוגה" בדסק משימה ────────────────────────────────────────
//
// מציגה בתוך המשבצת את הטבלאות של תפריט "תצוגה" - **אותם רכיבים** שנפתחים
// מהתפריט כחלונות צפים, עטופים ב-`EmbeddedWindow` כדי שימלאו את המשבצת.
// הרכיב הזה אינו יודע מה בתוך כל טבלה; העמדה (SectorDashboard) מספקת אותן.
//
// כמה טבלאות במשבצת אחת = לשוניות. לשונית שכבר נפתחה נשארת מורכבת ורק
// מוסתרת, כדי שטופס נסיעה באמצע הקלדה לא יימחק במעבר ללשונית ההודעות.

export interface ViewTableTab {
  key: MDViewTableKey;
  icon: string;
  label: string;
  /** null = הטבלה מוצגת במשבצת אחרת בדסק (ראה mdViewTableOwners) */
  node: React.ReactNode | null;
}

export interface ViewTablesSlotProps {
  presetId: number | string | null | undefined;
  serviceId: number;
  tabs: ViewTableTab[];
  themeMode: MDThemeMode;
}

const tabStorageKey = (presetId: ViewTablesSlotProps['presetId'], serviceId: number) =>
  `bt-md-vt-tab-${presetId ?? 'x'}-${serviceId}`;

/** הלשונית הפעילה: השמורה אם עדיין קיימת, אחרת הראשונה */
export function resolveActiveTab(saved: string | null | undefined, keys: MDViewTableKey[]): MDViewTableKey | null {
  if (saved && (keys as string[]).includes(saved)) return saved as MDViewTableKey;
  return keys[0] ?? null;
}

export const ViewTablesSlot: React.FC<ViewTablesSlotProps> = ({ presetId, serviceId, tabs, themeMode }) => {
  const theme = mdTheme(themeMode);
  const keys = tabs.map(t => t.key);
  const [saved, setSaved] = useState<string | null>(() => {
    try { return localStorage.getItem(tabStorageKey(presetId, serviceId)); } catch { return null; }
  });
  const active = resolveActiveTab(saved, keys);
  const [visited, setVisited] = useState<Set<MDViewTableKey>>(() => new Set(active ? [active] : []));

  useEffect(() => {
    if (active && !visited.has(active)) setVisited(prev => new Set(prev).add(active));
  }, [active, visited]);

  const pick = (key: MDViewTableKey) => {
    setSaved(key);
    try { localStorage.setItem(tabStorageKey(presetId, serviceId), key); } catch { /* מצב פרטי / אחסון חסום */ }
  };

  if (tabs.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: 13, textAlign: 'center', padding: 12 }}>
        📑 {tr('missiondesk.viewTablesEmptySlot')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {tabs.length > 1 && (
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: '4px 6px', background: theme.panelAlt, borderBottom: `1px solid ${theme.border}`, flexShrink: 0, overflowX: 'auto' }}>
          {tabs.map(t => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                data-testid={`md-vt-tab-${t.key}`}
                onClick={() => pick(t.key)}
                style={{
                  // מגע ועט: יעד לחיצה של 32 לפחות
                  minHeight: 32, padding: '0 12px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
                  fontSize: 13, fontWeight: on ? 'bold' : 'normal',
                  color: on ? theme.text : theme.subtext,
                  background: on ? theme.panel : 'transparent',
                  border: `1px solid ${on ? theme.accent : theme.border}`,
                }}
              >{t.icon} {t.label}</button>
            );
          })}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {tabs.map(t => {
          if (!visited.has(t.key) && t.key !== active) return null;
          return (
            <div key={t.key} role="tabpanel" style={{ position: 'absolute', inset: 0, display: t.key === active ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
              {t.node == null ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: 13, textAlign: 'center', padding: 12 }}>
                  {t.icon} {tr('missiondesk.viewTablesShownElsewhere')}
                </div>
              ) : (
                <EmbeddedWindow>{t.node}</EmbeddedWindow>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ViewTablesSlot;
