// גוף הדסק של עמדת "דסק משימה כללי" — עץ הפריסה (BSP) + רינדור השירותים.
// חולץ מ-MissionDeskView כדי שאותו קנבס ישמש בשני הקשרים, בלי שכפול לוגיקה:
//   · MissionDeskView  — מסך עצמאי (מצב הגדרה במסך הניהול)
//   · SectorDashboard  — עמדת דסק משימה אמיתית, בתוך אזור המפה, כך שהעמדה
//     מקבלת את כל מה שמוגדר לה בניהול (עזרים, דש בורד, מצבי בסיס, עומס) כמו כל עמדה.
// סנכרון ב-polling (אין WebSocket): GET /api/mission-desk-state כל POLL_MS.
// עריכה מקומית לא נדרסת: בזמן אינטראקציה או מיד אחרי כתיבה מקומית — דילוג על apply.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import type {
  MDNode, MissionDesk, MissionDeskService,
  MDButtonsState, MDFreeTextState, MDTableState, MDServiceState,
  MDImageConfig, MDLabelConfig,
} from '../../types/missionDesk';
import { mdTheme, type MDThemeMode } from './theme';
import ButtonsBoard from './ButtonsBoard';
import InkPad from './InkPad';
import SmartTable from './SmartTable';
import { ImageSetupPanel, RichLabelEditor, renderLabelRuns } from './configEditors';

interface Props {
  presetId: number;
  deskId: number | null;         // mission_desk_id של העמדה
  presetName: string;
  crewMemberId?: number | null;
  crewMemberName?: string | null;
  allPresets: { id: number; name: string }[];
  themeMode: MDThemeMode;
  // מצב הגדרה (מתוך עורך העמדה): אמצעים/שורות שנוצרים מסומנים "קבוע",
  // ולא מוצג שרבוט עט (הכתיבה שייכת לעמדה).
  adminMode?: boolean;
}

const POLL_MS = 5000;
// גדול ממחזור ה-poll: כתיבה מקומית לא תידרס ע"י GET שרץ לפני שה-PUT התחייב ב-DB
// (Neon latency). עדכונים משותפים לשירותים שלא נערכים כרגע — עדיין ≤ POLL_MS.
const LOCAL_WRITE_GRACE_MS = 8000;

