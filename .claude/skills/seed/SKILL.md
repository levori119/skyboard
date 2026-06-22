---
name: seed
description: Seed Data Manager — נהל נתוני אתחול (סקטורים, עמדות, משתמשים) בנפרד מסכמת ה-DB
---

# Seed Data Manager — SKY-KING

## קרא CLAUDE.md + data-model.md

## הבעיה הנוכחית

נתוני seed (אמיתיים: שמות, סקטורים, עמדות) מעורבבים בתוך `initDb()` ב-`server.js`.
זה מסוכן: שינוי seed יכול לשבור את כל ה-init.

## עקרון Seed נכון

```
initDb()     — schema בלבד (CREATE TABLE, ALTER TABLE)
seedDb()     — נתוני ברירת מחדל (INSERT ... ON CONFLICT DO NOTHING)
```

## פלט של סקיל זה

כשמפעילים `/seed`, אני אעשה אחד מהבאים:

### א. הוספת נתון seed חדש
1. מזהה לאיזה טבלה
2. כותב INSERT עם `ON CONFLICT DO NOTHING`
3. שואל: האם ב-`initDb()` (זמני) או ב-`seedDb()` נפרד (מומלץ)?

### ב. עדכון נתון קיים
1. מזהה את ה-INSERT הקיים ב-`initDb()`
2. כותב UPDATE עם `ON CONFLICT DO UPDATE SET ...`
3. מוסיף הסבר למה השינוי

### ג. רשימת כל ה-seed הנוכחי
מדפיס את כל ה-INSERT הקיימים מ-`initDb()`:
- crew_members (אורי לב, אורן בן דור, יוחאי שטיינברג, ...)
- sectors (CENTER, SOUTH, Ctr6, Ctr8, GILO, תווך...)
- sub_sectors
- table_modes (בתק עומק)
- workstation_presets (מרחבי 305/304, מטרו, תווך)

## כללים
- נתון seed = `ON CONFLICT DO NOTHING` תמיד (אל תדרוס data קיים)
- אל תוסיף seed של פ"מ אמיתיים (strips) — אלה נתוני הפעלה, לא seed
- אם נתון seed שונה בין סביבות (פיתוח vs ייצור) — לתעד את ההבדל
- מי מוסמך לשנות seed? → CEO בלבד
