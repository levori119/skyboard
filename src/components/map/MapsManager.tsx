import { tr } from '../../i18n/tr';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getDocument } from 'pdfjs-dist';
import { API_URL } from '../../config';
import { customConfirm } from '../shared/ConfirmModal';
import MapZoneEditor from './MapZoneEditor';

export const MapsManager = ({ onClose, onMapsUpdated, isEmbedded = false }: { onClose: () => void; onMapsUpdated: () => void; isEmbedded?: boolean }) => {
  const [maps, setMaps] = useState<{id: number; name: string; created_at: string}[]>([]);
  const [newMapName, setNewMapName] = useState('');
  const [newMapData, setNewMapData] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [zoneEditorMapId, setZoneEditorMapId] = useState<number | null>(null);
  const [zoneEditorMapSrc, setZoneEditorMapSrc] = useState<string | null>(null);
  const [zoneEditorMapData, setZoneEditorMapData] = useState<any>(null);

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfRendering, setPdfRendering] = useState(false);
  const [isPdf, setIsPdf] = useState(false);

  const loadMaps = async () => {
    try {
      const res = await fetch(`${API_URL}/maps`);
      if (res.ok) setMaps(await res.json());
    } catch (err) {
      console.error('Failed to load maps:', err);
    }
  };

  useEffect(() => {
    loadMaps();
  }, []);

  const renderPdfPage = async (doc: any, pageNum: number): Promise<string> => {
    const page = await doc.getPage(pageNum);
    // Scale to max ~2000px wide to keep file size manageable
    const rawViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.8, 2000 / Math.max(rawViewport.width, rawViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setIsPdf(true);
      setPdfDoc(null);
      setPdfPageCount(0);
      setPdfCurrentPage(1);
      setNewMapData(null);
      setPdfRendering(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await getDocument({ data: arrayBuffer }).promise;
        setPdfDoc(doc);
        setPdfPageCount(doc.numPages);
        const imgData = await renderPdfPage(doc, 1);
        setNewMapData(imgData);
      } catch (err) {
        console.error('PDF render error:', err);
        alert('שגיאה בטעינת ה-PDF');
      }
      setPdfRendering(false);
    } else {
      setIsPdf(false);
      setPdfDoc(null);
      setPdfPageCount(0);
      const reader = new FileReader();
      reader.onload = (ev) => setNewMapData(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePdfPageChange = async (pageNum: number) => {
    if (!pdfDoc || pdfRendering) return;
    setPdfRendering(true);
    setPdfCurrentPage(pageNum);
    const imgData = await renderPdfPage(pdfDoc, pageNum);
    setNewMapData(imgData);
    setPdfRendering(false);
  };

  const handleUpload = async () => {
    if (!newMapName.trim() || !newMapData) return;
    setUploading(true);
    try {
      const res = await fetch(`${API_URL}/maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMapName.trim(), image_data: newMapData })
      });
      if (res.ok) {
        setNewMapName('');
        setNewMapData(null);
        setIsPdf(false);
        setPdfDoc(null);
        setPdfPageCount(0);
        setPdfCurrentPage(1);
        loadMaps();
        onMapsUpdated();
      }
    } catch (err) {
      console.error('Failed to upload map:', err);
    }
    setUploading(false);
  };

  const handleDelete = async (id: number) => {
    if (!await customConfirm('למחוק את המפה?')) return;
    try {
      await fetch(`${API_URL}/maps/${id}`, { method: 'DELETE' });
      loadMaps();
      onMapsUpdated();
    } catch (err) {
      console.error('Failed to delete map:', err);
    }
  };

  const content = (
    <div style={{ background: isEmbedded ? '#1e293b' : 'white', borderRadius: '12px', padding: '24px', width: isEmbedded ? '100%' : '600px', maxHeight: isEmbedded ? 'none' : '80vh', overflowY: 'auto', direction: 'rtl' }}>
      {!isEmbedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#1e293b' }}>{tr("ניהול מפות")}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
        </div>
      )}
      
      {isEmbedded && <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', color: 'white' }}>{tr("ניהול מפות")}</h2>}

      <div style={{ background: isEmbedded ? '#334155' : '#f1f5f9', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: isEmbedded ? '#94a3b8' : '#475569' }}>{tr("העלאת מפה חדשה (תמונה או PDF)")}</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newMapName}
            onChange={(e) => setNewMapName(e.target.value)}
            placeholder={tr("שם המפה")}
            style={{ flex: 1, minWidth: '150px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: 'white' }}
          />
          <label style={{ background: '#475569', color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
            {pdfRendering ? '⏳ טוען PDF...' : newMapData ? (isPdf ? `📄 PDF — עמוד ${pdfCurrentPage}/${pdfPageCount} ✓` : '🖼 תמונה נבחרה ✓') : '📂 בחר תמונה / PDF'}
            <input type="file" accept="image/*,.pdf,application/pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
          <button
            onClick={handleUpload}
            disabled={!newMapName.trim() || !newMapData || uploading || pdfRendering}
            style={{
              background: newMapName.trim() && newMapData && !pdfRendering ? '#059669' : '#94a3b8',
              color: 'white',
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              cursor: newMapName.trim() && newMapData && !pdfRendering ? 'pointer' : 'not-allowed',
              fontSize: '14px'
            }}
          >
            {uploading ? 'מעלה...' : 'העלה'}
          </button>
        </div>
        {/* PDF page navigator */}
        {isPdf && pdfPageCount > 1 && (
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', direction: 'rtl' }}>
            <span style={{ fontSize: '12px', color: isEmbedded ? '#94a3b8' : '#475569', fontWeight: 'bold' }}>{tr("📄 בחר עמוד:")}</span>
            <button onClick={() => handlePdfPageChange(Math.max(1, pdfCurrentPage - 1))}
              disabled={pdfCurrentPage <= 1 || pdfRendering}
              style={{ padding: '3px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>◀</button>
            <span style={{ fontSize: '13px', color: isEmbedded ? '#e2e8f0' : '#1e293b', minWidth: '70px', textAlign: 'center' }}>
              {pdfRendering ? '⏳' : `${pdfCurrentPage} / ${pdfPageCount}`}
            </span>
            <button onClick={() => handlePdfPageChange(Math.min(pdfPageCount, pdfCurrentPage + 1))}
              disabled={pdfCurrentPage >= pdfPageCount || pdfRendering}
              style={{ padding: '3px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>▶</button>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginRight: '8px' }}>
              {Array.from({ length: Math.min(pdfPageCount, 10) }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => handlePdfPageChange(n)}
                  disabled={pdfRendering}
                  style={{ width: '28px', height: '28px', padding: 0, background: pdfCurrentPage === n ? '#3b82f6' : '#1e293b', color: 'white', border: `1px solid ${pdfCurrentPage === n ? '#3b82f6' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: pdfCurrentPage === n ? 'bold' : 'normal' }}>{n}</button>
              ))}
              {pdfPageCount > 10 && <span style={{ fontSize: '11px', color: '#64748b', alignSelf: 'center' }}>…{pdfPageCount}</span>}
            </div>
          </div>
        )}
        {newMapData && (
          <div style={{ marginTop: '12px' }}>
            <img src={newMapData} style={{ maxWidth: '200px', maxHeight: '100px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
          </div>
        )}
      </div>

      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: isEmbedded ? '#94a3b8' : '#475569' }}>מפות קיימות ({maps.length})</h3>
      {maps.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>{tr("אין מפות עדיין")}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {maps.map(map => (
            <div key={map.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: isEmbedded ? '#475569' : '#f8fafc', border: zoneEditorMapId === map.id ? '1px solid #3b82f6' : '1px solid #e2e8f0', borderRadius: zoneEditorMapId === map.id ? '8px 8px 0 0' : '8px' }}>
                <div>
                  <div style={{ fontWeight: 'bold', color: isEmbedded ? 'white' : '#1e293b' }}>{map.name}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(map.created_at).toLocaleDateString('he-IL')}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={async () => {
                      if (zoneEditorMapId === map.id) { setZoneEditorMapId(null); setZoneEditorMapSrc(null); setZoneEditorMapData(null); return; }
                      try {
                        const res = await fetch(`${API_URL}/maps/${map.id}`);
                        if (res.ok) { const data = await res.json(); setZoneEditorMapSrc(data.image_data); setZoneEditorMapId(map.id); setZoneEditorMapData(map); }
                      } catch {}
                    }}
                    style={{ background: zoneEditorMapId === map.id ? '#3b82f6' : (isEmbedded ? '#334155' : '#e2e8f0'), color: zoneEditorMapId === map.id ? 'white' : (isEmbedded ? 'white' : '#1e293b'), padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    🗺 אזורים
                  </button>
                  <button
                    onClick={() => handleDelete(map.id)}
                    style={{ background: '#ef4444', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    מחק
                  </button>
                </div>
              </div>
              {zoneEditorMapId === map.id && zoneEditorMapSrc && (
                <MapZoneEditor mapId={map.id} mapSrc={zoneEditorMapSrc} onClose={() => { setZoneEditorMapId(null); setZoneEditorMapSrc(null); setZoneEditorMapData(null); }} mapData={zoneEditorMapData ?? map} />
              )}
            </div>
          ))}
        </div>
      )}

      {!isEmbedded && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button onClick={onClose} style={{ background: '#1e293b', color: 'white', padding: '10px 30px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
            סגור
          </button>
        </div>
      )}
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {content}
    </div>,
    document.body
  );
};

// --- רכיב לימוד ספרות ---

export default MapsManager;
