#!/usr/bin/env bash
# בוחר מול איזה מאגר האפליקציה תעלה: המרכזי אם הוא עונה, אחרת המקומי.
#
# ⚠️ **ההכרעה היא בעלייה בלבד, וזה מכוון.** החלפת מאגר תוך כדי ריצה פירושה
# ששתי בקשות עוקבות של אותו מסך נענות משני מאגרים שונים, והבקר רואה מידע
# שקופץ. עמדה שעלתה על המקומי נשארת עליו עד הפעלה מחדש - וזה בדיוק החוזה
# שמסך הכניסה מציג (ARCHITECTURE.md §שני מצבי עלייה).
#
# מדפיס את הכתובת הנבחרת ל-stdout, וכל השאר ל-stderr.
set -uo pipefail

CENTRAL="${CENTRAL_DATABASE_URL:-}"
LOCAL="${LOCAL_DATABASE_URL:-}"
MODE="${DB_MODE:-auto}"
TIMEOUT="${DB_PROBE_TIMEOUT:-5}"

say() { printf '[db] %s\n' "$1" >&2; }

if [ -z "$LOCAL" ]; then say 'חסר LOCAL_DATABASE_URL'; exit 1; fi

case "$MODE" in
  local)  say 'DB_MODE=local - נכפה המאגר המקומי'; echo "$LOCAL"; exit 0 ;;
  remote) say 'DB_MODE=remote - נכפה המאגר המרכזי'; echo "$CENTRAL"; exit 0 ;;
esac

if [ -z "$CENTRAL" ]; then
  say 'אין CENTRAL_DATABASE_URL - עולים מול המאגר המקומי'
  echo "$LOCAL"; exit 0
fi

# ⚠️ `pg_isready` ולא ping: ping עונה גם כששער היציאה חי והמאגר מת, וזו בדיוק
# הטעות שמייצרת עמדה שעלתה "מחוברת" ונתקעת על הבקשה הראשונה.
if pg_isready -d "$CENTRAL" -t "$TIMEOUT" >/dev/null 2>&1; then
  say 'המאגר המרכזי עונה - עולים מולו'
  echo "$CENTRAL"
else
  say 'המאגר המרכזי אינו עונה - עולים עצמאית מול המאגר המקומי'
  echo "$LOCAL"
fi
