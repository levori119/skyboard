import { tr } from '../../i18n/tr';
import React, { useState, useRef, useEffect } from 'react';

export function GroundVehiclePanel({ lightMode, onClose }: { lightMode: boolean; onClose?: () => void }) {
  const [requests, setRequests] = React.useState<any[]>([]);
  const [routes, setRoutes] = React.useState<any[]>([]);
  const [open, setOpen] = React.useState(true);
  const [selected, setSelected] = React.useState<any | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('');
  const [rejectNote, setRejectNote] = React.useState('');
  const [gpsLatest, setGpsLatest] = React.useState<Record<number, any>>({});
  const [googleMapsKey, setGoogleMapsKey] = React.useState<string>('');
  const [dragPos, setDragPos] = React.useState({ x: 20, y: 80 });
  const [activePanel, setActivePanel] = React.useState<Record<number, 'edit'|'msg'|null>>({});
  const [editRouteId, setEditRouteId] = React.useState<Record<number, string>>({});
  const [editNotes, setEditNotes] = React.useState<Record<number, string>>({});
  const [msgText, setMsgText] = React.useState<Record<number, string>>({});
  const [msgSending, setMsgSending] = React.useState<Record<number, boolean>>({});
  const dragRef = React.useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [newlyArrived, setNewlyArrived] = React.useState<number[]>([]);
  const prevRequestsRef = React.useRef<any[]>([]);

  // Route-plan (auto pathfinding) state — shared for pending AND active edit panels
  const [planTab, setPlanTab] = React.useState<'select'|'build'>('select');
  const [activePlanTab, setActivePlanTab] = React.useState<Record<number,'select'|'build'>>({});
  const [planPermissions, setPlanPermissions] = React.useState<string[]>(['vehicle']);
  const [planFromId, setPlanFromId] = React.useState('');
  const [planToId, setPlanToId] = React.useState('');
  const [planResult, setPlanResult] = React.useState<any>(null);
  const [planLoading, setPlanLoading] = React.useState(false);
  const [planAirfields, setPlanAirfields] = React.useState<any[]>([]);
  const [planAirfieldId, setPlanAirfieldId] = React.useState('');
  const [afPoints, setAfPoints] = React.useState<any[]>([]);
  const [planAfRoutes, setPlanAfRoutes] = React.useState<any[]>([]);
  const [planAfElements, setPlanAfElements] = React.useState<any[]>([]);
  const [planViaRouteIds, setPlanViaRouteIds] = React.useState<number[]>([]);
  const [planShowOnMap, setPlanShowOnMap] = React.useState(false);
  const [navBlockedGroupsOpen, setNavBlockedGroupsOpen] = React.useState<Record<string,boolean>>({});
  const [navUnusableGroupsOpen, setNavUnusableGroupsOpen] = React.useState<Record<string,boolean>>({});

  React.useEffect(() => {
    fetch('/api/google-maps-key').then(r => r.ok ? r.json() : {} as any).then((d: any) => { if (d.key) setGoogleMapsKey(d.key); }).catch(() => {});
  }, []);

  React.useEffect(() => {
    fetch('/api/airfields').then(r => r.ok ? r.json() : []).then(setPlanAirfields).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!planAirfieldId) { setAfPoints([]); return; }
    fetch(`/api/airfields/${planAirfieldId}/points`).then(r => r.ok ? r.json() : []).then(setAfPoints).catch(() => {});
  }, [planAirfieldId]);

  React.useEffect(() => {
    if (!planAirfieldId) { setPlanAfRoutes([]); setPlanAfElements([]); setPlanViaRouteIds([]); return; }
    fetch(`/api/airfield-routes?airfield_id=${planAirfieldId}`).then(r => r.ok ? r.json() : []).then(d => setPlanAfRoutes(d)).catch(() => {});
    fetch(`/api/airfield-elements?airfield_id=${planAirfieldId}`).then(r => r.ok ? r.json() : []).then(d => setPlanAfElements(d)).catch(() => {});
  }, [planAirfieldId]);

  const autoSelectAbort = React.useRef<{ cancelled: boolean }>({ cancelled: false });

  // Auto-populate airfield + from/to + calculate route when a request is selected.
  // Does everything in one async flow; does NOT rely on the planAirfieldId→afPoints effect chain
  // so it works even when planAirfieldId doesn't change between selections.
  React.useEffect(() => {
    if (!selected) return;
    autoSelectAbort.current.cancelled = true;
    const myAbort = { cancelled: false };
    autoSelectAbort.current = myAbort;
    setPlanResult(null); setPlanFromId(''); setPlanToId(''); setPlanViaRouteIds([]);
    setPlanPermissions(['vehicle', 'taxiways', 'runways']); // use all route types defined in airfield

    (async () => {
      // 1. Resolve airfield — prefer stored ID, else match by base_name
      let afIdStr = selected.from_point_airfield_id ? String(selected.from_point_airfield_id) : '';
      if (!afIdStr && selected.base_name) {
        let afs: any[] = planAirfields.length ? planAirfields :
          await fetch('/api/airfields').then(r => r.ok ? r.json() : []).catch(() => []);
        if (myAbort.cancelled) return;
        const matched = afs.filter((a: any) =>
          (a.base_name && a.base_name === selected.base_name) ||
          (a.name && a.name.startsWith(selected.base_name))
        );
        if (matched.length) {
          const af = matched.find((a: any) => a.name?.includes('קרקעי')) || matched[0];
          afIdStr = String(af.id);
        }
      }
      if (!afIdStr || myAbort.cancelled) return;
      setPlanAirfieldId(afIdStr);

      // 2. Fetch points DIRECTLY — don't wait for planAirfieldId effect (it might not fire if value unchanged)
      const pts: any[] = await fetch(`/api/airfields/${afIdStr}/points`)
        .then(r => r.ok ? r.json() : []).catch(() => []);
      if (myAbort.cancelled) return;
      setAfPoints(pts);

      // 3. Resolve from/to — prefer stored IDs, fall back to name match
      let fromId = selected.from_point_id ? String(selected.from_point_id) : '';
      let toId   = selected.to_point_id   ? String(selected.to_point_id)   : '';
      if (!fromId && selected.origin)      { const p = pts.find((pt: any) => pt.name === selected.origin);      if (p) fromId = String(p.id); }
      if (!toId   && selected.destination) { const p = pts.find((pt: any) => pt.name === selected.destination); if (p) toId   = String(p.id); }
      if (fromId) setPlanFromId(fromId);
      if (toId)   setPlanToId(toId);
      if (fromId && toId) setPlanTab('build');

      // 4. Auto-calculate route
      if (fromId && toId) {
        setPlanLoading(true); setPlanResult(null);
        try {
          const data = await fetch('/api/route-plan', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ airfield_id: Number(afIdStr), from_point_id: Number(fromId), to_point_id: Number(toId), permissions: ['vehicle', 'taxiways', 'runways'] })
          }).then(r => r.json());
          if (!myAbort.cancelled) setPlanResult(data);
        } catch { if (!myAbort.cancelled) setPlanResult({ error: 'שגיאת רשת' }); }
        if (!myAbort.cancelled) setPlanLoading(false);
      }

      // 5. Load routes for this base
      if (selected.base_id) loadRoutes(selected.base_id);
    })();

    return () => { myAbort.cancelled = true; };
  }, [selected?.id]);

  const loadRequests = React.useCallback(async () => {
    try {
      const r = await fetch('/api/vehicle-requests');
      if (r.ok) {
        const data = await r.json();
        setRequests(prev => {
          // Detect requests that just transitioned to 'arrived'
          const prevApproved = new Set(prev.filter(p => p.status === 'approved').map(p => p.id));
          const justArrived = data.filter((d: any) => d.status === 'arrived' && prevApproved.has(d.id));
          if (justArrived.length > 0) {
            setNewlyArrived(na => [...new Set([...na, ...justArrived.map((d: any) => d.id)])]);
          }
          return data;
        });
      }
    } catch {}
  }, []);

  const loadRoutes = React.useCallback(async (baseId?: number) => {
    try {
      const url = baseId ? `/api/base-routes?base_id=${baseId}` : '/api/base-routes';
      const r = await fetch(url);
      if (r.ok) setRoutes(await r.json());
    } catch {}
  }, []);

  React.useEffect(() => {
    loadRequests(); loadRoutes();
    const iv = setInterval(loadRequests, 5000);
    return () => clearInterval(iv);
  }, [loadRequests, loadRoutes]);

  // Poll GPS for active + pending requests
  React.useEffect(() => {
    const activeIds = requests.filter(r => r.status === 'approved' || r.status === 'pending').map(r => r.id);
    if (activeIds.length === 0) return;
    const fetchGps = async () => {
      try {
        const r = await fetch('/api/vehicle-gps/all-latest');
        if (r.ok) {
          const rows = await r.json();
          const map: Record<number, any> = {};
          rows.forEach((row: any) => { map[row.request_id] = row; });
          setGpsLatest(map);
        }
      } catch {}
    };
    fetchGps();
    const iv = setInterval(fetchGps, 5000);
    return () => clearInterval(iv);
  }, [requests]);

  const bg = lightMode ? '#f1f5f9' : '#1e293b';
  const border = lightMode ? '#cbd5e1' : '#334155';
  const textColor = lightMode ? '#1e293b' : '#e2e8f0';
  const subColor = lightMode ? '#64748b' : '#94a3b8';

  const pending = requests.filter(r => r.status === 'pending');
  const active  = requests.filter(r => r.status === 'approved');
  const recent  = requests.filter(r => r.status === 'arrived' || r.status === 'completed' || r.status === 'rejected' || r.status === 'cancelled').slice(0, 5);

  const badgeColor: Record<string, string> = {
    pending:   '#fde047', approved: '#4ade80', arrived: '#a5b4fc',
    completed: '#a5b4fc', rejected: '#f87171', cancelled: '#94a3b8'
  };
  const badgeLabel: Record<string, string> = {
    pending: 'ממתין', approved: 'מאושר', arrived: 'הגיע',
    completed: 'הושלם', rejected: 'נדחה', cancelled: 'בוטל'
  };

  const approve = async (reqId: number) => {
    if (!selectedRouteId) { alert('בחר מסלול לפני אישור'); return; }
    await fetch(`/api/vehicle-requests/${reqId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', assigned_route_id: parseInt(selectedRouteId) })
    });
    setSelected(null); setSelectedRouteId('');
    loadRequests();
  };

  const buildPlan = async () => {
    if (!planAirfieldId) { alert('בחר שדה תעופה תחילה'); return; }
    if (!planFromId || !planToId) { alert('בחר נקודת מוצא ויעד'); return; }
    setPlanLoading(true); setPlanResult(null);
    try {
      const r = await fetch('/api/route-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airfield_id: Number(planAirfieldId), from_point_id: Number(planFromId), to_point_id: Number(planToId), permissions: planPermissions }) });
      const data = await r.json();
      setPlanResult(data);
    } catch { setPlanResult({ error: 'שגיאת רשת' }); }
    setPlanLoading(false);
  };

  const approveWithPlan = async (reqId: number) => {
    if (!planViaRouteIds.length && !planResult?.waypoints?.length) { alert('בחר ניווט או חשב מסלול GPS תחילה'); return; }
    let routeId: number | null = null;
    if (planResult?.waypoints?.length) {
      const fromPt = afPoints.find((p: any) => String(p.id) === planFromId);
      const toPt = afPoints.find((p: any) => String(p.id) === planToId);
      const routeName = `מסלול מחושב: ${fromPt?.name || '?'} → ${toPt?.name || '?'}`;
      const saved = await fetch('/api/base-routes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: routeName, waypoints: planResult.waypoints, notes: `מסלול אוטומטי — ${planPermissions.join('+')}`, airfield_id: Number(planAirfieldId), route_type: 'vehicle' }) }).then(r => r.ok ? r.json() : null);
      if (saved?.id) routeId = saved.id;
    }
    await fetch(`/api/vehicle-requests/${reqId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', assigned_route_id: routeId, via_route_ids: planViaRouteIds, show_on_map: planShowOnMap }) });
    setSelected(null); setPlanResult(null); setPlanFromId(''); setPlanToId(''); setPlanViaRouteIds([]); setPlanShowOnMap(false);
    loadRequests();
  };

  const reject = async (reqId: number) => {
    await fetch(`/api/vehicle-requests/${reqId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', notes: rejectNote })
    });
    setSelected(null); setRejectNote('');
    loadRequests();
  };

  const openMapForReq = (req: any) => {
    const gps = gpsLatest[req.id];
    if (!gps) { alert('אין מיקום GPS לרכב זה'); return; }
    const url = `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
    window.open(url, '_blank');
  };

  const cancelActive = async (reqId: number) => {
    if (!confirm('לבטל את הנסיעה המאושרת?')) return;
    await fetch(`/api/vehicle-requests/${reqId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
    setActivePanel(p => { const n = { ...p }; delete n[reqId]; return n; });
    loadRequests();
  };

  const sendMsg = async (reqId: number) => {
    const msg = (msgText[reqId] || '').trim();
    if (!msg) return;
    setMsgSending(p => ({ ...p, [reqId]: true }));
    try {
      await fetch('/api/vehicle-messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: reqId, message: msg }) });
      setMsgText(p => ({ ...p, [reqId]: '' }));
      setActivePanel(p => ({ ...p, [reqId]: null }));
    } catch {}
    setMsgSending(p => ({ ...p, [reqId]: false }));
  };

  const updateActiveRoute = async (req: any) => {
    const routeId = editRouteId[req.id] !== undefined ? editRouteId[req.id] : String(req.assigned_route_id || '');
    if (!routeId) { alert('בחר מסלול'); return; }
    const notes = editNotes[req.id] !== undefined ? editNotes[req.id] : (req.notes || '');
    await fetch(`/api/vehicle-requests/${req.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigned_route_id: parseInt(routeId), notes }) });
    setActivePanel(p => ({ ...p, [req.id]: null }));
    loadRequests();
  };

  const updateWithPlan = async (req: any) => {
    if (!planViaRouteIds.length && !planResult?.waypoints?.length) { alert('בחר ניווט או חשב מסלול GPS תחילה'); return; }
    let routeId: number | null = null;
    if (planResult?.waypoints?.length) {
      const fromPt = afPoints.find((p: any) => String(p.id) === planFromId);
      const toPt   = afPoints.find((p: any) => String(p.id) === planToId);
      const routeName = `מסלול מחושב: ${fromPt?.name || '?'} → ${toPt?.name || '?'}`;
      const saved = await fetch('/api/base-routes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: routeName, waypoints: planResult.waypoints, notes: `מסלול אוטומטי — ${planPermissions.join('+')}`, airfield_id: Number(planAirfieldId), route_type: 'vehicle' }) }).then(r => r.ok ? r.json() : null);
      if (saved?.id) routeId = saved.id;
    }
    const notes = editNotes[req.id] !== undefined ? editNotes[req.id] : (req.notes || '');
    await fetch(`/api/vehicle-requests/${req.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_route_id: routeId, via_route_ids: planViaRouteIds, show_on_map: planShowOnMap, notes }) });
    setActivePanel(p => ({ ...p, [req.id]: null }));
    setPlanResult(null); setPlanFromId(''); setPlanToId(''); setPlanViaRouteIds([]); setPlanShowOnMap(false);
    setActivePlanTab(p => ({ ...p, [req.id]: 'select' }));
    loadRequests();
  };

  const onDragStart = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: dragPos.x, origY: dragPos.y };
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setDragPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  };
  const onDragEnd = () => { dragRef.current = null; };

  return (
    <div style={{ position: 'fixed', left: dragPos.x, top: dragPos.y, zIndex: 8500, width: 340, background: lightMode ? '#fffbeb' : '#1c1107', border: `2px solid ${lightMode ? '#fbbf24' : '#b45309'}`, borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.55)', direction: 'rtl', overflow: 'hidden', minWidth: 260 }}>
      {/* Draggable Header */}
      <div
        onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', cursor: 'grab', userSelect: 'none', background: lightMode ? '#fef3c7' : '#1c1107', borderBottom: `1px solid ${lightMode ? '#fbbf24' : '#b45309'}` }}>
        <span style={{ fontSize: '16px' }}>🚛</span>
        <span onClick={() => setOpen(o => !o)} style={{ flex: 1, fontSize: '12px', fontWeight: 'bold', color: lightMode ? '#92400e' : '#fcd34d', cursor: 'pointer' }}>כניסת רכבים ({pending.length} ממתין{active.length > 0 ? `, ${active.length} בדרך` : ''})</span>
        {pending.length > 0 && <span style={{ background: '#ef4444', color: 'white', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 'bold', flexShrink: 0, animation: 'pulse 1.5s infinite' }}>{pending.length}</span>}
        <span onClick={() => setOpen(o => !o)} style={{ color: subColor, fontSize: 11, cursor: 'pointer', marginRight: '2px' }}>{open ? '▲' : '▼'}</span>
        {onClose && <button onPointerDown={e => e.stopPropagation()} onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }} title={tr('shared.close')}>✕</button>}
      </div>

      {open && (
        <div style={{ padding: '8px', maxHeight: 400, overflowY: 'auto', direction: 'rtl' }}>

          {/* Arrived notifications */}
          {newlyArrived.length > 0 && newlyArrived.map(id => {
            const req = requests.find(r => r.id === id);
            if (!req) return null;
            return (
              <div key={id} style={{ background: '#1a0a4a', border: '2px solid #a5b4fc', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px', animation: 'pulse 1.5s infinite' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#a5b4fc' }}>{tr('ground.arrivedAtDestination')}</span>
                  <button onClick={() => setNewlyArrived(na => na.filter(n => n !== id))}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '3px' }}>
                  <strong>{req.driver_name}</strong> {tr('ground.arrivedAt')} <strong>{req.destination}</strong>
                </div>
                {req.vehicle_type && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{req.vehicle_type}{req.plate_number ? ` · ${req.plate_number}` : ''}</div>}
              </div>
            );
          })}

          {/* Pending */}
          {pending.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', color: '#fde047', fontWeight: 'bold', marginBottom: '6px' }}>{tr('ground.awaitingApproval')}</div>
              {pending.map(req => (
                <div key={req.id} style={{ background: lightMode ? '#fff' : '#0f172a', border: `1px solid ${selected?.id === req.id ? '#f59e0b' : border}`, borderRadius: '8px', padding: '8px 10px', marginBottom: '6px', cursor: 'pointer' }}
                  onClick={() => { setSelected(selected?.id === req.id ? null : req); setSelectedRouteId(''); setRejectNote(''); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', color: textColor, fontSize: '13px' }}>{req.driver_name}</span>
                    <span style={{ fontSize: '11px', background: '#fef08a22', color: '#fde047', border: '1px solid #fde04755', borderRadius: 10, padding: '1px 8px' }}>{tr('shared.pending')}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: subColor }}>
                    {req.base_name} • {req.supply_type} → {req.destination}
                  </div>
                  {req.vehicle_type && <div style={{ fontSize: '10px', color: subColor }}>{req.vehicle_type} {req.plate_number}</div>}

                  {selected?.id === req.id && (
                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
                      {/* Driver GPS + destination info */}
                      <div style={{ background: lightMode ? '#f0fdf4' : '#052e16', border: `1px solid ${lightMode ? '#86efac' : '#166534'}`, borderRadius: '6px', padding: '6px 8px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: lightMode ? '#15803d' : '#4ade80', fontWeight: 'bold', marginBottom: '2px' }}>{tr('ground.driverLocation')}</div>
                            {gpsLatest[req.id] ? (
                              <div style={{ fontSize: '10px', color: lightMode ? '#166534' : '#86efac', fontFamily: 'monospace' }}>
                                {Number(gpsLatest[req.id].lat).toFixed(5)}°N, {Number(gpsLatest[req.id].lon).toFixed(5)}°E
                                {gpsLatest[req.id].speed_kmh != null && <span style={{ marginRight: '6px', color: lightMode ? '#15803d' : '#4ade80' }}> {Math.round(gpsLatest[req.id].speed_kmh)} קמ"ש</span>}
                              </div>
                            ) : (
                              <div style={{ fontSize: '10px', color: '#64748b' }}>{tr('ground.awaitingGpsData')}</div>
                            )}
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '10px', color: lightMode ? '#1d4ed8' : '#93c5fd', fontWeight: 'bold', marginBottom: '2px' }}>{tr('ground.destination3')}</div>
                            <div style={{ fontSize: '11px', color: lightMode ? '#1e40af' : '#bfdbfe', fontWeight: 'bold' }}>{req.destination}</div>
                          </div>
                        </div>
                      </div>
                      {/* Tab switcher */}
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                        <button onClick={() => setPlanTab('select')} style={{ flex: 1, padding: '4px', fontSize: '11px', fontWeight: planTab === 'select' ? 'bold' : 'normal', background: planTab === 'select' ? '#1d4ed8' : (lightMode ? '#e2e8f0' : '#1e293b'), color: planTab === 'select' ? '#fff' : subColor, border: 'none', borderRadius: '5px', cursor: 'pointer' }}>{tr('ground.selectRoute3')}</button>
                        <button onClick={() => setPlanTab('build')} style={{ flex: 1, padding: '4px', fontSize: '11px', fontWeight: planTab === 'build' ? 'bold' : 'normal', background: planTab === 'build' ? '#7c3aed' : (lightMode ? '#e2e8f0' : '#1e293b'), color: planTab === 'build' ? '#fff' : subColor, border: 'none', borderRadius: '5px', cursor: 'pointer' }}>{tr('ground.buildRoute')}</button>
                      </div>

                      {planTab === 'select' && (<>
                        <div style={{ marginBottom: '6px' }}>
                          <label style={{ fontSize: '11px', color: subColor, display: 'block', marginBottom: '3px' }}>{tr('ground.selectRoute2')}</label>
                          <select value={selectedRouteId} onChange={e => setSelectedRouteId(e.target.value)}
                            style={{ width: '100%', padding: '6px', background: lightMode ? '#f8fafc' : '#1e293b', border: `1px solid ${border}`, borderRadius: '6px', color: textColor, fontSize: '12px' }}>
                            <option value="">{tr('ground.selectRoute')}</option>
                            {routes.map(r => <option key={r.id} value={r.id}>{r.name}{r.route_type === 'taxiway' ? ' [הסעה]' : r.route_type === 'runway' ? ' [טיסה]' : ''}</option>)}
                          </select>
                          {routes.length === 0 && <div style={{ fontSize: '10px', color: '#ef4444', marginTop: 3 }}>{tr('ground.defineRoutesFirstIn')}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => approve(req.id)} style={{ flex: 1, padding: '7px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>{tr('ground.confirmAndSendRoute')}</button>
                          <button onClick={() => reject(req.id)} style={{ padding: '7px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>❌</button>
                        </div>
                      </>)}

                      {planTab === 'build' && (() => {
                        const cross2d = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
                        const segIntersect = (p1: {x:number;y:number}, p2: {x:number;y:number}, p3: {x:number;y:number}, p4: {x:number;y:number}) => {
                          const d1x=p2.x-p1.x, d1y=p2.y-p1.y, d2x=p4.x-p3.x, d2y=p4.y-p3.y;
                          const denom=cross2d(d1x,d1y,d2x,d2y); if (Math.abs(denom)<1e-10) return false;
                          const t=cross2d(p3.x-p1.x,p3.y-p1.y,d2x,d2y)/denom, u=cross2d(p3.x-p1.x,p3.y-p1.y,d1x,d1y)/denom;
                          return t>=0&&t<=1&&u>=0&&u<=1;
                        };
                        const parsePts = (r: any): {x:number;y:number}[] => Array.isArray(r.route_path)?r.route_path:(typeof r.route_path==='string'?(()=>{try{return JSON.parse(r.route_path);}catch{return[];}})():[]);
                        const ptToRouteDist = (px: number, py: number, r: any): number => {
                          const pts=parsePts(r); if (!pts.length) return Infinity; let minD=Infinity;
                          for (let i=0;i<pts.length-1;i++){const ax=pts[i].x,ay=pts[i].y,bx=pts[i+1].x,by=pts[i+1].y,dx=bx-ax,dy=by-ay,lenSq=dx*dx+dy*dy;if(lenSq===0){minD=Math.min(minD,Math.hypot(px-ax,py-ay));continue;}const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lenSq));minD=Math.min(minD,Math.hypot(px-ax-t*dx,py-ay-t*dy));}
                          if (pts.length===1) minD=Math.hypot(px-pts[0].x,py-pts[0].y); return minD;
                        };
                        const routesIntersect = (r1: any, r2: any) => {
                          const p1=parsePts(r1),p2=parsePts(r2); if(p1.length<2||p2.length<2) return false;
                          for (let i=0;i<p1.length-1;i++) for(let j=0;j<p2.length-1;j++) if(segIntersect(p1[i],p1[i+1],p2[j],p2[j+1])) return true;
                          const NEAR_V=4,eps1=[p1[0],p1[p1.length-1]],eps2=[p2[0],p2[p2.length-1]];
                          for(const ep of eps1) for(const v of p2) if(Math.hypot(ep.x-v.x,ep.y-v.y)<NEAR_V) return true;
                          for(const ep of eps2) for(const v of p1) if(Math.hypot(ep.x-v.x,ep.y-v.y)<NEAR_V) return true;
                          return false;
                        };
                        const findAllPaths = (fPt: any, tPt: any): number[][] => {
                          const NEAR=6,MAX_LEN=8;
                          const startIds=planAfRoutes.filter(r=>ptToRouteDist(fPt.x_pct,fPt.y_pct,r)<NEAR).sort((a,b)=>ptToRouteDist(fPt.x_pct,fPt.y_pct,a)-ptToRouteDist(fPt.x_pct,fPt.y_pct,b)).map(r=>r.id as number);
                          const endIds=new Set<number>(planAfRoutes.filter(r=>ptToRouteDist(tPt.x_pct,tPt.y_pct,r)<NEAR).map(r=>r.id as number));
                          if(!startIds.length||!endIds.size) return [];
                          const results: number[][]=[];
                          const dfs=(path: number[])=>{const lid=path[path.length-1];if(endIds.has(lid)){results.push([...path]);return;}if(path.length>=MAX_LEN)return;const lr=planAfRoutes.find(r=>r.id===lid);if(!lr)return;for(const r of planAfRoutes){if(path.includes(r.id))continue;if(routesIntersect(lr,r))dfs([...path,r.id]);}};
                          for(const sid of startIds) dfs([sid]);
                          results.sort((a,b)=>a.length-b.length);
                          const seen=new Set<string>(); return results.filter(p=>{const k=p.join(',');if(seen.has(k))return false;seen.add(k);return true;});
                        };
                        const unusableRouteSet=new Set<number>(), unusableRouteToElem: Record<number,string>={};
                        const blockedRouteSet=new Set<number>(), blockedRouteToElem: Record<number,string>={};
                        const NAV_DS: Record<string,string>={close:'סגור',open:'פתוח',blocked:'חסום',partial:'חלקי'};
                        (planAfElements||[]).forEach((ae: any)=>{
                          const rels: number[]=Array.isArray(ae.relevant_routes)?ae.relevant_routes:[];if(!rels.length)return;
                          if(ae.status==='לא שמיש'){rels.forEach(rid=>{unusableRouteSet.add(rid);unusableRouteToElem[rid]=ae.name;});return;}
                          const bsts: string[]=Array.isArray(ae.blocking_statuses)?ae.blocking_statuses:[];if(!bsts.length)return;
                          const eff=NAV_DS[ae.display_state||'']||ae.status||'';
                          if(!bsts.includes(eff)&&!bsts.includes(ae.status||''))return;
                          rels.forEach(rid=>{blockedRouteSet.add(rid);blockedRouteToElem[rid]=ae.name;});
                        });
                        const fromPtNav=planFromId?afPoints.find(p=>String(p.id)===planFromId):null;
                        const toPtNav=planToId?afPoints.find(p=>String(p.id)===planToId):null;
                        const allPaths=(fromPtNav&&toPtNav)?findAllPaths(fromPtNav,toPtNav):[];
                        const clearPaths=allPaths.filter(path=>!path.some(id=>blockedRouteSet.has(id))&&!path.some(id=>unusableRouteSet.has(id)));
                        const unusablePaths=allPaths.filter(path=>!path.some(id=>blockedRouteSet.has(id))&&path.some(id=>unusableRouteSet.has(id)));
                        const blockedPaths=allPaths.filter(path=>path.some(id=>blockedRouteSet.has(id)));
                        const unusableByElem: Record<string,{path:number[];unusableIds:number[]}[]>={};
                        for(const path of unusablePaths){const uIds=path.filter(id=>unusableRouteSet.has(id));const key=[...new Set(uIds.map(id=>unusableRouteToElem[id]||`#${id}`))].join(', ');if(!unusableByElem[key])unusableByElem[key]=[];unusableByElem[key].push({path,unusableIds:uIds});}
                        const blockedByElem: Record<string,{path:number[];blockedIds:number[]}[]>={};
                        for(const path of blockedPaths){const bIds=path.filter(id=>blockedRouteSet.has(id));const key=[...new Set(bIds.map(id=>blockedRouteToElem[id]||`#${id}`))].join(', ');if(!blockedByElem[key])blockedByElem[key]=[];blockedByElem[key].push({path,blockedIds:bIds});}
                        const gapAfterIdx=planViaRouteIds.map((rid,i)=>{if(i>=planViaRouteIds.length-1)return false;const r1=planAfRoutes.find(x=>x.id===rid),r2=planAfRoutes.find(x=>x.id===planViaRouteIds[i+1]);if(!r1||!r2)return true;return!routesIntersect(r1,r2);});
                        const hasAnyGap=gapAfterIdx.some(Boolean);
                        const catLabel: Record<string,string>={general:'כללי',aircraft:'מטוסים',vehicle:'כלי רכב'};
                        const routesByCategory=(['aircraft','vehicle','general'] as const).reduce<Record<string,any[]>>((acc,cat)=>{acc[cat]=planAfRoutes.filter(r=>(r.route_category||'general')===cat);return acc;},{} as Record<string,any[]>);
                        const lastViaId=planViaRouteIds.length>0?planViaRouteIds[planViaRouteIds.length-1]:null;
                        const lastViaRoute=lastViaId!=null?planAfRoutes.find(x=>x.id===lastViaId):null;
                        const canApprove=planViaRouteIds.length>0||(planResult?.waypoints?.length>0);
                        return (<>
                          {/* Airfield selector */}
                          <div style={{ marginBottom: '5px' }}>
                            <label style={{ fontSize: '10px', color: subColor, display: 'block', marginBottom: '2px' }}>{tr('shared.airfield')}</label>
                            <select value={planAirfieldId} onChange={e => { setPlanAirfieldId(e.target.value); setPlanFromId(''); setPlanToId(''); setPlanResult(null); setPlanViaRouteIds([]); }}
                              style={{ width: '100%', padding: '5px', background: lightMode ? '#f8fafc' : '#1e293b', border: `1px solid ${border}`, borderRadius: '5px', color: textColor, fontSize: '11px' }}>
                              <option value="">{tr('ground.selectAirfield')}</option>
                              {planAirfields.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          {/* Permission level */}
                          <div style={{ marginBottom: '5px' }}>
                            <label style={{ fontSize: '10px', color: subColor, display: 'block', marginBottom: '3px' }}>{tr('ground.drivingPermitCanBe')}</label>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {(['vehicle','taxiways','runways'] as const).map(p => {
                                const on=planPermissions.includes(p);
                                const bg=on?(p==='runways'?'#7c3aed':p==='taxiways'?'#1d4ed8':'#15803d'):(lightMode?'#e2e8f0':'#1e293b');
                                return (<button key={p} onClick={()=>{setPlanPermissions(prev=>prev.includes(p)?prev.filter(x=>x!==p):[...prev,p]);setPlanResult(null);}}
                                  style={{flex:1,padding:'5px 2px',fontSize:'10px',fontWeight:on?'bold':'normal',background:bg,color:on?'#fff':subColor,border:on?'2px solid #fff4':`1px solid ${lightMode?'#cbd5e1':'#334155'}`,borderRadius:'5px',cursor:'pointer'}}>
                                  {p==='vehicle'?'🚗 כביש':p==='taxiways'?'✈️ הסעה':'🛬 טיסה'}
                                </button>);
                              })}
                            </div>
                          </div>
                          {/* From / To */}
                          {planAirfieldId && (<>
                            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: '#4ade80', display: 'block', marginBottom: '2px' }}>{tr('ground.fromOrigin')}</label>
                                <select value={planFromId} onChange={e=>{setPlanFromId(e.target.value);setPlanResult(null);setPlanViaRouteIds([]);}}
                                  style={{width:'100%',padding:'4px',background:lightMode?'#f8fafc':'#1e293b',border:`1px solid ${border}`,borderRadius:'4px',color:textColor,fontSize:'11px'}}>
                                  <option value="">{tr('ground.origin')}</option>
                                  {afPoints.map((p: any)=><option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', color: '#f87171', display: 'block', marginBottom: '2px' }}>{tr('ground.toDestination')}</label>
                                <select value={planToId} onChange={e=>{setPlanToId(e.target.value);setPlanResult(null);setPlanViaRouteIds([]);}}
                                  style={{width:'100%',padding:'4px',background:lightMode?'#f8fafc':'#1e293b',border:`1px solid ${border}`,borderRadius:'4px',color:textColor,fontSize:'11px'}}>
                                  <option value="">{tr('ground.destination')}</option>
                                  {afPoints.filter((p: any)=>String(p.id)!==planFromId).map((p: any)=><option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </div>
                            </div>

                            {/* ── Clear paths ── */}
                            {fromPtNav && toPtNav && clearPaths.length > 0 && (
                              <div style={{ marginBottom: '7px' }}>
                                <div style={{ fontSize: '10px', color: '#4ade80', fontWeight: 'bold', marginBottom: '3px' }}>{tr('ground.availableRoutesShortestTo')}</div>
                                <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {clearPaths.map((path, pidx) => {
                                    const isActive=path.join(',')===planViaRouteIds.join(',');
                                    return (
                                      <div key={pidx} style={{display:'flex',alignItems:'center',gap:'4px',background:isActive?'#052e16':'#020d05',border:`1px solid ${isActive?'#16a34a':'#166534'}`,borderRadius:'4px',padding:'3px 6px'}}>
                                        <span style={{fontSize:'10px',color:'#64748b',minWidth:'16px',fontWeight:'bold'}}>{pidx+1}</span>
                                        <span style={{fontSize:'11px',color:isActive?'#86efac':'#4ade80',flex:1,fontFamily:'monospace'}}>{path.map(id=>planAfRoutes.find(r=>r.id===id)?.name||`#${id}`).join(' → ')}</span>
                                        <button onClick={()=>setPlanViaRouteIds(path)} style={{padding:'2px 8px',background:isActive?'#16a34a':'#052e16',color:isActive?'white':'#4ade80',border:`1px solid ${isActive?'#16a34a':'#166534'}`,borderRadius:'4px',cursor:'pointer',fontSize:'10px',flexShrink:0,fontWeight:isActive?'bold':'normal'}}>
                                          {isActive?'✓':'החל'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* ── Unusable paths (yellow) ── */}
                            {fromPtNav && toPtNav && Object.keys(unusableByElem).length > 0 && (
                              <div style={{ marginBottom: '7px' }}>
                                <div style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 'bold', marginBottom: '3px' }}>{tr('ground.routesThroughAnUnserviceable')}</div>
                                {Object.entries(unusableByElem).map(([elemName, entries]) => {
                                  const isOpen=navUnusableGroupsOpen[elemName]??false;
                                  return (
                                    <div key={elemName} style={{background:'#1a0f00',border:'1px solid #78350f',borderRadius:'5px',overflow:'hidden',marginBottom:'3px'}}>
                                      <button onClick={()=>setNavUnusableGroupsOpen(prev=>({...prev,[elemName]:!isOpen}))} style={{width:'100%',display:'flex',alignItems:'center',gap:'5px',padding:'5px 8px',background:'none',border:'none',color:'#fde68a',cursor:'pointer',direction:'rtl',fontSize:'10px',fontWeight:'bold'}}>
                                        <span style={{marginLeft:'auto',color:'#64748b',fontSize:'10px'}}>{isOpen?'▲':'▼'} {entries.length}</span>
                                        <span style={{flex:1}}>⚠️ לא שמיש: {elemName}</span>
                                      </button>
                                      {isOpen && (
                                        <div style={{borderTop:'1px solid #78350f',padding:'3px 6px',display:'flex',flexDirection:'column',gap:'2px'}}>
                                          {entries.map(({path,unusableIds},ei)=>{
                                            const isActive=path.join(',')===planViaRouteIds.join(',');
                                            return (
                                              <div key={ei} style={{display:'flex',alignItems:'center',gap:'4px',background:isActive?'#1a2e00':'transparent',borderRadius:'3px',padding:'2px 3px'}}>
                                                <span style={{fontSize:'9px',color:'#64748b',minWidth:'14px'}}>{path.length}</span>
                                                <span style={{fontSize:'10px',color:'#fde68a',flex:1}}>
                                                  {path.map((id,ii)=>{const nm=planAfRoutes.find(r=>r.id===id)?.name||`#${id}`;return <React.Fragment key={`${id}_${ii}`}>{ii>0&&<span style={{color:'#475569'}}> → </span>}{unusableIds.includes(id)?<span style={{color:'#fbbf24',textDecoration:'underline'}}>{nm}</span>:<span>{nm}</span>}</React.Fragment>;})}
                                                </span>
                                                <button onClick={()=>setPlanViaRouteIds(path)} style={{padding:'2px 7px',background:isActive?'#3d5200':'#1a0f00',color:isActive?'#d9f99d':'#fde68a',border:`1px solid ${isActive?'#65a30d':'#78350f'}`,borderRadius:'4px',cursor:'pointer',fontSize:'10px',flexShrink:0}}>{isActive?'✓':'החל'}</button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* ── Blocked paths (red) ── */}
                            {fromPtNav && toPtNav && Object.keys(blockedByElem).length > 0 && (
                              <div style={{ marginBottom: '7px' }}>
                                <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 'bold', marginBottom: '3px' }}>{tr('ground.blockedRoutesByBlocking')}</div>
                                {Object.entries(blockedByElem).map(([elemName, entries]) => {
                                  const isOpen=navBlockedGroupsOpen[elemName]??false;
                                  return (
                                    <div key={elemName} style={{background:'#1a0505',border:'1px solid #7f1d1d',borderRadius:'5px',overflow:'hidden',marginBottom:'3px'}}>
                                      <button onClick={()=>setNavBlockedGroupsOpen(prev=>({...prev,[elemName]:!isOpen}))} style={{width:'100%',display:'flex',alignItems:'center',gap:'5px',padding:'5px 8px',background:'none',border:'none',color:'#fca5a5',cursor:'pointer',direction:'rtl',fontSize:'10px',fontWeight:'bold'}}>
                                        <span style={{marginLeft:'auto',color:'#64748b',fontSize:'10px'}}>{isOpen?'▲':'▼'} {entries.length}</span>
                                        <span style={{flex:1}}>🔒 {elemName}</span>
                                      </button>
                                      {isOpen && (
                                        <div style={{borderTop:'1px solid #7f1d1d',padding:'3px 6px',display:'flex',flexDirection:'column',gap:'2px'}}>
                                          {entries.map(({path,blockedIds},bi)=>{
                                            const isActive=path.join(',')===planViaRouteIds.join(',');
                                            return (
                                              <div key={bi} style={{display:'flex',alignItems:'center',gap:'4px',background:isActive?'#052e16':'transparent',borderRadius:'3px',padding:'2px 3px'}}>
                                                <span style={{fontSize:'9px',color:'#64748b',minWidth:'14px'}}>{path.length}</span>
                                                <span style={{fontSize:'10px',color:'#fca5a5',flex:1}}>
                                                  {path.map((id,ii)=>{const nm=planAfRoutes.find(r=>r.id===id)?.name||`#${id}`;return <React.Fragment key={`${id}_${ii}`}>{ii>0&&<span style={{color:'#475569'}}> → </span>}{blockedIds.includes(id)?<span style={{color:'#ef4444',textDecoration:'line-through'}}>{nm}</span>:<span>{nm}</span>}</React.Fragment>;})}
                                                </span>
                                                <button onClick={()=>setPlanViaRouteIds(path)} style={{padding:'2px 7px',background:isActive?'#16a34a':'#450a0a',color:isActive?'white':'#fca5a5',border:`1px solid ${isActive?'#16a34a':'#7f1d1d'}`,borderRadius:'4px',cursor:'pointer',fontSize:'10px',flexShrink:0}}>{isActive?'✓':'החל'}</button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {fromPtNav && toPtNav && allPaths.length===0 && planAfRoutes.length>0 && (
                              <div style={{fontSize:'10px',color:'#64748b',textAlign:'center',padding:'5px',background:lightMode?'#f1f5f9':'#1e293b',borderRadius:'4px',marginBottom:'7px'}}>{tr('ground.noConnectedPathsFound')}</div>
                            )}

                            {/* ── Via routes by category ── */}
                            {planAfRoutes.length > 0 && (
                              <div style={{ marginBottom: '7px' }}>
                                <div style={{ fontSize: '10px', color: '#7dd3fc', fontWeight: 'bold', marginBottom: '4px' }}>{tr('ground.routesClickToAdd')}</div>
                                {(['aircraft','vehicle','general'] as const).filter(cat=>(routesByCategory[cat]||[]).length>0).map(cat=>(
                                  <div key={cat} style={{ marginBottom: '4px' }}>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>{catLabel[cat]}</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                      {(routesByCategory[cat]||[]).map((r: any)=>{
                                        const isInSeq=planViaRouteIds.includes(r.id);
                                        const isLast=lastViaId===r.id;
                                        const isDiscon=!isLast&&lastViaRoute!=null&&!routesIntersect(lastViaRoute,r);
                                        const cnt=planViaRouteIds.filter(id=>id===r.id).length;
                                        return (
                                          <button key={r.id} onClick={()=>{if(isInSeq){setPlanViaRouteIds(prev=>{const i2=prev.lastIndexOf(r.id);return prev.filter((_,ii)=>ii!==i2);});}else{setPlanViaRouteIds(prev=>[...prev,r.id]);}}}
                                            style={{display:'flex',alignItems:'center',gap:'3px',padding:'3px 7px',background:isInSeq?(r.color||'#3b82f6')+'33':(lightMode?'#f1f5f9':'#1e293b'),border:`1px solid ${isInSeq?(r.color||'#3b82f6'):(lightMode?'#cbd5e1':'#334155')}`,borderRadius:'10px',cursor:'pointer',color:isInSeq?(r.color||'#3b82f6'):textColor,fontSize:'10px'}}>
                                            <span style={{width:'6px',height:'6px',borderRadius:'50%',background:r.color||'#3b82f6',display:'inline-block',flexShrink:0}}/>
                                            {r.name}
                                            {cnt>0&&<span style={{background:r.color||'#3b82f6',color:'white',borderRadius:'50%',minWidth:'14px',height:'14px',fontSize:'8px',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 2px',fontWeight:'bold'}}>{cnt}</span>}
                                            {isDiscon&&!isInSeq&&<span title={tr('ground.gapDoesNotIntersect')} style={{fontSize:'9px'}}>⚠️</span>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* ── Selected sequence ── */}
                            {planViaRouteIds.length > 0 && (
                              <div style={{ background: '#0c1a2e', border: `1px solid ${hasAnyGap?'#991b1b':'#1e3a5f'}`, borderRadius: '6px', padding: '6px 10px', marginBottom: '7px' }}>
                                <div style={{ color: '#7dd3fc', marginBottom: '4px', fontWeight: 'bold', fontSize: '10px' }}>{tr('ground.selectedSequence')}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
                                  {planViaRouteIds.map((rid,i)=>{
                                    const r=planAfRoutes.find(x=>x.id===rid);
                                    return (<React.Fragment key={i}>
                                      <span style={{padding:'2px 6px',background:(r?.color||'#60a5fa')+'22',border:`1px solid ${r?.color||'#60a5fa'}`,borderRadius:'4px',color:r?.color||'#60a5fa',fontSize:'10px',whiteSpace:'nowrap'}}>{i+1}. {r?.name||`#${rid}`}</span>
                                      {i<planViaRouteIds.length-1&&(gapAfterIdx[i]?<span style={{color:'#ef4444',fontSize:'10px'}}>⚠️→</span>:<span style={{color:'#22c55e',fontSize:'10px'}}>→</span>)}
                                    </React.Fragment>);
                                  })}
                                </div>
                                {hasAnyGap&&<div style={{color:'#ef4444',fontSize:'10px',marginTop:'4px',fontWeight:'bold'}}>{tr('ground.thereAreGapsIn')}</div>}
                              </div>
                            )}
                          </>)}

                          {/* ── Show on map toggle ── */}
                          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px',padding:'5px 8px',background:planShowOnMap?'#0c1a2e':(lightMode?'#f8fafc':'#0f172a'),borderRadius:'6px',border:`1px solid ${planShowOnMap?'#3b82f6':border}`,cursor:'pointer'}} onClick={()=>setPlanShowOnMap(v=>!v)}>
                            <span style={{fontSize:'13px'}}>🗺</span>
                            <span style={{fontSize:'11px',color:planShowOnMap?'#7dd3fc':subColor,flex:1}}>{tr('ground.showOnMap')}</span>
                            <span style={{width:'32px',height:'16px',borderRadius:'8px',background:planShowOnMap?'#3b82f6':'#334155',display:'inline-flex',alignItems:'center',paddingLeft:planShowOnMap?'16px':'2px',boxSizing:'border-box',transition:'all 0.2s',flexShrink:0}}>
                              <span style={{width:'12px',height:'12px',borderRadius:'50%',background:'white',display:'block'}}/>
                            </span>
                          </div>

                          {/* ── GPS route ── */}
                          {planAirfieldId && planFromId && planToId && (
                            <button onClick={buildPlan} disabled={planLoading} style={{width:'100%',padding:'6px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'6px',fontSize:'11px',fontWeight:'bold',cursor:planLoading?'wait':'pointer',marginBottom:'6px',opacity:planLoading?0.7:1}}>
                              {planLoading?'⏳ מחשב…':'⚡ חשב מסלול GPS'}
                            </button>
                          )}
                          {planResult && !planResult.error && planResult.waypoints?.length > 0 && (
                            <div style={{background:'#052e16',border:'1px solid #16a34a',borderRadius:'6px',padding:'6px 8px',marginBottom:'5px'}}>
                              <div style={{color:'#4ade80',fontSize:'11px',fontWeight:'bold',marginBottom:'2px'}}>✅ מסלול GPS — {planResult.totalDistM?`${planResult.totalDistM}מ'`:''}</div>
                              {planResult.segmentPath&&<div style={{fontSize:'10px',color:'#86efac',fontFamily:'monospace',direction:'ltr',textAlign:'left'}}>{planResult.segmentPath}</div>}
                              {planResult.routeSegments?.length>0&&<div style={{fontSize:'10px',color:'#86efac'}}>מקטעים: {planResult.routeSegments.map((s: any)=>`${s.name}${s.type!=='vehicle'?' ['+(s.type==='taxiway'?'הסעה':'טיסה')+']':''}`).join(' → ')}</div>}
                              {planResult.excludedRouteTypes?.length>0&&<div style={{fontSize:'9px',color:'#fca5a5',marginTop:'3px'}}>🚫 לא בשימוש: {planResult.excludedRouteTypes.map((e: any)=>e.label).join(', ')}</div>}
                            </div>
                          )}
                          {planResult?.crossings?.length>0&&(
                            <div style={{background:'#431407',border:'1px solid #ea580c',borderRadius:'6px',padding:'6px 8px',marginBottom:'5px'}}>
                              <div style={{color:'#fb923c',fontSize:'11px',fontWeight:'bold',marginBottom:'2px'}}>⚠️ חצייות ({planResult.crossings.length})</div>
                              {planResult.crossings.slice(0,3).map((c: any,i: number)=><div key={i} style={{fontSize:'10px',color:'#fed7aa',marginBottom:'1px'}}>{c.crossingType==='runway'?'🛬':'✈️'} {c.crossingName||'חצייה'}</div>)}
                            </div>
                          )}
                          {planResult?.elementsToOperate?.length>0&&(
                            <div style={{background:'#1e1b4b',border:'1px solid #7c3aed',borderRadius:'6px',padding:'6px 8px',marginBottom:'5px'}}>
                              <div style={{color:'#c4b5fd',fontSize:'11px',fontWeight:'bold',marginBottom:'2px'}}>🚦 אלמנטים לתפעול ({planResult.elementsToOperate.length})</div>
                              {planResult.elementsToOperate.map((elm: any,i: number)=><div key={i} style={{fontSize:'10px',color:'#ddd6fe',marginBottom:'1px',display:'flex',justifyContent:'space-between'}}><span>{elm.icon||'🚧'} {elm.name}</span><span style={{color:'#818cf8'}}>{elm.distance}מ'</span></div>)}
                            </div>
                          )}
                          {planResult?.error&&<div style={{color:'#ef4444',fontSize:'11px',background:'#450a0a',padding:'6px',borderRadius:'5px',marginBottom:'5px'}}>⚠️ {planResult.error}</div>}
                          {planResult&&!planResult.error&&planResult.waypoints?.length===0&&<div style={{color:'#f59e0b',fontSize:'11px',background:'#422006',padding:'6px',borderRadius:'5px',marginBottom:'5px'}}>{tr('ground.noGpsRouteFound')}</div>}

                          {/* ── Approve / reject ── */}
                          {canApprove ? (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                              <button onClick={() => approveWithPlan(req.id)} style={{flex:1,padding:'7px',background:'#22c55e',color:'#fff',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'bold',cursor:'pointer'}}>{tr('ground.confirmWithThisNavigation')}</button>
                              <button onClick={() => reject(req.id)} style={{padding:'7px 10px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>❌</button>
                            </div>
                          ) : (
                            <div style={{ marginTop: '4px' }}>
                              {!planAirfieldId&&<div style={{color:'#64748b',fontSize:'11px',textAlign:'center',padding:'6px 0'}}>{tr('ground.selectAnAirfieldTo')}</div>}
                              {planAirfieldId&&(!planFromId||!planToId)&&<div style={{color:'#64748b',fontSize:'11px',textAlign:'center',padding:'4px 0'}}>{tr('ground.selectAnOriginAnd')}</div>}
                              <button onClick={() => reject(req.id)} style={{width:'100%',padding:'6px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'6px',fontSize:'11px',cursor:'pointer',marginTop:'6px'}}>{tr('ground.rejectRequest')}</button>
                            </div>
                          )}
                          {planViaRouteIds.length > 0 && (
                            <button onClick={() => setPlanViaRouteIds([])} style={{width:'100%',padding:'4px',background:lightMode?'#f1f5f9':'#1e293b',color:'#94a3b8',border:`1px solid ${border}`,borderRadius:'4px',cursor:'pointer',fontSize:'10px',marginTop:'4px'}}>{tr('ground.clearNavigation')}</button>
                          )}
                        </>);
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Active / In transit */}
          {active.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', color: '#4ade80', fontWeight: 'bold', marginBottom: '6px' }}>{tr('ground.enRoute')}</div>
              {active.map(req => {
                const gps = gpsLatest[req.id];
                const tsAge = gps ? Math.round((Date.now() - new Date(gps.timestamp).getTime()) / 1000) : null;
                const panel = activePanel[req.id] || null;
                return (
                  <div key={req.id} style={{ background: lightMode ? '#f0fdf4' : '#0a2218', border: `1px solid ${panel ? '#f59e0b' : lightMode ? '#86efac' : '#166534'}`, borderRadius: '8px', padding: '8px 10px', marginBottom: '6px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', color: textColor, fontSize: '13px' }}>{req.driver_name}</span>
                      <button onClick={() => openMapForReq(req)} style={{ padding: '3px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>{tr('ground.map')}</button>
                    </div>
                    <div style={{ fontSize: '11px', color: subColor, marginTop: 2 }}>{req.destination} • {req.route_name || 'מסלול'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '10px', color: gps ? '#4ade80' : '#94a3b8' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: gps && tsAge !== null && tsAge < 30 ? '#4ade80' : '#ef4444', display: 'inline-block', flexShrink: 0 }}></span>
                      GPS: {gps ? (tsAge !== null && tsAge < 30 ? 'פעיל' : `לפני ${tsAge}ש'`) : 'אין'}
                    </div>
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '4px', marginTop: '7px' }}>
                      <button onClick={() => setActivePanel(p => ({ ...p, [req.id]: p[req.id] === 'edit' ? null : 'edit' }))}
                        style={{ flex: 1, padding: '4px 0', background: panel === 'edit' ? '#1e3a5f' : '#0f172a', color: panel === 'edit' ? '#7dd3fc' : '#94a3b8', border: `1px solid ${panel === 'edit' ? '#3b82f6' : '#334155'}`, borderRadius: '5px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>{tr('ground.updateRoute')}</button>
                      <button onClick={() => setActivePanel(p => ({ ...p, [req.id]: p[req.id] === 'msg' ? null : 'msg' }))}
                        style={{ flex: 1, padding: '4px 0', background: panel === 'msg' ? '#1c1107' : '#0f172a', color: panel === 'msg' ? '#fcd34d' : '#94a3b8', border: `1px solid ${panel === 'msg' ? '#f59e0b' : '#334155'}`, borderRadius: '5px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>{tr('ground.message')}</button>
                      <button onClick={() => cancelActive(req.id)} style={{ padding: '4px 8px', background: '#3f0a0a', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: '5px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>{tr('ground.cancel')}</button>
                    </div>
                    {/* Edit route inline panel */}
                    {panel === 'edit' && (() => {
                      const aTab = activePlanTab[req.id] || 'select';
                      return (
                        <div style={{ marginTop: '8px', padding: '8px', background: '#0f172a', borderRadius: '6px', border: '1px solid #1e3a5f' }}>
                          {/* Tab switcher */}
                          <div style={{ display: 'flex', gap: '3px', marginBottom: '7px' }}>
                            <button onClick={() => setActivePlanTab(p => ({ ...p, [req.id]: 'select' }))}
                              style={{ flex: 1, padding: '3px', fontSize: '10px', fontWeight: aTab === 'select' ? 'bold' : 'normal', background: aTab === 'select' ? '#1d4ed8' : '#1e293b', color: aTab === 'select' ? '#fff' : '#64748b', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{tr('ground.selectRoute3')}</button>
                            <button onClick={() => { setActivePlanTab(p => ({ ...p, [req.id]: 'build' })); setPlanResult(null); }}
                              style={{ flex: 1, padding: '3px', fontSize: '10px', fontWeight: aTab === 'build' ? 'bold' : 'normal', background: aTab === 'build' ? '#7c3aed' : '#1e293b', color: aTab === 'build' ? '#fff' : '#64748b', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{tr('ground.buildRoute')}</button>
                          </div>

                          {aTab === 'select' && (<>
                            <select value={editRouteId[req.id] !== undefined ? editRouteId[req.id] : String(req.assigned_route_id || '')}
                              onChange={e => setEditRouteId(p => ({ ...p, [req.id]: e.target.value }))}
                              style={{ width: '100%', padding: '5px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px', direction: 'rtl', marginBottom: '6px', boxSizing: 'border-box' }}>
                              <option value="">{tr('ground.selectRoute')}</option>
                              {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name}{r.route_type === 'taxiway' ? ' [הסעה]' : r.route_type === 'runway' ? ' [טיסה]' : ''}</option>)}
                            </select>
                            <input value={editNotes[req.id] !== undefined ? editNotes[req.id] : (req.notes || '')}
                              onChange={e => setEditNotes(p => ({ ...p, [req.id]: e.target.value }))}
                              placeholder={tr('ground.noteToTheDriver')}
                              style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '6px' }} />
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => updateActiveRoute(req)} style={{ flex: 1, padding: '5px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>{tr('shared.save2')}</button>
                              <button onClick={() => setActivePanel(p => ({ ...p, [req.id]: null }))} style={{ padding: '5px 10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>{tr('shared.cancel')}</button>
                            </div>
                          </>)}

                          {aTab === 'build' && (<>
                            {/* Airfield */}
                            <div style={{ marginBottom: '5px' }}>
                              <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>{tr('shared.airfield')}</label>
                              <select value={planAirfieldId} onChange={e => { setPlanAirfieldId(e.target.value); setPlanFromId(''); setPlanToId(''); setPlanResult(null); }}
                                style={{ width: '100%', padding: '5px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px' }}>
                                <option value="">{tr('ground.selectAirfield')}</option>
                                {planAirfields.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                            </div>
                            {/* Permission — multi-select */}
                            <div style={{ marginBottom: '5px' }}>
                              <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '3px' }}>{tr('ground.drivingPermitCanBe')}</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {(['vehicle','taxiways','runways'] as const).map(p => {
                                  const on = planPermissions.includes(p);
                                  const bg = on ? (p === 'runways' ? '#7c3aed' : p === 'taxiways' ? '#1d4ed8' : '#15803d') : '#1e293b';
                                  return (
                                    <button key={p} onClick={() => { setPlanPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]); setPlanResult(null); }}
                                      style={{ flex: 1, padding: '5px 2px', fontSize: '10px', fontWeight: on ? 'bold' : 'normal', background: bg, color: on ? '#fff' : '#64748b', border: on ? '2px solid #fff4' : '1px solid #334155', borderRadius: '5px', cursor: 'pointer' }}>
                                      {p === 'vehicle' ? '🚗 כביש' : p === 'taxiways' ? '✈️ הסעה' : '🛬 טיסה'}
                                    </button>
                                  );
                                })}
                              </div>
                              <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>
                                {planPermissions.length === 0 ? 'בחר לפחות סוג אחד' :
                                 planPermissions.join('+') === 'vehicle' ? 'כבישי רכב בלבד' :
                                 planPermissions.includes('runways') ? 'כבישים + הסעה + מסלולי טיסה' :
                                 planPermissions.includes('taxiways') ? 'כבישים + מסלולי הסעה' : planPermissions.join(', ')}
                              </div>
                            </div>
                            {/* From / To */}
                            {planAirfieldId && (
                              <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>{tr('ground.from2')}</label>
                                  <select value={planFromId} onChange={e => { setPlanFromId(e.target.value); setPlanResult(null); }}
                                    style={{ width: '100%', padding: '5px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px' }}>
                                    <option value="">{tr('ground.originPoint')}</option>
                                    {afPoints.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>{tr('ground.to')}</label>
                                  <select value={planToId} onChange={e => { setPlanToId(e.target.value); setPlanResult(null); }}
                                    style={{ width: '100%', padding: '5px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px' }}>
                                    <option value="">{tr('ground.destination')}</option>
                                    {afPoints.filter((p: any) => String(p.id) !== planFromId).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                </div>
                              </div>
                            )}
                            <button onClick={buildPlan} disabled={planLoading || !planAirfieldId || !planFromId || !planToId}
                              style={{ width: '100%', padding: '6px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: planLoading ? 'wait' : 'pointer', marginBottom: '5px', opacity: (!planAirfieldId || !planFromId || !planToId) ? 0.5 : 1 }}>
                              {planLoading ? '⏳ מחשב…' : '⚡ חשב מסלול מהיר'}
                            </button>
                            {/* Results */}
                            {planResult && !planResult.error && planResult.waypoints?.length > 0 && (<>
                              <div style={{ background: '#052e16', border: '1px solid #16a34a', borderRadius: '5px', padding: '5px 7px', marginBottom: '4px', fontSize: '10px', color: '#4ade80' }}>
                                ✅ {planResult.totalDistM ? `${planResult.totalDistM}מ'` : 'נמצא מסלול'}
                                {planResult.segmentPath && <div style={{ color: '#86efac', fontFamily: 'monospace', marginTop: '2px', direction: 'ltr', textAlign: 'left' }}>{planResult.segmentPath}</div>}
                                {planResult.routeSegments?.length > 0 && <div style={{ color: '#86efac', marginTop: '2px' }}>{planResult.routeSegments.map((s: any) => s.name).join(' → ')}</div>}
                                {planResult.excludedRouteTypes?.length > 0 && <div style={{ color: '#fca5a5', marginTop: '2px', fontSize: '9px' }}>🚫 לא מורשה: {planResult.excludedRouteTypes.map((e: any) => e.label).join(', ')}</div>}
                              </div>
                              {planResult.crossings?.length > 0 && (
                                <div style={{ background: '#431407', border: '1px solid #ea580c', borderRadius: '5px', padding: '4px 6px', marginBottom: '4px', fontSize: '10px' }}>
                                  <span style={{ color: '#fb923c', fontWeight: 'bold' }}>⚠️ {planResult.crossings.length} חצייה</span>
                                  {planResult.crossings.slice(0, 2).map((c: any, i: number) => (
                                    <div key={i} style={{ color: '#fed7aa' }}>{c.crossingType === 'runway' ? '🛬' : '✈️'} {c.crossingName || c.routeName}</div>
                                  ))}
                                </div>
                              )}
                              {planResult.elementsToOperate?.length > 0 && (
                                <div style={{ background: '#1e1b4b', border: '1px solid #7c3aed', borderRadius: '5px', padding: '4px 6px', marginBottom: '4px', fontSize: '10px' }}>
                                  <span style={{ color: '#c4b5fd', fontWeight: 'bold' }}>🚦 {planResult.elementsToOperate.length} אלמנטים לתפעול</span>
                                  {planResult.elementsToOperate.slice(0, 3).map((el: any, i: number) => (
                                    <div key={i} style={{ color: '#ddd6fe' }}>{el.icon || '🚧'} {el.name} — {el.distance}מ'</div>
                                  ))}
                                </div>
                              )}
                              <input value={editNotes[req.id] !== undefined ? editNotes[req.id] : (req.notes || '')}
                                onChange={e => setEditNotes(p => ({ ...p, [req.id]: e.target.value }))}
                                placeholder={tr('ground.noteToTheDriver')}
                                style={{ width: '100%', padding: '4px 7px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '10px', direction: 'rtl', boxSizing: 'border-box', marginBottom: '4px' }} />
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => updateWithPlan(req)} style={{ flex: 1, padding: '5px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>{tr('ground.updateWithThisRoute')}</button>
                                <button onClick={() => setActivePanel(p => ({ ...p, [req.id]: null }))} style={{ padding: '5px 8px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>{tr('shared.cancel')}</button>
                              </div>
                            </>)}
                            {planResult?.error && <div style={{ color: '#ef4444', fontSize: '10px', padding: '5px', background: '#450a0a', borderRadius: '4px' }}>⚠️ {planResult.error}</div>}
                            {planResult && !planResult.error && !planResult.waypoints?.length && <div style={{ color: '#f59e0b', fontSize: '10px', padding: '5px', background: '#422006', borderRadius: '4px' }}>{tr('ground.noRouteFoundTry')}</div>}
                            {!planResult && <button onClick={() => setActivePanel(p => ({ ...p, [req.id]: null }))} style={{ width: '100%', padding: '4px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', marginTop: '4px' }}>{tr('shared.cancel')}</button>}
                          </>)}
                        </div>
                      );
                    })()}
                    {/* Message inline panel */}
                    {panel === 'msg' && (
                      <div style={{ marginTop: '8px', padding: '8px', background: '#0f172a', borderRadius: '6px', border: '1px solid #92400e' }}>
                        <div style={{ fontSize: '10px', color: '#fcd34d', fontWeight: 'bold', marginBottom: '6px' }}>{tr('ground.popUpMessageTo')}</div>
                        <textarea value={msgText[req.id] || ''} onChange={e => setMsgText(p => ({ ...p, [req.id]: e.target.value }))}
                          placeholder={tr('ground.writeAMessageTo')} rows={2}
                          style={{ width: '100%', padding: '6px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px', direction: 'rtl', resize: 'none', boxSizing: 'border-box', marginBottom: '6px' }} />
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => sendMsg(req.id)} disabled={msgSending[req.id] || !(msgText[req.id] || '').trim()}
                            style={{ flex: 1, padding: '5px', background: msgSending[req.id] ? '#374151' : '#b45309', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', opacity: !(msgText[req.id] || '').trim() ? 0.5 : 1 }}>
                            {msgSending[req.id] ? '⏳ שולח...' : '📤 שלח הודעה'}
                          </button>
                          <button onClick={() => setActivePanel(p => ({ ...p, [req.id]: null }))} style={{ padding: '5px 10px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>{tr('shared.cancel')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent */}
          {recent.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: subColor, fontWeight: 'bold', marginBottom: '4px' }}>{tr('ground.recent')}</div>
              {recent.map(req => (
                <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: lightMode ? '#f8fafc' : '#0f172a', borderRadius: '6px', marginBottom: '3px', fontSize: '11px' }}>
                  <span style={{ color: textColor }}>{req.driver_name} → {req.destination}</span>
                  <span style={{ color: badgeColor[req.status] || subColor }}>{badgeLabel[req.status] || req.status}</span>
                </div>
              ))}
            </div>
          )}

          {pending.length === 0 && active.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: subColor, fontSize: '12px' }}>{tr('ground.noActiveRequests')}</div>
          )}
        </div>
      )}
    </div>
  );
}

// --- תצוגת מגרש (GROUND) ---
// Ground shared constants/icons/helpers imported from ./components/ground/groundShared
// Ground runtime types imported from ./types/ground

// GroundView imported from ./components/views/GroundView
// SGCell, SGSplit, SGNode, SGCondition, CLASSIC_STRIP_FIELDS imported from ./types/stripGrid
// SG runtime helpers (ensureSGBlinkStyle, sgGenId, sgDefaultCell, sgUpdate, sgSplit, sgRemove, sgGetAllCells) imported from ./utils/stripGrid

// --- תצוגת סטריפים קלאסית ---
// Classic/Civilian views imported from ./components/classic/ClassicViews
// VerticalView imported from ./components/views/VerticalView
// --- פלטת צבעים ובחירה אוטומטית לבלוקים ---
// BLOCK_PALETTE, hexToHue, pickDistinctBlockColor, BlockVisualPainter imported from ./components/blocks/BlockVisualPainter
// SettingsModal, MaybeSettingsModal, BlockSpaceCellTable imported from ./components/shared/Modals
// TransferFormModal, DonutChart, AdminDashboard imported from ./components/dashboard/AdminDashboard

export default GroundVehiclePanel;
