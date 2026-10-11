// סרגל "קריאה מהירה" - המדף האישי של העזרים בתחתית המסך.
//
// אותה רצועה תחתונה של סרגל העמדות (StationPeekBar), ולכן אותו שפה עיצובית:
// לשונית כיווץ למעלה, רצועה שנפתחת מתחתיה. כששניהם מוצגים הרצועה מתחלקת -
// **קריאה מהירה בשמאל, עמדות בימין** (ראה bottomBarSlots ב-utils/reader.ts,
// ושם גם הנימוק לשימוש ב-left/right הפיזיים).
//
// המדף אישי לאיש הצוות ונשמר בשרת, ולכן הוא נוסע איתו בין העמדות.
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { docIcon, type BottomSlot, type ReaderDoc } from '../../utils/reader';

type ThemeMode = 'light' | 'dark' | 'ocean';

interface Props {
  items: ReaderDoc[];
  slot: BottomSlot;
  themeMode: ThemeMode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpen: (doc: ReaderDoc) => void;
  onRemove: (doc: ReaderDoc) => void;
}

// z-index: אותה רצועה של סרגל העמדות (8850) - שתיהן רצועה תחתונה אחת, ואסור
// שאחת תכסה את השנייה או את ההודעות (9000).
const Z_BAR = 8850;

const barTheme = (mode: ThemeMode) => mode === 'ocean' ? {
  surface: '#05404e', border: '#0e7490', text: '#cffafe', muted: '#22d3ee', chip: '#033240',
} : mode === 'light' ? {
  surface: '#f1f5f9', border: '#cbd5e1', text: '#1e293b', muted: '#64748b', chip: '#e2e8f0',
} : {
  surface: '#1e293b', border: '#334155', text: '#e2e8f0', muted: '#94a3b8', chip: '#0f172a',
};

export default function QuickReadBar({ items, slot, themeMode, collapsed, onToggleCollapsed, onOpen, onRemove }: Props) {
  const T = barTheme(themeMode);

  return (
    <div
      style={{
        position: 'fixed', left: slot.left, right: slot.right, bottom: 0, zIndex: Z_BAR,
        display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
      }}>
      <button
        type="button"
        onClick={onToggleCollapsed}
        title={collapsed ? tr('reader.quickShow') : tr('reader.quickHide')}
        style={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          background: T.surface, color: T.muted, border: `1px solid ${T.border}`, borderBottom: 'none',
          borderStartStartRadius: 6, borderStartEndRadius: 6, padding: '1px 14px',
          fontSize: 11, cursor: 'pointer', lineHeight: 1.6, direction: i18n.dir(),
        }}>
        <span>{collapsed ? '▲' : '▼'}</span>
        <span>📖 {tr('reader.quickBarTitle')} ({items.length})</span>
      </button>

      {!collapsed && (
        <div style={{
          pointerEvents: 'auto', width: '100%', background: T.surface, borderTop: `1px solid ${T.border}`,
          padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto',
          direction: i18n.dir(), minHeight: 34, boxSizing: 'border-box',
        }}>
          {items.length === 0 && (
            <span style={{ color: T.muted, fontSize: 11 }}>{tr('reader.quickEmpty')}</span>
          )}
          {items.map(d => (
            <div
              key={d.id}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, maxWidth: 220,
                background: T.chip, color: T.text, border: `1px solid ${T.border}`, borderRadius: 5,
                padding: '3px 6px', fontSize: 11,
              }}>
              <button
                type="button"
                onClick={() => onOpen(d)}
                title={d.name || d.file_name || d.url}
                style={{
                  background: 'transparent', border: 'none', color: T.text, cursor: 'pointer',
                  fontSize: 11, padding: 0, display: 'flex', alignItems: 'center', gap: 5,
                  maxWidth: 180, overflow: 'hidden',
                }}>
                <span style={{ flexShrink: 0 }}>{docIcon(d.kind)}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.name || d.file_name || d.url}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(d)}
                title={tr('reader.quickRemove')} aria-label={tr('reader.quickRemove')}
                style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
