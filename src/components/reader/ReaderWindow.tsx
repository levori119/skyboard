// חלון קריאה - עזר, מצגת או PDF נפרסים **בתוך** המערכת, עם סימניות אישיות.
//
// מה שהחלון מוסיף מעבר ל"עוד אפליקציה שנפתחת": העמוד שבו אני נמצא, הסימניות
// שלי עליו וההערות שכתבתי - נשמרים, ובפתיחה הבאה הכל חוזר. סדק פיזי לא שומר
// איפה עצרת; כאן זו הנקודה.
//
// ארבעה מנועי תצוגה, לפי מטריצת המקרים ב-shared/readerDocs.js:
//   pdf    - pdfjs, עמוד-עמוד (גם מצגת שהומרה ל-PDF)
//   image  - תמונה בודדת
//   sheet  - גיליון (xlsx), לשונית = "עמוד"
//   notes  - סימניות והערות בלבד, כשאי-אפשר לפרוס את התוכן (ואז הסיבה מוצגת)
//
// גרירה ושינוי גודל: Pointer Events + touchAction + setPointerCapture + חלוקה
// ב---s. העמדה היא מסך מגע ועט (CLAUDE.md §גרירה).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocument } from '../../utils/pdfjs';
import * as XLSX from 'xlsx';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { windowFrame, frameColor } from '../../utils/windowFrame';
import { startPointerDrag, DRAG_HANDLE_STYLE, readRootScale } from '../../utils/pointerDrag';
import {
  clampReaderRect, defaultReaderRect, docBytesUrl, docIcon, engineFor,
  loadReaderState, saveReaderState, READER_MIN_W, READER_MIN_H,
  READER_SIZE_PRESETS, presetReaderRect, activeSizePreset, fitRectToContent, canvasPixelScale, loadErrorKey, shapeReaderDoc,
  type ReaderBookmark, type ReaderConfig, type ReaderDoc, type ReaderRect, type ReaderSizeKey,
} from '../../utils/reader';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { openReaderDocExternally } from './openExternal';

type ThemeMode = 'light' | 'dark' | 'ocean';

interface Props {
  doc: ReaderDoc;
  presetId: number | string;
  themeMode: ThemeMode;
  officeMode: ReaderConfig['officeMode'];
  /** מיקום בערימת החלונות הפתוחים - קובע את ההיסט המדורג ואת ה-z-index */
  index: number;
  inQuickList: boolean;
  onToggleQuick: () => void;
  onClose: () => void;
  onDocChanged: (doc: ReaderDoc) => void;
}

const Z_BASE = 9700;   // מעל סרגל ההצצה המוגדל (9600) - זה החלון הפעיל של המשתמש
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const palette = (mode: ThemeMode) => mode === 'ocean' ? {
  panel: '#05404e', body: '#02242c', border: '#0e7490', text: '#cffafe', muted: '#22d3ee', chip: '#033240', input: '#022b35',
} : mode === 'light' ? {
  panel: '#f1f5f9', body: '#e2e8f0', border: '#cbd5e1', text: '#1e293b', muted: '#64748b', chip: '#e2e8f0', input: '#ffffff',
} : {
  panel: '#1e293b', body: '#0f172a', border: '#334155', text: '#e2e8f0', muted: '#94a3b8', chip: '#0f172a', input: '#0f172a',
};

/** תרגום סיבת "סימניות בלבד" למשפט שמסביר למשתמש מה לעשות. */
const reasonText = (reason: string): string => {
  switch (reason) {
    case 'unreachable': return tr('reader.reasonUnreachable');
    case 'office-external': return tr('reader.reasonOfficeExternal');
    case 'office-needs-pdf': return tr('reader.reasonOfficeNeedsPdf');
    case 'convert-pending': return tr('reader.reasonConvertPending');
    case 'convert-failed': return tr('reader.reasonConvertFailed');
    default: return tr('reader.reasonUnsupported');
  }
};

