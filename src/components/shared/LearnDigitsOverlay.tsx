import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { saveLearnedDigit, clearLearnedDigits, getDigitsCount } from '../../utils/digits';

export const LearnDigitsOverlay = ({ onClose, crewMemberId, crewMemberName }: { onClose: () => void; crewMemberId?: number; crewMemberName?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDigit, setCurrentDigit] = useState(0);
  const [saved, setSaved] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const loadCount = async () => {
    const count = await getDigitsCount(crewMemberId);
    setTotalCount(count);
  };

  useEffect(() => {
    loadCount();
  }, [saved, crewMemberId]);

  const getCoords = (e: any) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: any) => {
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
    }
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) { 
      ctx.lineTo(x, y); 
      ctx.stroke(); 
    }
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const saveDigit = async () => {
    if (!canvasRef.current) return;
    const imageData = canvasRef.current.toDataURL('image/png');
    await saveLearnedDigit(currentDigit.toString(), imageData, crewMemberId);
    setSaved(s => s + 1);
    clearCanvas();
  };

  const nextDigit = () => {
    setCurrentDigit((currentDigit + 1) % 10);
    clearCanvas();
  };

  const handleClearAll = async () => {
    await clearLearnedDigits(crewMemberId);
    setSaved(0);
    setTotalCount(0);
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', direction: 'rtl', minWidth: '300px' }}>
        <h3 style={{ margin: '0 0 15px', color: '#1e293b', textAlign: 'center' }}>לימוד כתב יד {crewMemberName ? `- ${crewMemberName}` : ''}</h3>
        
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', color: '#64748b' }}>כתוב את הספרה: </span>
          <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#2563eb' }}>{currentDigit}</span>
        </div>
        
        <canvas 
          ref={canvasRef} 
          width={150} 
          height={150} 
          style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '8px', touchAction: 'none', display: 'block', margin: '0 auto' }}
          onMouseDown={startDrawing} 
          onMouseMove={draw} 
          onMouseUp={() => setIsDrawing(false)}
          onMouseLeave={() => setIsDrawing(false)}
          onTouchStart={startDrawing} 
          onTouchMove={draw} 
          onTouchEnd={() => setIsDrawing(false)} 
        />
        
        <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
          <button onClick={clearCanvas} style={{ flex: 1, padding: '8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>נקה</button>
          <button onClick={saveDigit} style={{ flex: 1, padding: '8px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>שמור</button>
          <button onClick={nextDigit} style={{ flex: 1, padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>הבא</button>
        </div>
        
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: '#64748b' }}>
          נשמרו בסשן: {saved} | סה"כ ב-DB: {totalCount}
        </div>
        
        <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
          <button onClick={handleClearAll} style={{ flex: 1, padding: '8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>מחק הכל</button>
          <button onClick={onClose} style={{ flex: 1, padding: '8px', background: '#1e293b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>סיום</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- רכיב כתיבה (OCR) ---
// HandwritingOverlay imported from ./components/shared/HandwritingOverlay

// --- רכיב עריכת פמם בהעברה ---
// TransferStripEditor, OutgoingTransferCard, IncomingTransferCard imported from ./components/transfers/TransferCards
// --- פאנל נקודת העברה עם עמודות העברה/קבלה ---
// Draggable panels (DraggableNeighborPanel, DraggableIncomingTransferMini, DraggableMapMarker, DraggableIncomingTransfer, TableHandwritingCanvas) imported from ./components/transfers/DraggablePanels
// GroundVehiclePanel imported from ./components/ground/GroundVehiclePanel
// SectorDashboard imported from ./components/views/SectorDashboard

export default LearnDigitsOverlay;
