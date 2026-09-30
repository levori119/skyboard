#!/usr/bin/env bash
# מצב הרפליקציה - האם הנתונים באמת זורמים, ומה הפער.
#
# ⚠️ **"המנוי קיים" אינו "הנתונים זורמים".** מנוי יכול להיות מוגדר, מופעל,
# ולא להחיל שורה אחת - כי העובד מת, כי הסלוט נעלם במרכז, או כי הוא נכנס
# ללולאת שגיאה. שלוש הבדיקות כאן נבדלות בדיוק בזה.
#
# הרצה:   ./docker/scripts/sync-status.sh
#         ./docker/scripts/sync-status.sh --watch      # כל 10 שניות
# יציאה:  0 = זורם · 1 = לא זורם · 2 = אין מנוי כלל
set -uo pipefail

LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://${LOCAL_DB_USER:-skyking}:${LOCAL_DB_PASSWORD:-}@127.0.0.1:${LOCAL_DB_PORT:-5433}/${LOCAL_DB_NAME:-skyking}}"
CENTRAL_URL="${CENTRAL_DATABASE_URL:-}"
SUB="${SKYKING_SUBSCRIPTION:-skyking_sub}"
SLOT="${SKYKING_SLOT:-skyking_slot_station}"

q() { psql "$1" -At -c "$2" 2>/dev/null; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

check() {
  local rc=0
  echo "── המנוי (מקומי) ─────────────────────────────────────────"

  if ! q "$LOCAL_URL" 'SELECT 1' >/dev/null; then
    bad "אין קשר למאגר המקומי - האם הקונטיינר רץ?"
    return 2
  fi

  local enabled
  enabled=$(q "$LOCAL_URL" "SELECT subenabled FROM pg_subscription WHERE subname='$SUB'")
  if [ -z "$enabled" ]; then
    bad "מנוי '$SUB' אינו קיים - להריץ docker/replication/02-subscription.sql"
    return 2
  fi
  # ⚠️ מנוי **מושבת** הוא המצב שנוצר אחרי שגיאה (disable_on_error), וזה בדיוק
  # המקרה שנראה "שקט" ובפועל לא מסנכרן דבר.
  [ "$enabled" = "t" ] && ok "המנוי מופעל" || { bad "המנוי **מושבת** - נכנס לשגיאה. לבדוק את הלוג של הקונטיינר"; rc=1; }

  # עובד פעיל = יש תהליך שמחיל. בלעדיו אין זרימה, גם אם המנוי מופעל.
  local pid
  pid=$(q "$LOCAL_URL" "SELECT pid FROM pg_stat_subscription WHERE subname='$SUB'")
  [ -n "$pid" ] && ok "עובד ההחלה פעיל (pid $pid)" || { bad "אין עובד החלה - אין זרימה"; rc=1; }

  # הפער בפועל: מתי הגיעה ומתי הוחלה ההודעה האחרונה
  local last
  last=$(q "$LOCAL_URL" \
    "SELECT COALESCE(to_char(latest_end_time,'YYYY-MM-DD HH24:MI:SS'),'—')
       FROM pg_stat_subscription WHERE subname='$SUB'")
  [ -n "$last" ] && ok "הודעה אחרונה מהמרכז: $last"

  local errs
  errs=$(q "$LOCAL_URL" \
    "SELECT count(*) FROM pg_stat_subscription_stats WHERE subname='$SUB' AND (apply_error_count>0 OR sync_error_count>0)")
  [ "${errs:-0}" != "0" ] && { bad "יש שגיאות החלה - SELECT * FROM pg_stat_subscription_stats"; rc=1; } || ok "אין שגיאות החלה"

  local rows
  rows=$(q "$LOCAL_URL" "SELECT count(*) FROM public.strips")
  ok "פ\"מים במאגר המקומי: ${rows:-0}"

  if [ -n "$CENTRAL_URL" ]; then
    echo "── הסלוט (מרכז) ──────────────────────────────────────────"
    if ! q "$CENTRAL_URL" 'SELECT 1' >/dev/null; then
      warn "אין קשר למרכז - העמדה עובדת מול המאגר המקומי (זה תקין בנתק)"
      return $rc
    fi
    local act lag
    act=$(q "$CENTRAL_URL" "SELECT active FROM pg_replication_slots WHERE slot_name='$SLOT'")
    if [ -z "$act" ]; then
      bad "הסלוט '$SLOT' אינו קיים במרכז - המנוי לעולם לא יתקדם"; rc=1
    elif [ "$act" = "t" ]; then
      ok "הסלוט פעיל ומחובר"
    else
      # ⚠️ סלוט לא פעיל = המרכז **צובר WAL** בשבילנו. זו לא אזהרה תיאורטית:
      # סלוט נטוש ממלא את דיסק המרכז.
      warn "הסלוט קיים אך **אינו מחובר** - המרכז צובר WAL בשבילנו"; rc=1
    fi
    lag=$(q "$CENTRAL_URL" \
      "SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn))
         FROM pg_replication_slots WHERE slot_name='$SLOT'")
    [ -n "$lag" ] && ok "WAL שטרם נצרך: $lag"
  else
    warn "CENTRAL_DATABASE_URL לא מוגדר - בדיקת הסלוט במרכז דולגה"
  fi
  return $rc
}

if [ "${1:-}" = "--watch" ]; then
  while true; do clear; date '+%H:%M:%S'; check; sleep 10; done
else
  check
fi
