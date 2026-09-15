// המפה הצפה במצב Google - מצייר בלבד. ראה הערת הראש ב-liveMap.html.
//
// הפרוטוקול, **רק מול אותו מקור**:
//   העמדה -> הדף:  live-map:init  { key }
//                  live-map:state { trips: [{ id, color, icon, label, lat, lng, stale, trail }], fit }
//   הדף -> העמדה:  live-map:ready        - הסקריפט עלה, אפשר לשלוח init
//                  live-map:error        { reason: 'no_key' | 'auth_failed' | 'load_failed' }
//                  live-map:user-moved   - הפקח גרר או הגדיל בעצמו, "התאם לרכבים" כבה
(function () {
  'use strict';

  var map = null;
  var loading = false;
  var pending = null;          // מצב שהגיע לפני שהמפה עלתה
  var vehicles = new Map();    // tripId -> google.maps.Marker
  var trails = new Map();      // tripId -> google.maps.Marker[]
  var programmatic = false;    // הזזה שלנו (fitBounds) אינה "הפקח הזיז"

  function post(msg) {
    if (window.parent !== window) window.parent.postMessage(msg, location.origin);
  }

  function loadGoogle(key) {
    if (map || loading) return;
    if (!key) { post({ type: 'live-map:error', reason: 'no_key' }); return; }
    loading = true;
    // Google דוחה מפתח לא תקין **אחרי** שהסקריפט נטען - בלי onerror, רק מפה אפורה.
    // Maps JS קורא ל-gm_authFailure הגלובלי, וממנו העמדה מסבירה למה.
    window.gm_authFailure = function () { post({ type: 'live-map:error', reason: 'auth_failed' }); };
    window.__liveMapReady = function () {
      map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 31.5, lng: 34.8 }, zoom: 15, mapTypeId: 'hybrid',
        streetViewControl: false, fullscreenControl: false, mapTypeControl: true,
      });
      // גרירה או זום של הפקח מכבים את "התאם לרכבים" - אחרת המפה קופצת חזרה
      // לרכבים מתחת ליד שלו בעדכון הבא, כל 5 שניות
      map.addListener('dragstart', function () { post({ type: 'live-map:user-moved' }); });
      map.addListener('zoom_changed', function () { if (!programmatic) post({ type: 'live-map:user-moved' }); });
      if (pending) { render(pending); pending = null; }
    };
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&callback=__liveMapReady';
    s.async = true;
    s.onerror = function () { loading = false; post({ type: 'live-map:error', reason: 'load_failed' }); };
    document.head.appendChild(s);
  }

  function dot(color, stale) {
    return {
      path: google.maps.SymbolPath.CIRCLE, scale: 13,
      fillColor: stale ? '#64748b' : color, fillOpacity: 1,
      // אות אבד: אפור עם מסגרת בצבע הנסיעה - כך עדיין ברור **איזו** נסיעה זו
      strokeColor: stale ? color : '#ffffff', strokeWeight: 3,
    };
  }

  function render(state) {
    if (!map) { pending = state; return; }
    var trips = Array.isArray(state.trips) ? state.trips : [];
    var seen = new Set();
    var bounds = new google.maps.LatLngBounds();
    var count = 0;

    trips.forEach(function (t) {
      seen.add(t.id);
      // ── השובל: הקליטות האחרונות, דוהות מהישנה לחדשה ──
      var old = trails.get(t.id) || [];
      old.forEach(function (m) { m.setMap(null); });
      var trail = [];
      if (Array.isArray(t.trail)) {
        t.trail.forEach(function (p, i) {
          if (!isFinite(p.lat) || !isFinite(p.lng)) return;
          trail.push(new google.maps.Marker({
            map: map, position: { lat: p.lat, lng: p.lng }, clickable: false, zIndex: 1,
            icon: {
              path: google.maps.SymbolPath.CIRCLE, scale: 4, strokeWeight: 0,
              fillColor: t.color, fillOpacity: 0.25 + 0.7 * ((i + 1) / t.trail.length),
            },
          }));
          bounds.extend({ lat: p.lat, lng: p.lng });
        });
      }
      trails.set(t.id, trail);

      // ── הרכב ──
      if (!isFinite(t.lat) || !isFinite(t.lng)) {
        var gone = vehicles.get(t.id);
        if (gone) { gone.setMap(null); vehicles.delete(t.id); }
        return;
      }
      var pos = { lat: t.lat, lng: t.lng };
      var m = vehicles.get(t.id);
      if (!m) {
        m = new google.maps.Marker({ map: map, zIndex: 10 });
        vehicles.set(t.id, m);
      }
      m.setPosition(pos);
      m.setIcon(dot(t.color, t.stale));
      m.setLabel({ text: t.icon || '🚗', fontSize: '14px' });
      m.setTitle(t.label || '');
      bounds.extend(pos);
      count++;
    });

    // נסיעה שהוסרה מהמפה - גם הרכב וגם השובל שלה יורדים
    vehicles.forEach(function (m, id) { if (!seen.has(id)) { m.setMap(null); vehicles.delete(id); } });
    trails.forEach(function (arr, id) {
      if (!seen.has(id)) { arr.forEach(function (x) { x.setMap(null); }); trails.delete(id); }
    });

    if (state.fit && !bounds.isEmpty()) {
      programmatic = true;
      if (count <= 1 && !trips.some(function (t) { return t.trail && t.trail.length > 1; })) {
        map.setCenter(bounds.getCenter());
        map.setZoom(17);
      } else {
        map.fitBounds(bounds, 60);
      }
      google.maps.event.addListenerOnce(map, 'idle', function () { programmatic = false; });
    }
  }

  window.addEventListener('message', function (e) {
    // רק העמדה עצמה - דף אחר שמסגר את הדף הזה לא יכול לצייר בו
    if (e.origin !== location.origin || !e.data || typeof e.data.type !== 'string') return;
    if (e.data.type === 'live-map:init') loadGoogle(e.data.key);
    else if (e.data.type === 'live-map:state') render(e.data);
  });

  post({ type: 'live-map:ready' });
})();
