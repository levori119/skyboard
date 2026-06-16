                      setStrips(prev => prev.map(st => st.id === s.id ? { ...st, [colKey]: val } : st));
                      await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [colKey]: val }) });
                    };
                    if (col.editable === 'keyboard' || col.editable === 'both') {
                      return (
                        <td key={col.key} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <textarea autoFocus defaultValue={current} rows={1}
                                onBlur={async e => { if (e.target.value !== current) await saveField(e.target.value); setTableEditingCell(null); }}
                                style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: 'white', padding: '5px 7px', fontSize: '12px', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                              />
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {current && <button onMouseDown={e => e.preventDefault()} onClick={() => { saveField(''); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>🗑 נקה</button>}
                                
                              </div>
                            </div>
                          ) : (
                            <div onClick={() => setTableEditingCell(cellKey)} style={{ cursor: 'text', minHeight: '24px', padding: '3px 5px', borderRadius: '4px', direction: 'rtl', fontSize: '12px', color: current ? (T.text) : (lightMode ? '#94a3b8' : '#64748b'), display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                              <span style={{ flex: 1 }}>{current || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{EDITABLE_TEXT_FIELDS[colKey]}</span>}</span>
                              
                            </div>
                          )}
                        </td>
                      );
                    }
                    return <td key={col.key} style={{ padding: '10px 12px', color: T.text, verticalAlign: 'top' }}>{current || '—'}</td>;
                  }
                  return <td key={col.key} style={{ padding: '10px 12px', color: T.muted, verticalAlign: 'top' }}>—</td>;
                }
              }
            };

            const frozenCount = activeMode?.frozenColumns || 0;
            frozenColCountRef.current = frozenCount;
            const hasFrozen = frozenCount > 0;

            return (
              <>
              <table
                ref={tableElRef}
                style={{ width: hasFrozen ? 'max-content' : '100%', minWidth: '100%', borderCollapse: 'collapse', fontSize: `${tableFontSize}px`, direction: 'rtl' }}
                onDragOver={e => e.preventDefault()}
                onClick={() => tableHeaderMenuKey && setTableHeaderMenuKey(null)}
              >
                <thead>
                  <tr style={{ background: lightMode ? '#e2e8f0' : '#1e293b' }}>
                    <th style={{ padding: '4px 6px', position: 'sticky', top: 0, right: tableStickyOffsets[0] ?? 0, zIndex: hasFrozen ? 15 : 10, background: lightMode ? '#e2e8f0' : '#1e293b', borderBottom: `2px solid ${lightMode ? '#cbd5e1' : '#334155'}`, fontSize: '11px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <button onClick={() => setTableFontSize(s => Math.min(22, s + 1))} title="הגדל טקסט" style={{ background: lightMode ? '#f1f5f9' : '#334155', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, color: lightMode ? '#1e293b' : '#e2e8f0', borderRadius: '3px', cursor: 'pointer', padding: '0px 5px', fontSize: '15px', fontWeight: 'bold', lineHeight: 1.4, minWidth: '22px' }}>A</button>
                        <button onClick={() => setTableFontSize(s => Math.max(9, s - 1))} title="הקטן טקסט" style={{ background: lightMode ? '#f1f5f9' : '#334155', border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`, color: lightMode ? '#1e293b' : '#e2e8f0', borderRadius: '3px', cursor: 'pointer', padding: '0px 5px', fontSize: '11px', fontWeight: 'bold', lineHeight: 1.4, minWidth: '20px' }}>A</button>
                        <span style={{ fontSize: '9px', color: lightMode ? '#94a3b8' : '#64748b' }}>{tableFontSize}</span>
                      </div>
                    </th>
                    <th
                      className={hasFrozen ? 'frozen-col' : undefined}
                      style={{
                        padding: '8px 6px', width: '28px', color: T.muted, borderBottom: `2px solid ${lightMode ? '#cbd5e1' : '#334155'}`,
                        position: 'sticky', top: 0, zIndex: hasFrozen ? 15 : 10, fontSize: '11px',
                        ...(hasFrozen ? { right: tableStickyOffsets[1] ?? 0, background: lightMode ? '#e2e8f0' : '#1e293b' } : {})
                      }}
                      title="גרור לסידור מחדש"
                    >⠿</th>
                    {columns.map((col, colIdx) => {
                      const colKey = col.key || col.field || '';
                      const isGrouped = tableGroupByKey === colKey;
                      const isSorted = tableSortKey === colKey;
                      const isMenuOpen = tableHeaderMenuKey === colKey;
                      const isFrozen = colIdx < frozenCount;
                      const isLastFrozen = isFrozen && colIdx === frozenCount - 1;
                      const frozenRight = isFrozen ? (tableStickyOffsets[colIdx + 2] ?? undefined) : undefined;
                      return (
                        <th key={colKey} className={isFrozen ? (isLastFrozen ? 'frozen-col-last' : 'frozen-col') : undefined} style={{ padding: '8px 12px', textAlign: 'right', color: isGrouped ? '#a78bfa' : isSorted ? '#38bdf8' : (T.muted), borderBottom: `2px solid ${lightMode ? '#cbd5e1' : '#334155'}`, position: 'sticky', top: 0, minWidth: '80px', userSelect: 'none', zIndex: isFrozen ? 12 : 10, fontSize: '11px', ...(isFrozen ? { right: frozenRight, background: lightMode ? '#e2e8f0' : '#1e293b', borderLeft: isLastFrozen ? '2px solid #7c3aed' : undefined } : {}) }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-start' }}>
                            <span>{col.label}</span>
                            {isGrouped && <span style={{ fontSize: '9px', background: '#4c1d95', color: '#c4b5fd', padding: '1px 4px', borderRadius: '3px' }}>⊞</span>}
                            {isSorted && <span style={{ fontSize: '11px' }}>{tableSortDir === 'asc' ? '↑' : '↓'}</span>}
                            {col.editable && col.editable !== 'none' && (
                              <button
                                onClick={e => { e.stopPropagation(); setTableEditableCols(prev => { const n = new Set(prev); n.has(colKey) ? n.delete(colKey) : n.add(colKey); return n; }); setTableHeaderMenuKey(null); }}
                                title={tableEditableCols.has(colKey) ? 'כתיבה פעילה — לחץ לנעילה' : 'לחץ לאפשר עריכה'}
                                style={{ background: tableEditableCols.has(colKey) ? '#d97706' : 'transparent', border: tableEditableCols.has(colKey) ? '1px solid #f59e0b' : '1px solid transparent', color: tableEditableCols.has(colKey) ? '#fef3c7' : (lightMode ? '#94a3b8' : '#64748b'), cursor: 'pointer', padding: '1px 4px', borderRadius: '3px', fontSize: '11px', lineHeight: 1, flexShrink: 0 }}
                              >✏️</button>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setTableHeaderMenuKey(prev => prev === colKey ? null : colKey); }}
                              style={{ background: isMenuOpen ? (T.border) : 'transparent', border: 'none', color: lightMode ? '#334155' : '#94a3b8', cursor: 'pointer', padding: '1px 3px', borderRadius: '3px', fontSize: '10px', lineHeight: 1, flexShrink: 0 }}
                            >▾</button>
                          </div>
                          {isMenuOpen && (
                            <div
                              className="table-header-menu"
                              onClick={e => e.stopPropagation()}
                              style={{ position: 'absolute', top: '100%', right: 0, background: lightMode ? '#ffffff' : '#0f2444', border: `1px solid ${lightMode ? '#c4b5fd' : '#3b82f6'}`, borderRadius: '6px', zIndex: 300, minWidth: '140px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', padding: '4px', direction: 'rtl' }}
                            >
                              <button
                                onClick={() => {
                                  if (isGrouped) {
                                    setTableGroupByKey(null);
                                    setTableGroupOrder([]);
                                    setTableCollapsedGroups(new Set());
                                  } else {
                                    const vals = [...new Set(myStrips.map(s => getStripFieldValue(s, colKey)))];
                                    setTableGroupByKey(colKey);
                                    setTableGroupOrder(vals);
                                    setTableCollapsedGroups(new Set());
                                  }
                                  setTableHeaderMenuKey(null);
                                }}
                                style={{ display: 'block', width: '100%', textAlign: 'right', background: isGrouped ? (lightMode ? '#ede9fe' : '#2d1b69') : 'transparent', color: isGrouped ? (lightMode ? '#5b21b6' : '#c4b5fd') : (T.text), border: 'none', padding: '7px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}
                              >{isGrouped ? '✕ הסר קיבוץ' : '⊞ קבץ לפי'}</button>
                              <button
                                onClick={() => { setTableSortKey(colKey); setTableSortDir('asc'); setTableHeaderMenuKey(null); }}
                                style={{ display: 'block', width: '100%', textAlign: 'right', background: isSorted && tableSortDir === 'asc' ? (lightMode ? '#dbeafe' : '#1e3a5f') : 'transparent', color: T.text, border: 'none', padding: '7px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}
                              >↑ מיין עולה</button>
                              <button
                                onClick={() => { setTableSortKey(colKey); setTableSortDir('desc'); setTableHeaderMenuKey(null); }}
                                style={{ display: 'block', width: '100%', textAlign: 'right', background: isSorted && tableSortDir === 'desc' ? (lightMode ? '#dbeafe' : '#1e3a5f') : 'transparent', color: T.text, border: 'none', padding: '7px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}
                              >↓ מיין יורד</button>
                              {isSorted && (
                                <button
                                  onClick={() => { setTableSortKey(null); setTableHeaderMenuKey(null); }}
                                  style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: T.muted, border: 'none', padding: '7px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}
                                >✕ הסר מיון</button>
                              )}
                            </div>
                          )}
                        </th>
                      );
                    })}
                    {showFullPicture && (
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: T.muted, borderBottom: `2px solid ${lightMode ? '#cbd5e1' : '#334155'}`, position: 'sticky', top: 0, zIndex: 10, fontSize: '11px', whiteSpace: 'nowrap', minWidth: '120px' }}>
                        🖥 אצל מי בדסק
                      </th>
                    )}
                    <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 16, width: 0, padding: 0, background: lightMode ? '#e2e8f0' : '#1e293b', border: 'none' }} />
                  </tr>
                </thead>
                <tbody>
                  {tableDisplayItems.map((item, idx) => {
                    if (item._type === 'groupHeader') {
                      const isDragOverGroup = tableGroupDragOverKey === item.groupKey;
                      return (
                        <tr
                          key={'group_' + item.groupKey}
                          draggable
                          onDragStart={e => { e.stopPropagation(); setTableGroupDragKey(item.groupKey); }}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setTableGroupDragOverKey(item.groupKey); }}
                          onDragLeave={() => setTableGroupDragOverKey(null)}
                          onDrop={e => {
                            e.stopPropagation();
                            if (tableGroupDragKey && tableGroupDragKey !== item.groupKey) {
                              setTableGroupOrder(prev => {
                                const arr = [...prev];
                                const fi = arr.indexOf(tableGroupDragKey);
                                const ti = arr.indexOf(item.groupKey);
                                if (fi !== -1 && ti !== -1) { arr.splice(fi, 1); arr.splice(ti, 0, tableGroupDragKey); }
                                return arr;
                              });
                            }
                            setTableGroupDragKey(null); setTableGroupDragOverKey(null);
                          }}
                          style={{
                            background: isDragOverGroup ? '#1d4ed8' : (themeMode === 'light' ? '#7c3aed' : themeMode === 'ocean' ? '#0369a1' : '#1e1b4b'),
                            borderTop: `3px solid ${themeMode === 'light' ? '#5b21b6' : themeMode === 'ocean' ? '#0ea5e9' : '#4c1d95'}`,
                            borderBottom: isDragOverGroup ? '3px solid #3b82f6' : `3px solid ${themeMode === 'light' ? '#5b21b6' : themeMode === 'ocean' ? '#0ea5e9' : '#4c1d95'}`,
                            cursor: 'pointer',
                            opacity: tableGroupDragKey === item.groupKey ? 0.5 : 1,
                            boxShadow: themeMode === 'light' ? '0 2px 10px rgba(109,40,217,0.35)' : themeMode === 'ocean' ? '0 2px 10px rgba(3,105,161,0.4)' : 'inset 0 0 0 1px #7c3aed33, 0 2px 8px rgba(124,58,237,0.15)'
                          }}
                          onClick={e => {
                            if ((e.target as HTMLElement).closest('[data-drag-handle]')) return;
                            setTableCollapsedGroups(prev => {
                              const next = new Set(prev);
                              if (next.has(item.groupKey)) next.delete(item.groupKey); else next.add(item.groupKey);
                              return next;
                            });
                          }}
                        >
                          <td colSpan={columns.length + 3 + (showFullPicture ? 1 : 0)} style={{ padding: '0', direction: 'rtl' }}>
                            <div style={{ position: 'sticky', right: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px' }}>
                              <span data-drag-handle style={{ color: (themeMode === 'light' || themeMode === 'ocean') ? 'rgba(255,255,255,0.7)' : T.muted, fontSize: '14px', cursor: 'grab', flexShrink: 0 }}>⠿</span>
                              <span style={{ fontSize: '11px', color: (themeMode === 'light' || themeMode === 'ocean') ? 'rgba(255,255,255,0.9)' : '#a78bfa', transition: 'transform 0.15s', transform: item.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▾</span>
                              <span style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 'bold', fontSize: '13px', padding: '3px 12px', borderRadius: '5px', letterSpacing: '0.02em', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>{item.groupKey}</span>
                              <span style={{ background: 'rgba(255,255,255,0.22)', color: '#fff', fontWeight: 'bold', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>{item.count}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const s = item;
                    const isEven = idx % 2 === 0;
                    const isDragOver = tableDragOverRow === s.id;
                    const isPendingTransfer = s.status === 'pending_transfer';
                    const isRowDeviationRaw = computeBlockDeviation(s, dashboardBlocks, dashboardBlockTables, effectiveBlockTableId, session.presetId ? Number(session.presetId) : null);
                    const isRowDeviationAck = !!s.block_deviation;
                    const isRowDeviation = isRowDeviationRaw && !muteBlockAlerts;
                    const isRowDeviationAckEff = isRowDeviationAck && !muteBlockAlerts;
                    const isRowAltConflict = tableEffectiveConflictIds.has(String(s.id));
                    const isRowConflictResolved = tableConflictPairsMap.has(String(s.id)) && !isRowAltConflict;
                    const isRowConflictPartial = isRowAltConflict && (tableConflictResolutions.get(String(s.id))?.resolvedWith?.size ?? 0) > 0;
                    const rowBg = isDragOver ? '#1d4ed8'
                      : isRowAltConflict ? (lightMode ? '#fef2f2' : '#3b0000')
                      : (isRowDeviation && !isRowDeviationAck) ? undefined
                      : isPendingTransfer ? (isEven ? (lightMode ? '#dde6f5' : '#2d3344') : (lightMode ? '#d4dde8' : '#252b3a'))
                      : (isEven ? (T.surface) : (lightMode ? '#f1f5f9' : '#000000'));
                    return (
                      <tr
                        key={s.id}
                        data-strip-id={s.id}
                        className={[isRowAltConflict ? 'alt-conflict-flash' : (isRowDeviation && !isRowDeviationAck ? 'block-deviation-flash' : ''), acceptFlashStripId && String(s.id) === acceptFlashStripId ? 'accept-green-flash' : '', (s as any)._transferredOut ? 'transfer-out-flash' : ''].filter(Boolean).join(' ') || undefined}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/strip-id-for-transfer', s.id); setTableDragRow(s.id); }}
                        onDragOver={e => {
                          e.preventDefault();
                          if (tableSidebarDragId.current) { e.dataTransfer.dropEffect = 'move'; setTableDragOver(true); return; }
                          if (!isPendingTransfer) setTableDragOverRow(s.id);
                        }}
                        onDragLeave={() => setTableDragOverRow(null)}
                        onDragEnd={() => { setTableDragRow(null); setTableDragOverRow(null); }}
                        onDrop={e => {
                          setTableDragOver(false);
                          const rawId = e.dataTransfer.getData('text/strip-id') || String(tableSidebarDragId.current ?? '');
                          const droppedFromSidebar = rawId ? Number(rawId) : null;
                          if (droppedFromSidebar) {
                            // Restore to table (remove from the "removed" set)
                            setTableOnBoard(prev => { const n = new Set(prev); n.delete(String(droppedFromSidebar)); return n; });
                            tableSidebarDragId.current = null;
                            setTableDragRow(null); setTableDragOverRow(null);
                            return;
                          }
                          if (tableDragRow && tableDragRow !== s.id && !tableSortBySector && !tableSortKey) {
                            const sameGroup = !tableGroupByKey || (() => {
                              const dragStrip = myTableStrips.find((x: any) => String(x.id) === String(tableDragRow));
                              const tgtStrip = myTableStrips.find((x: any) => String(x.id) === String(s.id));
                              return dragStrip && tgtStrip && getStripFieldValue(dragStrip, tableGroupByKey) === getStripFieldValue(tgtStrip, tableGroupByKey);
                            })();
                            if (sameGroup) {
                              setTableRowOrder(prev => {
                                const arr = [...prev];
                                const fi = arr.indexOf(tableDragRow);
                                const ti = arr.indexOf(s.id);
                                if (fi !== -1 && ti !== -1) { arr.splice(fi, 1); arr.splice(ti, 0, tableDragRow); }
                                return arr;
                              });
                            }
                          }
                          setTableDragRow(null); setTableDragOverRow(null);
                        }}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setTableRowCtxMenu({ stripId: s.id, x: e.clientX, y: e.clientY }); }}
                        style={{
                          background: rowBg,
                          borderBottom: isDragOver ? '2px solid #3b82f6' : isRowConflictPartial ? '1px solid #f97316' : isRowAltConflict ? '1px solid #ef4444' : isRowConflictResolved ? '1px solid #22c55e' : (lightMode ? '3px solid #cbd5e1' : '3px solid #334155'),
                          outline: isRowAltConflict ? '1px solid #ef4444' : undefined,
                          opacity: isPendingTransfer ? 0.6 : (tableDragRow === s.id ? 0.5 : 1),
                          transition: 'background 0.1s'
                        }}
                      >
                        <td style={{ padding: '1px 0', whiteSpace: 'nowrap', verticalAlign: 'middle', background: rowBg ?? (lightMode ? '#e2e8f0' : '#1e293b'), position: 'sticky', right: tableStickyOffsets[0] ?? 0, zIndex: 5, width: '16px', minWidth: '16px', maxWidth: '16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center' }}>
                            <span
                              title={isRowConflictPartial ? 'קונפליקט חלקי — לחץ לפתרון' : isRowAltConflict ? 'קונפליקט גובה — לחץ לפתרון' : isRowConflictResolved ? 'קונפליקט פתור — לחץ לצפייה' : ''}
                              onClick={e => {
                                if (!tableConflictPairsMap.has(String(s.id))) return;
                                e.stopPropagation();
                                const conflictingIds = tableConflictPairsMap.get(String(s.id)) || [];
                                const conflictingStrips = conflictingIds.map(id => myTableStrips.find((x: any) => String(x.id) === id)).filter(Boolean);
                                const existing = tableConflictResolutions.get(String(s.id));
                                setTableConflictDialog({ stripId: String(s.id), conflictingStrips, note: existing?.note || '', selectedIds: existing?.resolvedWith ? new Set(existing.resolvedWith) : new Set(conflictingIds.map(String)) });
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: isRowConflictPartial ? '#f97316' : isRowAltConflict ? '#ef4444' : isRowConflictResolved ? '#22c55e' : 'transparent', color: (isRowAltConflict || isRowConflictResolved || isRowConflictPartial) ? 'white' : 'transparent', fontSize: '10px', fontWeight: 'bold', flexShrink: 0, lineHeight: 1, userSelect: 'none', cursor: tableConflictPairsMap.has(String(s.id)) ? 'pointer' : 'default' }}
                            >ק</span>
                            {isRowDeviation && !isRowDeviationAck ? (
                              <span
                                onClick={async e => { e.stopPropagation(); try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: true }) }); } catch {} setStrips(prev => prev.map((x: any) => String(x.id) === String(s.id) ? { ...x, block_deviation: true } : x)); }}
                                title="חריגה מבלוק — לחץ לאישור"
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}
                              >ב</span>
                            ) : isRowDeviationAck ? (
                              <span
                                onClick={async e => { e.stopPropagation(); try { await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: false }) }); } catch {} setStrips(prev => prev.map((x: any) => String(x.id) === String(s.id) ? { ...x, block_deviation: false } : x)); }}
                                title="חריגה מאושרת — לחץ לביטול"
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#22c55e', color: 'white', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}
                              >ב</span>
                            ) : (
                              <span style={{ display: 'inline-flex', width: '16px', height: '16px', flexShrink: 0 }} />
                            )}
                          </div>
                        </td>
                        <td
                          className={hasFrozen ? 'frozen-col' : undefined}
                          style={{ padding: '6px 4px', color: '#475569', textAlign: 'center', cursor: (tableSortBySector || tableSortKey) ? 'default' : 'grab', fontSize: '16px', verticalAlign: 'middle', touchAction: 'none', ...(hasFrozen ? { position: 'sticky', right: tableStickyOffsets[1] ?? 0, background: rowBg, zIndex: 3 } : {}) }}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setTableRowCtxMenu({ stripId: s.id, x: e.clientX, y: e.clientY }); }}
                          onPointerDown={e => {
                            if (tableSortBySector || tableSortKey) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const label = s.callSign || String(s.id);
                            tablePointerDragRef.current = { id: s.id, label };
                            setTableDragRow(s.id);
                            setTablePointerGhost({ x: e.clientX, y: e.clientY, label });
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <span style={{ fontSize: '16px', lineHeight: 1 }}>⠿</span>
                            {isPendingTransfer && (
                              <span title="ממתין לקבלה על ידי הנמען" style={{ fontSize: '9px', background: '#374151', color: '#9ca3af', borderRadius: '3px', padding: '1px 4px', whiteSpace: 'nowrap', lineHeight: 1.3 }}>ממתין ⏳</span>
                            )}
                            {(() => {
                              const rowCount = parseInt(s.numberOfFormation ?? s.number_of_formation ?? '1') || 1;
                              const rowSiblings = getSectorSiblings(s);
                              if (rowCount <= 1 && rowSiblings.length === 0) return null;
                              return (
                                <div style={{ display: 'flex', gap: '2px', flexDirection: 'column' }} onPointerDown={e => e.stopPropagation()}>
                                  {rowCount > 1 && (
                                    <button onClick={e => { e.stopPropagation(); setSectorSplitSelected([]); setSectorSplitModal({ strip: s }); }}
                                      title="פצל פ״מ" style={{ fontSize: '9px', padding: '1px 3px', background: '#4c1d95', color: '#c4b5fd', border: '1px solid #7c3aed', borderRadius: '2px', cursor: 'pointer', lineHeight: 1 }}>✂</button>
                                  )}
                                  {rowSiblings.length > 0 && (
                                    <button onClick={e => { e.stopPropagation(); if (rowSiblings.length === 1) { setSectorMergeConfirm({ targetId: String(rowSiblings[0].id), sourceId: String(s.id), targetName: rowSiblings[0].callSign || String(rowSiblings[0].id), sourceName: s.callSign || String(s.id) }); } else { setSectorMergeModal({ strip: s, siblings: rowSiblings }); } }}
                                      title="אחד פ״מ" style={{ fontSize: '9px', padding: '1px 3px', background: '#1e3a5f', color: '#93c5fd', border: '1px solid #1d4ed8', borderRadius: '2px', cursor: 'pointer', lineHeight: 1 }}>⊕</button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        {columns.map((col, colIdx) => {
                          const cell = renderCell(s, col);
                          const isFrozen = colIdx < frozenCount;
                          if (isFrozen) {
                            const fr = tableStickyOffsets[colIdx + 2];
                            const isLastFrozenTd = colIdx === frozenCount - 1;
                            return React.cloneElement(cell, {
                              className: isLastFrozenTd ? 'frozen-col-last' : 'frozen-col',
                              style: { ...cell.props.style, position: 'sticky', right: fr, background: rowBg, zIndex: 3, ...(isLastFrozenTd ? { borderLeft: '2px solid #7c3aed' } : {}) }
                            });
                          }
                          return cell;
                        })}
                        {showFullPicture && (() => {
                          const myPresetName = workstationPresets.find((p: any) => Number(p.id) === Number(session.presetId))?.name || '';
                          const deskPresets: string[] = s._deskPresets || [];
                          return (
                            <td style={{ padding: '5px 10px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                {deskPresets.length === 0
                                  ? <span style={{ color: T.muted, fontSize: '10px' }}>—</span>
                                  : deskPresets.map((name: string) => (
                                    <span key={name} style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '10px', background: name === myPresetName ? (lightMode ? '#dbeafe' : '#1e3a5f') : (lightMode ? '#f1f5f9' : '#1e293b'), color: name === myPresetName ? '#3b82f6' : T.muted, fontWeight: name === myPresetName ? 'bold' : 'normal', whiteSpace: 'nowrap' }}>
                                      {name === myPresetName ? '⭐ ' : ''}{name}
                                    </span>
                                  ))
                                }
                              </div>
                            </td>
                          );
                        })()}
                        <td style={{ position: 'sticky', left: 0, zIndex: 10, width: 0, padding: 0, border: 'none', background: 'transparent', overflow: 'visible', verticalAlign: 'middle' }}>
                          {isPendingTransfer && (
                            <div style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '16px solid transparent', borderBottom: '16px solid transparent', borderRight: '26px solid #22c55e', zIndex: 50, filter: 'drop-shadow(0 0 5px rgba(34,197,94,0.7))', pointerEvents: 'none' }} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {myTableStrips.length === 0 && (
                    <tr><td colSpan={columns.length + 2 + (showFullPicture ? 1 : 0)} style={{ padding: '60px 40px', textAlign: 'center', color: '#475569' }}>
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>⟵</div>
                      <div style={{ fontSize: '15px', color: '#64748b' }}>גרור פממים מהצד הימני לכאן</div>
                    </td></tr>
                  )}
                </tbody>
              </table>
              {/* handwriting canvas disabled */}
              </>
            );
          })()}
          {/* Table row right-click context menu */}
          {tableRowCtxMenu && (
            <div
              style={{ position: 'fixed', ...clampMenuPos(tableRowCtxMenu.x, tableRowCtxMenu.y, 180, 260), background: '#1e293b', border: '1px solid #3b82f6', borderRadius: '6px', zIndex: 9999, minWidth: '160px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)', padding: '4px', direction: 'rtl' }}
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const _activeMode = availableTableModes.find((tm: any) => tm.id === selectedTableModeId);
                const _columns: any[] = _activeMode?.columns?.length > 0 ? _activeMode.columns : [{ key: 'notes', editable: 'handwriting' }];
                const notesColEditable = _columns.find((c: any) => (c.key || c.field) === 'notes')?.editable ?? 'handwriting';
                return null; /* handwriting disabled */
              })()}
              {(() => {
                const ctxStrip = myTableStrips.find((s: any) => s.id === tableRowCtxMenu.stripId);
                const ctxDev = ctxStrip ? computeBlockDeviation(ctxStrip, dashboardBlocks, dashboardBlockTables, effectiveBlockTableId, session.presetId ? Number(session.presetId) : null) : false;
                const ctxAck = ctxStrip ? !!ctxStrip.block_deviation : false;
                if (!ctxDev && !ctxAck) return null;
                return (<>
                  <div style={{ height: '1px', background: '#334155', margin: '2px 8px' }} />
                  <button
                    onClick={() => {
                      setAltUpdateValue(ctxStrip?.alt || '');
                      setAltUpdateForm({ stripId: tableRowCtxMenu.stripId, currentAlt: ctxStrip?.alt || '', x: tableRowCtxMenu.x, y: tableRowCtxMenu.y });
                      setTableRowCtxMenu(null);
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#60a5fa', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                  >✏️ עדכון גובה</button>
                  {ctxDev && !ctxAck && (
                    <button
                      onClick={async () => {
                        const sid = tableRowCtxMenu.stripId;
                        try { await fetch(`${API_URL}/strips/${sid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: true }) }); } catch {}
                        setStrips(prev => prev.map((x: any) => String(x.id) === String(sid) ? { ...x, block_deviation: true } : x));
                        setTableRowCtxMenu(null);
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#f97316', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                    >⚠️ אשר חריגה מבלוק</button>
                  )}
                  {ctxAck && (
                    <button
                      onClick={async () => {
                        const sid = tableRowCtxMenu.stripId;
                        try { await fetch(`${API_URL}/strips/${sid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: false }) }); } catch {}
                        setStrips(prev => prev.map((x: any) => String(x.id) === String(sid) ? { ...x, block_deviation: false } : x));
                        setTableRowCtxMenu(null);
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#94a3b8', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                    >✅ בטל אישור חריגה מבלוק</button>
                  )}
                </>);
              })()}
              {(() => {
                const ctxSplit = myTableStrips.find((s: any) => String(s.id) === String(tableRowCtxMenu.stripId));
                if (!ctxSplit) return null;
                const ctxCount = parseInt(ctxSplit.numberOfFormation ?? ctxSplit.number_of_formation ?? '1') || 1;
                const ctxSiblings = getSectorSiblings(ctxSplit);
                if (ctxCount <= 1 && ctxSiblings.length === 0) return null;
                return (<>
                  <div style={{ height: '1px', background: '#334155', margin: '2px 8px' }} />
                  {ctxCount > 1 && (
                    <button
                      onClick={() => { setSectorSplitSelected([]); setSectorSplitModal({ strip: ctxSplit }); setTableRowCtxMenu(null); }}
                      style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#c4b5fd', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                    >✂ פצל פ"מ</button>
                  )}
                  {ctxSiblings.length > 0 && (
                    <button
                      onClick={() => {
                        if (ctxSiblings.length === 1) {
                          const tName = ctxSiblings[0].callSign || ctxSiblings[0].call_sign || String(ctxSiblings[0].id);
                          setSectorMergeConfirm({ targetId: String(ctxSiblings[0].id), sourceId: String(ctxSplit.id), targetName: tName, sourceName: ctxSplit.callSign || String(ctxSplit.id) });
                        } else {
                          setSectorMergeModal({ strip: ctxSplit, siblings: ctxSiblings });
                        }
                        setTableRowCtxMenu(null);
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#93c5fd', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                    >⊕ אחד פ"מ</button>
                  )}
                </>);
              })()}
              <div style={{ height: '1px', background: '#334155', margin: '2px 8px' }} />
              <button
                onClick={() => {
                  const removedId = tableRowCtxMenu.stripId;
                  setTableOnBoard(prev => { const n = new Set(prev); n.delete(removedId); return n; });
                  setTableRowCtxMenu(null);
                  if (session.presetId) {
                    const numId = removedId.replace(/^s/, '');
                    const pid = Number(session.presetId);
                    fetch(`${API_URL}/strip-table-assignments/${numId}/${pid}`, { method: 'DELETE' }).catch(() => {});
                    setStrips(prev => prev.map((s: any) => String(s.id) === removedId
                      ? { ...s, table_preset_ids: (Array.isArray(s.table_preset_ids) ? s.table_preset_ids : []).filter((x: number) => x !== pid) }
                      : s));
                  }
                }}
                style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#94a3b8', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
              >✕ הסר מהלוח</button>
              <div style={{ height: '1px', background: '#334155', margin: '2px 8px' }} />
              <button
                onClick={() => {
                  handleDeleteStripWithUndo(tableRowCtxMenu.stripId);
                  setTableRowCtxMenu(null);
                }}
                style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#f87171', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}
              >🗑 מחק</button>
            </div>
          )}

          {/* Vertical view strip context menu */}
          {verticalCtxMenu && (() => {
            const ctxS = myTableStrips.find((s: any) => s.id === verticalCtxMenu.stripId);
            const ctxDev = ctxS ? computeBlockDeviation(ctxS, dashboardBlocks, dashboardBlockTables, effectiveBlockTableId, session.presetId ? Number(session.presetId) : null) : false;
            const ctxAck = ctxS ? !!ctxS.block_deviation : false;
            if (!ctxDev && !ctxAck && !isMmiMode) { setTimeout(() => setVerticalCtxMenu(null), 0); return null; }
            return (
              <div
                style={{ position: 'fixed', ...clampMenuPos(verticalCtxMenu.x, verticalCtxMenu.y, 220, isMmiMode ? 200 + mmiConnectedPresets.length * 36 : 140), background: '#1e293b', border: '1px solid #f97316', borderRadius: '6px', zIndex: 9999, minWidth: '200px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)', padding: '4px', direction: 'rtl' }}
                onClick={e => e.stopPropagation()}
              >
                {(ctxDev || ctxAck) && <>
                  <button
                    onClick={() => {
                      setAltUpdateValue(ctxS?.alt || '');
                      setAltUpdateForm({ stripId: verticalCtxMenu.stripId, currentAlt: ctxS?.alt || '', x: verticalCtxMenu.x, y: verticalCtxMenu.y });
                      setVerticalCtxMenu(null);
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#60a5fa', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                  >✏️ עדכון גובה</button>
                  {ctxDev && !ctxAck && (
                    <button
                      onClick={async () => {
                        try { await fetch(`${API_URL}/strips/${verticalCtxMenu.stripId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: true }) }); } catch {}
                        setVerticalCtxMenu(null);
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#f97316', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                    >⚠️ אשר חריגה מבלוק</button>
                  )}
                  {ctxAck && (
                    <button
                      onClick={async () => {
                        try { await fetch(`${API_URL}/strips/${verticalCtxMenu.stripId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_deviation: false }) }); } catch {}
                        setVerticalCtxMenu(null);
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#94a3b8', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                    >✅ בטל אישור חריגה מבלוק</button>
                  )}
                </>}
                {isMmiMode && (
                  <>
                    {(ctxDev || ctxAck) && <div style={{ height: '1px', background: '#334155', margin: '2px 8px' }} />}
                    <div style={{ padding: '6px 12px 3px', fontSize: '11px', color: '#7dd3fc', fontWeight: 'bold' }}>📡 העבר אל</div>
                    {mmiConnectedPresets.length === 0
                      ? <div style={{ padding: '4px 12px 8px', fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>אין עמדות מתמשקות</div>
                      : mmiConnectedPresets.map(p => (
                        <button key={p.id}
                          onClick={() => {
                            const text = p.freqs ? `${p.name} | ${p.freqs}` : p.name;
                            setStripTransferTo(prev => ({ ...prev, [String(verticalCtxMenu.stripId)]: text }));
                            setVerticalCtxMenu(null);
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#e2e8f0', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', borderRadius: '4px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#1e3a5f')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ color: '#7dd3fc', fontWeight: 'bold' }}>{p.name}</span>
                          {p.freqs && <span style={{ fontSize: '10px', color: '#94a3b8' }}> | {p.freqs}</span>}
                        </button>
                      ))
                    }
                    {stripTransferTo[String(verticalCtxMenu.stripId)] && (
                      <button
                        onClick={() => { setStripTransferTo(prev => { const n = { ...prev }; delete n[String(verticalCtxMenu.stripId)]; return n; }); setVerticalCtxMenu(null); }}
                        style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#64748b', border: 'none', padding: '4px 12px 6px', cursor: 'pointer', fontSize: '11px', borderRadius: '4px' }}
                      >✕ נקה</button>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* Altitude update mini-form */}
          {altUpdateForm && (
            <div
              style={{ position: 'fixed', ...clampMenuPos(altUpdateForm.x, altUpdateForm.y, 220, 160), background: '#1e293b', border: '1px solid #3b82f6', borderRadius: '8px', zIndex: 10000, padding: '12px 14px', direction: 'rtl', boxShadow: '0 6px 24px rgba(0,0,0,0.7)', minWidth: '200px' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>✏️ עדכון גובה</div>
              {altUpdateForm.currentAlt && <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '6px' }}>גובה נוכחי: {altUpdateForm.currentAlt}</div>}
              <input
                autoFocus
                type="text"
                value={altUpdateValue}
                onChange={e => setAltUpdateValue(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter') {
                    const val = normalizeAlt(altUpdateValue.trim());
                    if (val) {
                      try { await fetch(`${API_URL}/strips/${altUpdateForm.stripId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alt: val, block_deviation: false }) }); } catch {}
                    }
                    setAltUpdateForm(null);
                  } else if (e.key === 'Escape') {
                    setAltUpdateForm(null);
                  }
                }}
                placeholder="הזן גובה חדש"
                style={{ width: '100%', background: '#0f172a', color: 'white', border: '1px solid #3b82f6', borderRadius: '4px', padding: '6px 8px', fontSize: '14px', direction: 'rtl', boxSizing: 'border-box', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button
                  onClick={async () => {
                    const val = normalizeAlt(altUpdateValue.trim());
                    if (val) {
                      try { await fetch(`${API_URL}/strips/${altUpdateForm.stripId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alt: val, block_deviation: false }) }); } catch {}
                    }
                    setAltUpdateForm(null);
                  }}
                  style={{ flex: 1, background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                >שמור</button>
                <button
                  onClick={() => setAltUpdateForm(null)}
                  style={{ flex: 1, background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer', fontSize: '13px' }}
                >ביטול</button>
              </div>
            </div>
          )}


          {!isGroundMode && !isClassicMode && !isCivilianMode && !tableMode && <>
          {/* Map 1 panel wrapper — clips to split area when dual map is on */}
          <div style={{ position: 'absolute', overflow: 'hidden', ...(isDualMapMode ? (dualMapLayout === 'stacked' ? { top: 0, left: 0, width: '100%', height: `${dualMapSplit}%` } : { top: 0, left: 0, width: `${dualMapSplit}%`, height: '100%' }) : { top: 0, left: 0, width: '100%', height: '100%' }) }}>
          {/* Map Zoom Toolbar */}
          <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(30,41,59,0.9)', padding: '4px', borderRadius: '6px', width: 28 }}>
            {/* Brightness toggle button */}
            <button
              onClick={() => setShowBrightnessPanel(v => !v)}
              title={`בהירות: ${Math.round(mapBrightness * 100)}%`}
              style={{
                width: 20, height: 20, background: showBrightnessPanel ? '#1d4ed8' : (mapBrightness !== 1 ? '#92400e' : '#475569'),
                color: mapBrightness !== 1 ? '#fcd34d' : 'white',
                border: showBrightnessPanel ? '1px solid #60a5fa' : (mapBrightness !== 1 ? '1px solid #f59e0b' : 'none'),
                borderRadius: '3px', cursor: 'pointer', fontSize: '11px', lineHeight: 1, padding: 0,
              }}>☀</button>
            {/* Brightness floating panel */}
            {showBrightnessPanel && (
              <div style={{
                position: 'absolute', left: 34, top: 0,
                background: 'rgba(15,23,42,0.97)', border: '1px solid #334155',
                borderRadius: '8px', padding: '10px 12px', zIndex: 200, width: 180,
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)', direction: 'rtl',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>☀ קבע בהירות</span>
                  <span style={{ fontSize: '13px', color: '#fcd34d', fontWeight: 'bold' }}>{Math.round(mapBrightness * 100)}%</span>
                </div>
                <input type="range" min={0.2} max={1.8} step={0.05} value={mapBrightness}
                  onChange={e => setMapBrightness(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#60a5fa', cursor: 'pointer', height: 14, marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[50, 75, 100, 125, 150].map(pct => (
                    <button key={pct} onClick={() => setMapBrightness(pct / 100)}
                      style={{ flex: 1, padding: '3px 0', fontSize: '9px', borderRadius: '3px', border: 'none', cursor: 'pointer',
                        background: Math.round(mapBrightness * 100) === pct ? '#1d4ed8' : '#1e293b',
                        color: Math.round(mapBrightness * 100) === pct ? '#fff' : '#94a3b8', fontWeight: Math.round(mapBrightness * 100) === pct ? 'bold' : 'normal' }}>
                      {pct}
                    </button>
                  ))}
                </div>
                {mapBrightness !== 1 && (
                  <button onClick={() => setMapBrightness(1)}
                    style={{ marginTop: '8px', width: '100%', padding: '4px', fontSize: '11px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    ↺ איפוס (100%)
                  </button>
                )}
              </div>
            )}
            <div style={{ width: '100%', height: '1px', background: '#334155', margin: '2px 0' }} />
            <button onClick={() => setMapZoom(z => Math.min(z + 0.25, 3))} style={{ width: 20, height: 20, background: '#475569', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', lineHeight: 1, padding: 0 }}>+</button>
            <button onClick={() => setMapZoom(z => Math.max(z - 0.25, 0.5))} style={{ width: 20, height: 20, background: '#475569', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', lineHeight: 1, padding: 0 }}>−</button>
            <button onClick={() => { setMapZoom(1); setMapPan({ x: 0, y: 0 }); }} style={{ width: 20, height: 16, background: '#475569', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '7px', lineHeight: 1, padding: 0 }}>איפוס</button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
              <button onClick={() => setMapPan(p => ({ ...p, y: p.y + 50 }))} style={{ width: 20, height: 16, background: '#334155', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '9px', lineHeight: 1, padding: 0 }}>▲</button>
              <div style={{ display: 'flex', gap: '1px' }}>
                <button onClick={() => setMapPan(p => ({ ...p, x: p.x + 50 }))} style={{ width: 9, height: 16, background: '#334155', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '7px', lineHeight: 1, padding: 0 }}>◀</button>
                <button onClick={() => setMapPan(p => ({ ...p, x: p.x - 50 }))} style={{ width: 9, height: 16, background: '#334155', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '7px', lineHeight: 1, padding: 0 }}>▶</button>
              </div>
              <button onClick={() => setMapPan(p => ({ ...p, y: p.y - 50 }))} style={{ width: 20, height: 16, background: '#334155', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '9px', lineHeight: 1, padding: 0 }}>▼</button>
            </div>
            <div style={{ fontSize: '7px', color: '#94a3b8', textAlign: 'center', marginTop: '1px' }}>{Math.round(mapZoom * 100)}%</div>
            <div style={{ width: '100%', height: '1px', background: '#334155', margin: '2px 0' }} />
            {/* Blind map toggle */}
            {!!mapImg && (
              <button
                onClick={() => setBlindMapMode(v => !v)}
                title={blindMapMode ? 'בטל מפה עיוורת' : 'מפה עיוורת — הסתר רקע, הצג אזורים בקווי מתאר'}
                style={{ width: 20, height: 20, background: blindMapMode ? '#0f766e' : '#475569', color: 'white', border: blindMapMode ? '1px solid #2dd4bf' : 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', lineHeight: 1, padding: 0 }}>🙈</button>
            )}
            {/* Drawing mode toggle */}
            <button
              onClick={() => setDrawingMode(v => !v)}
              title={drawingMode ? 'כבה ציור' : 'הפעל ציור על המפה'}
              style={{ width: 20, height: 20, background: drawingMode ? '#7c3aed' : '#475569', color: 'white', border: drawingMode ? '1px solid #a78bfa' : 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: 0 }}>✏</button>
            {/* Closures overlay toggle — only when map is geo-anchored */}
            {!!mapGeoAnchor && (
              <button
                onClick={() => { if (!showClosuresPanel) fetchClosuresForMap(); setShowClosuresPanel(v => !v); }}
                title="תצוגת סגירות על המפה"
                style={{ width: 20, height: 20, background: showClosuresPanel ? '#7c3aed' : (enabledClosureIds.size > 0 ? '#92400e' : '#475569'), color: 'white', border: showClosuresPanel ? '1px solid #a78bfa' : (enabledClosureIds.size > 0 ? '1px solid #f59e0b' : 'none'), borderRadius: '3px', cursor: 'pointer', fontSize: '11px', lineHeight: 1, padding: 0 }}>🚫</button>
            )}
          </div>

          {/* Closures floating panel */}
          {showClosuresPanel && mapGeoAnchor && (
            <div style={{ position: 'absolute', top: 8, left: 44, zIndex: 215, background: 'rgba(15,23,42,0.97)', border: '1px solid #7c3aed', borderRadius: '8px', padding: '10px 12px', minWidth: '210px', maxWidth: '270px', maxHeight: '72vh', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0,0,0,0.7)', direction: 'rtl' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexShrink: 0 }}>
                <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '12px' }}>🚫 סגירות על מפה</span>
                <button onClick={() => setShowClosuresPanel(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '15px', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {allClosures.length === 0 ? (
                  <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '14px 0' }}>אין סגירות עם פוליגון גאוגרפי</div>
                ) : (
                  allClosures.filter((c: any) => Array.isArray(c.polygon_geo) && c.polygon_geo.length >= 3).length === 0 ? (
                    <div style={{ color: '#475569', fontSize: '11px', textAlign: 'center', padding: '14px 0' }}>אין סגירות עם פוליגון גאוגרפי</div>
                  ) : (
                    allClosures.filter((c: any) => Array.isArray(c.polygon_geo) && c.polygon_geo.length >= 3).map((c: any) => {
                      const enabled = enabledClosureIds.has(c.id);
                      return (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 2px', borderBottom: '1px solid #1e293b', cursor: 'pointer' }}>
                          <input type="checkbox" checked={enabled} onChange={() => setEnabledClosureIds(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} style={{ accentColor: c.color || '#ef4444', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }} />
                          <span style={{ width: 10, height: 10, borderRadius: '2px', background: c.color || '#ef4444', flexShrink: 0, display: 'inline-block', border: '1px solid rgba(255,255,255,0.15)' }} />
                          <span style={{ fontSize: '11px', color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                          {(c.alt_min != null || c.alt_max != null) && <span style={{ fontSize: '9px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{c.alt_min ?? '?'}–{c.alt_max ?? '?'}</span>}
                        </label>
                      );
                    })
                  )
                )}
              </div>
              <div style={{ display: 'flex', gap: '5px', marginTop: '8px', flexShrink: 0 }}>
                <button onClick={() => setEnabledClosureIds(new Set(allClosures.filter((c: any) => Array.isArray(c.polygon_geo) && c.polygon_geo.length >= 3).map((c: any) => c.id)))} style={{ flex: 1, fontSize: '10px', padding: '3px 0', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>✔ הכל</button>
                <button onClick={() => setEnabledClosureIds(new Set())} style={{ flex: 1, fontSize: '10px', padding: '3px 0', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>✕ נקה</button>
                <button onClick={fetchClosuresForMap} style={{ flex: 1, fontSize: '10px', padding: '3px 0', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>↺</button>
              </div>
            </div>
          )}

          {/* Drawing toolbar — visible when drawingMode is on */}
          {drawingMode && (
            <div style={{ position: 'absolute', top: 8, left: 44, zIndex: 210, background: 'rgba(15,23,42,0.97)', border: '1px solid #7c3aed', borderRadius: '8px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', direction: 'rtl', cursor: 'default' }}>
              <div style={{ fontSize: '11px', color: '#c4b5fd', fontWeight: 'bold', marginBottom: '2px' }}>✏ כלי ציור</div>
              {/* Tool buttons */}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {([['pen','🖊 עט'],['eraser','🧹 מחק'],['circle','⭕ עיגול'],['rect','▭ מלבן']] as [string,string][]).map(([tool, label]) => (
                  <button key={tool} onClick={() => setDrawTool(tool as any)}
                    style={{ padding: '3px 7px', fontSize: '11px', borderRadius: '4px', border: `1px solid ${drawTool === tool ? '#a78bfa' : '#334155'}`, background: drawTool === tool ? '#4c1d95' : '#1e293b', color: drawTool === tool ? '#e9d5ff' : '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Color picker row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>צבע:</span>
                {['#ef4444','#f97316','#f59e0b','#22c55e','#3b82f6','#a855f7','#ffffff','#000000'].map(c => (
                  <div key={c} onClick={() => setPenColor(c)}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: penColor === c ? '2px solid white' : '1px solid #475569', cursor: 'pointer', flexShrink: 0 }} />
                ))}
                <input type="color" value={penColor} onChange={e => setPenColor(e.target.value)}
                  style={{ width: 18, height: 18, padding: 0, border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent' }} />
              </div>
              {/* Size slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>עובי:</span>
                <input type="range" min={1} max={20} value={penSize} onChange={e => setPenSize(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: '#a78bfa', height: 12 }} />
                <span style={{ fontSize: '10px', color: '#c4b5fd', width: 18, textAlign: 'center' }}>{penSize}</span>
              </div>
              {/* Fill toggle (for shapes) */}
              {(drawTool === 'circle' || drawTool === 'rect') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>מילוי:</span>
                  <button onClick={() => setShapeFilled(v => !v)}
                    style={{ padding: '2px 8px', fontSize: '10px', borderRadius: '4px', border: `1px solid ${shapeFilled ? '#a78bfa' : '#334155'}`, background: shapeFilled ? '#4c1d95' : '#1e293b', color: shapeFilled ? '#e9d5ff' : '#94a3b8', cursor: 'pointer' }}>
                    {shapeFilled ? 'מלא' : 'קווי'}
                  </button>
                </div>
              )}
              {/* Sharing toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px solid #334155', paddingTop: '6px', marginTop: '2px' }}>
                <button
                  onClick={() => setCollabEnabled(v => !v)}
                  title={collabEnabled ? 'כבה שיתוף עמדה' : 'הפעל שיתוף עמדה — ציור וסימונים יסונכרנו בין כל מי שנמצא בעמדה'}
                  style={{ flex: 1, padding: '3px 0', fontSize: '10px', background: collabEnabled ? '#14532d' : '#1e293b', color: collabEnabled ? '#86efac' : '#94a3b8', border: `1px solid ${collabEnabled ? '#16a34a' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  {collabEnabled ? '👥 שיתוף פעיל' : '👥 שיתוף עמדה'}
                </button>
              </div>
              {/* Clear + Close */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                <button onClick={clearCanvas}
                  style={{ flex: 1, padding: '3px 0', fontSize: '10px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', borderRadius: '4px', cursor: 'pointer' }}>
                  🗑 נקה
                </button>
                <button onClick={() => setDrawingMode(false)}
                  style={{ flex: 1, padding: '3px 0', fontSize: '10px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>
                  ✕ סגור
                </button>
              </div>
            </div>
          )}
          
          {/* Map + Strips Container with Transform (zoom/pan applies to both) */}
          <div style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%',
            transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out'
          }}>
            {/* Map Image */}
            {mapImg ? (
              <img ref={mapImgRef} src={mapImg} onLoad={() => computeMapImgBounds(mapImgRef.current)} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', filter: `brightness(${mapBrightness})`, opacity: blindMapMode ? 0 : 1 }} />
            ) : (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', pointerEvents: 'none' }}>נא לטעון מפה</div>
            )}

            {/* Map Zones Overlay — two layers: legacy (full-container %) and geo (image-bounded %) */}
            {mapZones.length > 0 && (!isFlightZonesMode || fzShowZones || fzFlashZoneIds.size > 0) && (() => {
              const mapAnchor = mapGeoAnchor;
              const occupiedZoneIds = new Set<number>(stripZoneAssignments.map((a: StripZoneAssignment) => a.zone_id).filter((id): id is number => id !== null));
              const requestedOnlyZoneIds = new Set<number>();
              stripZoneAssignments.forEach((a: StripZoneAssignment) => { ((a.extra_zones||[]) as any[]).forEach((ez:any) => { if (!occupiedZoneIds.has(ez.zone_id)) requestedOnlyZoneIds.add(ez.zone_id); }); });
              const allOccupiedIds = new Set([...occupiedZoneIds, ...requestedOnlyZoneIds]);
              const _flashOnly = isFlightZonesMode && !fzShowZones && fzFlashZoneIds.size > 0;
              const enabledZones = mapZones.filter(z => z.enabled !== false);
              const visibleZones = _flashOnly ? enabledZones.filter(z => fzFlashZoneIds.has(z.id)) : fzZoneFilter === 'all' ? enabledZones : fzZoneFilter === 'occupied' ? enabledZones.filter(z => allOccupiedIds.has(z.id)) : enabledZones.filter(z => !allOccupiedIds.has(z.id));
              const legacyZones = visibleZones.filter(z => !z.polygon_geo || z.polygon_geo.length === 0);
              const geoZones = visibleZones.filter(z => z.polygon_geo && z.polygon_geo.length >= 3 && mapAnchor);
              return (<>
                {legacyZones.length > 0 && mapImgBounds && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', top: mapImgBounds.top, left: mapImgBounds.left, width: mapImgBounds.width, height: mapImgBounds.height, pointerEvents: 'none', zIndex: 1 }}>
                    {legacyZones.map(zone => {
                      const zc = fzZoneColorOverrides[zone.id] ?? zone.color;
                      const isReqOnly = requestedOnlyZoneIds.has(zone.id);
                      const opPct = fzZoneOpacityOverrides[zone.id];
                      const fillHex = opPct !== undefined ? Math.round(0xff * opPct / 100).toString(16).padStart(2,'0') : '2a';
                      const reqFillHex = opPct !== undefined ? Math.round(0xff * opPct / 100).toString(16).padStart(2,'0') : '12';
                      const isHighlighted = fzAssignedZonesPanel?.assignment?.zone_id === zone.id;
                      const isFlashing = fzFlashZoneIds.has(zone.id);
                      const hasNote = !!(fzZoneNotes[zone.id]?.trim());
                      const cx = zone.polygon.reduce((s,p)=>s+p.x,0)/zone.polygon.length;
                      const cy = zone.polygon.reduce((s,p)=>s+p.y,0)/zone.polygon.length;
                      const pts = zone.polygon.map(p => `${p.x},${p.y}`).join(' ');
                      return (
                        <g key={zone.id}>
                          {zone.polygon.length >= 3 && (<>
                            <polygon points={pts} fill={zc + fillHex} stroke={zc} strokeWidth="0.4" strokeDasharray="2,1" />
                            {isHighlighted && (<>
                              <polygon points={pts} fill={zc + '22'} stroke={zc} strokeWidth="1.2">
                                <animate attributeName="stroke-opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" />
                                <animate attributeName="stroke-width" values="0.6;2;0.6" dur="1.2s" repeatCount="indefinite" />
                              </polygon>
                              <polygon points={pts} fill={zc + '11'} stroke={zc} strokeWidth="2.5" strokeDasharray="none" opacity="0.4">
                                <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.2s" repeatCount="indefinite" />
                              </polygon>
                            </>)}
                            {isFlashing && (<>
                              <polygon points={pts} fill="#fde04755" stroke="#fde047" strokeWidth="1.5" strokeDasharray="none">
                                <animate attributeName="opacity" values="0.4;1;0.4" dur="0.7s" repeatCount="indefinite" />
                              </polygon>
                              <polygon points={pts} fill="none" stroke="#fde047" strokeWidth="3" opacity="0.6">
                                <animate attributeName="stroke-width" values="1.5;4;1.5" dur="0.7s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.3;0.8;0.3" dur="0.7s" repeatCount="indefinite" />
                              </polygon>
                            </>)}
                            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={isFlashing ? '#fde047' : zc} fontSize="2.5" fontWeight="bold" style={{ userSelect:'none' }}>{zone.name}{hasNote ? ' ✎' : ''}</text>
                            {hasNote && <text x={cx} y={cy + 3.5} textAnchor="middle" dominantBaseline="middle" fill={zc + 'cc'} fontSize="1.8" style={{ userSelect:'none' }}>{fzZoneNotes[zone.id]}</text>}
                          </>)}
                        </g>
                      );
                    })}
                  </svg>
                )}
                {geoZones.length > 0 && mapAnchor && mapImgBounds && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', top: mapImgBounds.top, left: mapImgBounds.left, width: mapImgBounds.width, height: mapImgBounds.height, pointerEvents: 'none', zIndex: 1 }}>
                    {geoZones.map(zone => {
                      const zc = fzZoneColorOverrides[zone.id] ?? zone.color;
                      const imgPts = zone.polygon_geo!.map(g => geoToImagePct(g.lat, g.lon, mapAnchor));
                      const isReqOnly = requestedOnlyZoneIds.has(zone.id);
                      const opPct = fzZoneOpacityOverrides[zone.id];
                      const fillHex = opPct !== undefined ? Math.round(0xff * opPct / 100).toString(16).padStart(2,'0') : '2a';
                      const reqFillHex = opPct !== undefined ? Math.round(0xff * opPct / 100).toString(16).padStart(2,'0') : '12';
                      const isHighlighted = fzAssignedZonesPanel?.assignment?.zone_id === zone.id;
                      const isFlashing = fzFlashZoneIds.has(zone.id);
                      const hasNote = !!(fzZoneNotes[zone.id]?.trim());
                      const pts = imgPts.map(p=>`${p.x},${p.y}`).join(' ');
                      const cx = imgPts.reduce((s,p)=>s+p.x,0)/imgPts.length;
                      const cy = imgPts.reduce((s,p)=>s+p.y,0)/imgPts.length;
                      return (
                        <g key={zone.id}>
                          <polygon points={pts} fill={zc+fillHex} stroke={zc} strokeWidth="0.4" strokeDasharray="2,1" />
                          {isHighlighted && (<>
                            <polygon points={pts} fill={zc+'22'} stroke={zc} strokeWidth="1.2">
                              <animate attributeName="stroke-opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" />
                              <animate attributeName="stroke-width" values="0.6;2;0.6" dur="1.2s" repeatCount="indefinite" />
                            </polygon>
                            <polygon points={pts} fill={zc+'11'} stroke={zc} strokeWidth="2.5" strokeDasharray="none" opacity="0.4">
                              <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.2s" repeatCount="indefinite" />
                            </polygon>
                          </>)}
                          {isFlashing && (<>
                            <polygon points={pts} fill="#fde04755" stroke="#fde047" strokeWidth="1.5" strokeDasharray="none">
                              <animate attributeName="opacity" values="0.4;1;0.4" dur="0.7s" repeatCount="indefinite" />
                            </polygon>
                            <polygon points={pts} fill="none" stroke="#fde047" strokeWidth="3" opacity="0.6">
                              <animate attributeName="stroke-width" values="1.5;4;1.5" dur="0.7s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="0.7s" repeatCount="indefinite" />
                            </polygon>
                          </>)}
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={isFlashing ? '#fde047' : zc} fontSize="2.5" fontWeight="bold" style={{ userSelect:'none' }}>{zone.name}{hasNote?' ✎':''}</text>
                          {hasNote && <text x={cx} y={cy+3.5} textAnchor="middle" dominantBaseline="middle" fill={zc+'cc'} fontSize="1.8" style={{ userSelect:'none' }}>{fzZoneNotes[zone.id]}</text>}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </>);
            })()}

            {/* Blind Map: thin wireframe outlines for ALL zones, always visible */}
            {blindMapMode && mapZones.length > 0 && mapImgBounds && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', top: mapImgBounds.top, left: mapImgBounds.left, width: mapImgBounds.width, height: mapImgBounds.height, pointerEvents: 'none', zIndex: 2 }}>
                {mapZones.filter(z => z.enabled !== false && (!z.polygon_geo || z.polygon_geo.length === 0)).map(zone => {
                  const pts = zone.polygon.map(p => `${p.x},${p.y}`).join(' ');
                  const cx = zone.polygon.reduce((s, p) => s + p.x, 0) / zone.polygon.length;
                  const cy = zone.polygon.reduce((s, p) => s + p.y, 0) / zone.polygon.length;
                  const zoneColor = zone.color || '#3b82f6';
                  const strokeColor = lightMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.55)';
                  const textColor = lightMode ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.7)';
                  return (
                    <g key={zone.id}>
                      {zone.polygon.length >= 3 && (
                        <polygon points={pts} fill={lightMode ? 'rgba(0,0,0,0.06)' : 'none'} fillOpacity={1} stroke={strokeColor} strokeWidth={lightMode ? 0.5 : 0.35} strokeOpacity={1} strokeDasharray="none" />
                      )}
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={textColor} fontSize="1.3" fontWeight="normal" style={{ userSelect: 'none' }}>{zone.name}</text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Flight Zones Mode: no overlays — zones are invisible drop targets only */}
            
            {/* Strips Layer — only show strips placed by this workstation */}
            {strips.filter(s => s.onMap && (
              ((!s.workstation_preset_id || Number(s.workstation_preset_id) === Number(session.presetId)) && (showPendingTransfer || s.status !== 'pending_transfer')) ||
              (showPendingTransfer && s.status === 'pending_transfer' && outgoingTransfers.some((t: any) => String('s' + t.strip_id) === String(s.id)))
            )).map(rawS => {
              // If strip has geo pin and map is anchored, compute pixel position from lat/lon
              const _ib = mapImgBounds;
              const s = (rawS.map_lat != null && rawS.map_lon != null && mapGeoAnchor && _ib && _ib.width > 0)
                ? (() => {
                    const pct = geoToImagePct(Number(rawS.map_lat), Number(rawS.map_lon), mapGeoAnchor);
                    return { ...rawS, x: _ib.left + pct.x / 100 * _ib.width, y: _ib.top + pct.y / 100 * _ib.height };
                  })()
                : rawS;
              return (
              <Strip key={s.id} s={s} 
                onUpdate={handleAltUpdate}
                onMove={handleMove}
                neighbors={allSectors}
                onTransfer={handleTransferWithWorkstationPick}
                onToggleAirborne={handleToggleAirborne}
                onUpdateNotes={handleUpdateStripNotes}
                onUpdateDetails={handleUpdateStripDetails}
                zoom={mapZoom}
                pan={mapPan}
                serials={relevantSerials}
                serialSelections={stripSerialSelections}
                onSerialSelect={handleSerialSelect}
                onSerialDismiss={handleSerialDismiss}
                onSerialRemove={handleSerialRemove}
                allBlockSpaces={dashboardBlockSpaces}
                allBlockTables={dashboardBlockTables}
                allBlocks={dashboardBlocks}
                allWorkstationPresets={workstationPresets}
                activeBlockTableId={effectiveBlockTableId}
                mapConflictIds={mapStripConflictIds}
                viewerPresetId={session.presetId ? Number(session.presetId) : null}
                lightMode={lightMode}
              />
            ); })}

            {/* Map Zone Pins & Lines overlay */}
            {isMapZonesMode && showMapPinStrips && (() => {
              const pinStrips = strips.filter((s: any) => s.onMap && s.map_pin_x != null && s.map_pin_y != null && (
                ((!s.workstation_preset_id || Number(s.workstation_preset_id) === Number(session.presetId)) && (showPendingTransfer || s.status !== 'pending_transfer')) ||
                (showPendingTransfer && s.status === 'pending_transfer' && outgoingTransfers.some((t: any) => String('s' + t.strip_id) === String(s.id)))
              ));
              if (pinStrips.length === 0) return null;
              return (
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 190 }}>
                  {pinStrips.map((s: any) => {
                    const cardCX = (s.x || 0) + 90 / mapZoom;
                    const cardCY = (s.y || 0) + 30 / mapZoom;
                    const pinX = s.map_pin_x as number;
                    const pinY = s.map_pin_y as number;
                    const pinR = 9 / mapZoom;
                    return (
                      <g key={`zone-pin-${s.id}`}>
                        <line x1={cardCX} y1={cardCY} x2={pinX} y2={pinY} stroke="#22c55e" strokeWidth={1.8 / mapZoom} strokeDasharray={`${6/mapZoom},${3/mapZoom}`} opacity={0.75} />
                        <circle cx={pinX} cy={pinY} r={pinR} fill="#15803d" stroke="#86efac" strokeWidth={1.5 / mapZoom} opacity={0.95} style={{ pointerEvents: 'all', cursor: 'grab' }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            (e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId);
                            (window as any).__pinDragId = String(s.id);
                          }}
                          onPointerMove={(e) => {
                            if ((window as any).__pinDragId !== String(s.id)) return;
