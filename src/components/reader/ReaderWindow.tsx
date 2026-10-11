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
import { getDocument } from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import i18n from '../../i18n';
import { windowFrame, frameColor } from '../../utils/windowFrame';
import { startPointerDrag, DRAG_HANDLE_STYLE, readRootScale } from '../../utils/pointerDrag';
import {
  clampReaderRect, defaultReaderRect, docBytesUrl, docIcon, engineFor,
  loadReaderState, saveReaderState, READER_MIN_W, READER_MIN_H,
  READER_SIZE_PRESETS, presetReaderRect, activeSizePreset,
  type ReaderBookmark, type ReaderConfig, type ReaderDoc, type ReaderRect, type ReaderSizeKey,
} from '../../utils/reader';

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
      if (r.ok) { const b = await r.json(); setBookmarks(prev => [...prev, b]); setEditing(b.id); setPanelOpen(true); setBmError(''); }
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
        // "התאם לרוחב" הוא ברירת המחדל (זום 1): מצגת נקראת לרוחב הדף
        const fit = Math.max(0.2, (box.clientWidth - 16) / base.width);
        const viewport = p.getViewport({ scale: fit * ZOOMS[zoomIdx] });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await p.render({ canvasContext: ctx, viewport }).promise;
      } catch { /* עמוד שהוחלף באמצע ציור */ }
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
  const openExternal = () => {
    // קובץ שהועלה נפתח דרך הנתיב שלו; קישור - בכתובת המקורית, בדיוק כמו היום
    const href = doc.source_kind === 'file' ? `${API_URL}/reader/docs/${doc.id}/file` : doc.url;
    if (href) window.open(href, '_blank', 'noopener');
  };

  const convertNow = async () => {
    setConverting(true);
    try {
      const r = await fetch(`${API_URL}/reader/docs/${doc.id}/convert`, { method: 'POST' });
      const body = await r.json().catch(() => null);
      if (r.ok && body) onDocChanged({ ...doc, ...body, hasPdf: true });
      else setErrorText(body?.error || tr('reader.reasonConvertFailed'));
    } catch { setErrorText(tr('reader.reasonConvertFailed')); }
    setConverting(false);
  };

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

  return (
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
      }}>

      {/* כותרת = ידית הגרירה */}
      <div
        onPointerDown={onHeaderDown}
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
        {btn('🔖', tr('reader.bookmarksToggle'), () => setPanelOpen(v => !v), { active: panelOpen, disabled: engine === 'notes' })}
        {btn('↗', tr('reader.openExternal'), openExternal)}
        {btn('✕', tr('reader.close'), onClose)}
      </div>

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
          {status === 'error' && <Centered color={C.muted}>{tr('reader.loadFailed')}{errorText ? ` (${errorText})` : ''}</Centered>}

          {status === 'idle' && engine === 'pdf' && (
            <canvas ref={canvasRef} style={{ display: 'block', margin: '8px auto' }} />
          )}
          {status === 'idle' && engine === 'image' && imageUrl && (
            <img src={imageUrl} alt={doc.name} style={{ display: 'block', maxWidth: '100%', margin: '8px auto' }} />
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

        {showPanel && (
          <div style={{
            width: PANEL_W, flexShrink: 0, borderInlineStart: `1px solid ${C.border}`, background: C.panel,
            display: 'flex', flexDirection: 'column', minHeight: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
              padding: '4px 8px', borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 11, fontWeight: 'bold',
            }}>
              <span>🔖 {tr('reader.bookmarks')}</span>
              {btn('+', tr('reader.addBookmarkHere'), addBookmark)}
            </div>
            {bmError && (
              <div role="alert" style={{ padding: '4px 8px', fontSize: 10, color: '#fca5a5', borderBottom: `1px solid ${C.border}` }}>⚠ {bmError}</div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {bookmarks.length === 0 && (
                <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.6, padding: 4 }}>{tr('reader.noBookmarks')}</div>
              )}
              {bookmarks.map(b => (
                <div key={b.id} style={{ border: `1px solid ${C.border}`, borderRadius: 4, background: C.chip, padding: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button" onClick={() => goto(b.page_no)} title={`${pageWord} ${b.page_no}`}
                      style={{ background: 'transparent', border: 'none', color: accent, fontSize: 10, fontWeight: 'bold', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                      {b.page_no}
                    </button>
                    <input
                      value={b.label}
                      onChange={e => patchBookmark(b, { label: e.target.value })}
                      onFocus={() => setEditing(b.id)}
                      placeholder={tr('reader.bookmarkLabel')}
                      style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 10, padding: '2px 4px', direction: i18n.dir() }}
                    />
                    <button
                      type="button" onClick={() => removeBookmark(b.id)} title={tr('reader.deleteBookmark')} aria-label={tr('reader.deleteBookmark')}
                      style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', padding: 0, flexShrink: 0 }}>✕</button>
                  </div>
                  <textarea
                    value={b.note}
                    onChange={e => patchBookmark(b, { note: e.target.value })}
                    onFocus={() => setEditing(b.id)}
                    placeholder={tr('reader.bookmarkNote')}
                    rows={editing === b.id ? 3 : 1}
                    style={{ width: '100%', marginTop: 3, background: C.input, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 10, padding: '2px 4px', resize: 'vertical', direction: i18n.dir(), boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>

            <div style={{ padding: '4px 8px', borderTop: `1px solid ${C.border}`, color: C.muted, fontSize: 9, lineHeight: 1.4 }}>
              {tr('reader.personalNote')}
            </div>
          </div>
        )}
      </div>

      {/* ידית שינוי גודל - בפינה ה-inline-end, זו שזזה בשתי השפות */}
      <div
        onPointerDown={onResizeDown}
        title={tr('reader.resize')}
        style={{
          ...DRAG_HANDLE_STYLE, position: 'absolute', bottom: 0, insetInlineEnd: 0,
          width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: i18n.dir() === 'rtl' ? 'nesw-resize' : 'nwse-resize',
          color: accent, background: C.panel, fontSize: 12, lineHeight: 1, borderStartStartRadius: 6,
        }}>⇲</div>
    </div>
  );
}

function Centered({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 12, textAlign: 'center', padding: 12 }}>
      {children}
    </div>
  );
}
