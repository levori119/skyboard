import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Tesseract from 'tesseract.js';
import { getLearnedDigits } from '../../utils/digits';
import { compareImages } from '../../utils/handwriting';
import { VKTrigger } from '../../VirtualKeyboard';

const HandwritingOverlay = ({ onComplete, onCancel, anchorRect }: { onComplete: (val: string) => void; onCancel: () => void; anchorRect?: DOMRect | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recognized, setRecognized] = useState<string | null>(null);
  const timerRef = useRef<any>(null);
  const workerRef = useRef<any>(null);
  const [textInput, setTextInput] = useState('');

  useEffect(() => {
    const initWorker = async () => {
      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
      });
      workerRef.current = worker;
    };
    initWorker();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

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
    setRecognized(null);
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
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(processOCR, 800);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setRecognized(null);
  };

  const preprocessCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const tempCanvas = document.createElement('canvas');
    const scale = 3;
    tempCanvas.width = canvas.width * scale;
    tempCanvas.height = canvas.height * scale;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.3 + data[i+1] * 0.59 + data[i+2] * 0.11;
      const value = gray < 180 ? 0 : 255;
      data[i] = data[i+1] = data[i+2] = value;
    }

    tempCtx.putImageData(imageData, 0, 0);

    const padding = 40;
    const paddedCanvas = document.createElement('canvas');
    paddedCanvas.width = tempCanvas.width + padding * 2;
    paddedCanvas.height = tempCanvas.height + padding * 2;
    const paddedCtx = paddedCanvas.getContext('2d');
    if (paddedCtx) {
      paddedCtx.fillStyle = '#ffffff';
      paddedCtx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
      paddedCtx.drawImage(tempCanvas, padding, padding);
    }

    return paddedCanvas.toDataURL('image/png');
  };

  const matchWithLearnedDigits = async (): Promise<string | null> => {
    if (!canvasRef.current) return null;
    
    const learnedDigits = await getLearnedDigits();
    if (learnedDigits.length === 0) return null;

    const currentCanvas = canvasRef.current;
    const currentCtx = currentCanvas.getContext('2d');
    if (!currentCtx) return null;

    const normalizeCanvas = document.createElement('canvas');
    normalizeCanvas.width = 50;
    normalizeCanvas.height = 50;
    const normalizeCtx = normalizeCanvas.getContext('2d');
    if (!normalizeCtx) return null;

    normalizeCtx.fillStyle = '#ffffff';
    normalizeCtx.fillRect(0, 0, 50, 50);
    normalizeCtx.drawImage(currentCanvas, 0, 0, 50, 50);
    const currentData = normalizeCtx.getImageData(0, 0, 50, 50);

    let bestMatch = { digit: '', score: 0 };

    for (const learned of learnedDigits) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve) => {
        img.onload = () => {
          normalizeCtx.fillStyle = '#ffffff';
          normalizeCtx.fillRect(0, 0, 50, 50);
          normalizeCtx.drawImage(img, 0, 0, 50, 50);
          const learnedData = normalizeCtx.getImageData(0, 0, 50, 50);
          
          const score = compareImages(currentData, learnedData);
          if (score > bestMatch.score) {
            bestMatch = { digit: learned.digit, score };
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = learned.imageData;
      });
    }

    return bestMatch.score > 0.6 ? bestMatch.digit : null;
  };

  const processOCR = async () => {
    if (!canvasRef.current) return;
    setLoading(true);
    
    const learnedResult = await matchWithLearnedDigits();
    
    if (learnedResult) {
      setRecognized(learnedResult);
      setLoading(false);
      return;
    }

    if (!workerRef.current) {
      setLoading(false);
      return;
    }

    const dataUrl = preprocessCanvas();
    if (!dataUrl) {
      setLoading(false);
      return;
    }
    
    try {
      const result = await workerRef.current.recognize(dataUrl);
      const text = result.data.text.replace(/[^0-9]/g, '');
      setRecognized(text || null);
    } catch (err) {
      console.error('OCR error:', err);
    }
    setLoading(false);
  };

  const confirmValue = () => {
    if (recognized) {
      onComplete(recognized);
    }
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  // Calculate position - show to the right of the element, or centered if no anchor
  const getPosition = () => {
    if (anchorRect) {
      let top = anchorRect.top;
      let left = anchorRect.right + 10;
      
      // If would go off right edge, show to the left instead
      if (left + 380 > window.innerWidth) {
        left = anchorRect.left - 390;
      }
      // If would go off left edge, center it
      if (left < 10) {
        left = Math.max(10, (window.innerWidth - 380) / 2);
      }
      // If would go off bottom, move up
      if (top + 380 > window.innerHeight) {
        top = Math.max(10, window.innerHeight - 390);
      }
      return { top, left };
    }
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  };

  const pos = getPosition();

  return createPortal(
    <div style={{ 
      position: 'fixed', 
      top: typeof pos.top === 'number' ? pos.top : pos.top,
      left: typeof pos.left === 'number' ? pos.left : pos.left,
      transform: (pos as any).transform || 'none',
      zIndex: 10001, 
      background: 'white', 
      border: '2px solid #2563eb', 
      padding: '10px', 
      borderRadius: '10px', 
      boxShadow: '0 6px 20px rgba(0,0,0,0.25)', 
      minWidth: '270px',
      maxWidth: '290px',
      direction: 'rtl' 
    }}>
      {/* Title + close */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2563eb' }}>עדכון גובה</span>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}>✕</button>
      </div>

      {/* Text input + VK trigger */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && textInput.trim()) { onComplete(textInput.trim()); } }}
          placeholder="הקלד גובה..."
          autoFocus
          style={{ flex: 1, padding: '6px 8px', fontSize: '16px', border: '2px solid #93c5fd', borderRadius: '6px', textAlign: 'center', direction: 'ltr', outline: 'none' }}
        />
        <VKTrigger value={textInput} onChange={v => setTextInput(v)} mode="numeric" label="גובה" size={15} />
        <button
          onPointerDown={e => e.preventDefault()}
          onClick={() => { if (textInput.trim()) onComplete(textInput.trim()); }}
          disabled={!textInput.trim()}
          style={{ padding: '6px 12px', background: textInput.trim() ? '#10b981' : '#d1fae5', color: textInput.trim() ? 'white' : '#6ee7b7', border: 'none', borderRadius: '6px', cursor: textInput.trim() ? 'pointer' : 'default', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }}
        >✓</button>
      </div>

      {/* Confirm recognized value — ABOVE the canvas */}
      {recognized && (
        <>
          <div style={{ marginBottom: '6px', padding: '6px 8px', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '6px', textAlign: 'center', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#065f46' }}>זוהה: <strong style={{ fontSize: '16px' }}>{recognized}</strong></span>
          </div>
          <button onClick={confirmValue} style={{ marginBottom: '6px', width: '100%', padding: '7px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>✓ אישור — {recognized}</button>
        </>
      )}

      {/* Divider + status */}
      <div style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>
        {loading ? '⏳ מזהה...' : '— כתב יד —'}
      </div>
      
      {/* Canvas — smaller */}
      <canvas 
        ref={canvasRef} 
        width={250} 
        height={130} 
        style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '6px', touchAction: 'none', display: 'block', width: '250px', height: '130px' }}
        onMouseDown={startDrawing} 
        onMouseMove={draw} 
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing} 
        onTouchMove={draw} 
        onTouchEnd={stopDrawing} 
      />
      
      {/* Canvas controls */}
      <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
        <button onClick={clearCanvas} style={{ flex: 1, padding: '5px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>נקה</button>
        <button onClick={processOCR} disabled={loading} style={{ flex: 1, padding: '5px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>עבד</button>
      </div>
    </div>,
    document.body
  );
};

export default HandwritingOverlay;
