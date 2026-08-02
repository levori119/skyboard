// טופס חברי העמדה — רכיב משותף אחד לשני מסלולים:
//   1. עליית עמדה  ("כניסה לעמדה")   — App.tsx, לפני שהעמדה נטענת
//   2. עדכון בשידור ("עדכון חברי העמדה") — תפריט המשתמש ב-SectorDashboard
// אותם שדות, אותה לוגיקה, אותו עיצוב. מה שמשתנה בין המסלולים הוא הכותרת,
// תווית כפתור האישור, נוכחות "דלג" ו**המצב ההתחלתי** — ולא מבנה הטופס:
// בעליית עמדה הטופס נפתח נקי (רק הבקר/פקח שנכנס), ובעדכון הוא טוען את ההרכב
// שיושב עכשיו בעמדה. ראה initialSessionRoles.
//
// סוג העמדה קובע אילו שורות מוצגות (preset_role):
//   מגדל (tower) → פקח · אחורי · [מושגח] · קש"פ
//   יב"א ושאר    → בקר · אחורי · [מושגח] · מפעיל · [מפעיל מושגח] · מש"ק · קש"פ
// בקר/פקח הם אותו שדה ב-DB (`bakar`) — רק התווית מתחלפת.
//
// "מושגח" אינו שורה קבועה: הוא נפתח **בצד** שורת האב רק כשמסומן דגל "קיים משגיח",
// כדי שהטופס בפתיחה ראשונה יישאר קצר.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';

export type ThemeMode = 'light' | 'dark' | 'ocean';

export interface SessionRoles {
  bakar: string;
  achori: string;
  mushgach: string;
  mefale: string;
  mefale_mushgach: string;
  mashak: string;
  mashak_mushgach: string;
  kshp: string;
  has_mushgach: boolean;
  has_mefale_mushgach: boolean;
  has_mashak_mushgach: boolean;
}

export const EMPTY_SESSION_ROLES: SessionRoles = {
  bakar: '', achori: '', mushgach: '', mefale: '', mefale_mushgach: '',
  mashak: '', mashak_mushgach: '', kshp: '',
  has_mushgach: false, has_mefale_mushgach: false, has_mashak_mushgach: false,
};

/** נרמול תשובת השרת (עשויה להיות חלקית / שדות ישנים בלבד) לטיפוס המלא */
export function normalizeRoles(d: any): SessionRoles {
  return {
    bakar: d?.bakar || '',
    achori: d?.achori || '',
    mushgach: d?.mushgach || '',
    mefale: d?.mefale || '',
    mefale_mushgach: d?.mefale_mushgach || '',
    mashak: d?.mashak || '',
    mashak_mushgach: d?.mashak_mushgach || '',
    kshp: d?.kshp || '',
    has_mushgach: d?.has_mushgach === true,
    has_mefale_mushgach: d?.has_mefale_mushgach === true,
    has_mashak_mushgach: d?.has_mashak_mushgach === true,
  };
}

/** פלטה לפי תמה — ocean היא תמה **כהה**, לא בהירה (ראה /ui-adapt) */
export function crewPalette(themeMode: ThemeMode) {
  return themeMode === 'light'
    ? { card: '#ffffff', border: '#94a3b8', accent: '#2563eb', title: '#0f172a', label: '#334155',
        muted: '#64748b', inputBg: '#f8fafc', inputBorder: '#cbd5e1', inputText: '#0f172a',
        listBg: '#ffffff', listHover: '#e2e8f0', chipOff: '#e2e8f0', chipOffText: '#475569' }
    : themeMode === 'ocean'
    ? { card: '#0b3d4c', border: '#0e7490', accent: '#0891b2', title: '#ecfeff', label: '#a5f3fc',
        muted: '#7dd3fc', inputBg: '#052b36', inputBorder: '#0e7490', inputText: '#ecfeff',
        listBg: '#052b36', listHover: '#0e4a5a', chipOff: '#0e4a5a', chipOffText: '#a5f3fc' }
    : { card: '#1e293b', border: '#2563eb', accent: '#2563eb', title: '#ffffff', label: '#cbd5e1',
        muted: '#94a3b8', inputBg: '#0f172a', inputBorder: '#334155', inputText: '#ffffff',
        listBg: '#0f172a', listHover: '#334155', chipOff: '#334155', chipOffText: '#cbd5e1' };
}

