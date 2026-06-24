import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { API_URL } from '../../config';
import { sc } from '../../utils/scale';
import { customConfirm } from '../shared/ConfirmModal';
import { VKTrigger } from '../../VirtualKeyboard';
import type { QGroup } from '../../types';
import { emptyQGroup, hasConditions } from '../../utils/queryBuilder';
import { normalizeAlt } from '../../utils/strips';
import type { SGCell, SGSplit, SGCondition, SGNode } from '../../types/stripGrid';
import { CLASSIC_STRIP_FIELDS } from '../../types/stripGrid';
import { sgGenId, sgDefaultCell, sgUpdate, sgSplit, sgRemove, sgGetAllCells } from '../../utils/stripGrid';
import { ClassicStripCard, CivilianStripCard } from '../classic/ClassicViews';
import type { CivCol, CivAssignment } from '../classic/ClassicViews';
import { QBuilderCtx, QGroupEditor, QueryBuilder } from '../query/QueryBuilder';
import * as XLSX from 'xlsx';
import { STRIP_FIELD_DEFS, CUSTOM_FIELD_EDITABLE_OPTIONS, EDITABLE_LABELS, STICKY_COLORS } from '../../types/stripFields';
import { CIV_STATUSES } from '../classic/ClassicViews';
import { SW_TEXTURES, swGetBgStyle, swGenId, swDefaultLeaf, swRemapIds, SW_TEMPLATES, swUpdate, swSplit, swRemove, swFindLeaf } from '../../utils/stripWindow';
import type { SWLeaf, SWSplit, SWNode } from '../../utils/stripWindow';
import { geoToImagePct, imagePctToGeo, buildGeoAnchor as getAnchorFromMapData } from '../../utils/geo';

