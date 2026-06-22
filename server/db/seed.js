import pool from './pool.js';

export async function seedDb() {
  const sq = async (q, p) => {
    try { return await pool.query(q, p); }
    catch(e) { console.warn('[seed]', e.message.slice(0, 120)); return { rows: [], rowCount: 0 }; }
  };

  // ── Crew members ──────────────────────────────────────────────────────────
  await sq(`INSERT INTO crew_members (name, first_name, last_name, is_admin)
    VALUES ('אורי לב', 'אורי', 'לב', TRUE) ON CONFLICT (name) DO NOTHING`);

  await sq(`INSERT INTO crew_members (name, first_name, last_name, personal_id, is_admin)
    VALUES ('אורן בן דור', 'אורן', 'בן דור', '5229214', FALSE) ON CONFLICT (name) DO NOTHING`);

  await sq(`INSERT INTO crew_members (name, first_name, last_name, personal_id, is_admin)
    VALUES ('יוחאי שטיינברג', 'יוחאי', 'שטיינברג', '34234', TRUE) ON CONFLICT (name) DO NOTHING`);

  // ── Sectors (נקודות העברה) ────────────────────────────────────────────────
  const sectorsToSeed = [
    { name: 'CENTER',            label_he: 'מרכז',              category: null,                 notes: null },
    { name: 'SOUTH',             label_he: 'דרום',              category: null,                 notes: null },
    { name: 'Ctr6',              label_he: 'חצרים',             category: null,                 notes: null },
    { name: 'Ctr8',              label_he: 'תלנוף',             category: null,                 notes: null },
    { name: 'GILO',              label_he: 'גילה',              category: 'מעבר בין 305-304',  notes: 'כעגכצצת-40' },
    { name: 'תווך - מטרו צפון', label_he: 'תווך - מטרו צפון', category: null,                 notes: 'מעבר בין תווך למטרו' },
    { name: 'תווך - מטרו מרכז', label_he: 'תווך - מטרו מרכז', category: null,                 notes: 'מעבר בין תווך למטרו מרכז' },
  ];

  for (const s of sectorsToSeed) {
    await sq(
      `INSERT INTO sectors (name, label_he, category, notes) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING`,
      [s.name, s.label_he, s.category, s.notes]
    );
  }

  // ── Sector neighbors ──────────────────────────────────────────────────────
  const { rows: allSectors } = await sq(`SELECT id, name FROM sectors`);
  const sectorByName = {};
  for (const row of allSectors) sectorByName[row.name] = row.id;

  const neighborPairs = [['CENTER', 'SOUTH'], ['SOUTH', 'CENTER']];
  for (const [a, b] of neighborPairs) {
    if (sectorByName[a] && sectorByName[b]) {
      await sq(
        `INSERT INTO sector_neighbors (sector_id, neighbor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [sectorByName[a], sectorByName[b]]
      );
    }
  }

  // ── Sub-sectors (only if empty) ───────────────────────────────────────────
  const { rows: ssCount } = await sq(`SELECT COUNT(*) FROM sub_sectors`);
  if (ssCount[0].count === '0') {
    const subSectorsToSeed = [
      { sector: 'CENTER', neighbor: 'SOUTH', label: 'דרום-מערב', x: 0.2, y: 0.8 },
      { sector: 'CENTER', neighbor: 'SOUTH', label: 'דרום-מזרח', x: 0.8, y: 0.8 },
      { sector: 'SOUTH',  neighbor: 'CENTER', label: 'מרכז-צפון', x: 0.5, y: 0.2 },
    ];
    for (const ss of subSectorsToSeed) {
      if (sectorByName[ss.sector] && sectorByName[ss.neighbor]) {
        await sq(
          `INSERT INTO sub_sectors (sector_id, neighbor_id, label, default_x, default_y) VALUES ($1, $2, $3, $4, $5)`,
          [sectorByName[ss.sector], sectorByName[ss.neighbor], ss.label, ss.x, ss.y]
        );
      }
    }
  }

  // ── Table modes (only if empty) ───────────────────────────────────────────
  const { rows: tmCount } = await sq(`SELECT COUNT(*) FROM table_modes`);
  if (tmCount[0].count === '0') {
    const tableModeCols = JSON.stringify([
      {"id":"1773735155535","key":"callSign","field":"callSign","label":"או\"ק","editable":"none","isCustom":false},
      {"id":"1773735157671","key":"squadron","field":"squadron","label":"טייסת","editable":"none","isCustom":false},
      {"id":"1773735158284","key":"alt","field":"alt","label":"גובה","editable":"none","isCustom":false},
      {"id":"1773735158452","key":"weapons","field":"weapons","label":"חימושים","editable":"none","isCustom":false},
      {"id":"1773735158857","key":"targets","field":"targets","label":"מטרות","editable":"none","isCustom":false},
      {"id":"1773735169469","key":"shkadia","field":"shkadia","label":"שקדיה","editable":"keyboard","isCustom":false},
      {"id":"1773735174949","key":"sector","field":"sector","label":"אזור","editable":"none","isCustom":false},
      {"id":"1773735179082","key":"notes","field":"notes","label":"הערות","editable":"handwriting","isCustom":false},
      {"id":"1773735184891","key":"transfer","field":"transfer","label":"סתם טקסט","editable":"none","isCustom":false},
      {"id":"custom_1773737467768","key":"custom_1773737467768","label":"ספרור פסחים","editable":"both","isCustom":true}
    ]);
    await sq(`INSERT INTO table_modes (name, columns) VALUES ('בתק עומק', $1)`, [tableModeCols]);
  }

  // ── Workstation presets (only if empty) ───────────────────────────────────
  const { rows: wpCount } = await sq(`SELECT COUNT(*) FROM workstation_presets`);
  if (wpCount[0].count === '0') {
    const { rows: tmRows } = await sq(`SELECT id FROM table_modes WHERE name = 'בתק עומק' LIMIT 1`);
    const tmId = tmRows.length > 0 ? tmRows[0].id : null;

    const presetsToSeed = [
      { name: 'מרחבי 305', sectors: ['GILO'],                                     tableMode: null },
      { name: 'מרחבי 304', sectors: ['GILO'],                                     tableMode: null },
      { name: 'מטרו צפון', sectors: ['תווך - מטרו צפון'],                         tableMode: tmId },
      { name: 'תווך',      sectors: ['תווך - מטרו צפון', 'תווך - מטרו מרכז'],    tableMode: tmId },
      { name: 'מטרו מרכז', sectors: ['תווך - מטרו מרכז'],                         tableMode: tmId },
    ];

    for (const p of presetsToSeed) {
      const relevantIds = p.sectors.map(n => sectorByName[n]).filter(Boolean);
      await sq(
        `INSERT INTO workstation_presets (name, map_id, relevant_sectors, table_mode_id) VALUES ($1, NULL, $2, $3)`,
        [p.name, JSON.stringify(relevantIds), p.tableMode]
      );
    }

    // Link all crew members to all presets
    const { rows: allCrew }    = await sq(`SELECT id FROM crew_members`);
    const { rows: allPresets } = await sq(`SELECT id FROM workstation_presets`);
    for (const crew of allCrew) {
      for (const preset of allPresets) {
        await sq(
          `INSERT INTO crew_member_workstations (crew_member_id, workstation_preset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [crew.id, preset.id]
        );
      }
    }
  }

  console.log('[DB] Seed complete');
}