export type Palette = ReturnType<typeof crewPalette>;

const MAX_SUGGESTIONS = 50;
/** גובה תפריט ההצעות (px) — מוגדר כאן כי גם לוגיקת ה"פתיחה למעלה" נשענת עליו */
const LIST_MAX_H = 132;

/** נרמול לחיפוש: גרשיים ומרכאות יורדים, רווחים כפולים מתכווצים, אנגלית ל-lowercase */
const normalizeForSearch = (s: string) =>
  s.replace(/["'׳״`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * סינון תפריט השמות לפי מה שהוקלד.
 *
 * בעמדה לא מקלידים את השם המלא ולא בהכרח מתחילתו: מקלידים 2-3 אותיות מהשם
 * הפרטי או מהמשפחה, לפעמים בסדר הפוך ולפעמים בדילוג על מילה ("אורן דור"
 * עבור "אורן בן דור"). לכן כל מילה שהוקלדה נבדקת בנפרד, ורווחים וגרשיים
 * אינם מפילים את החיפוש. חיפוש "מתחיל ב-" בלבד היה מחזיר ריק ונראה שבור.
 */
export function matchCrewOptions(options: string[], query: string): string[] {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return options.slice(0, MAX_SUGGESTIONS);
  return options
    .filter(o => {
      const n = normalizeForSearch(o);
      return tokens.every(t => n.includes(t));
    })
    .slice(0, MAX_SUGGESTIONS);
}

// ── שדה שם עם חיפוש מהיר ברשימת הבקרים ─────────────────────────────────────────
// לא <select>: הרשימה יכולה להיות ארוכה, ובעמדה מקלידים 2-3 אותיות ובוחרים.
// הקלדה חופשית נשארת חוקית — מי שאינו ברשימה עדיין ניתן לרישום.
export function SearchPicker({
  value, onChange, options, placeholder, c, autoFocus, onEnter, field,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  c: Palette;
  autoFocus?: boolean;
  /** Enter כשאין הצעה מסומנת — אישור הטופס, כמו בשדה טקסט רגיל */
  onEnter?: () => void;
  /** שם השדה — עוגן יציב לבדיקות (הסדר משתנה לפי סוג העמדה, אינדקס אינו יציב) */
  field?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  // תפריט שנפתח מתחת לשדה התחתון בטופס יוצא מגבול הכרטיס הגולל ונראה רק אחרי
  // גלילה — ולכן ההצעות של מש"ק/קש"פ "נעלמו". במקרה כזה התפריט נפתח כלפי מעלה.
  const [flipUp, setFlipUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => matchCrewOptions(options, value), [value, options]);

  useEffect(() => { setHi(0); }, [value, open]);

  // מדידה אחרי הרינדור (ולא חישוב לפי קבוע): הטופס מוצג תחת סקייל גודל מסך,
  // ופיקסלים "לוגיים" אינם זהים לפיקסלים על המסך.
  useEffect(() => {
    if (!open) { setFlipUp(false); return; }
    const list = listRef.current, wrap = wrapRef.current;
    if (!list || !wrap) return;
    const card = wrap.closest('[data-crew-scroll]')?.getBoundingClientRect();
    const limit = Math.min(card?.bottom ?? window.innerHeight, window.innerHeight);
    const ceiling = Math.max(card?.top ?? 0, 0);
    const listRect = list.getBoundingClientRect();
    const spaceAbove = wrap.getBoundingClientRect().top - ceiling;
    if (listRect.bottom > limit && spaceAbove > listRect.height) setFlipUp(true);
  }, [open, matches.length]);

  // סגירה בלחיצה מחוץ לשדה — pointerdown ולא click, כדי שגם עט/מגע יסגור
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const pick = (name: string) => { onChange(name); setOpen(false); };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        type="text"
        data-crew-field={field}
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open) {
            if (e.key === 'Enter') onEnter?.();
            return;
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          // Enter בוחר את ההצעה המסומנת; אם אין הצעות — מאשר את הטופס
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (matches[hi]) pick(matches[hi]);
            else { setOpen(false); onEnter?.(); }
          }
          else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
        }}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 11px', borderRadius: '7px',
          border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.inputText,
          fontSize: '14px', boxSizing: 'border-box', textAlign: 'start',
        }}
      />
      {/* התפריט נפתח גם כשהרשימה ריקה — אחרת התפקיד שאין לו אנשים במיראז'
          (מש"ק, למשל) נראה כמו שדה תקול: לוחצים ושום דבר לא קורה */}
      {open && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0,
            ...(flipUp ? { bottom: 'calc(100% + 2px)' } : { top: 'calc(100% + 2px)' }),
            background: c.listBg, border: `1px solid ${c.inputBorder}`, borderRadius: '7px',
            maxHeight: `${LIST_MAX_H}px`, overflowY: 'auto', zIndex: 20,
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: '8px 11px', fontSize: '12px', color: c.muted }}>{tr('crew.noOptionsForRole')}</div>
          )}
          {options.length > 0 && matches.length === 0 && (
            <div style={{ padding: '8px 11px', fontSize: '12px', color: c.muted }}>{tr('crew.noResults')}</div>
          )}
          {matches.map((o, i) => (
            <button
              key={o}
              type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(o)}
              style={{
                display: 'block', width: '100%', textAlign: 'start', padding: '8px 11px',
                border: 'none', cursor: 'pointer', fontSize: '13px',
                background: i === hi ? c.listHover : 'transparent', color: c.inputText,
              }}
            >{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── שורה בטופס: תווית + שדה, ואופציונלית דגל "קיים משגיח" + שדה מושגח בצד ───────
function RoleRow({
  label, children, c, supervisor,
}: {
  label: string;
  children: React.ReactNode;
  c: Palette;
  supervisor?: { label: string; fieldLabel: string; on: boolean; onToggle: (v: boolean) => void; field: React.ReactNode };
}) {
  // שתי שורות מיושרות: שורת תוויות ושורת שדות. התווית של המושגח יושבת באותה
  // שורה כמו תווית האב — אחרת שדה המושגח נדחף מטה ושתי התיבות אינן מיושרות.
  const half: React.CSSProperties = { flex: 1, minWidth: 0 };
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        <div style={{ ...half, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: c.label }}>{label}</label>
          {supervisor && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: c.muted, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={supervisor.on}
                onChange={e => supervisor.onToggle(e.target.checked)}
                style={{ accentColor: c.accent, cursor: 'pointer' }}
              />
              {supervisor.label}
            </label>
          )}
        </div>
        {supervisor?.on && (
          <div style={half}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: c.label }}>{supervisor.fieldLabel}</label>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {children}
        {supervisor?.on && <div style={half}>{supervisor.field}</div>}
      </div>
    </div>
  );
}

// ── אנשי הצוות ממיראז', לפי תפקיד מקצועי ────────────────────────────────────
// השרת מסנן קודם לפי **הרשאה לעמדה** (`presetId`), ואז מקבץ לפי התפקיד:
// bakar (בקר/פקח, משגיח הבקר, אחורי) · mashak (מש"ק + משגיחו) · mefale (מפעיל + משגיחו).
// נפילה שקטה: כשהשירות לא זמין השדות נשארים טקסט חופשי ולא נחסמים.
export interface CrewByPosition {
  bakar: string[];
  pakach: string[];
  mashak: string[];
  mefale: string[];
}

export const EMPTY_CREW_BY_POSITION: CrewByPosition = { bakar: [], pakach: [], mashak: [], mefale: [] };

export function useMirageCrew(presetId: number) {
  const [byPosition, setByPosition] = useState<CrewByPosition>(EMPTY_CREW_BY_POSITION);
  const [crewError, setCrewError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/auth/mirage-crew?presetId=${presetId}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        if (!alive) return;
        const p = d?.byPosition || {};
        setByPosition({
          bakar: Array.isArray(p.bakar) ? p.bakar : [],
          pakach: Array.isArray(p.pakach) ? p.pakach : [],
          mashak: Array.isArray(p.mashak) ? p.mashak : [],
          mefale: Array.isArray(p.mefale) ? p.mefale : [],
        });
      })
      .catch(() => { if (alive) setCrewError(true); });
    return () => { alive = false; };
  }, [presetId]);
  return { byPosition, crewError };
}

