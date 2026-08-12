// תצוגת מז"א על המפה - **מקור אמת יחיד** לקטלוג שכבות Windy ולכתובת ההטמעה.
//
// למה iframe ולא אריחי מפה (tile layer): ה-CSP של העמדה מתיר מסגרות חיצוניות
// (`frame-src 'self' https: http:`) אבל **לא** תמונות חיצוניות
// (`img-src 'self' data: blob:`) - ראה server/middleware/securityHeaders.js.
// שכבת אריחים הייתה דורשת לפתוח את img-src ואת connect-src לשרתי Windy, כלומר
// להרחיב את משטח התקיפה של העמדה עבור תצוגה. ההטמעה עובדת כמו שהיא, בלי מפתח
// API ובלי תלות npm חדשה (SK-30 - כל תלות נוספת היא סיכון ברשת מבודדת).
//
// מזהי השכבות אומתו מול ה-bundle של embed.windy.com (גרסה 41.1.0) ולא נוחשו.

/** מזהה שכבה כפי ש-Windy מקבל אותו בפרמטר `overlay`. */
export type WindyOverlay =
  | 'radar' | 'satellite' | 'wind' | 'rain' | 'temp' | 'hurricanes'
  | 'clouds' | 'waves' | 'rainAccu' | 'thunder'
  | 'gust' | 'visibility' | 'cbase' | 'deg0' | 'cape';

export type WeatherLayerGroup = 'quick' | 'aviation';

/**
 * מפלס התצוגה. Windy מקבל `surface` או מפלס לחץ, והגבהים כאן הם הגבהים
 * המקורבים באטמוספירה תקנית - זו השפה של הבקר, לא הקטורים.
 * **נבדק בדפדפן:** כל מפלס מרנדר שדה שונה, ולא רק מקרא שונה.
 */
export const WINDY_LEVELS = [
  { id: 'surface', labelKey: 'weather.lvl_surface' },
  { id: '950h', labelKey: 'weather.lvl_950h' },   // ~2,000 ft
  { id: '900h', labelKey: 'weather.lvl_900h' },   // ~3,000 ft
  { id: '850h', labelKey: 'weather.lvl_850h' },   // ~5,000 ft
  { id: '700h', labelKey: 'weather.lvl_700h' },   // ~FL100
  { id: '600h', labelKey: 'weather.lvl_600h' },   // ~FL140
  { id: '500h', labelKey: 'weather.lvl_500h' },   // ~FL180
  { id: '400h', labelKey: 'weather.lvl_400h' },   // ~FL240
  { id: '300h', labelKey: 'weather.lvl_300h' },   // ~FL300
  { id: '250h', labelKey: 'weather.lvl_250h' },   // ~FL340
  { id: '200h', labelKey: 'weather.lvl_200h' },   // ~FL390
] as const;

export type WindyLevel = typeof WINDY_LEVELS[number]['id'];
export const DEFAULT_LEVEL: WindyLevel = 'surface';
const LEVEL_IDS = new Set<string>(WINDY_LEVELS.map(l => l.id));
export const isWindyLevel = (v: unknown): v is WindyLevel => typeof v === 'string' && LEVEL_IDS.has(v);

export interface WeatherLayerDef {
  id: WindyOverlay;
  /** מפתח ה-i18n בקבוצת weather (weather.layer_<id>). */
  labelKey: string;
  /**
   * לשכבה יש משמעות בגובה. מכ"ם, לוויין וגלים הם תצפית פני-שטח ומתעלמים
   * מהמפלס, ולכן בורר הגובה מוסתר עליהן במקום להציג פקד שלא עושה דבר.
   */
  levels?: true;
  /**
   * דגימת הצבע בתפריט - CSS gradient שמחקה את סקלת הצבעים של השכבה ב-Windy.
   * **לא** תמונה מהאתר: img-src חוסם מקור חיצוני, ותמונה מוטבעת הייתה מנפחת
   * את הבאנדל. העיגול הצבעוני עונה על אותה שאלה - "איזו שכבה זו" - במבט אחד.
   */
  swatch: string;
  /** ה-`product` שנשלח ל-Windy כשהשכבה אינה מודל תחזית רגיל. */
  product?: string;
  group: WeatherLayerGroup;
}

