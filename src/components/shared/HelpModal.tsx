// חלון עזרה לעמדה — נפתח מחלון "אודות" (סמל המערכת).
//
// עיקרון: מוסבר **רק** מה שמוצג בעמדה הזו בפועל. הסינון נעשה ב-visibleHelpTopics
// לפי אותם דגלים שמרנדרים את הרכיבים ב-SectorDashboard, כך שכפתור שלא נבחר
// בבניית העמדה גם לא מקבל סעיף עזרה. הספרור רץ על מה שנשאר אחרי הסינון.
//
// המבנה דו-שכבתי: נושא (תפריט / חלון / אזור) ממוספר n, והכפתורים שבתוכו n.m.
// הפריטים מקופלים כברירת מחדל - אחרת הרשימה ארוכה מכדי לסרוק אותה בעמדה.
// חיפוש פותח אוטומטית את מה שתואם.
//
// הפלטה נגזרת מהתמה (crewPalette) - נכון בשלוש התמות, בלי צבעים קשיחים.
import { useMemo, useState } from 'react';
import { tr } from '../../i18n/tr';
import { visibleHelpTopics, countHelpEntries, type HelpContext } from '../../utils/helpTopics';
import { crewPalette, type ThemeMode, type Palette } from './StationCrewForm';

export interface HelpModalProps {
  ctx: HelpContext;
  themeMode?: ThemeMode;
  onClose: () => void;
  /** "הצג לי" - מבקש מהמסך להאיר את הרכיב עצמו (ראה HelpSpotlight) */
  onShowMe?: (topicId: string, title: string, where: string) => void;
}

/** תג מספר סעיף — n לנושא, n.m לכפתור שבתוכו */
const NumBadge = ({ n, c, sub }: { n: string; c: Palette; sub?: boolean }) => (
  <span
    data-testid={sub ? 'help-subnum' : 'help-num'}
    style={{
      flexShrink: 0, minWidth: sub ? '30px' : '26px', height: sub ? '20px' : '26px',
      borderRadius: sub ? '5px' : '7px', padding: sub ? '0 4px' : 0,
      background: sub ? 'transparent' : c.accent,
      border: sub ? `1px solid ${c.inputBorder}` : 'none',
      color: sub ? c.muted : 'white',
      fontSize: sub ? '11px' : '13px', fontWeight: 'bold',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontVariantNumeric: 'tabular-nums',
    }}
  >{n}</span>
);

