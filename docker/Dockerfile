# תמונת האפליקציה. Node/TypeScript - להתאמה לפרויקט אחר צריך לגעת רק
# בפקודות ה-build וה-start שלמטה.
#
# ⚠️ **בנייה בשני שלבים.** שלב הבנייה מחזיק את כל תלויות הפיתוח (vite, tsc,
# electron) - מאות מגה-בייטים שאין להם מה לחפש בתמונה שרצה בעמדה. השלב השני
# מקבל רק את מה שנדרש בזמן ריצה.

# ── שלב 1: בנייה ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

# ⚠️ **התלויות לפני הקוד, ובכוונה.** שכבת ה-npm נשמרת ב-cache כל עוד
# package-lock.json לא השתנה; העתקת הקוד קודם הייתה מבטלת אותה בכל שינוי
# בקובץ אחד, ו-`npm ci` היה רץ מחדש בכל בנייה.
COPY package.json package-lock.json ./
# `--ignore-scripts`: electron מוריד בינארי של 150MB ב-postinstall, ואין בו
# שום צורך בשרת. `npm ci` ולא `install` - בנייה חוזרת חייבת להיות זהה.
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ── שלב 2: ריצה ───────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `postgresql-client` נדרש ל-pg_isready ול-psql שבסקריפטי הבדיקה והרפליקציה
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# רק מה שהשרת צריך בזמן ריצה
COPY --from=build /app/dist        ./dist
COPY --from=build /app/server      ./server
COPY --from=build /app/shared      ./shared
COPY --from=build /app/server.js   ./server.js
COPY docker/scripts/entrypoint.sh  /usr/local/bin/entrypoint.sh
COPY docker/scripts/pick-database-url.sh /usr/local/bin/pick-database-url.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/pick-database-url.sh

# ⚠️ לא כ-root. קונטיינר עם מידע שדה שרץ כ-root הוא הסלמה בחינם.
USER node

EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