/**
 * עשר השכבות הראשונות הן **התפריט המהיר של Windy** בדיוק ובאותו סדר, כפי
 * שהוצג באפיון. חמש הבאות נוספו כי הן מה שבקר ופקח באמת שואלים עליו - משבי
 * רוח לפני נחיתה, ראות, בסיס עננים, גובה איזותרם 0° וחוסר יציבות (CAPE).
 */
export const WEATHER_LAYERS: WeatherLayerDef[] = [
  { id: 'radar', labelKey: 'weather.layer_radar', group: 'quick', product: 'radar', swatch: 'linear-gradient(135deg,#0b3d91,#22d3ee 35%,#22c55e 55%,#facc15 75%,#ef4444)' },
  { id: 'satellite', labelKey: 'weather.layer_satellite', group: 'quick', product: 'satellite', swatch: 'linear-gradient(135deg,#0f172a,#1e3a5f 40%,#94a3b8 70%,#f8fafc)' },
  { id: 'wind', labelKey: 'weather.layer_wind', group: 'quick', levels: true, swatch: 'linear-gradient(135deg,#0d9488,#22d3ee 40%,#a78bfa 70%,#f472b6)' },
  { id: 'rain', labelKey: 'weather.layer_rain', group: 'quick', swatch: 'linear-gradient(135deg,#1e3a8a,#3b82f6 40%,#22d3ee 65%,#fde047)' },
  { id: 'temp', labelKey: 'weather.layer_temp', group: 'quick', levels: true, swatch: 'linear-gradient(135deg,#312e81,#0ea5e9 30%,#22c55e 50%,#facc15 70%,#dc2626)' },
  { id: 'hurricanes', labelKey: 'weather.layer_hurricanes', group: 'quick', swatch: 'conic-gradient(from 210deg,#7f1d1d,#ef4444,#fb923c,#fde68a,#7f1d1d)' },
  { id: 'clouds', labelKey: 'weather.layer_clouds', group: 'quick', swatch: 'linear-gradient(135deg,#1e293b,#64748b 45%,#cbd5e1 75%,#ffffff)' },
  { id: 'waves', labelKey: 'weather.layer_waves', group: 'quick', swatch: 'linear-gradient(135deg,#312e81,#2563eb 40%,#06b6d4 70%,#a3e635)' },
  { id: 'rainAccu', labelKey: 'weather.layer_rainAccu', group: 'quick', swatch: 'linear-gradient(135deg,#f8fafc,#7dd3fc 35%,#2563eb 65%,#7e22ce)' },
  { id: 'thunder', labelKey: 'weather.layer_thunder', group: 'quick', swatch: 'linear-gradient(135deg,#111827,#4c1d95 45%,#f59e0b 75%,#fef08a)' },

  { id: 'gust', labelKey: 'weather.layer_gust', group: 'aviation', levels: true, swatch: 'linear-gradient(135deg,#134e4a,#14b8a6 35%,#facc15 65%,#dc2626)' },
  { id: 'visibility', labelKey: 'weather.layer_visibility', group: 'aviation', swatch: 'linear-gradient(135deg,#7f1d1d,#b45309 35%,#a8a29e 65%,#f8fafc)' },
  { id: 'cbase', labelKey: 'weather.layer_cbase', group: 'aviation', swatch: 'linear-gradient(135deg,#451a03,#b45309 35%,#cbd5e1 70%,#ffffff)' },
  { id: 'deg0', labelKey: 'weather.layer_deg0', group: 'aviation', swatch: 'linear-gradient(135deg,#1e1b4b,#3b82f6 40%,#67e8f9 70%,#f0f9ff)' },
  { id: 'cape', labelKey: 'weather.layer_cape', group: 'aviation', swatch: 'linear-gradient(135deg,#052e16,#16a34a 35%,#facc15 65%,#dc2626)' },
];

