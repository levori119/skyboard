# syntax=docker/dockerfile:1
# ─── SKY-KING — קונטיינר production יחיד: server.js מגיש את ה-frontend (dist) + ה-API על אותו פורט ───

# ============ שלב בנייה ============
# node 22 לפי engines ב-package.json. bookworm-slim (glibc) — תואם ל-binaries
# הפרה-בנויים של esbuild/swc (יציב יותר מ-alpine/musl בבנייה).
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# תלויות תחילה (שכבת cache נפרדת — מתבטלת רק כשה-lock משתנה). npm ci = בנייה דטרמיניסטית מה-lock.
COPY package.json package-lock.json ./
RUN npm ci

# קוד המקור + בנייה: tsc (בדיקת טיפוסים) → vite build → dist/
# (node_modules/dist/.env מוחרגים ב-.dockerignore כדי לא לדרוס את ההתקנה ולא להדליף סודות)
COPY . .
RUN npm run build

# ============ שלב ריצה ============
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# תלויות production בלבד (ה-frontend כבר בנוי — אין צורך ב-vite/tsc/devDeps)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# הקוד הבנוי + השרת. server/app.js מגיש dist/ ו-public/ (driver.html) יחסית ל-server/
COPY --from=builder /app/dist ./dist
COPY server.js ./
COPY server ./server
COPY public ./public
# המיראז' — כדי שאותו image ישמש גם שירות מיראז' ב-Railway עם
# Start Command = node mirage/server.js (בלעדיו: MODULE_NOT_FOUND בעלייה)
COPY mirage ./mirage

# השרת מאזין על PORT (ברירת מחדל 3001) ב-0.0.0.0 — ראה server.js
ENV PORT=3001
EXPOSE 3001

# בדיקת בריאות בסיסית — מוודא שה-API עונה
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/sectors').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# הרצה כמשתמש לא-root (קיים באימג' הרשמי). האפליקציה קוראת-בלבד מהדיסק.
USER node

CMD ["node", "server.js"]
