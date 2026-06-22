---
name: realtime
description: Real-time / WebSocket Playbook — מדריך מלא למעבר מ-polling ל-WebSocket. הפעל לפני כל עבודה על סנכרון בין עמדות.
---

# Playbook: WebSocket / Real-time — SKY-KING

## קרא CLAUDE.md

זכור: "עדכון בזמן אמת בין עמדות" הוא פריט MVP שטרם הושלם.

## המצב הנוכחי

המערכת משתמשת ב-**polling** — כל עמדה שואלת את ה-server כל ~5 שניות:
- `GET /api/strips` — כל הסטריפים
- `GET /api/strip-transfers` — העברות פעילות
- `GET /api/strip-zone-assignments` — שיוכי אזורים
- `GET /api/activity-log` — log

**הבעיה:** עיכוב של עד 5 שניות בין עמדות, עומס מיותר על DB.

## הגישה המומלצת: Socket.io

### למה Socket.io ולא WebSocket נטיבי?
- fallback אוטומטי ל-long-polling אם WebSocket לא זמין
- rooms/namespaces — שימושי לסקטורים שונים
- reconnect אוטומטי
- קל לשלב עם Express קיים

### ארכיטקטורה מוצעת

```
Client (React)                 Server (Express + Socket.io)
     │                                    │
     │  connect + join_room(presetId)     │
     │ ──────────────────────────────>   │
     │                                    │
     │  [action: update_strip]            │
     │ ──────────────────────────────>   │
     │                         DB save   │
     │                         emit to all in room
     │  <── strip_updated ───────────── │
     │                                    │
     │  [action: send_transfer]           │
     │ ──────────────────────────────>   │
     │                         emit to target preset
     │  <── transfer_incoming ─────────  │
```

### Events לממש

#### Server → Client (push)
```javascript
'strip_updated'      // { strip }          — סטריפ עודכן
'strip_created'      // { strip }          — סטריפ חדש
'strip_deleted'      // { stripId }        — סטריפ נמחק
'transfer_incoming'  // { transfer }       — העברה נכנסת
'transfer_updated'   // { transfer }       — סטטוס העברה שינה
'zone_updated'       // { assignment }     — שיוך אזור שינה
'ground_aircraft_updated' // { stripId, aircraft[] }
```

#### Client → Server
```javascript
'join_workstation'   // { presetId }       — כניסה לעמדה
'leave_workstation'  // { presetId }       — יציאה
```

### שלבי מימוש

**שלב 1 — Backend (server.js)**
```javascript
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('join_workstation', ({ presetId }) => {
    socket.join(`preset_${presetId}`);
  });
});

// בכל PUT /api/strips/:id — אחרי ה-DB save:
io.to(`preset_${affectedPresets}`).emit('strip_updated', { strip });
```

**שלב 2 — Frontend (App.tsx)**
```typescript
import { io } from 'socket.io-client';
const socket = io('/');

socket.on('strip_updated', ({ strip }) => {
  setStrips(prev => prev.map(s => s.id === strip.id ? strip : s));
});
```

**שלב 3 — הסרת polling הדרגתית**
לא להסיר polling בבת אחת — להוסיף WebSocket קודם ולוודא שעובד, אחר כך להאריך interval ל-30s, אחר כך להסיר.

## כללי מימוש
- לא להסיר polling עד שWebSocket יציב שבוע
- כל event ב-WebSocket חייב ב-fallback אם socket לא מחובר
- `join_workstation` בכניסה + `leave_workstation` ביציאה/ריענון
- הפעל `/arch` לפני שמתחילים לממש
