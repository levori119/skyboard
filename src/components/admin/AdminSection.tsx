// קטגוריה מכווצת במסך הניהול.
//
// למה: טופס העמדה גדל לעשרות מקטעים, ועמדת דסק משימה מוסיפה עליו **קבוצה שלמה
// לכל חלון מפה** (מפה, נקודות העברה, מפות סקטור). ברשימה שטוחה אי אפשר למצוא
// כלום. הפתרון: קטגוריות מכווצות - ברירת מחדל **מכווץ**, פותחים את מה שעובדים
// עליו. אותו רכיב משרת גם את "כללי" וגם את "קבוצת מפה N", כדי שקיבוץ במסך אחד
// לא ייראה אחרת מקיבוץ במסך אחר (עקרון הרכיבים המשותפים).
//
// מצב הפתיחה יושב ב-provider אחד ולא בכל מקטע בנפרד, כי "פתח הכל"/"כווץ הכל"
// חייבים לשלוט בכולם. מקטע שאין מעליו provider מנהל את עצמו - כך אפשר לשתול
// אותו גם מחוץ לטופס בלי לשבור.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';

interface SectionCtx {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  setAll: (open: boolean) => void;
  register: (id: string, defaultOpen: boolean) => void;
}

const Ctx = createContext<SectionCtx | null>(null);

/** עוטף קבוצת מקטעים ומספק להם מצב פתיחה משותף + פתח/כווץ הכל. */
export function AdminSections({ children }: { children: React.ReactNode }) {
  // ערך undefined = המקטע רשום אך מעולם לא נגעו בו; false/true = מצב מפורש.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const register = useCallback((id: string, defaultOpen: boolean) => {
    setOpen(prev => (id in prev ? prev : { ...prev, [id]: defaultOpen }));
  }, []);
  const toggle = useCallback((id: string) => setOpen(prev => ({ ...prev, [id]: !prev[id] })), []);
  const setAll = useCallback((v: boolean) => {
    setOpen(prev => Object.fromEntries(Object.keys(prev).map(id => [id, v])));
  }, []);

  const value = useMemo<SectionCtx>(() => ({
    register, toggle, setAll,
    isOpen: (id: string) => open[id] === true,
  }), [open, register, toggle, setAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** פס הפעולות "פתח הכל / כווץ הכל" - חי רק בתוך AdminSections. */
export function AdminSectionsToolbar() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const btn: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 6, border: '1px solid #334155',
    background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12,
  };
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      <button type="button" style={btn} onClick={() => ctx.setAll(true)}>⊞ {tr('admin.secExpandAll')}</button>
      <button type="button" style={btn} onClick={() => ctx.setAll(false)}>⊟ {tr('admin.secCollapseAll')}</button>
    </div>
  );
}

export interface AdminSectionProps {
  id: string;                 // מזהה יציב (לא הכותרת - כותרת מתורגמת משתנה בין שפות)
  title: string;              // כבר מתורגם ע"י הקורא
  icon?: string;
  /** תגית מצב קצרה מימין לכותרת (למשל "3 מוגדר"). */
  badge?: string | null;
  /** מסמן את המקטע כדורש השלמה - מסגרת וכותרת בכתום. */
  attention?: boolean;
  /** ברירת המחדל היא מכווץ; מקטע קריטי יכול לבקש פתיחה. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AdminSection({ id, title, icon, badge, attention, defaultOpen, children }: AdminSectionProps) {
  const ctx = useContext(Ctx);
  const [localOpen, setLocalOpen] = useState(defaultOpen === true);
  const reg = ctx?.register;
  useEffect(() => { reg?.(id, defaultOpen === true); }, [reg, id, defaultOpen]);

  const open = ctx ? ctx.isOpen(id) : localOpen;
  const toggle = () => (ctx ? ctx.toggle(id) : setLocalOpen(v => !v));

  // מקטע שכל תוכנו מותנה בסוג העמדה יכול לצאת ריק לגמרי (למשל "אזרחי" בעמדת
  // דסק). כותרת מכווצת שנפתחת לכלום גרועה מכותרת שאינה קיימת - ולכן נמדד כאן
  // מה באמת רונדר. אפשר למדוד כי התוכן נשאר mounted גם כשהוא מכווץ.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const empty = el.childElementCount === 0 && !(el.textContent || '').trim();
    setIsEmpty(prev => (prev === empty ? prev : empty));
  });
  const accent = attention ? '#f59e0b' : open ? '#0ea5e9' : '#334155';

  return (
    <div style={{ marginBottom: 10, border: `1px solid ${accent}`, borderRadius: 8, background: '#0f172a', overflow: 'hidden', display: isEmpty ? 'none' : undefined }}>
      <button
        type="button"
        onClick={toggle}
        title={open ? undefined : tr('admin.secOpenHint')}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
          background: open ? '#0c2a40' : '#111c2e', border: 'none', cursor: 'pointer',
          color: attention ? '#fbbf24' : open ? '#7dd3fc' : '#cbd5e1',
          fontSize: 14, fontWeight: 'bold', textAlign: 'start',
        }}>
        <span style={{ fontSize: 12, opacity: 0.8, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
        {icon && <span>{icon}</span>}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 'normal', padding: '2px 8px', borderRadius: 999,
            background: attention ? '#78350f' : '#1e293b', color: attention ? '#fcd34d' : '#94a3b8', flexShrink: 0,
          }}>{badge}</span>
        )}
      </button>
      {/* המקטע נשאר mounted גם כשהוא מכווץ: שדות הטופס שבתוכו מחזיקים state
          מקומי (בוני שאילתות, עורכי עמודות), ו-unmount היה מאבד אותו בכל כיווץ. */}
      <div ref={bodyRef} style={{ display: open ? 'block' : 'none', padding: '10px 12px 14px' }}>{children}</div>
    </div>
  );
}