export default function ReaderWindow({
  doc, presetId, themeMode, officeMode, index, inQuickList, onToggleQuick, onClose, onDocChanged,
}: Props) {
  const C = palette(themeMode);
  const accent = frameColor('view', themeMode);
  const winRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<any>(null);
  const objectUrlRef = useRef<string | null>(null);

  const saved = useMemo(() => loadReaderState(presetId, doc.id), [presetId, doc.id]);
  const [rect, setRect] = useState<ReaderRect>(() => {
    const s = readRootScale();
    const vw = window.innerWidth / s;
    const vh = window.innerHeight / s;
    return saved.rect ? clampReaderRect(saved.rect, vw, vh) : defaultReaderRect(vw, vh, index);
  });
  const [page, setPage] = useState<number>(Math.max(1, saved.page || 1));
  const [pageCount, setPageCount] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(2);
  const [panelOpen, setPanelOpen] = useState<boolean>(saved.panelOpen ?? true);
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetHtml, setSheetHtml] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [converting, setConverting] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  // כשל בשמירת סימנייה **מוצג**. קודם הוא נבלע, והלחיצה על 🔖+ פשוט לא עשתה
  // כלום - בדיוק "פקד שנדלק בלי שקורה משהו" (CLAUDE.md §Do NOT).
  const [bmError, setBmError] = useState('');
  /** מצב "פתח באפליקציה חיצונית": '' · 'opening' · הודעת שגיאה */
  const [extState, setExtState] = useState('');
  /** הציור הנוכחי של pdf.js - מבוטל לפני ציור חדש על אותו canvas */
  const renderTaskRef = useRef<any>(null);
  /** יחס העמוד המוצג (גובה/רוחב). ממנו נגזר גובה החלון - ראה fitRectToContent */
  const [aspect, setAspect] = useState<number | null>(null);

  // ── עגינה בקונטיינר החלונות ─────────────────────────────────────────────
  // ref ולא rect ישירות: floatingPos נקרא בסוף גרירה, וסגירה על rect הייתה
  // מחזירה את המיקום שהיה ברגע הרינדור ולא את הנוכחי.
  const rectRef = useRef<ReaderRect | null>(null);
  const dock = useDockableWindow(`reader-${doc.id}`, doc.name || doc.file_name || tr('reader.title'), {
    setFloatingPos: (x, y) => setRect(r => ({ ...r, x, y })),
    floatingPos: () => ({ x: rectRef.current?.x ?? 0, y: rectRef.current?.y ?? 0 }),
  });

  const { engine, reason, canConvert } = engineFor(doc, officeMode);
  const pageWord = doc.kind === 'office' || doc.hasPdf ? tr('reader.slide') : engine === 'sheet' ? tr('reader.sheet') : tr('reader.page');

  // ── שמירת מצב התצוגה (מקומי לעמדה) ──────────────────────────────────────
  // בהשהיה ולא בכל שינוי: גרירה מייצרת עשרות עדכוני `rect` בשנייה, וכתיבה
  // סינכרונית ל-localStorage בכל אחד מהם מקרטעת את הגרירה על מסך המגע.
  useEffect(() => {
    const t = setTimeout(() => saveReaderState(presetId, doc.id, { rect, page, panelOpen }), 400);
    return () => clearTimeout(t);
  }, [presetId, doc.id, rect, page, panelOpen]);

  // ── סימניות (בשרת, אישיות) ──────────────────────────────────────────────
  const loadBookmarks = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/reader/bookmarks/${doc.id}`);
      if (r.ok) setBookmarks(await r.json());
    } catch { /* מנותק - נשארים עם מה שיש */ }
  }, [doc.id]);
  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  const addBookmark = async () => {
    try {
      const r = await fetch(`${API_URL}/reader/bookmarks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, pageNo: page, label: `${pageWord} ${page}`, note: '' }),
      });
      // נשמרת **לקריאה בלבד** (אפיון 2026-10-11): שם ועריכה רק דרך ✎
      if (r.ok) { const b = await r.json(); setBookmarks(prev => [...prev, b]); setPanelOpen(true); setBmError(''); }
      else { setBmError(tr('reader.bookmarkSaveFailed')); setPanelOpen(true); }
    } catch { setBmError(tr('reader.bookmarkSaveFailed')); setPanelOpen(true); }
  };

  const patchBookmark = async (b: ReaderBookmark, patch: Partial<ReaderBookmark>) => {
    const next = { ...b, ...patch };
    setBookmarks(prev => prev.map(x => x.id === b.id ? next : x));
    try {
      const r = await fetch(`${API_URL}/reader/bookmarks/${b.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageNo: next.page_no, label: next.label, note: next.note, color: next.color, sortOrder: next.sort_order }),
      });
      setBmError(r.ok ? '' : tr('reader.bookmarkSaveFailed'));
    } catch { setBmError(tr('reader.bookmarkSaveFailed')); /* הערך המקומי נשאר, ייכתב בעריכה הבאה */ }
  };

  const removeBookmark = async (id: number) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
    try { await fetch(`${API_URL}/reader/bookmarks/${id}`, { method: 'DELETE' }); } catch { /* מנותק */ }
  };

  // ── טעינת התוכן ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const cleanupObjectUrl = () => {
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    };

    if (engine === 'notes') { setStatus('idle'); return; }

    (async () => {
      setStatus('loading'); setErrorText('');
      try {
        // הבתים נמשכים ב-fetch ולא ב-src ישיר: תגית <img>/<iframe> אינה יכולה
        // לשאת כותרת Authorization, והנתיב מוגן (ראה server/middleware/auth.js).
        const res = await fetch(docBytesUrl(doc));
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        if (engine === 'pdf') {
          const pdf = await getDocument({ data: buf }).promise;
          if (cancelled) { pdf.destroy?.(); return; }
          pdfRef.current = pdf;
          setPageCount(pdf.numPages);
          setPage(p => Math.min(Math.max(1, p), pdf.numPages));
        } else if (engine === 'image') {
          cleanupObjectUrl();
          const url = URL.createObjectURL(new Blob([buf]));
          objectUrlRef.current = url;
          setImageUrl(url);
          setPageCount(1);
        } else if (engine === 'sheet') {
          const wb = XLSX.read(buf, { type: 'array' });
          setSheetNames(wb.SheetNames);
          setPageCount(wb.SheetNames.length);
          (pdfRef.current as any) = wb;   // אותו ref מחזיק את המסמך הפרוס, יהיה אשר יהיה
          setPage(p => Math.min(Math.max(1, p), wb.SheetNames.length));
        }
        if (!cancelled) setStatus('idle');
      } catch (err) {
        if (!cancelled) { setStatus('error'); setErrorText(String((err as Error)?.message || err)); }
      }
    })();

    return () => {
      cancelled = true;
      cleanupObjectUrl();
      if (pdfRef.current?.destroy) { try { pdfRef.current.destroy(); } catch { /* כבר נהרס */ } }
      pdfRef.current = null;
    };
  }, [doc.id, engine]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── ציור העמוד ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (engine !== 'pdf' || !pdfRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pdf = pdfRef.current;
        const p = await pdf.getPage(Math.min(Math.max(1, page), pdf.numPages));
        if (cancelled) return;
        const canvas = canvasRef.current;
        const box = viewportRef.current;
        if (!canvas || !box) return;
        const base = p.getViewport({ scale: 1 });
        setAspect(base.height / base.width);
        // "התאם לרוחב" הוא ברירת המחדל (זום 1): מצגת נקראת לרוחב הדף
        const fit = Math.max(0.2, (box.clientWidth - 16) / base.width);
        const viewport = p.getViewport({ scale: fit * ZOOMS[zoomIdx] });
        // **טקסט חד:** ה-canvas מצויר ברזולוציה של המסך בפועל (צפיפות × הגדלת
        // העמדה), ומוצג בגודל ה-CSS. קודם צויר 1:1 והמסך מתח אותו - מטושטש.
        const k = canvasPixelScale(window.devicePixelRatio || 1, readRootScale());
        canvas.width = Math.floor(viewport.width * k);
        canvas.height = Math.floor(viewport.height * k);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // שני ציורים על אותו canvas בבת אחת (שינוי גודל/דפדוף מהיר) משבשים את
        // הטקסט - הקודם מבוטל לפני שמתחיל הבא
        try { renderTaskRef.current?.cancel(); } catch { /* כבר הסתיים */ }
        const task = p.render({ canvasContext: ctx, viewport, transform: k !== 1 ? [k, 0, 0, k, 0, 0] : undefined });
        renderTaskRef.current = task;
        await task.promise;
      } catch { /* עמוד שהוחלף באמצע ציור / ציור שבוטל */ }
    })();
    return () => { cancelled = true; };
  }, [engine, page, zoomIdx, rect.w, rect.h, status]);

  // גיליון: הלשונית הנבחרת נפרסת ל-HTML. `xlsx` מייצר טבלה נקייה משלו.
  useEffect(() => {
    if (engine !== 'sheet' || !pdfRef.current) return;
    const wb = pdfRef.current as XLSX.WorkBook;
    const name = wb.SheetNames[Math.min(Math.max(0, page - 1), wb.SheetNames.length - 1)];
    const ws = name ? wb.Sheets[name] : null;
    setSheetHtml(ws ? XLSX.utils.sheet_to_html(ws, { editable: false }) : '');
  }, [engine, page, status]);

  // ── ניווט ומקלדת ────────────────────────────────────────────────────────
  const total = Math.max(1, pageCount);
  const goto = useCallback((n: number) => setPage(Math.min(Math.max(1, n), total)), [total]);

  useEffect(() => {
    // רק החלון שבו המשתמש נוגע מדפדף. בלי התנאי הזה, PageDown היה מקדם את
    // **כל** חלונות הקריאה הפתוחים בבת אחת.
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('input, textarea, select')) return;
      if (!winRef.current?.contains(document.activeElement)) return;
      if (e.key === 'PageDown') { goto(page + 1); e.preventDefault(); }
      else if (e.key === 'PageUp') { goto(page - 1); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, goto]);

  // ── גרירה ושינוי גודל ───────────────────────────────────────────────────
  const bounds = () => {
    const s = readRootScale();
    return { vw: window.innerWidth / s, vh: window.innerHeight / s };
  };

  const onHeaderDown = (e: React.PointerEvent) => {
    const start = { ...rect };
    startPointerDrag(e, {
      onMove: (dx, dy) => {
        const { vw, vh } = bounds();
        setRect(clampReaderRect({ ...start, x: start.x + dx, y: start.y + dy }, vw, vh));
      },
    });
  };

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const start = { ...rect };
    // ב-RTL הידית יושבת בפינה השמאלית, ולכן גרירה שמאלה היא **הגדלה**
    const rtl = i18n.dir() === 'rtl';
    startPointerDrag(e, {
      skipInteractive: false,
      onMove: (dx, dy) => {
        const { vw, vh } = bounds();
        const w = Math.max(READER_MIN_W, start.w + (rtl ? -dx : dx));
        const h = Math.max(READER_MIN_H, start.h + dy);
        setRect(clampReaderRect({ ...start, w, h, x: rtl ? start.x + Math.min(dx, start.w - READER_MIN_W) : start.x }, vw, vh));
      },
    });
  };

  // ── החלון בגודל העמוד המוצג, לא יותר ─────────────────────────────────────
  // הרוחב קובע (גודל קבוע / ידית), והגובה נגזר מהעמוד. "המסגרת" - כל מה שאינו
  // אזור התצוגה (כותרת, ניווט, פאנל הסימניות) - נמדדת ב-DOM כי היא משתנה עם הפאנל.
  // רק בזום "התאם לרוחב": בזום אחר העמוד גדול מהחלון בכוונה, ונגלל.
  rectRef.current = rect;
  useEffect(() => {
    if (!aspect || zoomIdx !== 2 || status !== 'idle') return;
    const vp = viewportRef.current;
    if (!vp) return;
    const cur = rectRef.current!;
    const chrome = { chromeW: cur.w - vp.clientWidth, chromeH: cur.h - vp.clientHeight };
    const { vw, vh } = bounds();
    const next = fitRectToContent(cur, aspect, chrome, vw, vh);
    if (Math.abs(next.w - cur.w) > 1 || Math.abs(next.h - cur.h) > 1 || next.x !== cur.x || next.y !== cur.y) setRect(next);
  }, [aspect, rect.w, panelOpen, zoomIdx, status]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── גדלים קבועים: מלא · 2/3 · חצי · 1/3 ──────────────────────────────────
  const applySize = (fraction: number) => {
    const { vw, vh } = bounds();
    setRect(r => presetReaderRect(fraction, r, vw, vh));
  };
  const SIZE_LABEL: Record<ReaderSizeKey, string> = {
    full: tr('reader.sizeFull'), twoThirds: tr('reader.sizeTwoThirds'),
    half: tr('reader.sizeHalf'), third: tr('reader.sizeThird'),
  };
  const activeSize = (() => { const { vw, vh } = bounds(); return activeSizePreset(rect, vw, vh); })();

  // ── פעולות ──────────────────────────────────────────────────────────────
  /** "פתח באפליקציה חיצונית" - ראה openExternal.ts (משותף עם קישורי העמדה) */
  const openExternal = async () => {
    if (extState === 'opening') return;
    if (doc.hasFile) setExtState('opening');
    const ok = await openReaderDocExternally(doc);
    setExtState(ok ? '' : tr('reader.openExternalFailed'));
  };

  const convertNow = async () => {
    if (converting) return;
    setConverting(true);
    try {
      const r = await fetch(`${API_URL}/reader/docs/${doc.id}/convert`, { method: 'POST' });
      const body = await r.json().catch(() => null);
      if (r.ok && body) onDocChanged({ ...doc, ...body, hasPdf: true });
      else {
        // הכשל **מוצג**: קודם השגיאה נשמרה ב-errorText שבמצב "הערות בלבד" לא
        // מוצג בכלל, והחלון נשאר על "ממיר..." לנצח. השרת רושם את הסיבה
        // (convert_error) - נמשכת מחדש כדי שהחלון יעבור ל"ההמרה נכשלה" עם הסיבה.
        setErrorText(body?.error || tr('reader.reasonConvertFailed'));
        try {
          const m = await fetch(`${API_URL}/reader/docs/${doc.id}`);
          if (m.ok) onDocChanged(shapeReaderDoc(await m.json()));
        } catch { /* מנותק - errorText מוצג */ }
      }
    } catch { setErrorText(tr(loadErrorKey('Failed to fetch'))); }
    setConverting(false);
  };

  // מצגת שטרם הומרה מומרת **מעצמה** בפתיחה - בלי לחיצה על "המר עכשיו". כפתור
  // שהמפעיל חייב ללחוץ כדי לראות את מה שפתח הוא צעד מיותר. פעם אחת למסמך: כשל
  // נשאר מוצג עם הסיבה, וניסיון חוזר הוא בכפתור.
  const autoConvertedRef = useRef(false);
  useEffect(() => {
    if (autoConvertedRef.current || !canConvert || reason !== 'convert-pending') return;
    autoConvertedRef.current = true;
    void convertNow();
  }, [canConvert, reason]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── עיצוב ───────────────────────────────────────────────────────────────
  const btn = (label: string, title: string, onClick: () => void, opts: { active?: boolean; disabled?: boolean } = {}) => (
    <button
      type="button" onClick={onClick} disabled={opts.disabled} title={title} aria-label={title}
      style={{
        background: opts.active ? accent : C.chip, color: opts.active ? '#04202b' : (opts.disabled ? C.border : C.muted),
        border: `1px solid ${C.border}`, borderRadius: 4, minWidth: 24, height: 22, padding: '0 6px',
        fontSize: 12, lineHeight: 1, cursor: opts.disabled ? 'default' : 'pointer', flexShrink: 0,
      }}>{label}</button>
  );

  // חצי הניווט מצביע לכיוון הקריאה: "הקודם" הוא ימינה בעברית ושמאלה באנגלית
  const rtl = i18n.dir() === 'rtl';
  const PANEL_W = 210;
  const showPanel = panelOpen || engine === 'notes';

  const win = (
    <div
      ref={winRef}
      // מקבל פוקוס בנגיעה, כדי ש-PageUp/PageDown ידפדפו **בחלון הזה** בלבד.
      // לא נוגעים בפוקוס כשהנגיעה על פקד - הוא מקבל אותו בעצמו.
      tabIndex={-1}
      onPointerDown={e => {
        const t = e.target as HTMLElement | null;
        if (!t?.closest('input, textarea, select, button, a')) winRef.current?.focus({ preventScroll: true });
      }}
      style={{
        position: 'fixed', left: rect.x, top: rect.y, width: rect.w, height: rect.h,
        outline: 'none',
        zIndex: Z_BASE + index, background: C.panel, ...windowFrame('view', themeMode, 8),
        boxShadow: '0 12px 40px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', direction: i18n.dir(),
        ...dock.rootStyle,
      }}>

      {/* כותרת = ידית הגרירה */}
      <div
        onPointerDown={e => { dock.onHeaderPointerDown(e); if (!dock.docked) onHeaderDown(e); }}
        style={{
          ...DRAG_HANDLE_STYLE, cursor: 'move', display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', background: C.chip, color: C.text, borderBottom: `1px solid ${C.border}`,
          fontSize: 12, fontWeight: 'bold', flexShrink: 0,
        }}>
        <span style={{ flexShrink: 0 }}>{docIcon(doc.kind)}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name || doc.file_name || doc.url}</span>
        {/* גדלים קבועים - לחיצה אחת במקום גרירת ידית, על מסך מגע זה ההבדל */}
        <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
          {READER_SIZE_PRESETS.map(p => (
            <span key={p.key} style={{ display: 'contents' }}>
              {btn(SIZE_LABEL[p.key], tr('reader.sizeTitle', { size: SIZE_LABEL[p.key] }), () => applySize(p.fraction), { active: activeSize === p.key })}
            </span>
          ))}
        </span>
        {btn(inQuickList ? '★' : '☆', inQuickList ? tr('reader.quickRemove') : tr('reader.quickSave'), onToggleQuick, { active: inQuickList })}
        {btn(bookmarks.length ? `🔖 ${bookmarks.length}` : '🔖', tr('reader.bookmarksToggle'), () => setPanelOpen(v => !v), { active: panelOpen, disabled: engine === 'notes' })}
        {btn('↗', tr('reader.openExternal'), openExternal)}
        {btn('✕', tr('reader.close'), onClose)}
      </div>

      {extState && (
        <div role={extState === 'opening' ? 'status' : 'alert'} style={{
          padding: '3px 8px', fontSize: 11, flexShrink: 0, borderBottom: `1px solid ${C.border}`,
          color: extState === 'opening' ? C.muted : '#fca5a5', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ flex: 1 }}>{extState === 'opening' ? tr('reader.openingExternal') : `⚠ ${extState}`}</span>
          {extState !== 'opening' && btn('✕', tr('reader.close'), () => setExtState(''))}
        </div>
      )}

      {/* שורת הניווט - מוסתרת כשאין תוכן לנווט בו */}
      {engine !== 'notes' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
          background: C.panel, borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 11, flexShrink: 0,
        }}>
          {btn(rtl ? '▶' : '◀', tr('reader.prevPage'), () => goto(page - 1), { disabled: page <= 1 })}
          <span style={{ minWidth: 84, textAlign: 'center', color: C.text }}>
            {engine === 'sheet' && sheetNames[page - 1]
              ? sheetNames[page - 1]
              : `${pageWord} ${tr('reader.pageOf', { page, total })}`}
          </span>
          {btn(rtl ? '◀' : '▶', tr('reader.nextPage'), () => goto(page + 1), { disabled: page >= total })}
          <span style={{ flex: 1 }} />
          {engine === 'pdf' && <>
            {btn('−', tr('reader.zoomOut'), () => setZoomIdx(i => Math.max(0, i - 1)), { disabled: zoomIdx === 0 })}
            {btn('⤢', tr('reader.fitWidth'), () => setZoomIdx(2), { active: zoomIdx === 2 })}
            {btn('+', tr('reader.zoomIn'), () => setZoomIdx(i => Math.min(ZOOMS.length - 1, i + 1)), { disabled: zoomIdx === ZOOMS.length - 1 })}
          </>}
          {btn('🔖+', tr('reader.addBookmark'), addBookmark)}
        </div>
      )}

      {/* גוף: תוכן + פאנל סימניות */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={viewportRef} style={{ flex: 1, minWidth: 0, overflow: 'auto', background: C.body, position: 'relative' }}>
          {status === 'loading' && <Centered color={C.muted}>{tr('reader.loading')}</Centered>}
          {status === 'error' && <Centered color={C.muted}>{tr(loadErrorKey(errorText))}{errorText ? ` (${errorText})` : ''}</Centered>}

          {status === 'idle' && engine === 'pdf' && (
            <canvas ref={canvasRef} style={{ display: 'block', margin: '8px auto' }} />
          )}
          {status === 'idle' && engine === 'image' && imageUrl && (
            <img src={imageUrl} alt={doc.name}
              onLoad={e => { const im = e.currentTarget; if (im.naturalWidth) setAspect(im.naturalHeight / im.naturalWidth); }}
              style={{ display: 'block', maxWidth: '100%', margin: '8px auto' }} />
          )}
          {status === 'idle' && engine === 'sheet' && (
            <div
              // התוכן מגיע מקובץ שהועלה בניהול ונפרס ע"י xlsx לטבלה בלבד
              dangerouslySetInnerHTML={{ __html: sheetHtml }}
              style={{ padding: 8, color: C.text, fontSize: 12, direction: 'ltr' }}
            />
          )}

          {engine === 'notes' && (
            <div style={{ padding: 14, color: C.text, fontSize: 12, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 6 }}>{tr('reader.notesOnly')}</div>
              <div style={{ color: C.muted }}>{reasonText(reason)}</div>
              {doc.convertError && <div style={{ color: C.muted, marginTop: 6, fontSize: 11 }}>{doc.convertError}</div>}
              {converting && <div style={{ color: C.text, marginTop: 6, fontSize: 11 }}>⏳ {tr('reader.converting')}</div>}
              {!converting && errorText && !doc.convertError && <div style={{ color: '#fca5a5', marginTop: 6, fontSize: 11 }}>⚠ {errorText}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={openExternal}
                  style={{ background: accent, color: '#04202b', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
                  {tr('reader.openExternal')}
                </button>
                {canConvert && (
                  <button type="button" onClick={convertNow} disabled={converting}
                    style={{ background: C.chip, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: converting ? 'default' : 'pointer' }}>
                    {converting ? tr('reader.converting') : tr('reader.convertNow')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* פאנל סימניות מוסתר - לשונית צרה בצד, עם מספר הסימניות. לחיצה פותחת.
            בלעדיה הדרך היחידה להחזיר את הפאנל הייתה 🔖 בכותרת, שלא נראה כמו
            "הצג פאנל" (2026-10-17). */}
        {!showPanel && (
          <button
            type="button" onClick={() => setPanelOpen(true)}
            title={tr('reader.bookmarksShow')} aria-label={tr('reader.bookmarksShow')}
            style={{
              width: 24, flexShrink: 0, border: 'none', borderInlineStart: `1px solid ${C.border}`,
              background: C.panel, color: C.muted, cursor: 'pointer', padding: '8px 0',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 11,
            }}>
            <span>{rtl ? '▶' : '◀'}</span>
            <span>🔖</span>
            {bookmarks.length > 0 && <span style={{ color: accent, fontWeight: 'bold' }}>{bookmarks.length}</span>}
          </button>
        )}

        {showPanel && (
          <div style={{
            width: PANEL_W, flexShrink: 0, borderInlineStart: `1px solid ${C.border}`, background: C.panel,
            display: 'flex', flexDirection: 'column', minHeight: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
              padding: '4px 8px', borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 11, fontWeight: 'bold',
            }}>
              <span style={{ flex: 1 }}>🔖 {tr('reader.bookmarks')}</span>
              {btn('+', tr('reader.addBookmarkHere'), addBookmark)}
              {/* הסתרה - פינוי מקום לשקף. במצב "הערות בלבד" הפאנל הוא כל התוכן ולכן אין מה להסתיר */}
              {engine !== 'notes' && btn(rtl ? '◀' : '▶', tr('reader.bookmarksHide'), () => setPanelOpen(false))}
            </div>
            {bmError && (
              <div role="alert" style={{ padding: '4px 8px', fontSize: 10, color: '#fca5a5', borderBottom: `1px solid ${C.border}` }}>⚠ {bmError}</div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {bookmarks.length === 0 && (
                <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.6, padding: 4 }}>{tr('reader.noBookmarks')}</div>
              )}
              {bookmarks.map(b => editing === b.id ? (
                // ── מצב עריכה - רק אחרי לחיצה על ✎ ──
                <div key={b.id} style={{ border: `1px solid ${frameColor('edit', themeMode)}`, borderRadius: 4, background: C.chip, padding: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: accent, fontSize: 10, fontWeight: 'bold', flexShrink: 0 }}>{b.page_no}</span>
                    <input
                      autoFocus
                      value={b.label}
                      onChange={e => patchBookmark(b, { label: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(null); }}
                      placeholder={tr('reader.bookmarkLabel')}
                      style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 10, padding: '2px 4px', direction: i18n.dir() }}
                    />
                    <button
                      type="button" onClick={() => removeBookmark(b.id)} title={tr('reader.deleteBookmark')} aria-label={tr('reader.deleteBookmark')}
                      style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', padding: 0, flexShrink: 0 }}>🗑</button>
                  </div>
                  <textarea
                    value={b.note}
                    onChange={e => patchBookmark(b, { note: e.target.value })}
                    placeholder={tr('reader.bookmarkNote')}
                    rows={3}
                    style={{ width: '100%', marginTop: 3, background: C.input, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 10, padding: '2px 4px', resize: 'vertical', direction: i18n.dir(), boxSizing: 'border-box' }}
                  />
                  <button type="button" onClick={() => setEditing(null)}
                    style={{ width: '100%', marginTop: 3, background: accent, color: '#04202b', border: 'none', borderRadius: 3, fontSize: 10, fontWeight: 'bold', padding: '3px 0', cursor: 'pointer' }}>
                    ✓ {tr('reader.bookmarkDone')}
                  </button>
                </div>
              ) : (
                // ── קריאה בלבד: כל השורה = קפיצה לעמוד. עריכה רק ב-✎ ──
                <div key={b.id}
                  role="button" tabIndex={0}
                  onClick={() => goto(b.page_no)}
                  onKeyDown={e => { if (e.key === 'Enter') goto(b.page_no); }}
                  title={tr('reader.bookmarkJump', { page: b.page_no })}
                  style={{
                    border: `1px solid ${b.page_no === page ? accent : C.border}`, borderRadius: 4,
                    background: C.chip, padding: '5px 6px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 5,
                  }}>
                  <span style={{ color: accent, fontSize: 10, fontWeight: 'bold', flexShrink: 0, minWidth: 14 }}>{b.page_no}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', color: C.text, fontSize: 11, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label || `${pageWord} ${b.page_no}`}</span>
                    {b.note && <span style={{ display: 'block', color: C.muted, fontSize: 10, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{b.note}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setEditing(b.id); }}
                    title={tr('reader.bookmarkEdit')} aria-label={tr('reader.bookmarkEdit')}
                    style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3, color: C.muted, fontSize: 10, cursor: 'pointer', padding: '1px 5px', flexShrink: 0 }}>✎</button>
                </div>
              ))}
            </div>

            <div style={{ padding: '4px 8px', borderTop: `1px solid ${C.border}`, color: C.muted, fontSize: 9, lineHeight: 1.4 }}>
              {tr('reader.personalNote')}
            </div>
          </div>
        )}
      </div>

      {/* ידית שינוי גודל - בפינה ה-inline-end, זו שזזה בשתי השפות.
          מעוגן - הקונטיינר קובע את הגודל, וידית הייתה פקד שלא עושה כלום */}
      {!dock.docked && <div
        onPointerDown={onResizeDown}
        title={tr('reader.resize')}
        style={{
          ...DRAG_HANDLE_STYLE, position: 'absolute', bottom: 0, insetInlineEnd: 0,
          width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: i18n.dir() === 'rtl' ? 'nesw-resize' : 'nwse-resize',
          color: accent, background: C.panel, fontSize: 12, lineHeight: 1, borderStartStartRadius: 6,
        }}>⇲</div>}
    </div>
  );
  return dock.render(win);
}

function Centered({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 12, textAlign: 'center', padding: 12 }}>
      {children}
    </div>
  );
}
