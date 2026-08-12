// ─── EmblemPicker — בחירת תמונת סמל במסך הניהול ──────────────────────────────
// רכיב משותף (DRY) לכל הסמלים שמנוהלים מהמסך: סמל בסיס וסמל מיח"ה. הוא אחראי
// על התצוגה, על בחירת הקובץ ועל הכיווץ (src/utils/emblemUpload) - ומחזיר data URL
// מוכן. **מה עושים עם התוצאה** נשאר אצל הקורא: סמל בסיס נשמר עם הטופס (כי בסיס
// חדש עוד לא קיבל id), וסמל מיח"ה נשמר מיד.
//
// הצבעים קשיחים בכוונה - מסך הניהול כולו בפלטה אחת (#0f172a/#1e293b/#334155)
// ואינו מותאם-תמה כמו מסכי העמדה.

import { useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { EMBLEM_ACCEPT, fileToEmblemDataUrl } from '../../utils/emblemUpload';

interface EmblemPickerProps {
  label: string;
  /** מה להציג כרגע: data URL של בחירה חדשה, URL של סמל שמור, או null אם אין */
  previewSrc: string | null;
  onPicked: (dataUrl: string) => void;
  /** מוצג רק כשיש מה להסיר */
  onRemove?: () => void;
  /** הערת מצב מתחת לתצוגה (למשל "ייכנס לתוקף בשמירה") */
  note?: string;
  size?: number;
  /** מזהה ל-e2e: בטאב הבסיסים מוצגים שני פיקרים (מיח"ה + בסיס) */
  testId?: string;
}

export function EmblemPicker({ label, previewSrc, onPicked, onRemove, note, size = 56, testId }: EmblemPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const showImage = !!previewSrc && !broken;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToEmblemDataUrl(file);
      setBroken(false);
      onPicked(dataUrl);
    } catch {
      alert(tr('admin.emblemBadFile'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';   // בחירה חוזרת של אותו קובץ
    }
  };

  return (
    <div data-testid={testId}>
      <div style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 'bold', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: size, height: size, flexShrink: 0, borderRadius: '8px', background: '#0f172a',
          border: `1px solid ${showImage ? '#3b82f6' : '#334155'}`, display: 'grid', placeItems: 'center', overflow: 'hidden',
        }}>
          {showImage
            ? <img src={previewSrc!} alt={label} draggable={false} onError={() => setBroken(true)}
                style={{ width: size - 8, height: size - 8, objectFit: 'contain', display: 'block' }} />
            : <span style={{ fontSize: '18px', opacity: 0.35 }}>🛡️</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <label style={{
              padding: '5px 12px', background: busy ? '#1e293b' : '#1e3a5f', border: '1px solid #3b82f6',
              borderRadius: '5px', cursor: busy ? 'wait' : 'pointer', fontSize: '12px', color: '#60a5fa', whiteSpace: 'nowrap',
            }}>
              {showImage ? tr('admin.emblemReplace') : tr('admin.emblemChoose')}
              <input ref={inputRef} type="file" accept={EMBLEM_ACCEPT} disabled={busy} style={{ display: 'none' }}
                onChange={e => pick(e.target.files?.[0])} />
            </label>
            {onRemove && showImage && (
              <button onClick={() => { setBroken(false); onRemove(); }}
                style={{ padding: '5px 12px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                {tr('admin.emblemRemove')}
              </button>
            )}
          </div>
          <div style={{ fontSize: '10px', color: note ? '#fbbf24' : '#64748b', lineHeight: 1.4 }}>
            {note || (showImage ? tr('admin.emblemHint') : tr('admin.emblemNone'))}
          </div>
        </div>
      </div>
    </div>
  );
}
