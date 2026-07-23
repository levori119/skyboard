import { tr } from '../../i18n/tr';
import { getCurrentEnv, isFlyingEnv } from '../../utils/environment';

// באדג' הסביבה המחוברת — רכיב משותף לסרגל העליון של כל העמדות (CTRL/מגדל/דסק).
// יושב ב-#root ולכן מקבל את zoom של --s אוטומטית (ראה /ui-adapt) — בלי portal.
//
// עקרון בטיחות ATC: סביבת תרגול חייבת להיות מובחנת ויזואלית באופן חד-משמעי,
// שלא יתבלבל תרגול עם אמת. לכן סביבת תרגול צבועה כתום-אזהרה (צבע סטטוס — קבוע
// בכל התמות), וסביבה טסה נייטרלית ונגזרת מהתמה.
type ThemeMode = 'light' | 'dark' | 'ocean';

export default function EnvironmentBadge({ themeMode = 'dark' }: { themeMode?: ThemeMode }) {
  const env = getCurrentEnv();
  const flying = isFlyingEnv(env);

  // צבעי סטטוס (קבועים בכל תמה) לסביבת תרגול — כתום אזהרה
  const training = { bg: '#b45309', border: '#f59e0b', text: '#fffbeb' };

  // סביבה טסה — פלטה נייטרלית נגזרת-תמה
  const flyingC = themeMode === 'dark'
    ? { bg: '#1e293b', border: '#334155', text: '#93c5fd' }
    : themeMode === 'ocean'
    ? { bg: '#c2dbf0', border: '#5b8cc0', text: '#0f172a' }
    : { bg: '#e2e8f0', border: '#94a3b8', text: '#1e293b' };

  const C = flying ? flyingC : training;

  return (
    <div
      title={flying ? undefined : tr('env.trainingHint')}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        background: C.bg, border: `1px solid ${C.border}`, color: C.text,
        padding: '3px 9px', borderRadius: '6px',
        fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap',
        letterSpacing: '0.3px',
      }}
    >
      <span aria-hidden style={{ fontSize: '12px', lineHeight: 1 }}>{flying ? '✈️' : '🎓'}</span>
      <span>{flying ? tr('env.label') : tr('env.training')}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 900 }}>{env}</span>
    </div>
  );
}