/**
 * חברי העמדה שאיתם נפתח הטופס.
 *
 * `fresh` (עליית עמדה): כל עלייה לעמדה היא **הרכב חדש** — הטופס נפתח נקי,
 * ורק שדה הבקר/פקח מתמלא במשתמש שאיתו נכנסנו. בלי זה נגררו לתוכו אנשי
 * המשמרת הקודמת והנכנס היה צריך למחוק שדה-שדה — מסלול שקט לרישום שגוי.
 *
 * אחרת (עדכון חברי העמדה / תחקיר): ההרכב השמור נטען כמו שהוא, כי הוא
 * ההרכב שיושב עכשיו בעמדה. bakar נופל למשתמש הנוכחי רק כשהוא ריק.
 */
export function initialSessionRoles(saved: any, defaultBakar: string | undefined, fresh: boolean): SessionRoles {
  if (fresh) return { ...EMPTY_SESSION_ROLES, bakar: defaultBakar || '' };
  const norm = normalizeRoles(saved);
  return { ...norm, bakar: norm.bakar || defaultBakar || '' };
}

/**
 * טוען את חברי העמדה השמורים.
 * `fresh` — הרכב חדש (מסלול הכניסה): לא טוענים כלל את המשמרת הקודמת.
 */
export function useSessionRoles(presetId: number, defaultBakar?: string, fresh = false) {
  const [roles, setRoles] = useState<SessionRoles>(EMPTY_SESSION_ROLES);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (fresh) {
      setRoles(initialSessionRoles(null, defaultBakar, true));
      setLoading(false);
      return;
    }
    let alive = true;
    fetch(`${API_URL}/workstation-session-roles?preset_id=${presetId}`)
      .then(r => (r.ok ? r.json() : {}))
      .then(d => { if (alive) setRoles(initialSessionRoles(d, defaultBakar, false)); })
      .catch(() => { if (alive) setRoles(initialSessionRoles(null, defaultBakar, false)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [presetId, defaultBakar, fresh]);
  return { roles, setRoles, loading };
}

// ── שדות חברי העמדה ─────────────────────────────────────────────────────────
// מוצא מהמודל כדי שגם טופס התחקיר יציג את **אותם** שדות עם אותה התנהגות
// (חיפוש מהיר, דגלי השגחה, סדר) - בלי שכפול.
export function CrewFields({
  roles, setRoles, presetRole, byPosition, c, autoFocus, onEnter,
}: {
  roles: SessionRoles;
  setRoles: React.Dispatch<React.SetStateAction<SessionRoles>>;
  presetRole?: string | null;
  byPosition: CrewByPosition;
  c: Palette;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const isTower = presetRole === 'tower';
  // בעמדת מגדל התפקיד הוא **פקח** ובעמדת יב"א **בקר** — שני מקצועות נפרדים
  // במיראז', ולכן שורת האב, המושגח והאחורי נשאבים מהתפריט המתאים לסוג העמדה.
  const headPosition: keyof CrewByPosition = isTower ? 'pakach' : 'bakar';
  const set = <K extends keyof SessionRoles>(k: K, v: SessionRoles[K]) =>
    setRoles(prev => ({ ...prev, [k]: v }));

  // כל שדה שם נשאב מהתפריט של התפקיד המתאים. הקלדה חופשית נשארת חוקית —
  // מי שאינו ברשימה (או כשמיראז' לא זמין) עדיין ניתן לרישום.
  const picker = (
    k: 'bakar' | 'achori' | 'mushgach' | 'mefale' | 'mefale_mushgach' | 'mashak' | 'mashak_mushgach',
    position: keyof CrewByPosition,
    focus?: boolean,
  ) => (
    <SearchPicker
      value={roles[k]}
      onChange={v => set(k, v)}
      options={byPosition[position]}
      placeholder={tr('crew.namePlaceholder')}
      c={c}
      autoFocus={focus}
      onEnter={onEnter}
      field={k}
    />
  );

  // קש"פ הוא **מספר** קשר פנים ולא שם — ולכן אין לו תפריט אנשים
  const kshpField = (
    <input
      type="text"
      data-crew-field="kshp"
      value={roles.kshp}
      onChange={e => set('kshp', e.target.value)}
      placeholder={tr('crew.kshpPlaceholder')}
      onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }}
      style={{
        flex: 1, minWidth: 0, width: '100%', padding: '9px 11px', borderRadius: '7px',
        border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.inputText,
        fontSize: '14px', boxSizing: 'border-box', textAlign: 'start',
      }}
    />
  );

  return (
    <>
      {/* בקר (יב"א) / פקח (מגדל) — אותו שדה, תווית לפי סוג העמדה */}
      <RoleRow
        label={isTower ? tr('crew.rolePakach') : tr('crew.roleBakar')}
        c={c}
        supervisor={{
          label: tr('crew.hasSupervisor'),
          fieldLabel: tr('crew.roleMushgach'),
          on: roles.has_mushgach,
          onToggle: v => setRoles(p => ({ ...p, has_mushgach: v, mushgach: v ? p.mushgach : '' })),
          field: picker('mushgach', headPosition),
        }}
      >
        {picker('bakar', headPosition, autoFocus)}
      </RoleRow>

      {/* אחורי נבחר מאותו תפריט כמו שורת האב: בקרים ביב"א, פקחים במגדל */}
      <RoleRow label={tr('crew.roleAchori')} c={c}>{picker('achori', headPosition)}</RoleRow>

      {!isTower && (
        <>
          <RoleRow
            label={tr('crew.roleMefale')}
            c={c}
            supervisor={{
              label: tr('crew.hasSupervisor'),
              fieldLabel: tr('crew.roleMefaleMushgach'),
              on: roles.has_mefale_mushgach,
              onToggle: v => setRoles(p => ({ ...p, has_mefale_mushgach: v, mefale_mushgach: v ? p.mefale_mushgach : '' })),
              field: picker('mefale_mushgach', 'mefale'),
            }}
          >
            {picker('mefale', 'mefale')}
          </RoleRow>
          <RoleRow
            label={tr('crew.roleMashak')}
            c={c}
            supervisor={{
              label: tr('crew.hasSupervisor'),
              fieldLabel: tr('crew.roleMashakMushgach'),
              on: roles.has_mashak_mushgach,
              onToggle: v => setRoles(p => ({ ...p, has_mashak_mushgach: v, mashak_mushgach: v ? p.mashak_mushgach : '' })),
              field: picker('mashak_mushgach', 'mashak'),
            }}
          >
            {picker('mashak', 'mashak')}
          </RoleRow>
        </>
      )}

      <RoleRow label={tr('crew.roleKshp')} c={c}>{kshpField}</RoleRow>
    </>
  );
}

interface Props {
  presetId: number;
  presetName: string;
  /** 'tower' → פקח/אחורי/מושגח/קש"פ · אחרת → הטופס המלא של יב"א */
  presetRole?: string | null;
  /** ברירת מחדל לשדה בקר/פקח — משתמש העמדה. ניתן לשנות לכל שם מרשימת מיראז' */
  defaultBakar?: string;
  mode: 'enter' | 'update';
  themeMode?: ThemeMode;
  /** נקרא אחרי שמירה מוצלחת (או דילוג) — הצרכן סוגר את הטופס וממשיך */
  onDone: (roles: SessionRoles) => void;
  /** מוצג רק במסלול הכניסה */
  onSkip?: () => void;
  /**
   * סגירת הטופס בלי לשמור (✕ / Escape). קיים במסלול העדכון: הטופס אינו חובה,
   * ומי שפתח אותו בטעות חייב דרך החוצה שאינה "שמירה". במסלול הכניסה תפקיד זה
   * ממולא ע"י "דלג", ולכן לא מעבירים כאן handler והכפתור אינו מוצג.
   */
  onCancel?: () => void;
  /** נקרא **בתוך** ה-gesture של הלחיצה, לפני כל await (Fullscreen API) */
  onSubmitGesture?: () => void;
}

export default function StationCrewForm({
  presetId, presetName, presetRole, defaultBakar, mode,
  themeMode = 'dark', onDone, onSkip, onCancel, onSubmitGesture,
}: Props) {
  const c = crewPalette(themeMode);
  // עליית עמדה = הרכב חדש: טופס נקי עם המשתמש שנכנס בלבד.
  // "עדכון חברי העמדה" ממשיך לטעון את ההרכב שיושב בעמדה עכשיו.
  const { roles, setRoles, loading } = useSessionRoles(presetId, defaultBakar, mode === 'enter');
  const { byPosition, crewError } = useMirageCrew(presetId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Escape סוגר את הטופס. תפריט הצעות פתוח בולע את המקש לפני כן (SearchPicker),
  // כך שהלחיצה הראשונה סוגרת את התפריט והשנייה את הטופס.
  useEffect(() => {
    if (!onCancel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = async () => {
    onSubmitGesture?.();
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch(`${API_URL}/workstation-session-roles/${presetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roles),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      // מסלול הכניסה חייב להמשיך גם כשהשמירה נכשלה — לא חוסמים בקר מלעלות לעמדה
      if (mode === 'enter') { setSaving(false); onDone(roles); return; }
      setSaving(false);
      setSaveError(true);
      return;
    }
    setSaving(false);
    onDone(roles);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* data-crew-scroll — הכרטיס הוא אזור הגלילה שביחס אליו תפריטי ההצעות
          מחליטים אם להיפתח למטה או למעלה (SearchPicker) */}
      <div data-crew-scroll style={{
        background: c.card, border: `2px solid ${c.border}`, borderRadius: '14px',
        padding: '24px 28px', minWidth: '340px', maxWidth: '480px', width: '90%',
        maxHeight: 'calc(92vh / var(--s, 1))', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '4px' }}>
            <div style={{ flex: 1, fontSize: '18px', fontWeight: 'bold', color: c.title }}>
              {mode === 'enter' ? `✈️ ${tr('crew.enterTitle')}: ${presetName}` : `👥 ${tr('crew.updateTitle')}: ${presetName}`}
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                style={{
                  background: c.chipOff, color: c.chipOffText, border: 'none', borderRadius: '7px',
                  padding: '6px 12px', fontSize: '13px', cursor: 'pointer', flexShrink: 0,
                }}
              >✕ {tr('crew.close')}</button>
            )}
          </div>
          <div style={{ fontSize: '12px', color: c.muted }}>{tr('crew.hint')}</div>
          {crewError && (
            <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>{tr('crew.crewListError')}</div>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '20px 0', fontSize: '13px', color: c.muted, textAlign: 'center' }}>
            {tr('crew.crewListLoading')}
          </div>
        ) : (
          <CrewFields
            roles={roles}
            setRoles={setRoles}
            presetRole={presetRole}
            byPosition={byPosition}
            c={c}
            autoFocus
            onEnter={submit}
          />
        )}

        {saveError && (
          <div style={{ fontSize: '12px', color: '#ef4444', textAlign: 'center', marginTop: '8px' }}>{tr('crew.saveFailed')}</div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          <button
            id="crewFormSubmit"
            disabled={saving || loading}
            onClick={submit}
            style={{
              flex: 1, padding: '11px', background: saving || loading ? c.chipOff : c.accent,
              color: saving || loading ? c.chipOffText : 'white', border: 'none', borderRadius: '8px',
              fontSize: '15px', fontWeight: 'bold', cursor: saving || loading ? 'wait' : 'pointer',
            }}
          >
            {saving ? '...' : `✅ ${mode === 'enter' ? tr('crew.confirmEnter') : tr('crew.confirmUpdate')}`}
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              style={{
                padding: '11px 18px', background: c.chipOff, color: c.chipOffText,
                border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              }}
            >
              {tr('crew.skip')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