export default function HelpModal({ ctx, themeMode = 'dark', onClose, onShowMe }: HelpModalProps) {
  const c = crewPalette(themeMode);
  const [search, setSearch] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const topics = useMemo(() => visibleHelpTopics(ctx), [ctx]);
  const total = countHelpEntries(topics);
  // "הצג לי" מוצע רק לנושא שיש לו עוגן אמיתי על המסך (data-help), כדי שלא
  // נבטיח הצבעה על משהו שלא קיים. נמדד פעם אחת בפתיחת החלון.
  const anchored = useMemo(
    () => new Set(topics.filter(t => document.querySelector(`[data-help="${t.id}"]`)).map(t => t.id)),
    [topics],
  );

  const q = search.trim().toLowerCase();
  const hit = (s: string) => s.toLowerCase().includes(q);

  // הספרור נקבע לפי המיקום ברשימה המלאה של העמדה, כדי שחיפוש לא ישנה מספרים
  // שהמפעיל כבר הכיר ("סעיף 7.2").
  const rows = topics
    .map((t, i) => {
      const n = i + 1;
      const items = t.items.map((item, j) => ({
        ...item, num: `${n}.${j + 1}`, title: tr(item.titleKey), body: tr(item.bodyKey),
      }));
      const title = tr(t.titleKey);
      const body = tr(t.bodyKey);
      const where = tr(t.whereKey);
      const topicMatch = !q || hit(title) || hit(body) || hit(where);
      const shownItems = q ? items.filter(x => hit(x.title) || hit(x.body)) : items;
      return { t, n, title, body, where, items, shownItems, topicMatch };
    })
    .filter(r => r.topicMatch || r.shownItems.length > 0);

  const allOpen = openIds.size >= topics.filter(t => t.items.length).length && openIds.size > 0;
  const toggleAll = () => setOpenIds(allOpen ? new Set() : new Set(topics.filter(t => t.items.length).map(t => t.id)));

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10010, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        data-testid="help-modal"
        style={{
          background: c.card, border: `2px solid ${c.border}`, borderRadius: '14px',
          width: '92%', minWidth: '320px', maxWidth: '680px',
          maxHeight: 'calc(90vh / var(--s, 1))', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* כותרת */}
        <div style={{ padding: '16px 22px 12px', borderBottom: `1px solid ${c.inputBorder}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ fontSize: '17px', fontWeight: 'bold', color: c.title }}>❓ {tr('help.windowTitle')}</div>
            <span style={{ fontSize: '11px', color: c.muted, whiteSpace: 'nowrap' }}>{total} {tr('help.itemsCount')}</span>
          </div>
          <div style={{ fontSize: '12px', color: c.muted, marginTop: '4px', lineHeight: 1.5 }}>{tr('help.windowHint')}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tr('help.search')}
              style={{
                flex: 1, minWidth: 0, padding: '8px 11px',
                borderRadius: '7px', border: `1px solid ${c.inputBorder}`, background: c.inputBg,
                color: c.inputText, fontSize: '13px', textAlign: 'start', outline: 'none',
              }}
            />
            <button
              onClick={toggleAll}
              style={{ flexShrink: 0, padding: '8px 12px', borderRadius: '7px', border: `1px solid ${c.inputBorder}`, background: c.chipOff, color: c.chipOffText, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >{allOpen ? tr('help.collapseAll') : tr('help.expandAll')}</button>
          </div>
        </div>

        {/* סעיפים ממוספרים */}
        <div style={{ overflowY: 'auto', padding: '12px 22px 16px', flex: 1 }}>
          {rows.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: c.muted }}>{tr('help.noResults')}</div>
          )}
          {rows.map(r => {
            const open = q ? r.shownItems.length > 0 : openIds.has(r.t.id);
            return (
              <div key={r.t.id} data-testid="help-topic" style={{ padding: '10px 0', borderBottom: `1px solid ${c.inputBorder}` }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <NumBadge n={String(r.n)} c={c} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div data-testid="help-title" style={{ fontSize: '14px', fontWeight: 'bold', color: c.title, marginBottom: '3px' }}>
                      <span aria-hidden style={{ marginInlineEnd: '5px' }}>{r.t.icon}</span>
                      {r.title}
                    </div>
                    <div style={{ fontSize: '12.5px', color: c.label, lineHeight: 1.6 }}>{r.body}</div>

                    {/* איפה זה נמצא על המסך + הצבעה חיה על הרכיב עצמו */}
                    <div data-testid="help-where" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '5px' }}>
                      <span style={{ fontSize: '11.5px', color: c.muted, lineHeight: 1.5 }}>
                        <span aria-hidden style={{ marginInlineEnd: '4px' }}>📍</span>{r.where}
                      </span>
                      {onShowMe && anchored.has(r.t.id) && (
                        <button
                          onClick={() => onShowMe(r.t.id, r.title, r.where)}
                          style={{ flexShrink: 0, padding: '2px 9px', borderRadius: '6px', border: `1px solid ${c.accent}`, background: 'transparent', color: c.accent, fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                        >👁 {tr('help.showMe')}</button>
                      )}
                    </div>

                    {/* הכפתורים שבתוך התפריט / החלון */}
                    {r.items.length > 0 && (
                      <button
                        onClick={() => setOpenIds(prev => { const s = new Set(prev); s.has(r.t.id) ? s.delete(r.t.id) : s.add(r.t.id); return s; })}
                        style={{ marginTop: '7px', background: 'none', border: 'none', padding: 0, color: c.accent, fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                      >
                        <span aria-hidden style={{ fontSize: '9px' }}>{open ? '▼' : '▶'}</span>
                        {tr('help.insideMenu')} ({r.items.length})
                      </button>
                    )}
                    {open && r.shownItems.length > 0 && (
                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {r.shownItems.map(item => (
                          <div key={item.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: c.listBg, border: `1px solid ${c.inputBorder}`, borderRadius: '7px', padding: '7px 9px' }}>
                            <NumBadge n={item.num} c={c} sub />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div data-testid="help-subtitle" style={{ fontSize: '12.5px', fontWeight: 'bold', color: c.title, marginBottom: '2px' }}>
                                <span aria-hidden style={{ marginInlineEnd: '5px' }}>{item.icon}</span>
                                {item.title}
                              </div>
                              <div style={{ fontSize: '12px', color: c.label, lineHeight: 1.55 }}>{item.body}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 22px', borderTop: `1px solid ${c.inputBorder}`, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 22px', background: c.accent, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {tr('shared.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