export default function MissionDeskBody({
  presetId, deskId, presetName, crewMemberId, crewMemberName, allPresets, themeMode, adminMode,
}: Props) {
  const [desk, setDesk] = useState<(MissionDesk & { services: MissionDeskService[] }) | null>(null);
  const [deskMissing, setDeskMissing] = useState(false);
  const [states, setStates] = useState<Record<number, MDServiceState>>({});
  const theme = mdTheme(themeMode);
  // כיווניות הקנבס נקבעת כאן לפי שפת המערכת, ולא נגררת מהמכל שמסביב:
  // בעמדה הדסק יושב בתוך המְכל המבני של SectorDashboard שהוא dir="ltr" (פריסת
  // עמדת הבקר תוכננה ל-LTR), ובלי הקיבוע הזה סדר האזורים בעמדה יצא הפוך ממה
  // שמוגדר בניהול (שם הדסק יורש את ה-RTL של השורש).
  const { i18n } = useTranslation();
  const dir = i18n.dir();

  // חלוקת אזורים אישית לעמדה — override על sizes של הפריסה, נשמר מקומית
  // (localStorage) ולא בהגדרת הדסק, כדי שכיוונון ארגונומי לא ישנה עמדות אחרות.
  const [splitOverrides, setSplitOverrides] = useState<Record<string, number[]>>({});
  const splitDragRef = useRef<{ nodeId: string; idx: number; start: number; orig: number[]; len: number; horizontal: boolean } | null>(null);
  const splitsStorageKey = `bt-md-splits-${presetId}-${deskId || 0}`;

  const interactingRef = useRef<Set<number>>(new Set());
  const lastLocalWriteRef = useRef<Record<number, number>>({});

  // שחזור חלוקת האזורים האישית של העמדה
  useEffect(() => {
    try {
      const saved = localStorage.getItem(splitsStorageKey);
      if (saved) setSplitOverrides(JSON.parse(saved));
    } catch { /* noop */ }
  }, [splitsStorageKey]);

  const postLog = useCallback((action: string, details: Record<string, unknown>) => {
    fetch(`${API_URL}/activity-log`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: action,
        workstation_preset_id: presetId,
        workstation_name: presetName,
        crew_member_id: crewMemberId ?? null,
        crew_member_name: crewMemberName ?? null,
        details,
      }),
    }).catch(() => {});
  }, [presetId, presetName, crewMemberId, crewMemberName]);

  // ── טעינת הגדרת הדסק ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const desks = await fetch(`${API_URL}/mission-desks`).then(r => r.json());
        if (!alive) return;
        const mine = Array.isArray(desks) ? desks.find((d: any) => d.id === deskId) : null;
        if (mine) setDesk(mine); else setDeskMissing(true);
      } catch { if (alive) setDeskMissing(true); }
    })();
    return () => { alive = false; };
  }, [deskId]);

  // ── polling: state של השירותים ────────────────────────────────────────────
  const pollState = useCallback(async () => {
    try {
      const rows: { service_id: number; state: MDServiceState; updated_at: string }[] =
        await fetch(`${API_URL}/mission-desk-state?preset_id=${presetId}`).then(r => r.json());
      if (!Array.isArray(rows)) return;
      setStates(prev => {
        const next = { ...prev };
        for (const row of rows) {
          const sid = row.service_id;
          if (interactingRef.current.has(sid)) continue;
          if (Date.now() - (lastLocalWriteRef.current[sid] || 0) < LOCAL_WRITE_GRACE_MS) continue;
          next[sid] = row.state;
        }
        return next;
      });
    } catch { /* polling — שקט */ }
  }, [presetId]);

  useEffect(() => {
    pollState();
    const t = setInterval(pollState, POLL_MS);
    return () => clearInterval(t);
  }, [pollState]);

  // ── כתיבת state (אופטימי + PUT; fan-out בשרת) ─────────────────────────────
  // debounce ל-PUT: גרירה/שינוי-גודל/הקלדה יורים onChange עשרות פעמים —
  // כותבים לרשת רק אחרי שקט קצר (המצב המקומי מתעדכן מיידית). flush ביציאה.
  const putTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef<Record<number, MDServiceState>>({});
  const flushPut = useCallback((serviceId: number) => {
    const state = pendingRef.current[serviceId];
    if (state === undefined) return;
    delete pendingRef.current[serviceId];
    lastLocalWriteRef.current[serviceId] = Date.now();
    fetch(`${API_URL}/mission-desk-state/${serviceId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId, state }),
    }).catch(() => {});
  }, [presetId]);

  const saveState = useCallback((serviceId: number, next: MDServiceState) => {
    setStates(prev => ({ ...prev, [serviceId]: next }));
    lastLocalWriteRef.current[serviceId] = Date.now();
    pendingRef.current[serviceId] = next;
    clearTimeout(putTimersRef.current[serviceId]);
    putTimersRef.current[serviceId] = setTimeout(() => flushPut(serviceId), 400);
  }, [flushPut]);

  useEffect(() => () => {
    // unmount — לשלוח כל מה שממתין
    Object.keys(pendingRef.current).forEach(sid => flushPut(Number(sid)));
    Object.values(putTimersRef.current).forEach(clearTimeout);
  }, [flushPut]);

  const setInteracting = useCallback((serviceId: number, busy: boolean) => {
    if (busy) interactingRef.current.add(serviceId);
    else interactingRef.current.delete(serviceId);
  }, []);

  // מצב הגדרה: עריכת config של שירות (תמונה/טקסט קבוע) — נשמר לשירות (משותף לדסק)
  // ומתעדכן מקומית מיד כדי שהתצוגה תשקף את השינוי.
  const saveServiceConfig = useCallback((serviceId: number, config: object) => {
    setDesk(prev => prev ? { ...prev, services: prev.services.map(s => s.id === serviceId ? { ...s, config } : s) } : prev);
    fetch(`${API_URL}/mission-desk-services/${serviceId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    }).catch(() => {});
  }, []);

  // ── רנדור עץ הפריסה ───────────────────────────────────────────────────────
  const renderService = (serviceId: number | null) => {
    const svc = desk?.services.find(s => s.id === serviceId);
    if (!svc) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: 13 }}>
        {tr('missiondesk.noServiceAssigned')}
      </div>
    );
    const st = states[svc.id];
    const common = { theme, postLog };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ padding: '4px 10px', background: theme.headerBg, borderBottom: `1px solid ${theme.border}`, fontSize: 13, fontWeight: 'bold', color: theme.subtext, display: 'flex', alignItems: 'center', gap: 6 }}>
          {svc.service_type === 'buttons' ? '🎛' : svc.service_type === 'freetext' ? '✍️' : '📊'} {svc.name || tr('missiondesk.unnamedService')}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {svc.service_type === 'buttons' && (
            <ButtonsBoard
              serviceName={svc.name}
              state={(st as MDButtonsState) || { buttons: [] }}
              onChange={s => saveState(svc.id, s)}
              presetId={presetId}
              presetName={presetName}
              allPresets={allPresets}
              onInteracting={b => setInteracting(svc.id, b)}
              adminMode={adminMode}
              {...common}
            />
          )}
          {svc.service_type === 'freetext' && (
            adminMode ? (
              // בהגדרה לא מציגים שרבוטי עט — הכתיבה שייכת לעמדה
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: 13, textAlign: 'center', padding: 12 }}>
                ✍️ {tr('missiondesk.freetextNotInSetup')}
              </div>
            ) : (
              <InkPad
                config={(svc.config as any) || {}}
                state={(st as MDFreeTextState) || { strokes: [] }}
                onChange={s => saveState(svc.id, s)}
                theme={theme}
                onInteracting={b => setInteracting(svc.id, b)}
              />
            )
          )}
          {svc.service_type === 'table' && (
            <SmartTable
              config={(svc.config as any) || { columns: [] }}
              state={(st as MDTableState) || { rows: [] }}
              onChange={s => saveState(svc.id, s)}
              adminMode={adminMode}
              {...common}
            />
          )}
          {/* תמונה קבועה — במצב הגדרה: עורך הדבקה/קובץ; בעמדה: read-only */}
          {svc.service_type === 'image' && (() => {
            const cfg = (svc.config as MDImageConfig) || {};
            if (adminMode) return (
              <ImageSetupPanel config={cfg} onChange={c => saveServiceConfig(svc.id, c)} />
            );
            return cfg.dataUrl ? (
              <img src={cfg.dataUrl} alt={svc.name}
                style={{ width: '100%', height: '100%', objectFit: cfg.fit || 'contain', display: 'block' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.subtext, fontSize: 13, padding: 12, textAlign: 'center' }}>
                🖼 {tr('missiondesk.imageNotSet')}
              </div>
            );
          })()}
          {/* טקסט קבוע — במצב הגדרה: עורך; בעמדה: read-only */}
          {svc.service_type === 'label' && (() => {
            const cfg = (svc.config as MDLabelConfig) || {};
            if (adminMode) return (
              <RichLabelEditor config={cfg} onChange={c => saveServiceConfig(svc.id, c)} />
            );
            return (
              <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '4px 12px', justifyContent: cfg.align === 'start' ? 'flex-start' : cfg.align === 'end' ? 'flex-end' : 'center' }}>
                <div style={{ textAlign: cfg.align || 'center', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                  {renderLabelRuns(cfg)}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  // ── ספליטרים בין אזורים — כיוונון אישי לעמדה, מותאם מגע/עט ────────────────
  const sizesFor = (node: { id: string; sizes: number[]; children: unknown[] }): number[] => {
    const ov = splitOverrides[node.id];
    return ov && ov.length === node.children.length ? ov : node.sizes;
  };

  const onSplitDown = (e: React.PointerEvent, node: { id: string; sizes: number[]; children: unknown[] }, idx: number, horizontal: boolean) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const parent = (e.currentTarget as HTMLElement).parentElement;
    const rect = parent?.getBoundingClientRect();
    splitDragRef.current = {
      nodeId: node.id, idx,
      start: horizontal ? e.clientX : e.clientY,
      orig: [...sizesFor(node)],
      len: (horizontal ? rect?.width : rect?.height) || 1,
      horizontal,
    };
  };
  const onSplitMove = (e: React.PointerEvent) => {
    const d = splitDragRef.current; if (!d) return;
    const rtl = dir === 'rtl'; // כיווניות הקנבס עצמו (ראה dir למעלה), לא של המכל
    const raw = (d.horizontal ? e.clientX : e.clientY) - d.start;
    const deltaPct = ((d.horizontal && rtl ? -raw : raw) / d.len) * 100;
    const a = d.orig[d.idx - 1] + deltaPct;
    const b = d.orig[d.idx] - deltaPct;
    if (a < 8 || b < 8) return; // מינימום 8% לאזור
    const next = [...d.orig];
    next[d.idx - 1] = a; next[d.idx] = b;
    setSplitOverrides(prev => ({ ...prev, [d.nodeId]: next }));
  };
  const onSplitUp = () => {
    if (!splitDragRef.current) return;
    splitDragRef.current = null;
    setSplitOverrides(prev => {
      try { localStorage.setItem(splitsStorageKey, JSON.stringify(prev)); } catch { /* noop */ }
      return prev;
    });
  };

  const renderNode = (node: MDNode): React.ReactNode => {
    if (node.type === 'leaf') {
      return (
        <div key={node.id} style={{ flex: 1, minWidth: 0, minHeight: 0, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {renderService(node.service_id)}
        </div>
      );
    }
    const horizontal = node.direction === 'h';
    const sizes = sizesFor(node);
    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
        {node.children.map((child, i) => (
          <Fragment key={child.id}>
            {i > 0 && (
              /* ספליטר רחב (12px) — נוח לאצבע/עט; pointer capture + touchAction:none */
              <div
                onPointerDown={e => onSplitDown(e, node, i, horizontal)}
                onPointerMove={onSplitMove}
                onPointerUp={onSplitUp}
                onPointerCancel={onSplitUp}
                title={tr('missiondesk.resizeSplitter')}
                style={{
                  flex: '0 0 12px', alignSelf: 'stretch', touchAction: 'none', zIndex: 5,
                  cursor: horizontal ? 'col-resize' : 'row-resize',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <div style={{
                  width: horizontal ? 4 : 34, height: horizontal ? 34 : 4,
                  borderRadius: 3, background: theme.border,
                }} />
              </div>
            )}
            <div style={{ display: 'flex', flexBasis: `${sizes[i] ?? 100 / node.children.length}%`, flexGrow: 0, flexShrink: 1, minWidth: 0, minHeight: 0 }}>
              {renderNode(child)}
            </div>
          </Fragment>
        ))}
      </div>
    );
  };

  return (
    <div dir={dir} data-testid="mission-desk-canvas"
      style={{ flex: 1, display: 'flex', direction: dir, padding: 6, minHeight: 0, minWidth: 0, background: theme.bg, color: theme.text, overflow: 'hidden' }}>
      {deskMissing || !deskId ? (
        <div style={{ margin: 'auto', textAlign: 'center', color: theme.subtext }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🗂</div>
          <div style={{ fontSize: 16 }}>{tr('missiondesk.noDeskConfigured')}</div>
        </div>
      ) : !desk ? (
        <div style={{ margin: 'auto', color: theme.subtext }}>{tr('missiondesk.loading')}</div>
      ) : !desk.layout_json ? (
        <div style={{ margin: 'auto', textAlign: 'center', color: theme.subtext }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📐</div>
          <div style={{ fontSize: 16 }}>{tr('missiondesk.noLayoutConfigured')}</div>
        </div>
      ) : renderNode(desk.layout_json)}
    </div>
  );
}

/** שם הדסק לתצוגה בכותרת — נטען בנפרד מהגוף (הגוף לא חושף state כלפי חוץ). */
export function useMissionDeskName(deskId: number | null): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!deskId) { setName(null); return; }
    let alive = true;
    fetch(`${API_URL}/mission-desks`)
      .then(r => r.json())
      .then((desks: any) => {
        if (!alive) return;
        const mine = Array.isArray(desks) ? desks.find((d: any) => d.id === deskId) : null;
        setName(mine?.name || null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [deskId]);
  return name;
}
