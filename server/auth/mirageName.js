// ─── מיראז' הוא מקור האמת לשם איש הצוות ──────────────────────────────────────
// איש צוות שכבר קיים ב-crew_members (לפי מספר אישי) קיבל בכניסה את השם השמור
// אצלנו - ושינוי שם במיראז' לא הגיע לעמדה ("איש צוות: אורן בן דור" גם אחרי
// שהשם שונה). כאן השם ממיראז' גובר; ריק ממיראז' - נשאר השם הקיים.

/** השם המלא מתשובת מיראז' (fullName, ואם אין - פרטי + משפחה). ריק = אין שם */
export function mirageFullName(user) {
  const u = user || {};
  return String(u.fullName || `${u.firstName || ''} ${u.lastName || ''}`).trim();
}

/**
 * איש הצוות עם השם של מיראז'. מחזיר `{ member, changed }` - `changed` אומר
 * שצריך לעדכן גם את crew_members, כדי שיומנים ומסכים אחרים יראו את השם החדש.
 */
export function withMirageName(member, user) {
  const name = mirageFullName(user);
  if (!member || !name) return { member, changed: false };
  const first = String(user?.firstName ?? '').trim() || member.first_name || '';
  const last = String(user?.lastName ?? '').trim() || member.last_name || '';
  const changed = name !== member.name || first !== (member.first_name || '') || last !== (member.last_name || '');
  return { member: changed ? { ...member, name, first_name: first, last_name: last } : member, changed };
}