export const StickyNotesLayer = ({ presetId, presetName, crewName, notes, setNotes }: {
  presetId: number; presetName: string; crewName: string;
  notes: any[]; setNotes: React.Dispatch<React.SetStateAction<any[]>>;
}) => {
  const [showDistribute, setShowDistribute] = useState<number | null>(null);
  const [peers, setPeers] = useState<any[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<number>>(new Set());
  const [showColorPicker, setShowColorPicker] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragRef = useRef<{ noteId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const canEdit = (note: any) => note.allow_all_edit || note.creator_preset_id === presetId;

  const updateNote = async (id: number, changes: any, saveToServer = true) => {
    const currentNote = notes.find(n => n.id === id);
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...changes } : n));
    if (saveToServer) {
      await fetch(`${API_URL}/sticky-notes/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...changes, preset_id: presetId, preset_name: presetName, crew_name: crewName }),
      });
      if ('content' in changes || 'title' in changes) {
        const logDetails: Record<string, any> = { noteId: id };
        if ('content' in changes) {
          logDetails.oldContent = currentNote?.content ?? '';
          logDetails.newContent = changes.content ?? '';
        }
        if ('title' in changes) {
          logDetails.oldTitle = currentNote?.title ?? '';
          logDetails.newTitle = changes.title ?? '';
        }
        fetch(`${API_URL}/activity-log`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: 'note_edited', severity: 'normal', workstation_preset_id: presetId, workstation_name: presetName, crew_member_name: crewName, details: logDetails }),
        }).catch(() => {});
      }
    }
  };

  const deleteNote = async (id: number) => {
    await fetch(`${API_URL}/sticky-notes/${id}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== id));
    setConfirmDelete(null);
  };

  const openDistribute = async (noteId: number) => {
    const res = await fetch(`${API_URL}/workstations/${presetId}/work-group-peers`);
    if (res.ok) {
      const data = await res.json();
      setPeers(data.filter((p: any) => p.id !== presetId));
    }
    setSelectedRecipients(new Set());
    setShowDistribute(noteId);
  };

  const distribute = async () => {
    if (!showDistribute || selectedRecipients.size === 0) return;
    await fetch(`${API_URL}/sticky-notes/${showDistribute}/distribute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_ids: [...selectedRecipients] }),
    });
    setShowDistribute(null);
    showToast(`הפתקית הופצה ל-${selectedRecipients.size} נמענים`);
  };

  const startDrag = (noteId: number, e: React.PointerEvent) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { noteId, startX: e.clientX, startY: e.clientY, origX: note.x, origY: note.y };
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { noteId, startX, startY, origX, origY } = dragRef.current;
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, x: Math.max(0, origX + e.clientX - startX), y: Math.max(40, origY + e.clientY - startY) } : n));
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    const { noteId } = dragRef.current;
    const note = notes.find(n => n.id === noteId);
    if (note) fetch(`${API_URL}/sticky-notes/${noteId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: note.x, y: note.y, preset_id: presetId }) });
    dragRef.current = null;
  };

  return (
    <>
      {notes.filter(n => !n.minimized).map(note => {
        const editable = canEdit(note);
        const lastEdit = note.last_edited_at
          ? `עודכן: ${note.last_edited_by_preset_name || ''} / ${note.last_edited_by_crew_name || ''} — ${new Date(note.last_edited_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
          : `נוצר: ${note.creator_preset_name || ''} / ${note.creator_crew_name || ''}`;

        return (
          <div key={note.id} style={{ position: 'fixed', left: note.x, top: note.y, zIndex: 2100, width: note.minimized ? 220 : 270, boxShadow: '0 6px 24px rgba(0,0,0,0.4)', borderRadius: '8px', overflow: 'visible', userSelect: 'none' }}>
            {/* Header */}
            <div
              onPointerDown={e => startDrag(note.id, e)}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              style={{ background: note.background_color, borderRadius: note.minimized ? '8px' : '8px 8px 0 0', padding: '5px 7px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'grab', borderBottom: note.minimized ? 'none' : '1px solid rgba(0,0,0,0.12)' }}
            >
              <span style={{ fontSize: '10px', color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>⠿</span>
              {!editable && (
                <span title="קריאה בלבד — אינך מורשה לערוך" style={{ fontSize: '11px', flexShrink: 0 }}>🔒</span>
              )}
              <span style={{ flex: 1, fontWeight: 'bold', fontSize: '12px', color: '#1e293b', direction: 'rtl', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {note.title || 'פתקית'}
              </span>
              <button onPointerDown={e => e.stopPropagation()} onClick={() => updateNote(note.id, { minimized: !note.minimized, preset_id: presetId })}
                style={{ background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '3px', padding: '1px 5px', cursor: 'pointer', fontSize: '9px', flexShrink: 0, lineHeight: 1.4 }}>
                {note.minimized ? '▼' : '▲'}
              </button>
              {editable && (
                <button onPointerDown={e => e.stopPropagation()} onClick={() => setConfirmDelete(note.id)}
                  title="מחק פתקית"
                  style={{ background: 'rgba(220,38,38,0.15)', border: 'none', borderRadius: '3px', padding: '1px 5px', cursor: 'pointer', fontSize: '11px', color: '#dc2626', flexShrink: 0, lineHeight: 1.4 }}>🗑</button>
              )}
              <button onPointerDown={e => e.stopPropagation()}
                onClick={() => updateNote(note.id, { minimized: true, preset_id: presetId })}
                title="סגור (הפתקית תישמר)"
                style={{ background: 'rgba(0,0,0,0.1)', border: 'none', borderRadius: '3px', padding: '1px 5px', cursor: 'pointer', fontSize: '10px', color: '#475569', flexShrink: 0, lineHeight: 1.4 }}>✕</button>
            </div>

            {/* Body */}
            {!note.minimized && (
              <div style={{ background: note.background_color, borderRadius: '0 0 8px 8px', filter: 'brightness(1.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                  <input value={note.title} onChange={e => updateNote(note.id, { title: e.target.value }, false)}
                    onBlur={e => updateNote(note.id, { title: e.target.value })}
                    disabled={!editable} placeholder="כותרת..."
                    style={{ flex: 1, border: 'none', background: 'transparent', padding: '4px 8px', fontSize: '11px', direction: 'rtl', fontWeight: 'bold', color: '#1e293b', outline: 'none', minWidth: 0 }}
                  />
                  {editable && (
                    <VKTrigger value={note.title} onChange={v => updateNote(note.id, { title: v })} mode="full" label="כותרת" size={12} style={{ marginLeft: '4px', marginRight: '4px', border: '1px solid rgba(0,0,0,0.15)', color: '#475569' }} />
                  )}
                </div>
                <textarea value={note.content} onChange={e => updateNote(note.id, { content: e.target.value }, false)}
                  onBlur={e => updateNote(note.id, { content: e.target.value })}
                  disabled={!editable} placeholder={editable ? 'כתוב כאן...' : '(קריאה בלבד)'}
                  rows={4}
                  title={lastEdit}
                  style={{ width: '100%', boxSizing: 'border-box', border: 'none', background: 'transparent', padding: '6px 8px', fontSize: '12px', direction: 'rtl', color: '#1e293b', outline: 'none', resize: 'vertical', minHeight: '80px', fontFamily: 'inherit' }}
                />
                {/* Bottom bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px 6px', borderTop: '1px solid rgba(0,0,0,0.08)', position: 'relative' }}>
                  {editable && (
                    <VKTrigger value={note.content} onChange={v => updateNote(note.id, { content: v })} mode="full" label="תוכן" size={14} style={{ border: '1px solid rgba(0,0,0,0.15)', color: '#475569' }} />
                  )}
                  <button onClick={() => setShowColorPicker(showColorPicker === note.id ? null : note.id)} title="צבע רקע"
                    style={{ background: note.background_color, border: '2px solid rgba(0,0,0,0.2)', borderRadius: '50%', width: '16px', height: '16px', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                  {showColorPicker === note.id && (
                    <div style={{ position: 'absolute', bottom: '28px', right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', display: 'flex', gap: '5px', flexWrap: 'wrap', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', width: '140px' }}>
                      {STICKY_COLORS.map(c => (
                        <button key={c.value} title={c.label} onClick={() => { updateNote(note.id, { background_color: c.value }); setShowColorPicker(null); }}
                          style={{ background: c.value, border: note.background_color === c.value ? '2px solid #1d4ed8' : '1px solid rgba(0,0,0,0.15)', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', padding: 0 }} />
                      ))}
                    </div>
                  )}
                  {note.creator_preset_id === presetId && (
                    <button onClick={() => updateNote(note.id, { allow_all_edit: !note.allow_all_edit })}
                      title={note.allow_all_edit ? 'כולם יכולים לערוך — לחץ לנעול' : 'רק יוצר יכול לערוך — לחץ לפתוח'}
                      style={{ background: note.allow_all_edit ? '#d1fae5' : '#fee2e2', border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontSize: '9px', color: note.allow_all_edit ? '#065f46' : '#991b1b', flexShrink: 0 }}>
                      {note.allow_all_edit ? '🔓' : '🔒'}
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  <button onClick={() => openDistribute(note.id)} title="הפץ לנמענים"
                    style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '10px', flexShrink: 0 }}>הפץ ▶</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Confirm Delete */}
      {confirmDelete !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '20px 24px', width: '320px', direction: 'rtl', boxShadow: '0 20px 50px rgba(0,0,0,0.7)', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗑</div>
            <p style={{ color: 'white', marginBottom: '16px', fontSize: '14px' }}>
              {(() => { const n = notes.find(x => x.id === confirmDelete); return (!n || n.creator_preset_id === presetId || n.allow_all_edit) ? 'למחוק פתקית זו?' : 'אין הרשאה למחוק פתקית זו'; })()}
            </p>
            {(() => { const n = notes.find(x => x.id === confirmDelete); return (!n || n.creator_preset_id === presetId || n.allow_all_edit); })() ? (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={() => setConfirmDelete(null)} style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 18px', cursor: 'pointer' }}>ביטול</button>
                <button onClick={() => deleteNote(confirmDelete!)} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 18px', cursor: 'pointer' }}>מחק</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(null)} style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 18px', cursor: 'pointer' }}>סגור</button>
            )}
          </div>
        </div>
      )}

      {/* Distribute Modal */}
      {showDistribute !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowDistribute(null); }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '380px', direction: 'rtl', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}>
            <h3 style={{ margin: '0 0 16px', color: 'white', fontSize: '16px' }}>הפץ פתקית לנמענים</h3>
            {peers.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>אין עמדות בקבוצות העבודה של עמדה זו.<br/>הגדר קבוצות עבודה בניהול המערכת.</p>
            ) : (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', marginBottom: '8px', padding: '6px', background: '#1e293b', borderRadius: '6px' }}>
                  <input type="checkbox" checked={selectedRecipients.size === peers.length && peers.length > 0}
                    onChange={e => setSelectedRecipients(e.target.checked ? new Set(peers.map((p: any) => p.id)) : new Set())} />
                  <strong>בחר הכל ({peers.length})</strong>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', marginBottom: '16px' }}>
                  {peers.map((peer: any) => (
                    <label key={peer.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontSize: '13px', cursor: 'pointer', padding: '5px 8px', background: selectedRecipients.has(peer.id) ? '#1e3a5f' : '#1e293b', borderRadius: '5px', border: selectedRecipients.has(peer.id) ? '1px solid #3b82f6' : '1px solid transparent' }}>
                      <input type="checkbox" checked={selectedRecipients.has(peer.id)}
                        onChange={e => setSelectedRecipients(prev => { const next = new Set(prev); e.target.checked ? next.add(peer.id) : next.delete(peer.id); return next; })} />
                      <span style={{ flex: 1 }}>{peer.name}</span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>{(peer.groups || []).join(', ')}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDistribute(null)} style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 18px', cursor: 'pointer', fontSize: '13px' }}>ביטול</button>
              {peers.length > 0 && (
                <button onClick={distribute} disabled={selectedRecipients.size === 0}
                  style={{ background: selectedRecipients.size === 0 ? '#475569' : '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 18px', cursor: selectedRecipients.size === 0 ? 'default' : 'pointer', fontSize: '13px' }}>
                  שלח ({selectedRecipients.size})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Toast notification */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1e293b', border: '1px solid #38bdf8', color: 'white', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', direction: 'rtl', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          ✅ {toast}
        </div>
      )}
    </>
  );
};

// --- ניהול קבוצות עבודה ---
export const WorkGroupsManager = ({ presets }: { presets: any[] }) => {
  const [groups, setGroups] = useState<any[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingAdminId, setSavingAdminId] = useState<number | null>(null);

  const loadGroups = async () => {
    const res = await fetch(`${API_URL}/work-groups`);
    if (res.ok) setGroups(await res.json());
  };
  useEffect(() => { loadGroups(); }, []);

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    await fetch(`${API_URL}/work-groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newGroupName.trim() }) });
    setNewGroupName('');
    loadGroups();
  };

  const renameGroup = async (id: number) => {
    if (!editingName.trim()) return;
    await fetch(`${API_URL}/work-groups/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editingName.trim() }) });
    setEditingId(null);
    loadGroups();
  };

  const deleteGroup = async (id: number) => {
    if (!await customConfirm('למחוק קבוצת עבודה זו?')) return;
    await fetch(`${API_URL}/work-groups/${id}`, { method: 'DELETE' });
    loadGroups();
  };

  const addMember = async (groupId: number, presetId: number) => {
    await fetch(`${API_URL}/work-groups/${groupId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_id: presetId }) });
    loadGroups();
  };

  const removeMember = async (groupId: number, presetId: number) => {
    await fetch(`${API_URL}/work-groups/${groupId}/members/${presetId}`, { method: 'DELETE' });
    loadGroups();
  };

  return (
    <div style={{ direction: 'rtl' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '18px' }}>קבוצות עבודה</h2>

      {/* Create New Group */}
      <div style={{ background: '#0f172a', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createGroup()}
          placeholder="שם קבוצה חדשה..."
          style={{ flex: 1, padding: '8px 12px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '14px', direction: 'rtl' }} />
        <button onClick={createGroup} disabled={!newGroupName.trim()}
          style={{ padding: '8px 18px', background: newGroupName.trim() ? '#2563eb' : '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: newGroupName.trim() ? 'pointer' : 'default', fontSize: '14px', flexShrink: 0 }}>
          + קבוצה חדשה
        </button>
      </div>

      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px', fontSize: '14px' }}>אין קבוצות עבודה. צור קבוצה חדשה למעלה.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {groups.map(group => {
            const memberIds = new Set(group.members.map((m: any) => m.preset_id));
            const nonMembers = presets.filter(p => !memberIds.has(p.id));
            return (
              <div key={group.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '16px', border: '1px solid #1e3a5f' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  {editingId === group.id ? (
                    <>
                      <input value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameGroup(group.id); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus style={{ flex: 1, padding: '5px 10px', background: '#1e293b', color: 'white', border: '1px solid #3b82f6', borderRadius: '5px', fontSize: '15px', direction: 'rtl' }} />
                      <button onClick={() => renameGroup(group.id)} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px' }}>שמור</button>
                      <button onClick={() => setEditingId(null)} style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '5px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>ביטול</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontWeight: 'bold', fontSize: '15px', color: '#e2e8f0' }}>{group.name}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{group.members.length} עמדות</span>
                      <button onClick={() => { setEditingId(group.id); setEditingName(group.name); }} style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '11px' }}>✎ שנה שם</button>
                      <button onClick={() => deleteGroup(group.id)} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '11px' }}>🗑 מחק</button>
                    </>
                  )}
                </div>

                {/* Members */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: group.members.length > 0 ? '10px' : 0 }}>
                  {group.members.map((m: any) => (
                    <span key={m.preset_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#1e3a5f', color: '#93c5fd', borderRadius: '20px', padding: '3px 10px', fontSize: '12px' }}>
                      {m.preset_name}
                      <button onClick={() => removeMember(group.id, m.preset_id)} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0 0 0 2px', fontSize: '12px', lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                  {group.members.length === 0 && <span style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>אין עמדות בקבוצה</span>}
                </div>

                {/* Add member */}
                {nonMembers.length > 0 && (
                  <select defaultValue="" onChange={e => { if (e.target.value) { addMember(group.id, Number(e.target.value)); e.target.value = ''; } }}
                    style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '5px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', direction: 'rtl', marginBottom: '8px' }}>
                    <option value="">+ הוסף עמדה...</option>
                    {nonMembers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}

                {/* Admin preset selector */}
                {group.members.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #1e3a5f', paddingTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>עמדת ניהול מדניות:</span>
                    <select
                      value={group.admin_preset_id ?? ''}
                      onChange={async e => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setSavingAdminId(group.id);
                        await fetch(`${API_URL}/work-groups/${group.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_preset_id: val }) });
                        setSavingAdminId(null);
                        loadGroups();
                      }}
                      style={{ flex: 1, background: '#1e293b', color: savingAdminId === group.id ? '#64748b' : '#fbbf24', border: '1px solid #78350f', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', direction: 'rtl' }}>
                      <option value="">— ללא עמדת ניהול —</option>
                      {group.members.map((m: any) => <option key={m.preset_id} value={m.preset_id}>{m.preset_name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- ניהול מודי טבלה ---
export const TableModesManager = () => {
  const [modes, setModes] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', columns: [] as any[], frozenColumns: 0 });
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null);

  const loadModes = async () => {
    const res = await fetch(`${API_URL}/table-modes`);
    if (res.ok) setModes(await res.json());
  };

  useEffect(() => { loadModes(); }, []);

  const startNew = () => {
    setEditing(null);
    setForm({ name: '', columns: [], frozenColumns: 0 });
  };

  const startEdit = (mode: any) => {
    setEditing(mode);
    const cols = (mode.columns || []).map((c: any) => ({
      ...c,
      key: c.key || c.field || ('custom_' + Date.now()),
      isCustom: c.isCustom || (c.key || c.field || '').startsWith('custom_')
    }));
    setForm({ name: mode.name, columns: cols, frozenColumns: mode.frozenColumns || 0 });
  };

  const addColumn = () => {
    setForm(f => ({
      ...f,
      columns: [...f.columns, { id: Date.now().toString(), key: 'callSign', label: 'או"ק', editable: 'none', isCustom: false }]
    }));
  };

  const addCustomColumn = () => {
    const uid = 'custom_' + Date.now();
    setForm(f => ({
      ...f,
      columns: [...f.columns, { id: uid, key: uid, label: 'שדה חופשי', editable: 'none', isCustom: true }]
    }));
  };

  const updateCol = (idx: number, changes: any) => {
    setForm(f => {
      const cols = [...f.columns];
      cols[idx] = { ...cols[idx], ...changes };
      return { ...f, columns: cols };
    });
  };

  const removeCol = (idx: number) => {
    setForm(f => ({ ...f, columns: f.columns.filter((_, i) => i !== idx) }));
  };

  const handleColDrop = (targetIdx: number) => {
    if (dragColIdx === null || dragColIdx === targetIdx) return;
    setForm(f => {
      const cols = [...f.columns];
      const [moved] = cols.splice(dragColIdx, 1);
      cols.splice(targetIdx, 0, moved);
      return { ...f, columns: cols };
    });
    setDragColIdx(null);
    setDragOverColIdx(null);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `${API_URL}/table-modes/${editing.id}` : `${API_URL}/table-modes`;
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setEditing(null);
    setForm({ name: '', columns: [], frozenColumns: 0 });
    loadModes();
  };

  const deleteMode = async (id: number) => {
    if (!await customConfirm('למחוק מוד טבלה זה?')) return;
    await fetch(`${API_URL}/table-modes/${id}`, { method: 'DELETE' });
    loadModes();
  };

  const fieldDef = (key: string) => STRIP_FIELD_DEFS.find(f => f.key === key) || null;

  return (
    <div>
      <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>מודי טבלה</h2>

      {/* Form */}
      <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', color: '#94a3b8' }}>{editing ? `עריכה: ${editing.name}` : 'מוד חדש'}</h3>
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="שם המוד (לדוגמה: טבלה מפורטת)"
          style={{ width: '100%', padding: '10px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '16px', direction: 'rtl' }}
        />

        {/* Columns */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>עמודות (גרור לשינוי סדר):</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={addColumn} style={{ padding: '6px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>+ שדה מפמם</button>
              <button onClick={addCustomColumn} style={{ padding: '6px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>+ שדה חופשי</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {form.columns.map((col, idx) => {
              const def = col.isCustom ? null : fieldDef(col.key || col.field);
              const editableOpts = col.isCustom ? CUSTOM_FIELD_EDITABLE_OPTIONS : (def?.editableOptions || ['none']);
              const isDragOver = dragOverColIdx === idx;
              return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={() => setDragColIdx(idx)}
                  onDragOver={e => { e.preventDefault(); setDragOverColIdx(idx); }}
                  onDragLeave={() => setDragOverColIdx(null)}
                  onDrop={() => handleColDrop(idx)}
                  onDragEnd={() => { setDragColIdx(null); setDragOverColIdx(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: isDragOver ? '#1d4ed8' : (idx < form.frozenColumns ? '#1a0e2e' : col.isCustom ? '#1a1040' : '#1e293b'),
                    border: isDragOver ? '2px solid #3b82f6' : (idx + 1 === form.frozenColumns ? '1px solid #7c3aed' : idx < form.frozenColumns ? '1px solid #4c1d95' : col.isCustom ? '1px solid #6d28d9' : '1px solid #334155'),
                    borderRadius: '6px', padding: '8px 10px',
                    opacity: dragColIdx === idx ? 0.5 : 1, cursor: 'grab', transition: 'background 0.1s'
                  }}
                >
                  <span style={{ color: '#475569', fontSize: '16px', flexShrink: 0 }}>⠿</span>
                  {col.isCustom ? (
                    <span style={{ fontSize: '11px', color: '#a78bfa', background: '#2e1065', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', flexShrink: 0 }}>שדה חופשי</span>
                  ) : (
                    <select
                      value={col.key || col.field || 'callSign'}
                      onChange={e => {
                        const newDef = fieldDef(e.target.value);
                        updateCol(idx, {
                          key: e.target.value,
                          field: e.target.value,
                          label: newDef?.label || e.target.value,
                          editable: newDef?.editableOptions[0] || 'none'
                        });
                      }}
                      style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px', direction: 'rtl' }}
                    >
                      {STRIP_FIELD_DEFS.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  )}
                  <input
                    value={col.label}
                    onChange={e => updateCol(idx, { label: e.target.value })}
                    placeholder={col.isCustom ? "שם השדה (לדוגמה: מהירות)" : "כותרת עמודה"}
                    style={{ flex: 1, background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px', direction: 'rtl' }}
                  />
                  {/* Editability control: single select */}
                  <select
                    value={col.editable}
                    onChange={e => updateCol(idx, { editable: e.target.value })}
                    style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px', direction: 'rtl', flexShrink: 0 }}
                  >
                    {editableOpts.filter((o: string) => o !== 'handwriting' || !editableOpts.includes('both')).map((opt: string) => (
                      <option key={opt} value={opt}>{EDITABLE_LABELS[opt]}</option>
                    ))}
                  </select>
                  <button
                    title={idx + 1 === form.frozenColumns ? 'בטל הקפאה' : 'הקפא עד עמודה זו'}
                    onClick={() => setForm(f => ({ ...f, frozenColumns: idx + 1 === f.frozenColumns ? 0 : idx + 1 }))}
                    style={{ padding: '4px 7px', background: idx < form.frozenColumns ? '#4c1d95' : 'transparent', color: idx + 1 === form.frozenColumns ? '#c4b5fd' : idx < form.frozenColumns ? '#a78bfa' : '#475569', border: `1px solid ${idx + 1 === form.frozenColumns ? '#7c3aed' : idx < form.frozenColumns ? '#4c1d95' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '13px', flexShrink: 0, transition: 'all 0.1s' }}
                  >📌</button>
                  <button onClick={() => removeCol(idx)} style={{ padding: '4px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}>✕</button>
                </div>
              );
            })}
            {form.columns.length === 0 && (
              <div style={{ color: '#475569', textAlign: 'center', padding: '20px', background: '#1e293b', borderRadius: '6px', fontSize: '13px' }}>
                לחץ "+ שדה מפמם" להוסיף עמודה מנתוני הפמם, או "+ שדה חופשי" לשדה בעל שם חופשי
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={save} disabled={!form.name.trim()} style={{ padding: '10px 24px', background: form.name.trim() ? '#059669' : '#334155', color: 'white', border: 'none', borderRadius: '6px', cursor: form.name.trim() ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 'bold' }}>
            {editing ? 'עדכון' : 'שמירה'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ name: '', columns: [], frozenColumns: 0 }); }} style={{ padding: '10px 20px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
              ביטול
            </button>
          )}
        </div>
      </div>

      {/* Modes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {modes.map(mode => (
          <div key={mode.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '16px' }}>{mode.name}</strong>
                <span style={{ color: '#64748b', fontSize: '13px', marginRight: '12px' }}>
                  {mode.columns?.length || 0} עמודות: {(mode.columns || []).map((c: any) => c.label).join(' | ')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => startEdit(mode)} style={{ padding: '6px 14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                <button onClick={() => deleteMode(mode.id)} style={{ padding: '6px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
              </div>
            </div>
          </div>
        ))}
        {modes.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>אין מודי טבלה. צור מוד חדש למעלה.</div>
        )}
      </div>
    </div>
  );
};

// --- Query Builder Context (preset names for created_by_preset selector) ---
// QBuilderCtx, QGroupEditor, QueryBuilder imported from ./components/query/QueryBuilder
// --- ניהול עזרים לעמדה ---
export const AidsManager = ({ presets }: { presets: any[] }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(presets[0]?.id ?? null);
  const [aidGroup, setAidGroup] = useState<any | null>(null);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<'text'|'image'>('text');
  const [newItemContent, setNewItemContent] = useState('');
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingName, setEditingName] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareMode, setShareMode] = useState<'duplicate'|'link'>('duplicate');
  const [shareTargets, setShareTargets] = useState<Set<number>>(new Set());
  const [groupNameEdit, setGroupNameEdit] = useState('');
  const [linkExistingId, setLinkExistingId] = useState<number | null>(null);

  const loadAidGroup = async (pid: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/presets/${pid}/aid-group`);
      const data = res.ok ? await res.json() : null;
      setAidGroup(data);
      setGroupNameEdit(data?.name || '');
    } finally { setLoading(false); }
  };

  const loadAllGroups = async () => {
    const res = await fetch(`${API_URL}/aid-groups`);
    if (res.ok) setAllGroups(await res.json());
  };

  useEffect(() => { if (selectedPresetId) loadAidGroup(selectedPresetId); }, [selectedPresetId]);
  useEffect(() => { loadAllGroups(); }, []);

  const createNewGroup = async () => {
    if (!selectedPresetId) return;
    const res = await fetch(`${API_URL}/aid-groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `עזרים - ${presets.find(p => p.id === selectedPresetId)?.name || ''}` }) });
    if (res.ok) {
      const grp = await res.json();
      await fetch(`${API_URL}/presets/${selectedPresetId}/aid-group`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: grp.id }) });
      loadAidGroup(selectedPresetId);
      loadAllGroups();
    }
  };

  const unlinkGroup = async () => {
    if (!selectedPresetId) return;
    await fetch(`${API_URL}/presets/${selectedPresetId}/aid-group`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: null }) });
    setAidGroup(null);
    loadAllGroups();
  };

  const saveGroupName = async () => {
    if (!aidGroup) return;
    await fetch(`${API_URL}/aid-groups/${aidGroup.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: groupNameEdit }) });
    setAidGroup((prev: any) => ({ ...prev, name: groupNameEdit }));
  };

  const addItem = async () => {
    if (!aidGroup || !newItemName.trim()) return;
    const maxOrder = Math.max(0, ...(aidGroup.items || []).map((i: any) => i.sort_order));
    const res = await fetch(`${API_URL}/aid-groups/${aidGroup.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newItemName, type: newItemType, content: newItemContent, sort_order: maxOrder + 1 }) });
    if (res.ok) {
      const item = await res.json();
      setAidGroup((prev: any) => ({ ...prev, items: [...(prev.items || []), item] }));
      setNewItemName(''); setNewItemContent(''); setAddingItem(false);
    }
  };

  const deleteItem = async (itemId: number) => {
    await fetch(`${API_URL}/aid-items/${itemId}`, { method: 'DELETE' });
    setAidGroup((prev: any) => ({ ...prev, items: prev.items.filter((i: any) => i.id !== itemId) }));
  };

  const saveItem = async (itemId: number) => {
    await fetch(`${API_URL}/aid-items/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editingName, content: editingContent }) });
    setAidGroup((prev: any) => ({ ...prev, items: prev.items.map((i: any) => i.id === itemId ? { ...i, name: editingName, content: editingContent } : i) }));
    setEditingItemId(null);
  };

  const doShare = async () => {
    if (!aidGroup || shareTargets.size === 0) return;
    const url = shareMode === 'duplicate' ? `${API_URL}/aid-groups/${aidGroup.id}/duplicate` : `${API_URL}/aid-groups/${aidGroup.id}/link`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset_ids: [...shareTargets] }) });
    setShowShareModal(false);
    setShareTargets(new Set());
    loadAllGroups();
  };

  const linkExisting = async () => {
    if (!selectedPresetId || !linkExistingId) return;
    await fetch(`${API_URL}/presets/${selectedPresetId}/aid-group`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: linkExistingId }) });
    loadAidGroup(selectedPresetId);
    setLinkExistingId(null);
  };

  const readImageFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const labelStyle = { fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' as const, textTransform: 'uppercase' as const };
  const btnPrimary = { background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px' };
  const btnSecondary = { background: '#334155', color: 'white', border: 'none', borderRadius: '5px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px' };
  const btnDanger = { background: 'rgba(220,38,38,0.2)', color: '#f87171', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' };

  return (
    <div style={{ display: 'flex', gap: '20px', direction: 'rtl', minHeight: '400px' }}>
      {/* Preset list */}
      <div style={{ width: '200px', flexShrink: 0 }}>
        <div style={labelStyle}>עמדות</div>
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {presets.map(p => (
            <button key={p.id} onClick={() => setSelectedPresetId(p.id)}
              style={{ background: selectedPresetId === p.id ? '#2563eb' : '#0f172a', color: 'white', border: selectedPresetId === p.id ? '1px solid #60a5fa' : '1px solid #334155', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer', textAlign: 'right', fontSize: '13px' }}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Aid group management */}
      <div style={{ flex: 1 }}>
        {!selectedPresetId && <div style={{ color: '#64748b' }}>בחר עמדה</div>}
        {selectedPresetId && loading && <div style={{ color: '#64748b' }}>טוען...</div>}
        {selectedPresetId && !loading && !aidGroup && (
          <div>
            <div style={{ color: '#94a3b8', marginBottom: '12px', fontSize: '13px' }}>אין קבוצת עזרים לעמדה זו</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={createNewGroup} style={btnPrimary}>+ צור קבוצת עזרים חדשה</button>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select value={linkExistingId ?? ''} onChange={e => setLinkExistingId(Number(e.target.value) || null)}
                  style={{ background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '5px', padding: '5px 8px', fontSize: '12px' }}>
                  <option value="">קשר לקבוצה קיימת...</option>
                  {allGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.item_count} פריטים)</option>)}
                </select>
                {linkExistingId && <button onClick={linkExisting} style={btnPrimary}>קשר</button>}
              </div>
            </div>
          </div>
        )}
        {selectedPresetId && !loading && aidGroup && (
          <div>
            {/* Group header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <input value={groupNameEdit} onChange={e => setGroupNameEdit(e.target.value)}
                onBlur={saveGroupName}
                style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '5px', padding: '5px 10px', fontSize: '14px', fontWeight: 'bold', flex: 1 }} />
              {aidGroup.linked_presets?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: '#1e3a5f', padding: '4px 10px', borderRadius: '8px', fontSize: '11px' }}>
                  <div style={{ color: '#93c5fd', fontWeight: 'bold' }}>🔗 מקושר לעמדות:</div>
                  {(aidGroup.linked_presets as string[]).map((name: string) => (
                    <div key={name} style={{ color: '#bfdbfe', paddingRight: '6px' }}>• {name}</div>
                  ))}
                </div>
              )}
              <button onClick={() => { setShowShareModal(true); setShareMode('duplicate'); setShareTargets(new Set()); }} style={btnSecondary}>שכפל ▶</button>
              <button onClick={() => { setShowShareModal(true); setShareMode('link'); setShareTargets(new Set()); }} style={btnSecondary}>קשר ▶</button>
              <button onClick={unlinkGroup} style={btnDanger}>נתק</button>
            </div>

            {/* Items list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(aidGroup.items || []).map((item: any) => (
                <div key={item.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px' }}>
                  {editingItemId === item.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input value={editingName} onChange={e => setEditingName(e.target.value)}
                        style={{ background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' }} />
                      {item.type === 'text' ? (
                        <textarea value={editingContent} onChange={e => setEditingContent(e.target.value)} rows={4}
                          style={{ background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', resize: 'vertical', fontFamily: 'inherit' }} />
                      ) : (
                        <div>
                          {editingContent && <img src={editingContent} alt="תצוגה מקדימה" style={{ maxWidth: '200px', maxHeight: '100px', borderRadius: '4px', display: 'block', marginBottom: '6px' }} />}
                          <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) setEditingContent(await readImageFile(f)); }} />
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => saveItem(item.id)} style={btnPrimary}>שמור</button>
                        <button onClick={() => setEditingItemId(null)} style={btnSecondary}>ביטול</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '9px', background: item.type === 'image' ? '#1e3a5f' : '#1e293b', padding: '1px 5px', borderRadius: '3px' }}>{item.type === 'image' ? '🖼' : '📄'}</span>
                          <span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>{item.name}</span>
                        </div>
                        {item.type === 'text' && item.content && <div style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'pre-wrap', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.content}</div>}
                        {item.type === 'image' && item.content && <img src={item.content} alt={item.name} style={{ maxWidth: '120px', maxHeight: '60px', borderRadius: '4px', objectFit: 'contain' }} />}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button onClick={() => { setEditingItemId(item.id); setEditingName(item.name); setEditingContent(item.content); }} style={btnSecondary}>✏️</button>
                        <button onClick={() => deleteItem(item.id)} style={btnDanger}>🗑</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add item */}
            {!addingItem ? (
              <button onClick={() => setAddingItem(true)} style={{ ...btnPrimary, marginTop: '12px' }}>+ הוסף עזר</button>
            ) : (
              <div style={{ marginTop: '12px', background: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="שם העזר..."
                    style={{ background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '5px 10px', fontSize: '13px', flex: 1 }} />
                  <select value={newItemType} onChange={e => setNewItemType(e.target.value as 'text'|'image')}
                    style={{ background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '5px 8px', fontSize: '12px' }}>
                    <option value="text">📄 טקסט</option>
                    <option value="image">🖼 תמונה</option>
                  </select>
                </div>
                {newItemType === 'text' ? (
                  <textarea value={newItemContent} onChange={e => setNewItemContent(e.target.value)} rows={3} placeholder="תוכן..."
                    style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '5px 10px', fontSize: '12px', resize: 'vertical', fontFamily: 'inherit' }} />
                ) : (
                  <div>
                    {newItemContent && <img src={newItemContent} alt="תצוגה מקדימה" style={{ maxWidth: '200px', maxHeight: '100px', borderRadius: '4px', display: 'block', marginBottom: '6px' }} />}
                    <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) setNewItemContent(await readImageFile(f)); }} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button onClick={addItem} style={btnPrimary}>הוסף</button>
                  <button onClick={() => { setAddingItem(false); setNewItemName(''); setNewItemContent(''); }} style={btnSecondary}>ביטול</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share modal */}
      {showShareModal && aidGroup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowShareModal(false); }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '360px', direction: 'rtl', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
            <h3 style={{ margin: '0 0 6px', color: 'white', fontSize: '15px' }}>{shareMode === 'duplicate' ? 'שכפל עזרים לעמדות' : 'קשר עזרים לעמדות'}</h3>
            <p style={{ margin: '0 0 14px', color: '#94a3b8', fontSize: '12px' }}>
              {shareMode === 'duplicate' ? 'יווצר עותק עצמאי לכל עמדה שתבחר.' : 'כל העמדות שתבחר יצביעו לאותה קבוצה — עדכון אחד ישפיע על כולן.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '220px', overflowY: 'auto', marginBottom: '14px' }}>
              {presets.filter(p => p.id !== selectedPresetId).map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', cursor: 'pointer', padding: '5px', background: shareTargets.has(p.id) ? '#1e3a5f' : 'transparent', borderRadius: '5px' }}>
                  <input type="checkbox" checked={shareTargets.has(p.id)} onChange={e => setShareTargets(prev => { const s = new Set(prev); e.target.checked ? s.add(p.id) : s.delete(p.id); return s; })} />
                  {p.name}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={doShare} disabled={shareTargets.size === 0} style={{ ...btnPrimary, opacity: shareTargets.size === 0 ? 0.5 : 1 }}>אשר</button>
              <button onClick={() => setShowShareModal(false)} style={btnSecondary}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Module-level theme helper for sub-components that receive lightMode as prop
const mkT = (lightMode: boolean) => lightMode ? {
  bg: '#f8fafc', bgAlt: '#f1f5f9', surface: '#f1f5f9', surface2: 'white',
  border: '#e2e8f0', borderLight: '#cbd5e1',
  text: '#1e293b', textInv: '#f1f5f9', muted: '#64748b', input: 'white',
} : {
  bg: '#0f172a', bgAlt: '#0f172a', surface: '#1e293b', surface2: '#1e293b',
  border: '#334155', borderLight: '#475569',
  text: '#e2e8f0', textInv: '#1e293b', muted: '#94a3b8', input: '#0f172a',
};

// --- ניהול ספרורים (Admin) ---
export const SerialsAdminTab = ({ initialUndoDurationMs }: { initialUndoDurationMs?: number | null }) => {
  const [serials, setSerials] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [pendingClearSerials, setPendingClearSerials] = useState<{ durationMs: number } | null>(null);
  const clearSerialsUndoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    return () => { if (clearSerialsUndoTimerRef.current) clearTimeout(clearSerialsUndoTimerRef.current); };
  }, []);
  const getSerialsUndoDurationMs = () => {
    try { const v = localStorage.getItem('groundUndoDurationMs'); if (v) { const n = Number(v); if ([3000,6000,10000].includes(n)) return n; } } catch { /* ignore */ }
    if (initialUndoDurationMs && [3000,6000,10000].includes(initialUndoDurationMs)) return initialUndoDurationMs;
    return 6000;
  };

  const loadSerials = async () => {
    try {
      const res = await fetch(`${API_URL}/serials`);
      if (res.ok) setSerials(await res.json());
    } catch {}
  };

  useEffect(() => { loadSerials(); }, []);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const buffer = ev.target?.result as ArrayBuffer;
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[];

        // Strip all whitespace/punctuation and lowercase for flexible matching
        const norm = (s: string) => s.trim().replace(/[\s\u00a0\u200b\u200f\u202a-\u202e\r\n\t_\-\.\/\\]+/g, '').toLowerCase();

        // Detect which DB field a column name belongs to (contains-based, ordered by specificity)
        const detectField = (colName: string): string | null => {
          const n = norm(colName);
          // control_station
          if (n.includes('תאשליטה') || n.includes('controlstation') || n === 'תא') return 'control_station';
          // serial_number — check BEFORE מהות to avoid partial match
          if (n.includes('מספרספרור') || n.includes('מס׳ספרור') || n.includes('מספרserialnumber') || n === 'מספר' || n === 'ספרור' || n.includes('serialnumber')) return 'serial_number';
          // essence — מהות
          if (n.includes('מהות') || n === 'essence') return 'essence';
          // relevant_to — רלוונטי
          if (n.includes('רלוונטי') || n.includes('relevantto') || n.includes('קהלמטרה')) return 'relevant_to';
          // created_at — תאריך
          if (n.includes('תאריך') || n.includes('שעה') || n.includes('זמן') || n.includes('createdat')) return 'created_at';
          return null;
        };

        // Helper: convert Excel date value to ISO string
        const toDateStr = (v: any): string | null => {
          if (!v && v !== 0) return null;
          if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
          if (typeof v === 'string' && v.trim()) {
            // Try standard parse
            const d = new Date(v);
            if (!isNaN(d.getTime())) return d.toISOString();
            // Try DD/MM/YYYY[ HH:MM] format
            const m = v.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
            if (m) {
              const year = m[3].length === 2 ? `20${m[3]}` : m[3];
              const d2 = new Date(`${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${(m[4]||'00').padStart(2,'0')}:${(m[5]||'00').padStart(2,'0')}:00`);
              if (!isNaN(d2.getTime())) return d2.toISOString();
            }
          }
          if (typeof v === 'number') {
            // Excel serial date: days since 1900-01-00
            const d = new Date((v - 25569) * 86400 * 1000);
            if (!isNaN(d.getTime())) return d.toISOString();
          }
          return String(v);
        };

        const rawKeys = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
        const detectedCols = rawKeys.join(', ');
        console.log('[Serials Import] columns:', rawKeys, '| normalized:', rawKeys.map(k => `${k}→${norm(k)}→${detectField(k)}`));

        const rows = rawRows.map(r => {
          const mapped: any = {};
          for (const [k, v] of Object.entries(r)) {
            const field = detectField(k);
            if (field) {
              mapped[field] = field === 'created_at' ? toDateStr(v) : v;
            }
          }
          return mapped;
        });
        const res = await fetch(`${API_URL}/serials/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        });
        if (res.ok) {
          const { inserted, updated, skipped } = await res.json();
          const mappedFields = rawKeys.map(k => `${k}→${detectField(k) ?? '?'}`).join(', ');
          setImportResult(`חדשים: ${inserted} | עודכנו: ${updated} | דילוג (זהים): ${skipped}\nמיפוי עמודות: ${mappedFields}`);
          loadSerials();
        } else {
          const errText = await res.text();
          setImportResult(`שגיאה בייבוא: ${errText}`);
        }
      } catch (err) {
        setImportResult(`שגיאה בקריאת הקובץ: ${err}`);
      }
      setImporting(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const doClearSerials = async () => {
    setClearing(true);
    await fetch(`${API_URL}/serials/all`, { method: 'DELETE' });
    setSerials([]);
    setClearing(false);
    setImportResult('כל הספרורים נמחקו');
  };

  const clearAll = () => {
    const dur = getSerialsUndoDurationMs();
    setPendingClearSerials({ durationMs: dur });
    if (clearSerialsUndoTimerRef.current) clearTimeout(clearSerialsUndoTimerRef.current);
    clearSerialsUndoTimerRef.current = setTimeout(() => {
      setPendingClearSerials(null);
      clearSerialsUndoTimerRef.current = null;
      doClearSerials();
    }, dur);
  };

  const grouped = serials.reduce((acc, s) => {
    if (!acc[s.control_station]) acc[s.control_station] = [];
    acc[s.control_station].push(s);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div style={{ direction: 'rtl', color: 'white' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '18px' }}>ניהול ספרורים</h2>
      <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '14px' }}>טעינת קובץ Excel</h3>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>
          עמודות נדרשות: <strong style={{ color: '#94a3b8' }}>תא שליטה, מספר ספרור, מהות ספרור, רלוונטי ל, תאריך ושעה</strong>
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ background: '#2563eb', color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {importing ? '⏳ מייבא...' : '📂 בחר קובץ Excel'}
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileImport} disabled={importing} />
          </label>
          {!pendingClearSerials ? (
            <button onClick={clearAll} disabled={clearing} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
              🗑️ מחק הכל
            </button>
          ) : (
            <button
              onClick={() => {
                if (clearSerialsUndoTimerRef.current) { clearTimeout(clearSerialsUndoTimerRef.current); clearSerialsUndoTimerRef.current = null; }
                setPendingClearSerials(null);
              }}
              style={{ position: 'relative', overflow: 'hidden', background: '#f59e0b', color: 'white', border: '1px solid #f59e0b', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
            >
              בטל מחיקה
              <div className="undo-timer-bar" style={{ animationDuration: `${pendingClearSerials.durationMs}ms` }} />
            </button>
          )}
        </div>
        {importResult && (
          <div style={{ marginTop: '10px', padding: '8px 12px', background: importResult.includes('שגיאה') ? '#dc2626' : '#10b981', borderRadius: '6px', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {importResult}
          </div>
        )}
      </div>

      <div style={{ background: '#0f172a', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>ספרורים קיימים ({serials.length})</h3>
        </div>
        {Object.keys(grouped).length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '13px' }}>אין ספרורים במערכת</p>
        ) : (
          (Object.entries(grouped) as [string, any[]][]).map(([station, stSerials]) => (
            <div key={station} style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '13px', marginBottom: '6px', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                📡 {station} ({stSerials.length} ספרורים)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {stSerials.map((sr: any) => (
                  <div key={sr.id} style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#cbd5e1', padding: '4px 8px', background: '#1e293b', borderRadius: '4px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 'bold', minWidth: '40px' }}>#{sr.serial_number}</span>
                    <span style={{ flex: 1 }}>{sr.essence || '—'}</span>
                    <span style={{ color: '#94a3b8', fontSize: '11px', minWidth: '80px' }}>{sr.relevant_to || ''}</span>
                    <span style={{ color: '#64748b', fontSize: '11px', minWidth: '130px' }}>{sr.created_at ? new Date(sr.created_at).toLocaleString('he-IL') : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- פאנל ספרורים במוד עמדה ---
export const SerialsPanelModal = ({ serials, onClose, lightMode }: { serials: any[]; onClose: () => void; lightMode: boolean }) => {
  const T = mkT(lightMode);
  const bg = T.bg;
  const bg2 = T.surface;
  const textMain = T.text;
  const textSub = T.muted;
  const border = T.border;

  const allStations = Array.from(new Set(serials.map(s => s.control_station))).sort();
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set(allStations));
  const [hoursFilter, setHoursFilter] = useState<number | null>(null);
  const [showTimeFilter, setShowTimeFilter] = useState(false);

  const toggleStation = (st: string) => {
    setSelectedStations(prev => {
      const next = new Set(prev);
      if (next.has(st)) next.delete(st); else next.add(st);
      return next;
    });
  };

  const now = new Date();
  const filtered = serials.filter(s => {
    if (!selectedStations.has(s.control_station)) return false;
    if (hoursFilter !== null && s.created_at) {
      const diff = (now.getTime() - new Date(s.created_at).getTime()) / 3600000;
      if (diff > hoursFilter) return false;
    }
    return true;
  });

  const grouped = filtered.reduce((acc, s) => {
    if (!acc[s.control_station]) acc[s.control_station] = [];
    acc[s.control_station].push(s);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'stretch', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
      <div style={{ background: bg, width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', direction: 'rtl', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div
          onClick={() => setShowTimeFilter(v => !v)}
          style={{ background: lightMode ? '#1e293b' : '#0f172a', color: 'white', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ fontSize: '18px', fontWeight: 'bold', flex: 1 }}>📡 ספרורים במוד עמדה ({filtered.length})</span>
          {hoursFilter !== null && (
            <span style={{ background: '#f59e0b', color: 'black', borderRadius: '12px', padding: '2px 10px', fontSize: '12px' }}>
              {hoursFilter} שעות אחרונות
            </span>
          )}
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>לחץ לסינון זמן ▾</span>
          <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: '#dc2626', border: 'none', color: 'white', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '13px', marginRight: '8px' }}>✕ סגור</button>
        </div>

        {/* Time filter dropdown */}
        {showTimeFilter && (
          <div style={{ background: lightMode ? '#e2e8f0' : '#1e293b', padding: '12px 20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${border}` }}>
            <span style={{ color: textMain, fontSize: '13px', fontWeight: 'bold' }}>הצג ספרורים שנוצרו ב:</span>
            {[3, 6, 12, 24, 48].map(h => (
              <button key={h} onClick={() => setHoursFilter(hoursFilter === h ? null : h)}
                style={{ background: hoursFilter === h ? '#2563eb' : (lightMode ? '#cbd5e1' : '#334155'), color: hoursFilter === h ? 'white' : textMain, border: 'none', borderRadius: '6px', padding: '5px 14px', cursor: 'pointer', fontSize: '13px' }}>
                {h}ש׳
              </button>
            ))}
            {hoursFilter !== null && (
              <button onClick={() => setHoursFilter(null)} style={{ background: '#64748b', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>ללא סינון</button>
            )}
          </div>
        )}

        {/* Station filter */}
        <div style={{ padding: '10px 20px', background: bg2, borderBottom: `1px solid ${border}`, display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: textSub, fontSize: '12px' }}>תאי שליטה:</span>
          <button onClick={() => setSelectedStations(new Set(allStations))} style={{ background: 'transparent', border: `1px solid ${border}`, color: textSub, borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}>הכל</button>
          <button onClick={() => setSelectedStations(new Set())} style={{ background: 'transparent', border: `1px solid ${border}`, color: textSub, borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}>נקה</button>
          {allStations.map(st => (
            <button key={st} onClick={() => toggleStation(st)}
              style={{ background: selectedStations.has(st) ? '#2563eb' : (T.border), color: selectedStations.has(st) ? 'white' : textMain, border: 'none', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: selectedStations.has(st) ? 'bold' : 'normal' }}>
              {st}
            </button>
          ))}
        </div>

        {/* Serials list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {Object.keys(grouped).length === 0 ? (
            <div style={{ color: textSub, textAlign: 'center', marginTop: '40px', fontSize: '14px' }}>אין ספרורים להצגה</div>
          ) : (
            (Object.entries(grouped) as [string, any[]][]).map(([station, stSerials]) => (
              <div key={station} style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '15px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📡 {station}
                  <span style={{ fontSize: '12px', color: textSub, fontWeight: 'normal' }}>({stSerials.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {stSerials.map((sr: any, i: number) => (
                    <div key={sr.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 120px 160px', gap: '8px', fontSize: '12px', color: textMain, padding: '6px 10px', background: i === 0 ? (lightMode ? '#dbeafe' : '#1e3a5f') : bg2, borderRadius: '4px', border: i === 0 ? '1px solid #3b82f6' : `1px solid ${border}`, alignItems: 'start' }}>
                      <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '13px' }}>#{sr.serial_number}</span>
                      <span>{sr.essence || '—'}</span>
                      <span style={{ color: textSub }}>{sr.relevant_to || ''}</span>
                      <span style={{ color: textSub, fontSize: '11px' }}>{sr.created_at ? new Date(sr.created_at).toLocaleString('he-IL') : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// --- תחקיר / Activity Log ---
const EVENT_TYPE_LABELS: Record<string, string> = {
  transfer_sent:     'העברה נשלחה',
  transfer_accepted: 'העברה התקבלה',
  transfer_rejected: 'העברה נדחתה',
  accept_to_map:     'קיבול למפה',
  conflict_detected: 'קונפליקט גובה',
  overload_reached:  'עומס מלא',
  strip_created:     'פמ"מ נוצר',
  strip_deleted:     'פמ"מ נמחק',
  strip_notes_edited:'עריכת הערות פמ"מ',
  note_edited:       'עריכת פתקית',
  wg_note_edited:    'עריכת הערת קבוצה',
  wg_note_created:   'הערת קבוצה נוצרה',
  block_assigned:    'שיוך מרחב בלוקים',
  workstation_login: 'כניסה לעמדה',
  workstation_logout:'יציאה מעמדה',
  crew_swap:         'החלפת משתמש',
};
const SEVERITY_STYLES: Record<string, React.CSSProperties> = {
  critical: { background: '#450a0a', color: '#fca5a5', firstCellBorder: '4px solid #ef4444' } as any,
  warning:  { background: '#431407', color: '#fdba74', firstCellBorder: '4px solid #f97316' } as any,
  normal:   {},
};

export const DebriefingTab = ({ presets: presetsProp, crewMembers: crewMembersProp, lightMode, initialUndoDurationMs }: { presets?: any[]; crewMembers?: any[]; lightMode: boolean; initialUndoDurationMs?: number | null }) => {
  const T = mkT(lightMode);
  const bg = T.bg;
  const cardBg = lightMode ? '#fff' : '#1e293b';
  const border = T.border;
  const text = lightMode ? '#0f172a' : '#e2e8f0';
  const muted = T.muted;
  const inputStyle: React.CSSProperties = { background: lightMode ? '#fff' : '#0f172a', color: text, border: `1px solid ${border}`, borderRadius: '6px', padding: '5px 8px', fontSize: '13px', direction: 'rtl' };

  const today = new Date().toISOString().slice(0, 10);
  const [filterEventType, setFilterEventType] = React.useState('');
  const [filterDateFrom, setFilterDateFrom] = React.useState(today);
  const [filterDateTo, setFilterDateTo] = React.useState(today);
  const [filterPresetId, setFilterPresetId] = React.useState('');
  const [filterCrewId, setFilterCrewId] = React.useState('');
  const [rows, setRows] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const pageSize = 100;
  const [pendingClearLog, setPendingClearLog] = React.useState<{ durationMs: number } | null>(null);
  const clearLogUndoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    return () => { if (clearLogUndoTimerRef.current) clearTimeout(clearLogUndoTimerRef.current); };
  }, []);
  const getLogUndoDurationMs = () => {
    try { const v = localStorage.getItem('groundUndoDurationMs'); if (v) { const n = Number(v); if ([3000,6000,10000].includes(n)) return n; } } catch { /* ignore */ }
    if (initialUndoDurationMs && [3000,6000,10000].includes(initialUndoDurationMs)) return initialUndoDurationMs;
    return 6000;
  };

  // Self-fetch reference data if not provided by parent
  const [internalPresets, setInternalPresets] = React.useState<any[]>([]);
  const [internalCrewMembers, setInternalCrewMembers] = React.useState<any[]>([]);
  const [sectors, setSectors] = React.useState<any[]>([]);
  React.useEffect(() => {
    if (!presetsProp) fetch(`${API_URL}/workstation-presets`).then(r => r.ok ? r.json() : []).then(setInternalPresets).catch(() => {});
    if (!crewMembersProp) fetch(`${API_URL}/crew-members`).then(r => r.ok ? r.json() : []).then(setInternalCrewMembers).catch(() => {});
    fetch(`${API_URL}/sectors`).then(r => r.ok ? r.json() : []).then(setSectors).catch(() => {});
  }, []);
  const presets = presetsProp ?? internalPresets;
  const crewMembers = crewMembersProp ?? internalCrewMembers;

  // Lookup helpers
  const presetName = React.useCallback((id: any) => {
    if (!id) return null;
    const p = presets.find((x: any) => String(x.id) === String(id));
    return p?.name || null;
  }, [presets]);
  const sectorName = React.useCallback((id: any) => {
    if (!id) return null;
    const s = sectors.find((x: any) => String(x.id) === String(id));
    return s?.label_he || s?.name || null;
  }, [sectors]);

  const fetchLog = React.useCallback(async (pg = 0) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(pg * pageSize) });
    if (filterEventType) params.set('event_type', filterEventType);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterPresetId) params.set('workstation_preset_id', filterPresetId);
    if (filterCrewId) params.set('crew_member_id', filterCrewId);
    try {
      const res = await fetch(`${API_URL}/activity-log?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch { setRows([]); setTotal(0); }
    setLoading(false);
  }, [filterEventType, filterDateFrom, filterDateTo, filterPresetId, filterCrewId]);

  React.useEffect(() => { setPage(0); fetchLog(0); }, [filterEventType, filterDateFrom, filterDateTo, filterPresetId, filterCrewId]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const doDeleteLog = async () => {
    await fetch(`${API_URL}/activity-log`, { method: 'DELETE' });
    fetchLog(0);
  };

  const clearLog = () => {
    const dur = getLogUndoDurationMs();
    setPendingClearLog({ durationMs: dur });
    if (clearLogUndoTimerRef.current) clearTimeout(clearLogUndoTimerRef.current);
    clearLogUndoTimerRef.current = setTimeout(() => {
      setPendingClearLog(null);
      clearLogUndoTimerRef.current = null;
      doDeleteLog();
    }, dur);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ padding: '16px', direction: 'rtl', color: text, background: bg, minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>תחקיר — יומן פעילות</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!pendingClearLog ? (
            <button
              onClick={clearLog}
              style={{ background: '#dc2626', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
            >
              🗑 מחק יומן
            </button>
          ) : (
            <button
              onClick={() => {
                if (clearLogUndoTimerRef.current) { clearTimeout(clearLogUndoTimerRef.current); clearLogUndoTimerRef.current = null; }
                setPendingClearLog(null);
              }}
              style={{ position: 'relative', overflow: 'hidden', background: '#f59e0b', color: 'white', border: '1px solid #f59e0b', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
            >
              בטל מחיקת יומן
              <div className="undo-timer-bar" style={{ animationDuration: `${pendingClearLog.durationMs}ms` }} />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', padding: '10px 12px', background: cardBg, borderRadius: '8px', border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: muted }}>סוג ארוע</span>
          <select value={filterEventType} onChange={e => setFilterEventType(e.target.value)} style={inputStyle}>
            <option value=''>הכל</option>
            {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: muted }}>מתאריך</span>
          <input type='date' value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: muted }}>עד תאריך</span>
          <input type='date' value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: muted }}>עמדה</span>
          <select value={filterPresetId} onChange={e => setFilterPresetId(e.target.value)} style={inputStyle}>
            <option value=''>כל העמדות</option>
            {presets.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: muted }}>משתמש</span>
          <select value={filterCrewId} onChange={e => setFilterCrewId(e.target.value)} style={inputStyle}>
            <option value=''>כל המשתמשים</option>
            {crewMembers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button onClick={() => { setFilterEventType(''); setFilterDateFrom(today); setFilterDateTo(today); setFilterPresetId(''); setFilterCrewId(''); }} style={{ ...inputStyle, background: lightMode ? '#f1f5f9' : '#334155', cursor: 'pointer' }}>איפוס</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', fontSize: '11px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#450a0a', border: '2px solid #ef4444', display: 'inline-block' }} />קונפליקט / קריטי</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#431407', border: '2px solid #f97316', display: 'inline-block' }} />אזהרה / עומס</span>
        <span style={{ color: muted }}>{loading ? 'טוען...' : `${total} רשומות`}</span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: `1px solid ${border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', direction: 'rtl' }}>
          <thead>
            <tr style={{ background: lightMode ? '#1e293b' : '#0f172a', color: '#e2e8f0' }}>
              {['זמן', 'סוג ארוע', 'עמדה', 'משתמש', 'פמ"מ', 'פרטים'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: `1px solid ${border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: muted }}>אין רשומות</td></tr>
            )}
            {rows.map((row, i) => {
              const sevStyle = SEVERITY_STYLES[row.severity] || SEVERITY_STYLES.normal;
              const rowBg = sevStyle.background || (i % 2 === 0 ? cardBg : (lightMode ? '#f1f5f9' : '#162032'));
              const details = typeof row.details === 'string' ? (() => { try { return JSON.parse(row.details); } catch { return {}; } })() : (row.details || {});
              const detailStr = [
                // conflict: show sector/transfer point label
                row.event_type === 'conflict_detected' && details.sectorLabel ? `נקודה: ${details.sectorLabel}` : null,
                row.event_type === 'conflict_detected' && details.conflictWith ? `קונפליקט עם: ${details.conflictWith}` : null,
                row.event_type !== 'conflict_detected' && details.toSectorId ? `→ ${sectorName(details.toSectorId) || `סקטור ${details.toSectorId}`}` : null,
                row.event_type !== 'conflict_detected' && details.toWorkstationId ? `→ ${presetName(details.toWorkstationId) || `עמדה ${details.toWorkstationId}`}` : null,
                row.event_type !== 'conflict_detected' && details.fromPresetId ? `← ${presetName(details.fromPresetId) || `עמדה ${details.fromPresetId}`}` : null,
                details.altitude ? `גובה ${normalizeAlt(String(details.altitude))}` : null,
                details.loadCount != null ? `עומס ${details.loadCount}/${details.fullLoadThreshold}` : null,
                details.blockSpaceName ? `מרחב: ${details.blockSpaceName}` : (details.blockSpaceId === null && row.event_type === 'block_assigned' ? 'הוסר מרחב' : null),
                details.title ? `כותרת: ${details.title}` : null,
                // sticky note / strip notes diff
                details.oldContent != null && details.newContent != null
                  ? `${details.oldContent ? `הוסר: "${details.oldContent.slice(0,30)}${details.oldContent.length > 30 ? '…' : ''}"` : ''} ${details.newContent ? `→ "${details.newContent.slice(0,30)}${details.newContent.length > 30 ? '…' : ''}"` : '(נמחק)'}`.trim()
                  : null,
                details.oldTitle != null && details.newTitle != null
                  ? `כותרת: "${details.oldTitle || '—'}" → "${details.newTitle || '—'}"`
                  : null,
                details.notesLength != null && details.oldNotes == null ? `${details.notesLength} תווים` : null,
                details.oldNotes != null
                  ? `${details.oldNotes ? `"${details.oldNotes.slice(0,25)}${details.oldNotes.length > 25 ? '…' : ''}"` : '(ריק)'} → ${details.newNotes ? `"${details.newNotes.slice(0,25)}${details.newNotes.length > 25 ? '…' : ''}"` : '(נמחק)'}`
                  : null,
                details.prevCrewMemberName ? `החליף: ${details.prevCrewMemberName}` : null,
                details.role ? `תפקיד: ${{ admin: 'מנהל', team_lead: 'ראש צוות', operator: 'מפעיל' }[details.role as string] || details.role}` : null,
                details.newRole && row.event_type === 'crew_swap' ? `תפקיד חדש: ${{ admin: 'מנהל', team_lead: 'ראש צוות', operator: 'מפעיל' }[details.newRole as string] || details.newRole}` : null,
              ].filter(Boolean).join(' | ');
              const firstCellBorder = (sevStyle as any).firstCellBorder;
              return (
                <tr key={row.id} style={{ background: rowBg, color: sevStyle.color || text }}>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', borderBottom: `1px solid ${border}`, ...(firstCellBorder ? { borderRight: firstCellBorder } : {}) }}>{formatTime(row.timestamp)}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontWeight: row.severity !== 'normal' ? 700 : 400, borderBottom: `1px solid ${border}` }}>{EVENT_TYPE_LABELS[row.event_type] || row.event_type}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${border}` }}>{row.workstation_name || '—'}</td>
                  <td style={{ padding: '7px 10px', borderBottom: `1px solid ${border}` }}>{row.crew_member_name || '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', borderBottom: `1px solid ${border}` }}>{row.strip_callsign || '—'}</td>
                  <td style={{ padding: '7px 10px', color: muted, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px solid ${border}` }} title={detailStr}>{detailStr || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px', justifyContent: 'center', alignItems: 'center' }}>
          <button onClick={() => { const p = Math.max(0, page - 1); setPage(p); fetchLog(p); }} disabled={page === 0} style={{ ...inputStyle, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1, padding: '4px 10px' }}>◀</button>
          <span style={{ color: muted, fontSize: '12px' }}>{page + 1} / {totalPages}</span>
          <button onClick={() => { const p = Math.min(totalPages - 1, page + 1); setPage(p); fetchLog(p); }} disabled={page >= totalPages - 1} style={{ ...inputStyle, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1, padding: '4px 10px' }}>▶</button>
        </div>
      )}
    </div>
  );
};

// ─── Civilian Strips Admin (admin tab component) ─────────────────────────────
export const CivilianStripsAdmin = () => {
  const [presets, setPresets] = useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [strips, setStrips] = useState<any[]>([]);
  const [civCols, setCivCols] = useState<CivCol[]>([]);
  const [assignments, setAssignments] = useState<CivAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addToCol, setAddToCol] = useState('');
  const [newStrip, setNewStrip] = useState({ callSign: '', unit: '', civ_fl: '', civ_stand: '', civ_dest: '', civ_time: '', civ_route: '', civ_ssr: '', civ_runway: '', civ_status: 'CLR' });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  React.useEffect(() => {
    fetch(`${API_URL}/workstation-presets`).then(r => r.ok ? r.json() : []).then((data: any[]) => {
      const civPresets = data.filter(p => p.preset_type === 'civilian');
      setPresets(civPresets);
      if (civPresets.length > 0) setSelectedPresetId(civPresets[0].id);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!selectedPresetId) return;
    setLoading(true);
    const preset = presets.find(p => p.id === selectedPresetId);
    const cols: CivCol[] = Array.isArray(preset?.civilian_columns) ? preset.civilian_columns : [];
    setCivCols(cols);
    Promise.all([
      fetch(`${API_URL}/civ-strips?preset_id=${selectedPresetId}`).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/civilian-assignments?preset_id=${selectedPresetId}`).then(r => r.ok ? r.json() : []),
    ]).then(([stripsData, assignData]) => {
      setStrips(Array.isArray(stripsData) ? stripsData : []);
      setAssignments(Array.isArray(assignData) ? assignData : []);
    }).finally(() => setLoading(false));
  }, [selectedPresetId, presets]);

  const updateField = (id: string, field: string, val: string) => {
    setStrips(prev => prev.map(s => String(s.id) === id ? { ...s, [field]: val } : s));
    fetch(`${API_URL}/strips/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: val }) }).catch(() => {});
  };

  const deleteStrip = async (id: string) => {
    await fetch(`${API_URL}/civ-strips/${id}`, { method: 'DELETE' });
    setStrips(prev => prev.filter(s => String(s.id) !== id));
    setAssignments(prev => prev.filter(a => String(a.strip_id) !== id));
  };

  const addStrip = async () => {
    if (!selectedPresetId || !newStrip.callSign.trim()) return;
    try {
      const res = await fetch(`${API_URL}/civ-strips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newStrip, preset_id: selectedPresetId, col_key: addToCol }),
      });
      const strip = await res.json();
      setStrips(prev => [...prev, strip]);
      if (addToCol) {
        setAssignments(prev => [...prev, { id: Date.now(), strip_id: strip.id, preset_id: selectedPresetId, col_key: addToCol, sub_col: '', sort_order: 0 }]);
      }
      setNewStrip({ callSign: '', unit: '', civ_fl: '', civ_stand: '', civ_dest: '', civ_time: '', civ_route: '', civ_ssr: '', civ_runway: '', civ_status: 'CLR' });
      setShowAddForm(false);
    } catch (e) { console.error(e); }
  };

  const handleAssign = (stripId: string, colKey: string, subCol = '') => {
    setAssignments(prev => {
      const without = prev.filter(a => String(a.strip_id) !== stripId);
      return [...without, { id: Date.now(), strip_id: Number(stripId), preset_id: selectedPresetId!, col_key: colKey, sub_col: subCol, sort_order: 0 }];
    });
    fetch(`${API_URL}/civilian-assignments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strip_id: stripId, preset_id: selectedPresetId, col_key: colKey, sub_col: subCol, sort_order: 0 }),
    }).catch(() => {});
  };

  const allCols: CivCol[] = [...civCols, { key: '__queue__', label: 'תור (לא משויך)', color: '#475569' }];

  const getStripsInCol = (colKey: string, subCol = '') => {
    const assigned = assignments.filter(a => a.col_key === colKey && a.sub_col === subCol);
    return assigned.sort((a, b) => a.sort_order - b.sort_order).map(a => strips.find(s => Number(s.id) === Number(a.strip_id))).filter(Boolean);
  };

  const getUnassigned = () => {
    const assignedIds = new Set(assignments.map(a => Number(a.strip_id)));
    return strips.filter(s => !assignedIds.has(Number(s.id)));
  };

  const fieldStyle: React.CSSProperties = { background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: 'white', padding: '4px 8px', fontSize: '11px', fontFamily: 'monospace', outline: 'none' };

  if (presets.length === 0) return (
    <div style={{ textAlign: 'center', color: '#64748b', padding: '40px', fontSize: '14px' }}>
      אין עמדות מסוג ✈ אזרחי.<br />
      <span style={{ fontSize: '12px' }}>צור עמדה עם סוג "✈ אזרחי" בטאב עמדות.</span>
    </div>
  );

  return (
    <div style={{ direction: 'ltr' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select
          value={selectedPresetId || ''}
          onChange={e => setSelectedPresetId(Number(e.target.value))}
          style={{ ...fieldStyle, padding: '6px 10px', fontSize: '13px' }}
        >
          {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <button
          onClick={() => { setShowAddForm(true); setAddToCol(civCols[0]?.key || ''); }}
          style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}
        >+ NEW STRIP</button>

        {loading && <span style={{ color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>LOADING...</span>}
        <span style={{ color: '#475569', fontSize: '11px', fontFamily: 'monospace' }}>{strips.length} STRIPS</span>
        <button
          style={{ marginLeft: 'auto', background: '#0f2744', color: '#7dd3fc', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => {
            const preset = presets.find(p => p.id === selectedPresetId);
            const colMap = Object.fromEntries(assignments.map(a => [String(a.strip_id), a.col_key]));
            const cols = ['CALLSIGN','AIRLINE','FL','STAND','GATE','TIME','SSR','RWY','STATUS','ROUTE','COLUMN'];
            const rows = strips.map(s => [
              s.callSign || '', s.unit || '', s.civ_fl || '', s.civ_stand || '', s.civ_dest || '',
              s.civ_time || '', s.civ_ssr || '', s.civ_runway || '', s.civ_status || '',
              s.civ_route || '', colMap[String(s.id)] || ''
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            const csv = [cols.join(','), ...rows].join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `civ-strips-${preset?.name || 'export'}-${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          title="ייצא סטריפים אזרחיים ל-CSV"
        >
          <span>↓</span> סטריפים אזרחי
        </button>
      </div>

      {/* Add strip form */}
      {showAddForm && (
        <div style={{ background: '#0a111f', border: '1px solid #1e3a5f', borderRadius: '6px', padding: '12px', marginBottom: '14px' }}>
          <div style={{ color: '#60a5fa', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace', marginBottom: '10px', letterSpacing: '1px' }}>NEW STRIP</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
            {[
              { label: 'CALLSIGN', field: 'callSign', w: '90px' },
              { label: 'AIRLINE', field: 'unit', w: '90px' },
              { label: 'FL', field: 'civ_fl', w: '50px' },
              { label: 'STAND', field: 'civ_stand', w: '50px' },
              { label: 'GATE', field: 'civ_dest', w: '40px' },
              { label: 'TIME', field: 'civ_time', w: '55px' },
              { label: 'SSR', field: 'civ_ssr', w: '55px' },
              { label: 'RWY', field: 'civ_runway', w: '45px' },
            ].map(({ label, field, w }) => (
              <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ color: '#475569', fontSize: '9px', fontFamily: 'monospace', letterSpacing: '1px' }}>{label}</label>
                <input
                  value={(newStrip as any)[field]}
                  onChange={e => setNewStrip(prev => ({ ...prev, [field]: e.target.value }))}
                  style={{ ...fieldStyle, width: w }}
                  placeholder={label}
                />
              </div>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ color: '#475569', fontSize: '9px', fontFamily: 'monospace', letterSpacing: '1px' }}>STATUS</label>
              <select value={newStrip.civ_status} onChange={e => setNewStrip(prev => ({ ...prev, civ_status: e.target.value }))} style={{ ...fieldStyle, width: '65px' }}>
                {CIV_STATUSES.filter(s => s.key).map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ color: '#475569', fontSize: '9px', fontFamily: 'monospace', letterSpacing: '1px' }}>COLUMN</label>
              <select value={addToCol} onChange={e => setAddToCol(e.target.value)} style={{ ...fieldStyle, width: '130px' }}>
                <option value="">— unassigned —</option>
                {civCols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '160px' }}>
              <label style={{ color: '#475569', fontSize: '9px', fontFamily: 'monospace', letterSpacing: '1px' }}>ROUTE</label>
              <input value={newStrip.civ_route} onChange={e => setNewStrip(prev => ({ ...prev, civ_route: e.target.value }))} style={{ ...fieldStyle, width: '100%' }} placeholder="ROUTE..." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button onClick={addStrip} style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 16px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }}>ADD</button>
            <button onClick={() => setShowAddForm(false)} style={{ background: '#374151', color: '#94a3b8', border: 'none', borderRadius: '4px', padding: '5px 14px', cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace' }}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Board — same multi-column layout as CivilianView */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '1px', overflow: 'auto', background: '#07090c', borderRadius: '4px', padding: '2px', minHeight: '400px' }}>
        {allCols.map(col => {
          const colStrips = col.key === '__queue__' ? getUnassigned() : getStripsInCol(col.key);
          const dropKey = `${col.key}:`;
          const colCount = colStrips.length;
          return (
            <div key={col.key} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '170px', maxWidth: '220px', borderRight: '1px solid #0a0f1a', overflow: 'hidden' }}>
              {/* Column header */}
              <div style={{ background: col.key === '__queue__' ? '#1e293b' : (col.color || '#1e3a5f'), padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #0a0f1a', flexShrink: 0 }}>
                <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  {col.key !== '__queue__' && (
                    <button
                      onClick={() => { setShowAddForm(true); setAddToCol(col.key); }}
                      style={{ background: 'rgba(255,255,255,0.15)', color: '#ffffff', border: 'none', borderRadius: '2px', padding: '0 5px', cursor: 'pointer', fontSize: '12px', lineHeight: '16px', fontWeight: 'bold' }}
                      title="הוסף סטריפ לעמודה"
                    >+</button>
                  )}
                  <span style={{ background: 'rgba(0,0,0,0.35)', color: '#ffffff', fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace', borderRadius: '2px', padding: '0 5px', minWidth: '18px', textAlign: 'center' }}>{colCount}</span>
                </div>
              </div>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOverKey(dropKey); }}
                onDragLeave={() => setDragOverKey(null)}
                onDrop={e => { e.preventDefault(); if (draggingId) handleAssign(draggingId, col.key, ''); setDraggingId(null); setDragOverKey(null); }}
                style={{ flex: 1, overflowY: 'auto', padding: '3px', background: dragOverKey === dropKey ? '#1a2232' : '#07090c', transition: 'background 0.1s' }}
              >
                {colStrips.map((s: any) => (
                  <CivilianStripCard
                    key={s.id}
                    strip={s}
                    onUpdateField={updateField}
                    colColor={col.color}
                    onDragStart={(e, id) => { e.dataTransfer.setData('text/plain', id); setDraggingId(id); }}
                    onDelete={deleteStrip}
                  />
                ))}
                {colStrips.length === 0 && (
                  <div style={{ color: '#1e3040', fontSize: '10px', textAlign: 'center', marginTop: '20px', letterSpacing: '1px', fontFamily: 'monospace' }}>EMPTY</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Default Names Manager (admin tab component) ────────────────────────────
export const DefaultNamesManager = () => {
  const [defArmNames, setDefArmNames] = useState<any[]>([]);
  const [defSysNames, setDefSysNames] = useState<any[]>([]);
  const [newArmName, setNewArmName] = useState('');
  const [newSysName, setNewSysName] = useState('');
  const [dnLoading, setDnLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/default-armament-names`).then(r => r.ok ? r.json() : []),
      fetch(`${API_URL}/default-system-names`).then(r => r.ok ? r.json() : [])
    ]).then(([arms, syss]) => { setDefArmNames(arms); setDefSysNames(syss); setDnLoading(false); }).catch(() => setDnLoading(false));
  }, []);
  const addArm = () => {
    if (!newArmName.trim()) return;
    fetch(`${API_URL}/default-armament-names`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newArmName.trim() }) })
      .then(r => r.ok ? r.json() : null).then(row => { if (row?.id) setDefArmNames(prev => [...prev, row]); setNewArmName(''); }).catch(() => {});
  };
  const deleteArm = (id: number) => {
    fetch(`${API_URL}/default-armament-names/${id}`, { method: 'DELETE' }).then(() => setDefArmNames(prev => prev.filter((r: any) => r.id !== id))).catch(() => {});
  };
  const addSys = () => {
    if (!newSysName.trim()) return;
    fetch(`${API_URL}/default-system-names`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSysName.trim() }) })
      .then(r => r.ok ? r.json() : null).then(row => { if (row?.id) setDefSysNames(prev => [...prev, row]); setNewSysName(''); }).catch(() => {});
  };
  const deleteSys = (id: number) => {
    fetch(`${API_URL}/default-system-names/${id}`, { method: 'DELETE' }).then(() => setDefSysNames(prev => prev.filter((r: any) => r.id !== id))).catch(() => {});
  };
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', background: '#0f172a', borderRadius: '6px', marginBottom: '4px' };
  const inpStyle: React.CSSProperties = { flex: 1, padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '13px', direction: 'rtl', outline: 'none' };
  return (
    <div style={{ padding: '20px', direction: 'rtl', color: 'white' }}>
      <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#38bdf8' }}>🚀 שמות חימושים ומערכות — ברירת מחדל</h2>
      <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 24px 0' }}>שמות אלה יופיעו כהצעות השלמה אוטומטית בעת הזנת חימושים ומערכות בעמדת מגרש.</p>
      {dnLoading ? <div style={{ color: '#64748b' }}>טוען...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <h3 style={{ fontSize: '14px', color: '#f59e0b', margin: '0 0 12px 0' }}>🚀 שמות חימושים</h3>
            {defArmNames.map((row: any) => (
              <div key={row.id} style={rowStyle}>
                <span style={{ flex: 1, fontSize: '13px' }}>{row.name}</span>
                <button onClick={() => deleteArm(row.id)} style={{ padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
              </div>
            ))}
            {defArmNames.length === 0 && <div style={{ fontSize: '12px', color: '#475569', padding: '8px' }}>אין שמות מוגדרים</div>}
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <input value={newArmName} onChange={e => setNewArmName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addArm()} placeholder="שם חימוש חדש" style={inpStyle} />
              <button onClick={addArm} style={{ padding: '5px 14px', background: '#d97706', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>+ הוסף</button>
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '14px', color: '#2dd4bf', margin: '0 0 12px 0' }}>⚙ שמות מערכות</h3>
            {defSysNames.map((row: any) => (
              <div key={row.id} style={rowStyle}>
                <span style={{ flex: 1, fontSize: '13px' }}>{row.name}</span>
                <button onClick={() => deleteSys(row.id)} style={{ padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
              </div>
            ))}
            {defSysNames.length === 0 && <div style={{ fontSize: '12px', color: '#475569', padding: '8px' }}>אין שמות מוגדרים</div>}
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <input value={newSysName} onChange={e => setNewSysName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSys()} placeholder="שם מערכת חדש" style={inpStyle} />
              <button onClick={addSys} style={{ padding: '5px 14px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>+ הוסף</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Strip Grid Card Layout Editor ---
export const StripGridEditor = ({ tableId, tableName, apiUrl, onClose, onSaved }: { tableId: number; tableName: string; apiUrl: string; onClose: () => void; onSaved: (updated: any) => void }) => {
  const [tree, setTree] = useState<SGNode>(sgDefaultCell());
  const [conditions, setConditions] = useState<SGCondition[]>([]);
  const [stripHeight, setStripHeight] = useState(48);
  const [selCellId, setSelCellId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'layout'|'conditions'>('layout');
  const dragRef = React.useRef<{ splitId: string; idx: number; startPos: number; startSizes: number[]; dir: 'h'|'v'; containerPx: number } | null>(null);
  const heightDragRef = React.useRef<{ startY: number; startH: number } | null>(null);
  const [propsPanelHeight, setPropsPanelHeight] = useState(220);
  const propsDragRef = React.useRef<{ startY: number; startH: number } | null>(null);

  React.useEffect(() => {
    fetch(`${apiUrl}/classic-strip-tables`).then(r => r.ok ? r.json() : []).then((tables: any[]) => {
      const t = tables.find((x: any) => x.id === tableId);
      if (t?.layout_json) setTree(t.layout_json);
      if (t?.conditions_json) setConditions(t.conditions_json);
      if (t?.strip_height) setStripHeight(t.strip_height);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [tableId, apiUrl]);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const pos = d.dir === 'h' ? e.clientX : e.clientY;
      const pctDelta = ((pos - d.startPos) / d.containerPx) * 100;
      const total = d.startSizes[d.idx] + d.startSizes[d.idx + 1];
      const newA = Math.max(5, Math.min(total - 5, d.startSizes[d.idx] + pctDelta));
      setTree(prev => sgUpdate(prev, d.splitId, (n: SGSplit) => { const ns = [...n.sizes]; ns[d.idx] = newA; ns[d.idx + 1] = total - newA; return { ...n, sizes: ns }; }));
      setDirty(true);
    };
    const onUp = () => { dragRef.current = null; propsDragRef.current = null; if (heightDragRef.current) { heightDragRef.current = null; setDirty(true); } };
    const onMoveAll = (e: MouseEvent) => {
      onMove(e);
      const hd = heightDragRef.current;
      if (hd) { const delta = e.clientY - hd.startY; setStripHeight(Math.max(24, Math.min(200, hd.startH + delta))); }
      const pd = propsDragRef.current;
      if (pd) { const delta = pd.startY - e.clientY; setPropsPanelHeight(Math.max(60, Math.min(520, pd.startH + delta))); }
    };
    document.addEventListener('mousemove', onMoveAll); document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMoveAll); document.removeEventListener('mouseup', onUp); };
  }, []);

  const mutate = (fn: (t: SGNode) => SGNode) => { setTree(fn); setDirty(true); };
  const selCell = React.useMemo(() => { if (!selCellId) return null; const cells = sgGetAllCells(tree); return cells.find(c => c.id === selCellId) || null; }, [tree, selCellId]);

  const FIELDS = CLASSIC_STRIP_FIELDS;

  const renderEditorNode = (node: SGNode, parentSplit?: SGSplit): React.ReactNode => {
    if (node.type === 'cell') {
      const cell = node as SGCell;
      const isSel = selCellId === cell.id;
      const val = FIELDS.find(f => f.key === cell.fieldKey)?.label || (cell.fieldKey || '— ריק —');
      return (
        <div key={cell.id} onClick={e => { e.stopPropagation(); setSelCellId(cell.id); }} title={cell.hint || undefined}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '36px', minWidth: '40px', background: cell.bgColor || '#1e293b', border: `2px solid ${isSel ? '#3b82f6' : '#334155'}`, borderRadius: '3px', cursor: 'pointer', position: 'relative', gap: '2px', padding: '2px', overflow: 'hidden' }}>
          {cell.showTitle && (
            <span style={{ fontSize: `${Math.min(cell.titleFontSize || 10, 11)}px`, color: cell.titleColor || '#93c5fd', background: cell.titleBg || 'transparent', fontWeight: cell.titleBold ? 'bold' : 'normal', textAlign: cell.titleAlign || 'center', borderRadius: '2px', padding: '0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{(cell.titleText && cell.titleText.trim()) ? cell.titleText : val}</span>
          )}
          <span style={{ fontSize: '11px', color: cell.textColor || '#e2e8f0', fontWeight: cell.bold ? 'bold' : 'normal', fontStyle: cell.italic ? 'italic' : 'normal', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{cell.hint ? `${val} 💬` : val}</span>
          {isSel && (
            <div style={{ display: 'flex', gap: '2px', position: 'absolute', bottom: '1px', left: 0, right: 0, justifyContent: 'center' }}>
              <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); mutate(t => sgSplit(t, cell.id, 'h')); }} title="פצל אופקי" style={{ fontSize: '9px', padding: '1px 3px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', lineHeight: 1 }}>⟺</button>
              <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); mutate(t => sgSplit(t, cell.id, 'v')); }} title="פצל אנכי" style={{ fontSize: '9px', padding: '1px 3px', background: '#0e7490', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', lineHeight: 1 }}>⇅</button>
              {parentSplit && <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); mutate(t => sgRemove(t, cell.id)); setSelCellId(null); }} title="הסר" style={{ fontSize: '9px', padding: '1px 3px', background: '#7f1d1d', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', lineHeight: 1 }}>✕</button>}
            </div>
          )}
        </div>
      );
    }
    const split = node as SGSplit;
    return (
      <div key={split.id} style={{ display: 'flex', flexDirection: split.direction === 'h' ? 'row' : 'column', flex: 1, gap: '2px', overflow: 'hidden', direction: split.direction === 'h' ? 'ltr' : undefined }}>
        {split.children.map((child, i) => (
          <React.Fragment key={child.id}>
            <div style={{ [split.direction === 'h' ? 'width' : 'height']: `${split.sizes[i] ?? (100 / split.children.length)}%`, display: 'flex', overflow: 'hidden' }}>
              {renderEditorNode(child, split)}
            </div>
            {i < split.children.length - 1 && (
              <div
                onMouseDown={e => {
                  e.preventDefault();
                  const container = (e.currentTarget as HTMLElement).parentElement!;
                  const rect = container.getBoundingClientRect();
                  dragRef.current = { splitId: split.id, idx: i, startPos: split.direction === 'h' ? e.clientX : e.clientY, startSizes: [...split.sizes], dir: split.direction, containerPx: split.direction === 'h' ? rect.width : rect.height };
                }}
                style={{ [split.direction === 'h' ? 'width' : 'height']: '4px', [split.direction === 'h' ? 'height' : 'width']: '100%', background: '#475569', cursor: split.direction === 'h' ? 'col-resize' : 'row-resize', flexShrink: 0, borderRadius: '2px' }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${apiUrl}/classic-strip-tables/${tableId}/layout`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout_json: tree, conditions_json: conditions, strip_height: stripHeight }),
      });
      if (r.ok) { const updated = await r.json(); onSaved(updated); setDirty(false); }
    } finally { setSaving(false); }
  };

  const clearLayout = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${apiUrl}/classic-strip-tables/${tableId}/layout`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout_json: null, conditions_json: null }),
      });
      if (r.ok) { const updated = await r.json(); onSaved(updated); setTree(sgDefaultCell()); setConditions([]); setDirty(false); }
    } finally { setSaving(false); }
  };

  const addCondition = () => setConditions(prev => [...prev, { id: sgGenId(), query: null, target: 'strip', styleBg: '', styleText: '' }]);
  const updateCondition = (id: string, changes: Partial<SGCondition>) => setConditions(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
  const removeCondition = (id: string) => setConditions(prev => prev.filter(c => c.id !== id));

  const previewStrip = { callSign: 'F-16', sq: '101', alt: 'FL200', task: 'CAS', takeoff_time: '0800', notes: 'הערה', status: 'active', sector: 'מרחב' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: '12px', width: '90vw', maxWidth: '960px', height: '80vh', display: 'flex', flexDirection: 'column', color: '#e2e8f0', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1e3a5f', gap: '12px' }}>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#93c5fd' }}>📐 עורך גריד — {tableName}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {dirty && <span style={{ fontSize: '12px', color: '#fbbf24' }}>● שינויים לא שמורים</span>}
            <button onClick={clearLayout} title="נקה גריד" style={{ padding: '5px 12px', background: '#7f1d1d', color: '#fecaca', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>🗑 נקה גריד</button>
            <button onClick={save} disabled={saving} style={{ padding: '5px 14px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>{saving ? '...' : '💾 שמור'}</button>
            <button onClick={onClose} style={{ padding: '5px 10px', background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>✕ סגור</button>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #1e3a5f' }}>
          {([['layout','📐 תצורת גריד'],['conditions','🎨 פורמט מותנה']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 18px', background: activeTab === tab ? '#1e3a5f' : 'transparent', color: activeTab === tab ? '#93c5fd' : '#64748b', border: 'none', borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === tab ? 'bold' : 'normal' }}>{label}</button>
          ))}
        </div>
        {loading ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>טוען...</div> : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {activeTab === 'layout' && (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Preview side panel — fixed width, no resize */}
                <div style={{ width: '260px', flexShrink: 0, borderInlineEnd: '1px solid #1e3a5f', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto', background: '#070e1a' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>תצוגה מקדימה</div>
                  <div style={{ userSelect: 'none' }}>
                    <ClassicStripCard strip={previewStrip} rows={[]} lightMode={false} layoutJson={tree} conditionsJson={conditions} stripHeight={stripHeight} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>גובה (px):</label>
                    <input type="number" min={24} max={200} value={stripHeight}
                      onChange={e => { setStripHeight(Math.max(24, Math.min(200, Number(e.target.value)))); setDirty(true); }}
                      style={{ width: '58px', padding: '3px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px' }} />
                    <span style={{ fontSize: '10px', color: '#475569' }}>גרור ← בגריד</span>
                  </div>
                </div>
                {/* Main: editor grid + resizable properties panel */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Editor grid */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 12px 0', gap: '6px', overflow: 'hidden', minHeight: 0 }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>לחץ על תא לבחירה • ⟺ פצל אופקי • ⇅ פצל אנכי • ✕ הסר</div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #334155', borderRadius: '6px', background: '#0f172a', minHeight: 0 }}>
                      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, direction: 'ltr' }}>
                        {renderEditorNode(tree)}
                      </div>
                      {/* Strip height drag handle — drag down = taller strip */}
                      <div
                        onMouseDown={e => { e.preventDefault(); heightDragRef.current = { startY: e.clientY, startH: stripHeight }; }}
                        style={{ height: '9px', background: '#0a1820', borderTop: '2px solid #1e3a5f', cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', flexShrink: 0 }}
                        title={`גרור לשינוי גובה סטריפ (${stripHeight}px) — למטה = גדול יותר`}
                      >
                        <div style={{ width: '44px', height: '3px', background: '#3b82f6', borderRadius: '2px', opacity: 0.7 }} />
                      </div>
                    </div>
                  </div>
                  {/* Drag divider — drag UP to expand properties panel */}
                  <div
                    onMouseDown={e => { e.preventDefault(); propsDragRef.current = { startY: e.clientY, startH: propsPanelHeight }; }}
                    style={{ height: '8px', background: '#060d18', borderTop: '2px solid #1e3a5f', cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', flexShrink: 0 }}
                    title="גרור למעלה/למטה לשינוי גובה פאנל הגדרות השדה"
                  >
                    <div style={{ width: '36px', height: '3px', background: '#475569', borderRadius: '2px' }} />
                  </div>
                  {/* Properties panel — resizable bottom */}
                  <div style={{ height: propsPanelHeight, flexShrink: 0, overflow: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: 'none' }}>
                  {selCell ? (
                    <>
                      {(() => {
                        const sumStyle: React.CSSProperties = { cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1', padding: '5px 8px', background: '#0f172a', borderRadius: '6px', listStyle: 'none', userSelect: 'none' };
                        const bodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 4px 2px' };
                        const lbl: React.CSSProperties = { fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' };
                        const fieldLabel = FIELDS.find(f => f.key === selCell.fieldKey)?.label || '';
                        return (
                      <>
                      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#93c5fd' }}>✏ תא נבחר</div>

                      {/* 📝 שדה */}
                      <details open style={{ border: '1px solid #1e3a5f', borderRadius: '8px' }}>
                        <summary style={sumStyle}>📝 שדה</summary>
                        <div style={bodyStyle}>
                          <select value={selCell.fieldKey} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, fieldKey: e.target.value })))}
                            style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                            {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                        </div>
                      </details>

                      {/* 🔠 כותרת */}
                      <details style={{ border: '1px solid #1e3a5f', borderRadius: '8px' }}>
                        <summary style={sumStyle}>🔠 כותרת {selCell.showTitle ? '●' : ''}</summary>
                        <div style={bodyStyle}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!selCell.showTitle} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, showTitle: e.target.checked })))} />
                            הצג כותרת לשדה
                          </label>
                          {selCell.showTitle && <>
                            <div>
                              <label style={lbl}>טקסט כותרת (ריק = שם השדה):</label>
                              <input type="text" value={selCell.titleText ?? ''} placeholder={fieldLabel} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, titleText: e.target.value })))}
                                style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <div style={{ flex: 1 }}><label style={lbl}>רקע כותרת:</label>
                                <input type="color" value={selCell.titleBg || '#0f2744'} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, titleBg: e.target.value })))} style={{ width: '100%', height: '26px', padding: '1px', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                              <div style={{ flex: 1 }}><label style={lbl}>צבע טקסט:</label>
                                <input type="color" value={selCell.titleColor || '#93c5fd'} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, titleColor: e.target.value })))} style={{ width: '100%', height: '26px', padding: '1px', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                              <div style={{ flex: 1 }}><label style={lbl}>גופן (px):</label>
                                <input type="number" min={7} max={20} value={selCell.titleFontSize || 10} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, titleFontSize: Number(e.target.value) })))} style={{ width: '100%', padding: '4px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px' }} /></div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer', paddingBottom: '5px' }}>
                                <input type="checkbox" checked={!!selCell.titleBold} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, titleBold: e.target.checked })))} /><b>B</b>
                              </label>
                            </div>
                            <div><label style={lbl}>יישור כותרת:</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {(['right','center','left'] as const).map(a => (
                                  <button key={a} onClick={() => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, titleAlign: a })))}
                                    style={{ flex: 1, padding: '4px', background: (selCell.titleAlign || 'center') === a ? '#1d4ed8' : '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '12px' }}>{a === 'right' ? '→' : a === 'left' ? '←' : '↔'}</button>
                                ))}
                              </div>
                            </div>
                          </>}
                        </div>
                      </details>

                      {/* 🎨 סגנון תוכן */}
                      <details open style={{ border: '1px solid #1e3a5f', borderRadius: '8px' }}>
                        <summary style={sumStyle}>🎨 סגנון תוכן</summary>
                        <div style={bodyStyle}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}><label style={lbl}>רקע:</label>
                              <input type="color" value={selCell.bgColor || '#1e293b'} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, bgColor: e.target.value })))} style={{ width: '100%', height: '28px', padding: '1px', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                            <div style={{ flex: 1 }}><label style={lbl}>צבע טקסט:</label>
                              <input type="color" value={selCell.textColor || '#e2e8f0'} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, textColor: e.target.value })))} style={{ width: '100%', height: '28px', padding: '1px', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                          </div>
                          <div>
                            <label style={lbl}>רקע טקסט <span style={{ fontSize: '10px', color: '#475569' }}>(highlight)</span>:</label>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input type="color" value={selCell.textBgColor || '#facc15'} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, textBgColor: e.target.value })))} style={{ flex: 1, height: '28px', padding: '1px', border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                              {selCell.textBgColor && (<button onClick={() => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, textBgColor: undefined })))} style={{ padding: '3px 7px', background: '#334155', color: '#94a3b8', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }} title="הסר רקע טקסט">✕</button>)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1 }}><label style={lbl}>גופן (px):</label>
                              <input type="number" min={8} max={24} value={selCell.fontSize || 12} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, fontSize: Number(e.target.value) })))} style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px' }} /></div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer', paddingBottom: '5px' }}><input type="checkbox" checked={!!selCell.bold} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, bold: e.target.checked })))} /><b>B</b></label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer', paddingBottom: '5px' }}><input type="checkbox" checked={!!selCell.italic} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, italic: e.target.checked })))} /><i>I</i></label>
                          </div>
                          <div><label style={lbl}>יישור:</label>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {(['right','center','left'] as const).map(a => (
                                <button key={a} onClick={() => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, textAlign: a })))} style={{ flex: 1, padding: '4px', background: selCell.textAlign === a ? '#1d4ed8' : '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '12px' }}>{a === 'right' ? '→' : a === 'left' ? '←' : '↔'}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </details>

                      {/* ✨ הבהוב */}
                      <details style={{ border: '1px solid #1e3a5f', borderRadius: '8px' }}>
                        <summary style={sumStyle}>✨ הבהוב {selCell.blink ? '●' : ''}</summary>
                        <div style={bodyStyle}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#fbbf24', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!selCell.blink} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, blink: e.target.checked })))} /> ✦ הפעל הבהוב
                          </label>
                          {selCell.blink && <>
                            <div><label style={lbl}>צבע הבהוב:</label>
                              <input type="color" value={selCell.blinkColor || '#ef4444'} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, blinkColor: e.target.value })))} style={{ width: '100%', height: '26px', padding: '1px', border: 'none', borderRadius: '4px', cursor: 'pointer' }} /></div>
                            <div><label style={lbl}>קצב (שניות):</label>
                              <input type="number" min={0.2} max={5} step={0.1} value={selCell.blinkRate || 0.8} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, blinkRate: Number(e.target.value) })))} style={{ width: '100%', padding: '4px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px' }} /></div>
                          </>}
                        </div>
                      </details>

                      {/* 💬 Hint */}
                      <details style={{ border: '1px solid #1e3a5f', borderRadius: '8px' }}>
                        <summary style={sumStyle}>💬 Hint {selCell.hint ? '●' : ''}</summary>
                        <div style={bodyStyle}>
                          <label style={lbl}>טקסט עזרה בריחוף (tooltip):</label>
                          <textarea value={selCell.hint ?? ''} onChange={e => mutate(t => sgUpdate(t, selCell.id, (n: SGCell) => ({ ...n, hint: e.target.value })))} rows={2} placeholder="טקסט חופשי שיופיע בריחוף מעל התא"
                            style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', direction: 'rtl', resize: 'vertical' }} />
                        </div>
                      </details>
                      </>
                        );
                      })()}
                    </>
                  ) : (
                    <div style={{ color: '#475569', fontSize: '12px', paddingTop: '20px', textAlign: 'center' }}>לחץ על תא לעריכת מאפייניו</div>
                  )}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'conditions' && (
              <div style={{ flex: 1, padding: '16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', direction: 'rtl' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 'bold' }}>כללי עיצוב מותנה</span>
                  <button onClick={() => { addCondition(); setDirty(true); }} style={{ padding: '5px 12px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>+ הוסף כלל</button>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', background: '#0f172a', borderRadius: '6px', padding: '8px 10px' }}>
                  כל כלל בונה שאילתת תנאים מלאה. כאשר הפ"מ עונה על כל התנאים — העיצוב שנקבע מוחל על הכרטיס או על תא ספציפי.
                </div>
                {conditions.length === 0 && <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '20px' }}>אין כללים. לחץ "הוסף כלל" כדי להוסיף.</div>}
                {conditions.map(c => {
                  const allCells = sgGetAllCells(tree);
                  return (
                    <div key={c.id} style={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 'bold' }}>כלל עיצוב</span>
                        <button onClick={() => { removeCondition(c.id); setDirty(true); }} style={{ padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✕ מחק</button>
                      </div>
                      {/* Query Builder */}
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '-4px' }}>תנאי השאילתה:</div>
                      <QBuilderCtx.Provider value={{ presetNames: [] }}>
                        <QGroupEditor
                          group={c.query || emptyQGroup()}
                          isRoot
                          onUpdate={g => { updateCondition(c.id, { query: hasConditions(g) ? g : null }); setDirty(true); }}
                        />
                      </QBuilderCtx.Provider>
                      {/* Target + Style */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>החל על:</span>
                        <select value={c.target} onChange={e => { updateCondition(c.id, { target: e.target.value as any, targetCellId: undefined }); setDirty(true); }}
                          style={{ padding: '4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                          <option value="strip">כל הכרטיס</option>
                          <option value="all">כל התאים</option>
                          <option value="cell">תא ספציפי</option>
                        </select>
                        {c.target === 'cell' && (
                          <select value={c.targetCellId || ''} onChange={e => { updateCondition(c.id, { targetCellId: e.target.value }); setDirty(true); }}
                            style={{ padding: '4px 6px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', direction: 'rtl' }}>
                            <option value="">— בחר תא —</option>
                            {allCells.map((cell, ci) => <option key={cell.id} value={cell.id}>{FIELDS.find(f => f.key === cell.fieldKey)?.label || `תא ${ci+1}`}</option>)}
                          </select>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                          רקע: <input type="color" value={c.styleBg || '#1e293b'} onChange={e => { updateCondition(c.id, { styleBg: e.target.value }); setDirty(true); }}
                            style={{ width: '28px', height: '22px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer' }} />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                          טקסט: <input type="color" value={c.styleText || '#e2e8f0'} onChange={e => { updateCondition(c.id, { styleText: e.target.value }); setDirty(true); }}
                            style={{ width: '28px', height: '22px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer' }} />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#fbbf24', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!c.blink} onChange={e => { updateCondition(c.id, { blink: e.target.checked }); setDirty(true); }} />
                          ✦ הבהוב
                        </label>
                        {c.blink && <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                            צבע הבהוב: <input type="color" value={c.blinkColor || '#ef4444'} onChange={e => { updateCondition(c.id, { blinkColor: e.target.value }); setDirty(true); }}
                              style={{ width: '28px', height: '22px', padding: '1px', border: 'none', borderRadius: '3px', cursor: 'pointer' }} />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                            קצב (ש׳): <input type="number" min={0.2} max={5} step={0.1} value={c.blinkRate || 0.8} onChange={e => { updateCondition(c.id, { blinkRate: Number(e.target.value) }); setDirty(true); }}
                              style={{ width: '52px', padding: '2px 4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '11px' }} />
                          </label>
                        </>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Strip Window Layout Builder ---
// SW types/helpers imported from ../../utils/stripWindow

export const ClosuresManager = () => {
  const API = typeof API_URL !== 'undefined' ? API_URL : '/api';
  interface Closure {
    id: number; name: string; category: string; color: string;
    alt_min: number | null; alt_max: number | null;
    dates: string[]; time_start: string; time_end: string;
    closure_status: string; active: boolean;
    polygon_geo: { lat: number; lon: number }[];
  }
  const emptyForm = (): Omit<Closure, 'id'> => ({
    name: '', category: '', color: '#ef4444', alt_min: null, alt_max: null,
    dates: [], time_start: '', time_end: '',
    closure_status: 'coordinated', active: true, polygon_geo: []
  });
  const [closures, setClosures] = React.useState<Closure[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [editId, setEditId] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<Omit<Closure, 'id'>>(emptyForm());
  const [showForm, setShowForm] = React.useState(false);
  const [dateInput, setDateInput] = React.useState('');
  const [polyInput, setPolyInput] = React.useState<{ lat: string; lon: string }>({ lat: '', lon: '' });
  const [importRows, setImportRows] = React.useState<any[] | null>(null);
  const [importing, setImporting] = React.useState(false);
  const importFileRef = React.useRef<HTMLInputElement>(null);

  const HEBREW_COLORS: Record<string, string> = {
    'סגול': '#a855f7', 'אדום': '#ef4444', 'צהוב': '#eab308', 'כחול': '#3b82f6',
    'ירוק': '#22c55e', 'כתום': '#f97316', 'ורוד': '#ec4899', 'אפור': '#64748b',
    'לבן': '#f1f5f9', 'שחור': '#1e293b', 'תכלת': '#38bdf8', 'חום': '#a16207',
  };
  const HEBREW_STATUS: Record<string, string> = {
    'מתואמת': 'coordinated', 'מאושרת': 'approved',
    'ממתינה לאישור': 'pending', 'בוטלה': 'cancelled',
  };
  const excelDateToStr = (serial: number) => {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  };
  const excelTimeToStr = (frac: number) => {
    const totalMins = Math.round(frac * 24 * 60);
    const h = Math.floor(totalMins / 60), m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const parseNavCoord = (str: string): { lat: number; lon: number }[] => {
    // Format: "3110N/03430E - 3120N/03430E ..."  (DDMM / DDDMM)
    return str.split(' - ').map(pt => {
      const m = pt.trim().match(/^(\d{2})(\d{2})([NS])\/(\d{3})(\d{2})([EW])$/);
      if (!m) return null;
      const lat = parseInt(m[1]) + parseInt(m[2]) / 60;
      const lon = parseInt(m[4]) + parseInt(m[5]) / 60;
      return { lat: m[3] === 'S' ? -lat : lat, lon: m[6] === 'W' ? -lon : lon };
    }).filter(Boolean) as { lat: number; lon: number }[];
  };
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const buffer = ev.target?.result as ArrayBuffer;
        const wb = XLSX.read(buffer, { type: 'array' });
        const SHEET_NAME = 'רשימת סגירות מרחב';
        const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
        // Detect header row — search for row starting with "שם סגירה"
        let dataStart = 4;
        for (let ri = 0; ri < Math.min(data.length, 10); ri++) {
          if (String(data[ri][0] || '').trim() === 'שם סגירה') { dataStart = ri + 1; break; }
        }
        const rows = data.slice(dataStart).filter(r => String(r[0] || '').trim());
        if (rows.length === 0) { alert('לא נמצאו שורות נתונים בקובץ'); return; }
        const parsed = rows.map(r => {
          const colorHeb = String(r[2] || '').trim();
          const statusHeb = String(r[8] || '').trim();
          const dateVal = r[5];
          const timeStartVal = r[6];
          const timeEndVal = r[7];
          return {
            name: String(r[0] || '').trim(),
            category: String(r[1] || '').trim(),
            color: HEBREW_COLORS[colorHeb] || '#64748b',
            colorName: colorHeb,
            alt_min: r[3] !== '' && !isNaN(Number(r[3])) ? Number(r[3]) : null,
            alt_max: r[4] !== '' && !isNaN(Number(r[4])) ? Number(r[4]) : null,
            dates: dateVal !== '' && !isNaN(Number(dateVal)) ? [excelDateToStr(Number(dateVal))] : [],
            time_start: timeStartVal !== '' && !isNaN(Number(timeStartVal)) ? excelTimeToStr(Number(timeStartVal)) : String(timeStartVal || ''),
            time_end: timeEndVal !== '' && !isNaN(Number(timeEndVal)) ? excelTimeToStr(Number(timeEndVal)) : String(timeEndVal || ''),
            closure_status: HEBREW_STATUS[statusHeb] || statusHeb || 'coordinated',
            statusDisplay: statusHeb,
            active: String(r[9] || '').trim() === 'כן',
            polygon_geo: r[10] ? parseNavCoord(String(r[10])) : [],
          };
        });
        setImportRows(parsed);
      } catch (err) {
        alert('שגיאה בקריאת הקובץ: ' + (err as Error).message);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };
  const confirmImport = async () => {
    if (!importRows) return;
    setImporting(true);
    let success = 0, failed = 0;
    for (const row of importRows) {
      const { colorName, statusDisplay, ...body } = row;
      try {
        const res = await fetch(`${API}/closures`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) success++; else failed++;
      } catch { failed++; }
    }
    setImporting(false);
    setImportRows(null);
    load();
    if (failed > 0) alert(`יובאו ${success} סגירות בהצלחה, ${failed} נכשלו`);
  };

  // ── Map picker for drawing polygon geo points ──────────────────────────
  interface MapPickerState {
    step: 'list' | 'draw';
    maps: any[];
    selected: any | null;
    points: { lat: number; lon: number }[];
  }
  const [mapPicker, setMapPicker] = React.useState<MapPickerState | null>(null);
  const mapPickerImgRef = React.useRef<HTMLImageElement>(null);

  const openMapPicker = async () => {
    const maps = await fetch(`${API}/maps`).then(r => r.json()).catch(() => []);
    const anchored = (Array.isArray(maps) ? maps : []).filter((m: any) => getAnchorFromMapData(m) !== null);
    setMapPicker({ step: 'list', maps: anchored, selected: null, points: [] });
  };
  const selectMapForDraw = async (m: any) => {
    const full = await fetch(`${API}/maps/${m.id}`).then(r => r.json()).catch(() => m);
    setMapPicker(prev => prev ? { ...prev, step: 'draw', selected: full, points: [] } : prev);
  };
  const handleMapDrawClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!mapPicker?.selected) return;
    const anchor = getAnchorFromMapData(mapPicker.selected);
    if (!anchor) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const geo = imagePctToGeo(xPct, yPct, anchor);
    setMapPicker(prev => prev ? { ...prev, points: [...prev.points, geo] } : prev);
  };
  const applyMapPickerPoints = () => {
    if (!mapPicker || mapPicker.points.length === 0) { setMapPicker(null); return; }
    setForm(f => ({ ...f, polygon_geo: [...f.polygon_geo, ...mapPicker.points] }));
    setMapPicker(null);
  };

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`${API}/closures`).then(r => r.json()).then(setClosures).catch(() => {}).finally(() => setLoading(false));
  }, [API]);
  React.useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditId(null); setForm(emptyForm()); setDateInput(''); setPolyInput({ lat: '', lon: '' }); setShowForm(true); };
  const openEdit = (c: Closure) => { setEditId(c.id); setForm({ name: c.name, category: c.category, color: c.color, alt_min: c.alt_min, alt_max: c.alt_max, dates: [...(c.dates || [])], time_start: c.time_start, time_end: c.time_end, closure_status: c.closure_status, active: c.active, polygon_geo: [...(c.polygon_geo || [])] }); setDateInput(''); setPolyInput({ lat: '', lon: '' }); setShowForm(true); };
  const cancel = () => { setShowForm(false); setEditId(null); };

  const save = async () => {
    if (!form.name.trim()) { alert('נא להזין שם'); return; }
    const url = editId ? `${API}/closures/${editId}` : `${API}/closures`;
    const method = editId ? 'PUT' : 'POST';
    try {
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setShowForm(false); setEditId(null); load();
    } catch { alert('שגיאה בשמירה'); }
  };

  const del = async (id: number) => {
    if (!confirm('למחוק סגירה זו?')) return;
    await fetch(`${API}/closures/${id}`, { method: 'DELETE' });
    load();
  };

  const addDate = () => {
    if (!dateInput.trim()) return;
    setForm(f => ({ ...f, dates: [...f.dates, dateInput.trim()] }));
    setDateInput('');
  };
  const removeDate = (i: number) => setForm(f => ({ ...f, dates: f.dates.filter((_, idx) => idx !== i) }));

  const addPoint = () => {
    const lat = parseFloat(polyInput.lat), lon = parseFloat(polyInput.lon);
    if (!isFinite(lat) || !isFinite(lon)) { alert('נ"צ לא תקין'); return; }
    setForm(f => ({ ...f, polygon_geo: [...f.polygon_geo, { lat, lon }] }));
    setPolyInput({ lat: '', lon: '' });
  };
  const removePoint = (i: number) => setForm(f => ({ ...f, polygon_geo: f.polygon_geo.filter((_, idx) => idx !== i) }));

  const lbl = (txt: string) => <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>{txt}</label>;
  const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#e2e8f0', padding: '5px 8px', fontSize: '12px', width: '100%', ...props.style }} />
  );

  return (
    <div style={{ padding: '16px', maxWidth: '960px', direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#e2e8f0' }}>🚫 סגירות</span>
        <button onClick={openNew} style={{ padding: '5px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>+ סגירה חדשה</button>
        <button onClick={() => importFileRef.current?.click()} style={{ padding: '5px 14px', background: '#065f46', color: '#6ee7b7', border: '1px solid #059669', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>📥 טען מקובץ Excel</button>
        <input ref={importFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportFile} />
        {loading && <span style={{ color: '#64748b', fontSize: '11px' }}>טוען...</span>}
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontWeight: 'bold', color: '#93c5fd', fontSize: '13px', marginBottom: '12px' }}>{editId ? 'עריכת סגירה' : 'סגירה חדשה'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
            <div>{lbl('שם *')}{inp({ value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })), placeholder: 'שם הסגירה' })}</div>
            <div>{lbl('קטגוריה')}{inp({ value: form.category, onChange: e => setForm(f => ({ ...f, category: e.target.value })), placeholder: 'למשל: TRA, DANGER...' })}</div>
            <div>{lbl('צבע')}<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: '40px', height: '30px', border: 'none', background: 'transparent', cursor: 'pointer' }} /><span style={{ color: '#94a3b8', fontSize: '12px' }}>{form.color}</span></div></div>
            <div>{lbl('גובה מינימאלי (FL)')}{inp({ type: 'number', value: form.alt_min ?? '', onChange: e => setForm(f => ({ ...f, alt_min: e.target.value === '' ? null : Number(e.target.value) })), placeholder: '0' })}</div>
            <div>{lbl('גובה מקסימאלי (FL)')}{inp({ type: 'number', value: form.alt_max ?? '', onChange: e => setForm(f => ({ ...f, alt_max: e.target.value === '' ? null : Number(e.target.value) })), placeholder: '999' })}</div>
            <div>{lbl('סטטוס סגירה')}
              <select value={form.closure_status} onChange={e => setForm(f => ({ ...f, closure_status: e.target.value }))} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#e2e8f0', padding: '5px 8px', fontSize: '12px', width: '100%' }}>
                <option value="coordinated">מתואמת</option>
                <option value="approved">מאושרת</option>
                <option value="pending">ממתינה לאישור</option>
                <option value="cancelled">בוטלה</option>
              </select>
            </div>
            <div>{lbl('זמן התחלה')}{inp({ type: 'time', value: form.time_start, onChange: e => setForm(f => ({ ...f, time_start: e.target.value })) })}</div>
            <div>{lbl('זמן סיום')}{inp({ type: 'time', value: form.time_end, onChange: e => setForm(f => ({ ...f, time_end: e.target.value })) })}</div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#e2e8f0' }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                בשימוש
              </label>
            </div>
          </div>

          {/* Dates */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              {lbl('מערך תאריכים')}
              {form.dates.length > 0 && (
                <button onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setForm(f => ({ ...f, dates: f.dates.map(() => today) }));
                }} style={{ padding: '2px 9px', background: '#1a3a2a', color: '#4ade80', border: '1px solid #16a34a', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap', marginBottom: '2px' }}>
                  📅 שנה הכל להיום
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              {inp({ type: 'date', value: dateInput, onChange: e => setDateInput(e.target.value), style: { flex: 1 } })}
              <button onClick={addDate} style={{ padding: '5px 12px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}>+ הוסף</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {form.dates.map((d, i) => (
                <span key={i} style={{ background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {d}
                  <button onClick={() => removeDate(i)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '12px', padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {form.dates.length === 0 && <span style={{ color: '#475569', fontSize: '11px' }}>אין תאריכים</span>}
            </div>
          </div>

          {/* Polygon Geo Points */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              {lbl('נ"צ הפוליגון (lat/lon)')}
              <button onClick={openMapPicker} style={{ padding: '3px 10px', background: '#1a3a4a', color: '#38bdf8', border: '1px solid #0ea5e9', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap', marginBottom: '3px' }}>🗺️ דקור על מפה</button>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              {inp({ placeholder: 'קו רוחב (lat)', value: polyInput.lat, onChange: e => setPolyInput(p => ({ ...p, lat: e.target.value })), style: { flex: 1 } })}
              {inp({ placeholder: 'קו אורך (lon)', value: polyInput.lon, onChange: e => setPolyInput(p => ({ ...p, lon: e.target.value })), style: { flex: 1 } })}
              <button onClick={addPoint} style={{ padding: '5px 12px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}>+ הוסף</button>
            </div>
            {form.polygon_geo.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ color: '#64748b' }}>
                    <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>#</th>
                    <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>קו רוחב</th>
                    <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>קו אורך</th>
                    <th style={{ width: '30px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.polygon_geo.map((p, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #1e293b' }}>
                      <td style={{ padding: '3px 6px', color: '#475569' }}>{i + 1}</td>
                      <td style={{ padding: '3px 6px', color: '#e2e8f0' }}>{p.lat.toFixed(6)}</td>
                      <td style={{ padding: '3px 6px', color: '#e2e8f0' }}>{p.lon.toFixed(6)}</td>
                      <td><button onClick={() => removePoint(i)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '13px' }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {form.polygon_geo.length === 0 && <span style={{ color: '#475569', fontSize: '11px' }}>אין נקודות פוליגון</span>}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={save} style={{ padding: '6px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>💾 שמור</button>
            <button onClick={cancel} style={{ padding: '6px 18px', background: '#374151', color: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>ביטול</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
              {['שם', 'קטגוריה', 'צבע', 'FL מין-מקס', 'תאריכים', 'שעות', 'סטטוס', 'בשימוש', 'נקודות', ''].map((h, i) => (
                <th key={i} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'normal', whiteSpace: 'nowrap', borderBottom: '1px solid #334155' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {closures.length === 0 && !loading && (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '24px', color: '#475569' }}>אין סגירות — לחץ "+ סגירה חדשה"</td></tr>
            )}
            {closures.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '7px 10px', color: '#e2e8f0', fontWeight: 'bold' }}>{c.name}</td>
                <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{c.category}</td>
                <td style={{ padding: '7px 10px' }}><span style={{ display: 'inline-block', width: '18px', height: '18px', borderRadius: '3px', background: c.color, verticalAlign: 'middle' }} title={c.color} /></td>
                <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{c.alt_min != null || c.alt_max != null ? `FL${c.alt_min ?? '?'} – FL${c.alt_max ?? '?'}` : '—'}</td>
                <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{(c.dates || []).length > 0 ? (c.dates || []).join(', ') : '—'}</td>
                <td style={{ padding: '7px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{c.time_start && c.time_end ? `${c.time_start} – ${c.time_end}` : c.time_start || c.time_end || '—'}</td>
                <td style={{ padding: '7px 10px' }}>
                  {(() => {
                    const st = c.closure_status;
                    const cfg: Record<string, { bg: string; color: string; label: string }> = {
                      approved:    { bg: '#166534', color: '#86efac', label: 'מאושרת' },
                      coordinated: { bg: '#1e3a5f', color: '#93c5fd', label: 'מתואמת' },
                      pending:     { bg: '#451a03', color: '#fdba74', label: 'ממתינה לאישור' },
                      cancelled:   { bg: '#27272a', color: '#a1a1aa', label: 'בוטלה' },
                    };
                    const c2 = cfg[st] || { bg: '#1e293b', color: '#94a3b8', label: st };
                    return <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: c2.bg, color: c2.color }}>{c2.label}</span>;
                  })()}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'center' }}>{c.active ? '✅' : '⭕'}</td>
                <td style={{ padding: '7px 10px', color: '#64748b' }}>{(c.polygon_geo || []).length}</td>
                <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(c)} style={{ background: 'none', border: '1px solid #334155', color: '#93c5fd', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', marginLeft: '4px' }}>✏️</button>
                  <button onClick={() => del(c.id)} style={{ background: 'none', border: '1px solid #334155', color: '#f87171', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px' }}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Map Picker Modal — draw polygon points on an anchored map */}
      {mapPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', width: '92vw', maxWidth: '1100px', height: '88vh', display: 'flex', flexDirection: 'column', direction: 'rtl', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px', borderBottom: '1px solid #334155', flexShrink: 0 }}>
              {mapPicker.step === 'draw' && (
                <button onClick={() => setMapPicker(p => p ? { ...p, step: 'list', selected: null, points: [] } : p)} style={{ background: '#374151', border: 'none', color: '#94a3b8', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}>← חזור</button>
              )}
              <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '14px', flex: 1 }}>
                {mapPicker.step === 'list' ? '🗺️ בחר מפה מעוגנת לדקירת נקודות' : `🎯 ${mapPicker.selected?.name} — לחץ להוספת נקודה`}
              </span>
              <button onClick={() => setMapPicker(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
            </div>

            {/* Step 1 — Map list */}
            {mapPicker.step === 'list' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {mapPicker.maps.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#475569', padding: '50px 20px', fontSize: '13px' }}>
                    אין מפות מעוגנות.<br/>
                    <span style={{ fontSize: '11px' }}>הגדר עיגון גאוגרפי למפה בלשונית "מפות" בניהול.</span>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                    {mapPicker.maps.map((m: any) => (
                      <div key={m.id} onClick={() => selectMapForDraw(m)}
                        style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '18px 12px', cursor: 'pointer', textAlign: 'center', color: '#e2e8f0', fontSize: '13px', fontWeight: 'bold', transition: 'border-color 0.15s, background 0.15s' }}
                        onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = '#38bdf8'; (e.currentTarget as HTMLElement).style.background = '#0c2131'; }}
                        onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = '#334155'; (e.currentTarget as HTMLElement).style.background = '#0f172a'; }}>
                        🗺️<br/><span style={{ fontSize: '12px' }}>{m.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2 — Draw on map */}
            {mapPicker.step === 'draw' && mapPicker.selected && (() => {
              const anchor = getAnchorFromMapData(mapPicker.selected);
              return (
                <>
                  <div style={{ padding: '6px 16px', background: '#0f172a', fontSize: '11px', color: '#64748b', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
                    לחץ על המפה להוספת נקודת פוליגון · לחיצה ימנית = מחיקת נקודה אחרונה · {mapPicker.points.length} נקודות
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', cursor: 'crosshair', background: '#020617' }}>
                    <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
                      <img
                        ref={mapPickerImgRef}
                        src={mapPicker.selected.image_data}
                        style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none', pointerEvents: 'all' }}
                        onClick={handleMapDrawClick}
                        onContextMenu={e => { e.preventDefault(); setMapPicker(p => p ? { ...p, points: p.points.slice(0, -1) } : p); }}
                        draggable={false}
                        alt="map"
                      />
                      {/* SVG overlay — polygon preview */}
                      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                        {anchor && mapPicker.points.map((pt, i) => {
                          const pct = geoToImagePct(pt.lat, pt.lon, anchor);
                          const prev = i > 0 ? geoToImagePct(mapPicker.points[i - 1].lat, mapPicker.points[i - 1].lon, anchor) : null;
                          return (
                            <g key={i}>
                              {prev && <line x1={`${prev.x}%`} y1={`${prev.y}%`} x2={`${pct.x}%`} y2={`${pct.y}%`} stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="5,3" />}
                              <circle cx={`${pct.x}%`} cy={`${pct.y}%`} r="6" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.5" />
                              <text x={`${pct.x}%`} y={`${pct.y}%`} dy="-9" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#fde68a" stroke="#0f172a" strokeWidth="3" paintOrder="stroke">{i + 1}</text>
                            </g>
                          );
                        })}
                        {/* Close polygon */}
                        {anchor && mapPicker.points.length >= 3 && (() => {
                          const fp = geoToImagePct(mapPicker.points[0].lat, mapPicker.points[0].lon, anchor);
                          const lp = geoToImagePct(mapPicker.points[mapPicker.points.length - 1].lat, mapPicker.points[mapPicker.points.length - 1].lon, anchor);
                          return <line x1={`${lp.x}%`} y1={`${lp.y}%`} x2={`${fp.x}%`} y2={`${fp.y}%`} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,4" opacity="0.45" />;
                        })()}
                      </svg>
                    </div>
                  </div>
                  {/* Footer */}
                  <div style={{ padding: '10px 16px', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                    <button onClick={applyMapPickerPoints} disabled={mapPicker.points.length === 0}
                      style={{ padding: '6px 20px', background: mapPicker.points.length === 0 ? '#374151' : '#0ea5e9', color: mapPicker.points.length === 0 ? '#64748b' : '#fff', border: 'none', borderRadius: '6px', cursor: mapPicker.points.length === 0 ? 'default' : 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      ✅ הוסף {mapPicker.points.length} נקודות לפוליגון
                    </button>
                    <button onClick={() => setMapPicker(p => p ? { ...p, points: [] } : p)} style={{ padding: '6px 14px', background: '#374151', color: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}>🗑 נקה</button>
                    <span style={{ color: '#475569', fontSize: '11px', whiteSpace: 'nowrap' }}>לחיצה ימנית = מחיקת אחרונה</span>
                    {mapPicker.points.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginRight: 'auto' }}>
                        {mapPicker.points.map((pt, i) => (
                          <span key={i} style={{ background: '#1e293b', border: '1px solid #f59e0b', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', color: '#fcd34d', whiteSpace: 'nowrap' }}>
                            {i + 1}: {pt.lat.toFixed(4)},{pt.lon.toFixed(4)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {importRows && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', width: '90vw', maxWidth: '1000px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', direction: 'rtl', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#e2e8f0' }}>📥 תצוגה מקדימה — {importRows.length} סגירות נמצאו</span>
              <button onClick={() => setImportRows(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>בדוק את הנתונים לפני הייבוא. ייבוא יוסיף את כל השורות כסגירות חדשות.</div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#0f172a' }}>
                  <tr style={{ color: '#64748b' }}>
                    {['שם', 'קטגוריה', 'צבע', 'גובה', 'תאריך', 'שעות', 'סטטוס', 'בשימוש', 'נ"צ'].map((h, i) => (
                      <th key={i} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'normal', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #0f172a', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '5px 8px', color: '#e2e8f0', fontWeight: 'bold', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</td>
                      <td style={{ padding: '5px 8px', color: '#94a3b8' }}>{row.category}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: row.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ color: '#64748b', fontSize: '10px' }}>{row.colorName}</span>
                        </div>
                      </td>
                      <td style={{ padding: '5px 8px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {row.alt_min != null || row.alt_max != null ? `${row.alt_min ?? '?'}–${row.alt_max ?? '?'} רגל` : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{row.dates.join(', ') || '—'}</td>
                      <td style={{ padding: '5px 8px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {row.time_start && row.time_end ? `${row.time_start}–${row.time_end}` : row.time_start || row.time_end || '—'}
                      </td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                        {(() => {
                          const cfg: Record<string, { bg: string; color: string }> = {
                            approved: { bg: '#166534', color: '#86efac' }, coordinated: { bg: '#1e3a5f', color: '#93c5fd' },
                            pending: { bg: '#451a03', color: '#fdba74' }, cancelled: { bg: '#27272a', color: '#a1a1aa' },
                          };
                          const sc = cfg[row.closure_status] || { bg: '#1e293b', color: '#94a3b8' };
                          return <span style={{ padding: '1px 6px', borderRadius: '8px', background: sc.bg, color: sc.color }}>{row.statusDisplay || row.closure_status}</span>;
                        })()}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>{row.active ? '✅' : '⭕'}</td>
                      <td style={{ padding: '5px 8px', color: '#64748b' }}>{row.polygon_geo.length} נק׳</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-start', borderTop: '1px solid #334155', paddingTop: '12px' }}>
              <button onClick={confirmImport} disabled={importing} style={{ padding: '7px 22px', background: importing ? '#374151' : '#16a34a', color: importing ? '#94a3b8' : '#fff', border: 'none', borderRadius: '6px', cursor: importing ? 'default' : 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {importing ? 'מייבא...' : `✅ אשר ייבוא (${importRows.length})`}
              </button>
              <button onClick={() => setImportRows(null)} disabled={importing} style={{ padding: '7px 18px', background: '#374151', color: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const StripWindowAdmin = ({ apiUrl }: { apiUrl: string }) => {
  const [layouts, setLayouts] = useState<any[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [tree, setTree] = useState<SWNode | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTplId, setNewTplId] = useState('tpl_blank');
  const [showTplPicker, setShowTplPicker] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [selLeafId, setSelLeafId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [swSectors, setSwSectors] = useState<any[]>([]);
  const dragRef = React.useRef<{ splitId: string; idx: number; startPos: number; startSizes: number[]; dir: 'h' | 'v'; containerPx: number } | null>(null);
  const headerHeightDragRef = React.useRef<{ leafId: string; startY: number; startH: number } | null>(null);

  const load = React.useCallback(async () => {
    const r = await fetch(`${apiUrl}/strip-window-layouts`);
    if (r.ok) setLayouts(await r.json());
  }, [apiUrl]);

  React.useEffect(() => {
    fetch(`${apiUrl}/sectors`).then(r => r.ok ? r.json() : []).then(data => setSwSectors(Array.isArray(data) ? data : [])).catch(() => {});
  }, [apiUrl]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pos = d.dir === 'v' ? e.clientX : e.clientY;
      const pctDelta = ((pos - d.startPos) / d.containerPx) * 100;
      const total = d.startSizes[d.idx] + d.startSizes[d.idx + 1];
      const newA = Math.max(5, Math.min(total - 5, d.startSizes[d.idx] + pctDelta));
      const newB = total - newA;
      setTree(prev => prev ? swUpdate(prev, d.splitId, (n: SWSplit) => {
        const ns = [...n.sizes]; ns[d.idx] = newA; ns[d.idx + 1] = newB; return { ...n, sizes: ns };
      }) : prev);
      setDirty(true);
    };
    const onUp = () => { dragRef.current = null; headerHeightDragRef.current = null; };
    const onMoveAll = (e: MouseEvent) => {
      onMove(e);
      const hd = headerHeightDragRef.current;
      if (!hd) return;
      const delta = e.clientY - hd.startY;
      const newH = Math.max(16, Math.min(72, hd.startH + delta));
      mutate(t => swUpdate(t, hd.leafId, (n: SWLeaf) => ({ ...n, header_height: newH })));
    };
    document.addEventListener('mousemove', onMoveAll);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMoveAll); document.removeEventListener('mouseup', onUp); };
  }, []);

  const selLay = layouts.find(l => l.id === selId);
  const selLeaf = React.useMemo(() => (tree && selLeafId) ? swFindLeaf(tree, selLeafId) : null, [tree, selLeafId]);
  const selectLay = (lay: any) => { setSelId(lay.id); setTree(lay.layout_json || swDefaultLeaf()); setSelLeafId(null); setDirty(false); };
  const save = async () => {
    if (!selId || !tree) return;
    await fetch(`${apiUrl}/strip-window-layouts/${selId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: selLay?.name, layout_json: tree }) });
    setDirty(false);
    await load();
  };
  const mutate = (fn: (t: SWNode) => SWNode) => { setTree(p => p ? fn(p) : p); setDirty(true); };

  const T = { bg: '#0f172a', card: '#1e293b', border: '#334155', text: '#f1f5f9', muted: '#94a3b8' };
  const btnSm = (col: string): React.CSSProperties => ({ background: col, color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' as const, flexShrink: 0 });

  const renderNode = (node: SWNode): React.ReactElement => {
    if (node.type === 'split') {
      const isV = node.direction === 'v';
      const sizes = node.sizes.length === node.children.length ? node.sizes : node.children.map(() => 100 / node.children.length);
      return (
        <div key={node.id} style={{ display: 'flex', flexDirection: isV ? 'row' : 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', direction: isV ? 'ltr' : undefined }}>
          {node.children.map((child, idx) => (
            <React.Fragment key={child.id}>
              <div style={{ flex: `0 0 ${sizes[idx]}%`, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
                {renderNode(child)}
              </div>
              {idx < node.children.length - 1 && (
                <div
                  style={{ flexShrink: 0, background: '#334155', cursor: isV ? 'col-resize' : 'row-resize', transition: 'background 0.15s', ...(isV ? { width: '5px' } : { height: '5px' }) }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#7c3aed'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#334155'}
                  onMouseDown={e => {
                    e.preventDefault();
                    const parent = e.currentTarget.parentElement;
                    const containerPx = isV ? (parent?.offsetWidth ?? 800) : (parent?.offsetHeight ?? 600);
                    dragRef.current = { splitId: node.id, idx, startPos: isV ? e.clientX : e.clientY, startSizes: [...sizes], dir: node.direction, containerPx };
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      );
    }
    const sel = node.id === selLeafId;
    return (
      <div key={node.id} onClick={() => setSelLeafId(node.id)}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, ...swGetBgStyle(node.bg_color, node.bg_texture), border: sel ? '2px solid #7c3aed' : '1px solid #334155', boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', minWidth: 0, minHeight: 0 }}>
        <div style={{ position: 'relative', background: node.header_color || '#1e3a5f', height: `${node.header_height || 24}px`, padding: '0 7px', fontSize: `${node.header_font_size || Math.max(9, Math.round((node.header_height || 24) * 0.5))}px`, fontWeight: 'bold', color: node.header_text_color || 'white', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, boxSizing: 'border-box' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label || node.waypoint || '— תא —'}
          </span>
          {node.waypoint && node.waypoint_mode === 'מקבל' && <span style={{ fontSize: '9px', color: '#4ade80', fontWeight: 'bold' }}>📥</span>}
          {node.waypoint && node.waypoint_mode === 'מוסר' && <span style={{ fontSize: '9px', color: '#fb923c', fontWeight: 'bold' }}>📤</span>}
          {node.query && <span style={{ fontSize: '9px', opacity: 0.7 }}>⚡</span>}
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>{node.header_height || 24}px</span>
          {/* Header height drag handle */}
          <div
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); headerHeightDragRef.current = { leafId: node.id, startY: e.clientY, startH: node.header_height || 24 }; }}
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', cursor: 'ns-resize', background: 'transparent', zIndex: 10 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.6)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            title="גרור לשינוי גובה כותרת"
          />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '4px', flexWrap: 'wrap' }}>
          <button onClick={e => { e.stopPropagation(); mutate(t => swSplit(t, node.id, 'h')); }} style={btnSm('#1d4ed8')} title="חלק לעליון ותחתון">+ שורה</button>
          <button onClick={e => { e.stopPropagation(); mutate(t => swSplit(t, node.id, 'v')); }} style={btnSm('#065f46')} title="חלק לשמאל וימין">+ עמודה</button>
        </div>
      </div>
    );
  };

  const sidebar = (
    <div style={{ width: '220px', flexShrink: 0, background: T.card, borderInlineEnd: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: T.text }}>🪟 חלונות סטריפים</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="שם חדש..."
            onKeyDown={async e => { if (e.key === 'Enter' && newName.trim()) { const tpl = SW_TEMPLATES.find(t => t.id === newTplId) || SW_TEMPLATES[0]; const layout_json = tpl.build(); const res = await fetch(`${apiUrl}/strip-window-layouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), layout_json }) }); if (res.status === 409) { alert((await res.json()).error || 'שם כבר קיים'); return; } setNewName(''); await load(); if (res.ok) { const created = await res.json().catch(() => null); if (created?.id) { const r2 = await fetch(`${apiUrl}/strip-window-layouts`); if (r2.ok) { const list = await r2.json(); setLayouts(list); const lay = list.find((l: any) => l.id === created.id); if (lay) { setSelId(lay.id); setTree(lay.layout_json || swDefaultLeaf()); setSelLeafId(null); setDirty(false); } } } } } }}
            style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, color: T.text, padding: '4px 6px', borderRadius: '4px', fontSize: '12px' }} />
          <button onClick={async () => { if (!newName.trim()) return; const tpl = SW_TEMPLATES.find(t => t.id === newTplId) || SW_TEMPLATES[0]; const layout_json = tpl.build(); const res = await fetch(`${apiUrl}/strip-window-layouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), layout_json }) }); if (res.status === 409) { alert((await res.json()).error || 'שם כבר קיים'); return; } setNewName(''); if (res.ok) { const created = await res.json().catch(() => null); const r2 = await fetch(`${apiUrl}/strip-window-layouts`); if (r2.ok) { const list = await r2.json(); setLayouts(list); if (created?.id) { const lay = list.find((l: any) => l.id === created.id); if (lay) { setSelId(lay.id); setTree(lay.layout_json || swDefaultLeaf()); setSelLeafId(null); setDirty(false); } } } } }}
            style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '14px' }}>+</button>
        </div>
        {/* Template picker */}
        <div style={{ marginTop: '6px' }}>
          <button type="button" onClick={() => setShowTplPicker(p => !p)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 7px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px', cursor: 'pointer', color: T.muted, fontSize: '11px' }}>
            <span>📋 תבנית: <strong style={{ color: T.text }}>{SW_TEMPLATES.find(t => t.id === newTplId)?.label || 'ריק'}</strong></span>
            <span>{showTplPicker ? '▲' : '▼'}</span>
          </button>
          {showTplPicker && (
            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {SW_TEMPLATES.map(tpl => (
                <button key={tpl.id} type="button"
                  onClick={() => { setNewTplId(tpl.id); setShowTplPicker(false); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1px', padding: '5px 8px', background: newTplId === tpl.id ? '#1e3a5f' : T.bg, border: `1px solid ${newTplId === tpl.id ? '#3b82f6' : T.border}`, borderRadius: '5px', cursor: 'pointer', width: '100%' }}>
                  <span style={{ fontSize: '11px', color: newTplId === tpl.id ? '#7dd3fc' : T.text, fontWeight: newTplId === tpl.id ? 'bold' : 'normal' }}>{tpl.label}</span>
                  <span style={{ fontSize: '10px', color: T.muted }}>{tpl.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {layouts.length === 0 && <div style={{ color: T.muted, fontSize: '11px', textAlign: 'center', padding: '16px 0' }}>אין חלונות</div>}
        {layouts.map(lay => (
          <div key={lay.id}>
            {renamingId === lay.id ? (
              <div style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
                <input autoFocus value={renameDraft} onChange={e => setRenameDraft(e.target.value)}
                  onKeyDown={async e => { if (e.key === 'Enter') { await fetch(`${apiUrl}/strip-window-layouts/${lay.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: renameDraft, layout_json: lay.layout_json }) }); setRenamingId(null); load(); } if (e.key === 'Escape') setRenamingId(null); }}
                  style={{ flex: 1, background: T.bg, border: '1px solid #7c3aed', color: T.text, padding: '3px 5px', borderRadius: '4px', fontSize: '11px' }} />
                <button onClick={async () => { await fetch(`${apiUrl}/strip-window-layouts/${lay.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: renameDraft, layout_json: lay.layout_json }) }); setRenamingId(null); load(); }}
                  style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontSize: '11px' }}>✓</button>
              </div>
            ) : (
              <div onClick={() => selectLay(lay)}
                style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '5px 6px', background: selId === lay.id ? '#1e40af33' : 'transparent', borderRadius: '5px', border: selId === lay.id ? '1px solid #1e40af99' : '1px solid transparent', cursor: 'pointer', marginBottom: '2px' }}>
                <span style={{ flex: 1, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>{lay.name}</span>
                <button onClick={e => { e.stopPropagation(); setRenamingId(lay.id); setRenameDraft(lay.name); }} style={{ background: 'transparent', color: T.muted, border: 'none', cursor: 'pointer', fontSize: '10px', padding: '1px 2px' }} title="שנה שם">✏️</button>
                <button onClick={async e => { e.stopPropagation(); const copyName = `${lay.name} — עותק`; const res = await fetch(`${apiUrl}/strip-window-layouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: copyName, layout_json: lay.layout_json }) }); if (res.status === 409) { alert('שם כבר קיים — שנה שם לחלון המקורי ונסה שוב'); return; } if (res.ok) { const created = await res.json().catch(() => null); await load(); if (created?.id) { const r2 = await fetch(`${apiUrl}/strip-window-layouts`); if (r2.ok) { const list = await r2.json(); setLayouts(list); const dup = list.find((l: any) => l.id === created.id); if (dup) { setSelId(dup.id); setTree(dup.layout_json || swDefaultLeaf()); setSelLeafId(null); setDirty(false); } } } } }} style={{ background: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: '10px', padding: '1px 2px' }} title="שכפל חלון">📋</button>
                <button onClick={e => { e.stopPropagation(); if (confirm(`מחק "${lay.name}"?`)) { fetch(`${apiUrl}/strip-window-layouts/${lay.id}`, { method: 'DELETE' }).then(() => { if (selId === lay.id) { setSelId(null); setTree(null); } load(); }); } }} style={{ background: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: '10px', padding: '1px 2px' }} title="מחק">🗑</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', direction: 'rtl', color: T.text, overflow: 'hidden', position: 'relative' }}>
      {sidebar}
      {!selLay ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: '14px' }}>בחר חלון מהרשימה או צור חדש</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: T.card, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>🪟 {selLay.name}</span>
            {dirty && <span style={{ fontSize: '11px', color: '#fbbf24' }}>●</span>}
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: '6px' }}>
              {dirty && <button onClick={save} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>💾 שמור</button>}
              <button onClick={() => setFullScreen(true)} style={{ background: '#7c3aed', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>⛶ ערוך בגדול</button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', padding: '8px', display: 'flex' }}>
            <div style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
              {tree && renderNode(tree)}
            </div>
          </div>
        </div>
      )}

      {fullScreen && selLay && tree && (
        <div style={{ position: 'fixed', inset: 0, background: '#070d1a', zIndex: 9999, display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
          <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <span style={{ fontWeight: 'bold', fontSize: '15px' }}>🪟 {selLay.name}</span>
            {dirty && <span style={{ fontSize: '12px', color: '#fbbf24' }}>● שינויים לא שמורים</span>}
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: '8px' }}>
              {dirty && <button onClick={save} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>💾 שמור</button>}
              <button onClick={() => { setFullScreen(false); setSelLeafId(null); }} style={{ background: '#334155', color: '#f1f5f9', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>✕ סגור</button>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', userSelect: 'none' }}>
              {renderNode(tree)}
            </div>
            {selLeaf && (
              <div style={{ width: '270px', background: '#1e293b', borderInlineStart: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>⚙ הגדרות תא</span>
                  <button onClick={() => { if (confirm('למחוק תא זה?')) { mutate(t => swRemove(t, selLeaf.id)); setSelLeafId(null); } }}
                    style={{ marginInlineStart: 'auto', background: 'transparent', color: '#f87171', border: '1px solid #f87171', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer', fontSize: '11px' }}>🗑 מחק</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>כותרת תא</div>
                    <input value={selLeaf.label || ''} onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, label: e.target.value })))} placeholder="כותרת..."
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '5px 7px', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>נקודת מעבר</div>
                    <select value={selLeaf.waypoint || ''} onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, waypoint: e.target.value, waypoint_mode: e.target.value ? n.waypoint_mode : undefined })))}
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '5px 7px', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box', direction: 'rtl' }}>
                      <option value="">— ללא נקודת מעבר —</option>
                      {swSectors.map((s: any) => (
                        <option key={s.id} value={String(s.id)}>{s.label_he || s.name}</option>
                      ))}
                    </select>
                    {selLeaf.waypoint && (
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>כיוון נקודת מעבר</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {(['מקבל', 'מוסר'] as const).map(mode => {
                            const isActive = selLeaf.waypoint_mode === mode;
                            const isRecv = mode === 'מקבל';
                            return (
                              <button key={mode}
                                onClick={() => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, waypoint_mode: n.waypoint_mode === mode ? undefined : mode })))}
                                style={{ flex: 1, padding: '5px 8px', background: isActive ? (isRecv ? '#14532d' : '#431407') : '#1e293b', color: isActive ? (isRecv ? '#4ade80' : '#fb923c') : '#64748b', border: `1px solid ${isActive ? (isRecv ? '#16a34a' : '#c2410c') : '#334155'}`, borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: isActive ? 'bold' : 'normal', transition: 'all 0.15s', direction: 'rtl' }}>
                                {isRecv ? '📥' : '📤'} {mode}
                              </button>
                            );
                          })}
                        </div>
                        {!selLeaf.waypoint_mode && (
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', textAlign: 'center' }}>בחר כיוון כדי לסנן לפי הנקודה</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>רקע תא</div>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input type="color" value={selLeaf.bg_color || '#0f172a'} onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, bg_color: e.target.value })))}
                          style={{ width: '32px', height: '26px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }} />
                        <span style={{ fontSize: '10px', color: '#64748b' }}>{selLeaf.bg_color || '#0f172a'}</span>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>רקע כותרת</div>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input type="color" value={selLeaf.header_color || '#1e3a5f'} onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, header_color: e.target.value })))}
                          style={{ width: '32px', height: '26px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }} />
                        <span style={{ fontSize: '10px', color: '#64748b' }}>{selLeaf.header_color || '#1e3a5f'}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '5px' }}>מרקם רקע</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {SW_TEXTURES.map(tx => {
                        const sel2 = (selLeaf.bg_texture || '') === tx.id;
                        const previewStyle = tx.getStyle(selLeaf.bg_color || '#0f172a');
                        return (
                          <button key={tx.id} title={tx.label} onClick={() => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, bg_texture: tx.id })))}
                            style={{ width: '38px', height: '28px', borderRadius: '4px', cursor: 'pointer', border: sel2 ? '2px solid #7c3aed' : '1px solid #475569', padding: 0, position: 'relative', overflow: 'hidden', flexShrink: 0, ...previewStyle }}>
                            <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: '7px', color: 'rgba(255,255,255,0.7)', lineHeight: 1, pointerEvents: 'none', textShadow: '0 0 2px #000' }}>{tx.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>גובה כותרת: {selLeaf.header_height || 24}px</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="range" min={16} max={72} step={2} value={selLeaf.header_height || 24}
                        onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, header_height: Number(e.target.value) })))}
                        style={{ flex: 1 }} />
                      <input type="number" min={16} max={72} step={2} value={selLeaf.header_height || 24}
                        onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, header_height: Math.max(16, Math.min(72, Number(e.target.value))) })))}
                        style={{ width: '46px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#e2e8f0', fontSize: '11px', padding: '2px 4px', textAlign: 'center' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>צבע טקסט כותרת</div>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input type="color" value={selLeaf.header_text_color || '#e2e8f0'} onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, header_text_color: e.target.value })))}
                          style={{ width: '32px', height: '26px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }} />
                        <span style={{ fontSize: '10px', color: '#64748b' }}>{selLeaf.header_text_color || '#e2e8f0'}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>גודל טקסט כותרת: {selLeaf.header_font_size || 'אוטומטי'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="range" min={8} max={32} step={1} value={selLeaf.header_font_size || Math.max(10, Math.round((selLeaf.header_height || 24) * 0.5))}
                        onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, header_font_size: Number(e.target.value) })))}
                        style={{ flex: 1 }} />
                      <input type="number" min={8} max={32} step={1} value={selLeaf.header_font_size || ''}
                        placeholder="auto"
                        onChange={e => { const v = e.target.value === '' ? undefined : Math.max(8, Math.min(32, Number(e.target.value))); mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, header_font_size: v }))); }}
                        style={{ width: '46px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#e2e8f0', fontSize: '11px', padding: '2px 4px', textAlign: 'center' }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>שאילתת סינון</div>
                    <QueryBuilder value={selLeaf.query || null} onChange={q => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, query: q })))} label="שאילתת סינון לתא" />
                  </div>
                  {/* ── Content title section ── */}
                  <div style={{ borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold', letterSpacing: '0.5px' }}>📝 כותרת תוכן (מעל הסטריפים)</div>
                    <input value={selLeaf.content_title || ''} onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, content_title: e.target.value })))}
                      placeholder="טקסט הכותרת (ריק = ללא)..."
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '5px 7px', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box', marginBottom: '8px', direction: 'rtl' }} />
                    {selLeaf.content_title && (<>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>צבע טקסט</div>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input type="color" value={selLeaf.content_title_color || '#f1f5f9'} onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, content_title_color: e.target.value })))}
                              style={{ width: '28px', height: '24px', border: 'none', borderRadius: '3px', cursor: 'pointer', padding: 0 }} />
                            <span style={{ fontSize: '9px', color: '#475569' }}>{selLeaf.content_title_color || '#f1f5f9'}</span>
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>רקע</div>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input type="color" value={selLeaf.content_title_bg || '#1e293b'} onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, content_title_bg: e.target.value })))}
                              style={{ width: '28px', height: '24px', border: 'none', borderRadius: '3px', cursor: 'pointer', padding: 0 }} />
                            <span style={{ fontSize: '9px', color: '#475569' }}>{selLeaf.content_title_bg || '#1e293b'}</span>
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>גודל ({selLeaf.content_title_font_size || 13}px)</div>
                          <input type="range" min={10} max={36} step={1} value={selLeaf.content_title_font_size || 13}
                            onChange={e => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, content_title_font_size: Number(e.target.value) })))}
                            style={{ width: '100%' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button onClick={() => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, content_title_bold: !n.content_title_bold })))}
                          style={{ padding: '3px 10px', background: selLeaf.content_title_bold ? '#3730a3' : '#1e293b', color: selLeaf.content_title_bold ? '#a5b4fc' : '#64748b', border: `1px solid ${selLeaf.content_title_bold ? '#4f46e5' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                          B מודגש
                        </button>
                        {(['right', 'center', 'left'] as const).map(align => (
                          <button key={align} onClick={() => mutate(t => swUpdate(t, selLeaf.id, (n: SWLeaf) => ({ ...n, content_title_align: align })))}
                            title={align === 'right' ? 'ימין' : align === 'center' ? 'מרכז' : 'שמאל'}
                            style={{ padding: '3px 8px', background: (selLeaf.content_title_align || 'right') === align ? '#1e3a5f' : '#1e293b', color: (selLeaf.content_title_align || 'right') === align ? '#93c5fd' : '#475569', border: `1px solid ${(selLeaf.content_title_align || 'right') === align ? '#3b82f6' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                            {align === 'right' ? '⇒' : align === 'center' ? '⇔' : '⇐'}
                          </button>
                        ))}
                        <div style={{ marginRight: 'auto', padding: '3px 8px', background: selLeaf.content_title_bg || '#1e293b', color: selLeaf.content_title_color || '#f1f5f9', fontSize: `${selLeaf.content_title_font_size || 13}px`, fontWeight: selLeaf.content_title_bold ? 'bold' : 'normal', borderRadius: '4px', direction: 'rtl', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selLeaf.content_title}
                        </div>
                      </div>
                    </>)}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ background: '#0f172a', borderTop: '1px solid #1e293b', padding: '5px 14px', fontSize: '10px', color: '#475569', display: 'flex', gap: '16px' }}>
            <span>לחץ על תא לבחירה ← הגדרות בפאנל ימין</span>
            <span>גרור מחיצה ← שינוי גודל</span>
            <span><b style={{ color: '#94a3b8' }}>+ שורה</b> = עליון/תחתון &nbsp;·&nbsp; <b style={{ color: '#94a3b8' }}>+ עמודה</b> = שמאל/ימין</span>
          </div>
        </div>
      )}
    </div>
  );
};

// --- דף ניהול ---
