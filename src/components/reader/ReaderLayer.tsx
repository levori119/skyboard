// שכבת הקריאה של העמדה: מנהלת את חלונות הקריאה הפתוחים ואת סרגל הקריאה
// המהירה, ומחזיקה את תצורת המערכת (איפה נפתח עזר, ומה עושים עם קבצי אופיס).
//
// למה שכבה ולא קוד ב-SectorDashboard: הדשבורד רק **מבקש** לפתוח קישור
// (`readerRef.current?.openLink(link)`), וכל השאר - איחוד הקישור לעזר, בחירת
// המנוע, הערמת החלונות, המדף האישי - חי כאן. אותה שכבה תשמש כל מסך שירצה
// לפתוח עזר, בלי לשכפל שורה (עקרון הרכיב המשותף).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { API_URL } from '../../config';
import { bottomBarSlots, shapeReaderDoc, resolveOpenMode, linkOpensInWindow, type ReaderConfig, type ReaderDoc } from '../../utils/reader';
import ReaderWindow from './ReaderWindow';
import QuickReadBar from './QuickReadBar';

type ThemeMode = 'light' | 'dark' | 'ocean';

/** שורת קישור של עמדה, כפי שהיא מגיעה מ-/api/preset-links. */
export interface PresetLinkLike { id: number; url: string; name?: string; doc_id?: number | null }

export interface ReaderLayerHandle {
  /** פותח קישור עמדה. מחזיר false אם הקישור נפתח באפליקציה החיצונית. */
  openLink: (link: PresetLinkLike) => Promise<boolean>;
  /** האם הקישור הזה נפתח בחלון - לפי ההגדרה הפעילה, וקובץ בלבד תמיד בחלון. */
  opensInWindow: (link?: PresetLinkLike) => boolean;
}

interface Props {
  presetId: number | string;
  themeMode: ThemeMode;
  /** עקיפת העמדה מטבלת workstation_presets ('' = ירושה מהמערכת) */
  presetOpenMode?: string | null;
  /** מוצג/מוסתר מתפריט "תצוגה" של העמדה */
  quickBarVisible: boolean;
  /** האם סרגל העמדות מוצג - קובע את חלוקת הרצועה התחתונה */
  stationsBarVisible: boolean;
}

const DEFAULT_CONFIG: ReaderConfig = { openMode: 'external', officeMode: 'pdf', convertAvailable: null };

const ReaderLayer = forwardRef<ReaderLayerHandle, Props>(function ReaderLayer(
  { presetId, themeMode, presetOpenMode, quickBarVisible, stationsBarVisible }, ref,
) {
  const [config, setConfig] = useState<ReaderConfig>(DEFAULT_CONFIG);
  const [open, setOpen] = useState<ReaderDoc[]>([]);
  const [quick, setQuick] = useState<ReaderDoc[]>([]);
  const [quickCollapsed, setQuickCollapsed] = useState<boolean>(
    () => localStorage.getItem(`bt-reader-quick-collapsed-${presetId}`) === '1',
  );

  useEffect(() => {
    localStorage.setItem(`bt-reader-quick-collapsed-${presetId}`, quickCollapsed ? '1' : '0');
  }, [quickCollapsed, presetId]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/reader/config`);
        if (r.ok) setConfig({ ...DEFAULT_CONFIG, ...(await r.json()) });
      } catch { /* מנותק - נשארים על ברירת המחדל, כלומר ההתנהגות הקיימת */ }
    })();
  }, []);

  const loadQuick = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/reader/quick`);
      if (r.ok) {
        const rows = await r.json();
        setQuick(Array.isArray(rows) ? rows.map(shapeReaderDoc) : []);
      }
    } catch { /* מנותק */ }
  }, []);
  useEffect(() => { loadQuick(); }, [loadQuick]);

  const effectiveOpenMode = resolveOpenMode(config.openMode, presetOpenMode ?? '');

  const openDoc = useCallback((doc: ReaderDoc) => {
    setOpen(prev => (prev.some(d => d.id === doc.id) ? prev : [...prev, doc]));
  }, []);

  const openLink = useCallback(async (link: PresetLinkLike): Promise<boolean> => {
    if (!linkOpensInWindow(effectiveOpenMode, link)) return false;
    try {
      const r = await fetch(`${API_URL}/reader/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetLinkId: link.id }),
      });
      if (!r.ok) return false;
      openDoc(shapeReaderDoc(await r.json()));
      return true;
    } catch {
      // מנותק מהשרת - הקישור ייפתח באפליקציה החיצונית, כמו לפני הפיצ'ר
      return false;
    }
  }, [effectiveOpenMode, openDoc]);

  useImperativeHandle(ref, () => ({
    openLink,
    opensInWindow: (link?: PresetLinkLike) => (link ? linkOpensInWindow(effectiveOpenMode, link) : effectiveOpenMode === 'window'),
  }), [openLink, effectiveOpenMode]);

  const toggleQuick = async (doc: ReaderDoc) => {
    const inList = quick.some(d => d.id === doc.id);
    setQuick(prev => inList ? prev.filter(d => d.id !== doc.id) : [...prev, doc]);
    try {
      if (inList) await fetch(`${API_URL}/reader/quick/${doc.id}`, { method: 'DELETE' });
      else await fetch(`${API_URL}/reader/quick`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, sortOrder: quick.length }),
      });
    } catch { /* מנותק - הרשימה תסונכרן בטעינה הבאה */ }
  };

  const slots = bottomBarSlots(quickBarVisible, stationsBarVisible);

  return (
    <>
      {open.map((doc, i) => (
        <ReaderWindow
          key={doc.id}
          doc={doc}
          presetId={presetId}
          themeMode={themeMode}
          officeMode={config.officeMode}
          index={i}
          inQuickList={quick.some(d => d.id === doc.id)}
          onToggleQuick={() => toggleQuick(doc)}
          onClose={() => setOpen(prev => prev.filter(d => d.id !== doc.id))}
          onDocChanged={next => {
            const shaped = shapeReaderDoc(next as unknown as Record<string, unknown>);
            setOpen(prev => prev.map(d => d.id === shaped.id ? shaped : d));
            setQuick(prev => prev.map(d => d.id === shaped.id ? shaped : d));
          }}
        />
      ))}

      {quickBarVisible && (
        <QuickReadBar
          items={quick}
          slot={slots.quick}
          themeMode={themeMode}
          collapsed={quickCollapsed}
          onToggleCollapsed={() => setQuickCollapsed(v => !v)}
          onOpen={openDoc}
          onRemove={toggleQuick}
        />
      )}
    </>
  );
});

export default ReaderLayer;