export const DEFAULT_OVERLAY: WindyOverlay = 'radar';

const BY_ID = new Map(WEATHER_LAYERS.map(l => [l.id, l]));

/** הגדרת השכבה, או `undefined` למזהה שאינו בקטלוג. */
export const weatherLayer = (id: string): WeatherLayerDef | undefined => BY_ID.get(id as WindyOverlay);

export const isWindyOverlay = (v: unknown): v is WindyOverlay =>
  typeof v === 'string' && BY_ID.has(v as WindyOverlay);

/**
 * כתובת ההטמעה. ניתנת לדריסה ב-`VITE_WINDY_EMBED_URL` כדי שבסיס שמפעיל מראה
 * (mirror) פנימי של Windy יוכל להצביע אליו בלי שינוי קוד - ברשת מבודדת זו
 * ההבדל בין פיצ'ר עובד לפיצ'ר מת.
 */
export const WINDY_EMBED_BASE: string =
  ((import.meta as unknown as { env?: Record<string, string> })?.env?.VITE_WINDY_EMBED_URL)
  || 'https://embed.windy.com/embed2.html';

export interface WindyEmbedOpts {
  lat: number;
  lon: number;
  /** רמת זום של Leaflet (מספר שלם). */
  zoom: number;
  overlay: WindyOverlay;
  /** מפלס התצוגה. נשלח רק לשכבות שיש להן משמעות בגובה. */
  level?: WindyLevel;
  /**
   * `clean` - שכבה מעוגנת על מפת השדה: בלי סמן ובלי חלונית מידע, כי היא רקע
   * ולא כלי. `full` - חלון צף שהמשתמש עובד בתוכו: שם לחיצה על המפה פותחת את
   * טבלת התחזית בנקודה (רוח, משבים וכיוון לפי שעות) - **נבדק בדפדפן**.
   */
  chrome?: 'clean' | 'full';
}

/**
 * `kt` ו-`°C` ולא ברירת המחדל של Windy: אלו היחידות שעל הסדק ובכריזת ה-ATIS.
 * מטר לשנייה על מסך של בקר טיסה הוא תרגום מיותר בראש, בזמן אמת.
 */
const COMMON: Record<string, string> = {
  menu: '',
  message: '',
  calendar: 'now',
  pressure: '',
  type: 'map',
  location: 'coordinates',
  metricWind: 'kt',
  metricTemp: '°C',
  radarRange: '-1',
};

/** בונה את כתובת ההטמעה של Windy לשכבה, למרכז ולזום נתונים. */
export function windyEmbedUrl(o: WindyEmbedOpts): string {
  const def = weatherLayer(o.overlay);
  const params: Record<string, string> = {
    lat: o.lat.toFixed(5),
    lon: o.lon.toFixed(5),
    zoom: String(Math.round(o.zoom)),
    overlay: o.overlay,
    ...COMMON,
    // מפלס נשלח רק לשכבה שיש לה משמעות בגובה; לשאר Windy מתעלם ממנו ממילא,
    // והשארתו מייצרת כתובת שונה לכל מפלס ולכן טעינה מחדש מיותרת.
    level: def?.levels && o.level ? o.level : DEFAULT_LEVEL,
    // סמן וחלונית פירוט רק בחלון שעובדים בו: `detail` הוא מה שהופך לחיצה על
    // המפה לטבלת רוח/משבים/כיוון בנקודה. על שכבה מעוגנת הם רעש שנע עם המפה.
    marker: o.chrome === 'full' ? 'true' : '',
    detail: o.chrome === 'full' ? 'true' : '',
  };
  if (def?.product) params.product = def.product;

  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${WINDY_EMBED_BASE}?${qs}`;
}
