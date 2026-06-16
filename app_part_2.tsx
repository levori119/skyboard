                            e.stopPropagation();
                            const dx = e.movementX / mapZoom;
                            const dy = e.movementY / mapZoom;
                            setStrips((prev: any[]) => prev.map((strip: any) => String(strip.id) === String(s.id) ? { ...strip, map_pin_x: (strip.map_pin_x || 0) + dx, map_pin_y: (strip.map_pin_y || 0) + dy } : strip));
                          }}
                          onPointerUp={(e) => {
                            if ((window as any).__pinDragId !== String(s.id)) return;
                            e.stopPropagation();
                            (window as any).__pinDragId = null;
                            setStrips((prev: any[]) => {
                              const updated = prev.find((strip: any) => String(strip.id) === String(s.id));
                              if (updated && updated.map_pin_x != null) {
                                const ib = mapImgBoundsRef.current;
                                if (!ib) { fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ map_pin_x: updated.map_pin_x, map_pin_y: updated.map_pin_y }) }).catch(() => {}); return prev; }
                                const pxPct = ((updated.map_pin_x - ib.left) / ib.width) * 100;
                                const pyPct = ((updated.map_pin_y - ib.top) / ib.height) * 100;
                                const zone = fzGetZoneAtPointRef.current(pxPct, pyPct);
                                const zoneName = zone?.name || '';
                                const altRanges = zone ? (zoneAltRangesRef.current[zone.id] || []) : [];
                                const zoneAlts = altRanges.map((ar: any) => ar.name || [ar.alt_min != null ? `FL${Math.round(ar.alt_min / 100)}` : '', ar.alt_max != null ? `FL${Math.round(ar.alt_max / 100)}` : ''].filter(Boolean).join('-')).filter(Boolean).join(', ');
                                fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ map_pin_x: updated.map_pin_x, map_pin_y: updated.map_pin_y, map_zone_name: zoneName, map_zone_alts: zoneAlts }) }).catch(() => {});
                                return prev.map((strip: any) => String(strip.id) === String(s.id) ? { ...strip, map_zone_name: zoneName, map_zone_alts: zoneAlts } : strip);
                              }
                              return prev;
                            });
                          }}
                        />
                        <circle cx={pinX} cy={pinY} r={pinR * 0.45} fill="#86efac" style={{ pointerEvents: 'none' }} />
                        {s.map_zone_name && (
                          <text x={pinX} y={pinY - pinR - 4 / mapZoom} textAnchor="middle" fontSize={11 / mapZoom} fill="#86efac" stroke="#0f172a" strokeWidth={3 / mapZoom} paintOrder="stroke" style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: 'bold' }}>
                            {s.map_zone_name}{s.map_zone_alts ? ` · ${s.map_zone_alts}` : ''}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()}

            {/* Formation Split/Merge Overlay — split button for multi-aircraft strips, merge for siblings */}
            {mapSplitMergeMode && (() => {
              const onMapStrips = strips.filter(s => s.onMap && (
                ((!s.workstation_preset_id || Number(s.workstation_preset_id) === Number(session.presetId)) && (showPendingTransfer || s.status !== 'pending_transfer')) ||
                (showPendingTransfer && s.status === 'pending_transfer' && outgoingTransfers.some((t: any) => String('s' + t.strip_id) === String(s.id)))
              ));
              return onMapStrips.map(s => {
                const mapCount = parseInt(s.numberOfFormation ?? s.number_of_formation ?? '1') || 1;
                const mapSiblings = getSectorSiblings(s).filter((sib: any) => sib.onMap);
                if (mapCount <= 1 && mapSiblings.length === 0) return null;
                // We are INSIDE the transform div — do NOT multiply by mapZoom/mapPan
                // (transform already applied by parent div). Also support geo-pinned strips.
                const _fmaIb = mapImgBounds;
                const _fmaGeo = (s.map_lat != null && s.map_lon != null && mapGeoAnchor && _fmaIb && _fmaIb.width > 0)
                  ? (() => { const pct = geoToImagePct(Number(s.map_lat), Number(s.map_lon), mapGeoAnchor); return { x: _fmaIb.left + pct.x / 100 * _fmaIb.width, y: _fmaIb.top + pct.y / 100 * _fmaIb.height }; })()
                  : { x: s.x || 0, y: s.y || 0 };
                const px = _fmaGeo.x;
                const py = _fmaGeo.y;
                return (
                  <div key={`fma-btn-${s.id}`} style={{ position: 'absolute', left: px + 4, top: py - 26, zIndex: 500, pointerEvents: 'all', display: 'flex', gap: '3px' }}>
                    {mapCount > 1 && (
                      <button
                        title="פצל פ״מ"
                        onClick={() => { setSectorSplitSelected([]); setSectorSplitModal({ strip: s }); }}
                        style={{ background: '#4c1d95', border: '1px solid #7c3aed', color: '#c4b5fd', borderRadius: '5px', padding: '2px 5px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
                      >✂פצל</button>
                    )}
                    {mapSiblings.length > 0 && (
                      <button
                        title="אחד פ״מ"
                        onClick={() => { if (mapSiblings.length === 1) { setSectorMergeConfirm({ targetId: String(mapSiblings[0].id), sourceId: String(s.id), targetName: mapSiblings[0].callSign || String(mapSiblings[0].id), sourceName: s.callSign || String(s.id) }); } else { setSectorMergeModal({ strip: s, siblings: mapSiblings }); } }}
                        style={{ background: '#1e3a5f', border: '1px solid #1d4ed8', color: '#93c5fd', borderRadius: '5px', padding: '2px 5px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
                      >⊕אחד</button>
                    )}
                  </div>
                );
              });
            })()}

            {/* Markers Layer */}
            {neighborMarkers.map((marker, idx) => (
              <DraggableMapMarker
                key={`marker-${marker.sectorId}-${marker.subLabel || idx}`}
                marker={marker}
                strips={strips}
                outgoingTransfers={outgoingTransfers}
                incomingTransfers={incomingTransfers}
                onMove={(x, y) => {
                  setNeighborMarkers(prev => prev.map(m => 
                    m === marker ? { ...m, x, y } : m
                  ));
                }}
                onRemove={() => setNeighborMarkers(prev => prev.filter(m => m !== marker))}
                onRename={(newLabel) => {
                  setNeighborMarkers(prev => prev.map(m => 
                    m === marker ? { ...m, subLabel: newLabel } : m
                  ));
                }}
                onTransfer={handleTransferWithWorkstationPick}
                onCancelTransfer={handleCancelTransfer}
                onAcceptTransfer={handleAcceptTransfer}
                onRejectTransfer={handleRejectTransfer}
                onAcceptToMap={handleAcceptToMap}
                notes={allSectors.find(s => s.id === marker.sectorId)?.notes}
                onUpdateNotes={handleUpdateSectorNotes}
                zoom={mapZoom}
                pan={mapPan}
                conflictAltDelta={allSectors.find((s: any) => s.id === marker.sectorId)?.conflict_alt_delta ?? 500}
                crossSectorConflictIds={crossSectorConflictIds}
                onUpdateStripField={handleUpdateStripField}
                lightMode={lightMode}
                onSendMessage={handleSendMessageToMarker}
                onReplyToTransfer={handleReplyToTransfer}
                sharedPresets={(() => {
                  const sectorId = marker.sectorId;
                  return (workstationPresets as any[]).filter(p => {
                    if (Number(p.id) === Number(session.presetId)) return false;
                    const sids = new Set([
                      ...(p.relevant_sectors || []).map(Number),
                      ...((p.classic_transfer_points || []) as any[]).map((pt: any) => Number(pt.sector_id)),
                      ...((p.classic_receive_points || []) as any[]).map((pt: any) => Number(pt.sector_id)),
                    ]);
                    return sids.has(Number(sectorId));
                  }).map((p: any) => ({ id: Number(p.id), name: String(p.name || '') }));
                })()}
                onBroadcastNote={handleBroadcastNote}
                onDirectReplyToTransfer={handleSendDirectReplyToTransfer}
              />
            ))}

            {/* ─── Neighbor Pin Markers (pin-only mode) ─── */}
            {neighborPins.map((pin, idx) => {
              const pinOutgoing = outgoingTransfers.filter(t => Number(t.to_sector_id) === Number(pin.sectorId));
              return (
                <div
                  key={`npin-${pin.sectorId}-${idx}`}
                  className="neighbor-pin-drop-zone"
                  data-pin-sector={pin.sectorId}
                  style={{ position: 'absolute', left: pin.x, top: pin.y, transform: 'translate(-50%, -100%)', zIndex: 80, userSelect: 'none', cursor: 'default' }}
                >
                  {/* green arrow SVG */}
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <svg width="28" height="36" viewBox="0 0 28 36" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }}>
                      <polygon points="14,2 26,16 19,16 19,34 9,34 9,16 2,16" fill="#22c55e" stroke="white" strokeWidth="1.5"/>
                    </svg>
                    <div style={{ background: 'rgba(0,0,0,0.75)', color: '#86efac', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', marginTop: '2px', direction: 'rtl', border: '1px solid #22c55e' }}>
                      {pin.label}
                      {pinOutgoing.length > 0 && <span style={{ marginRight: '4px', color: '#fbbf24' }}> ({pinOutgoing.length})</span>}
                    </div>
                    <button
                      onClick={() => setNeighborPins(prev => prev.filter((_, i) => i !== idx))}
                      style={{ position: 'absolute', top: -8, left: -8, background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', lineHeight: '16px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
                      title="הסר"
                    >✕</button>
                  </div>
                </div>
              );
            })}

            {/* ─── Dashed green arrows: strip position → neighbor pin ─── */}
            {neighborPins.length > 0 && mapImgBounds && (() => {
              const ib = mapImgBounds;
              const arrowLines: React.ReactNode[] = [];
              neighborPins.forEach((pin, pIdx) => {
                const pinTransfers = showPendingTransfer
                  ? outgoingTransfers.filter(t => Number(t.to_sector_id) === Number(pin.sectorId))
                  : [];
                pinTransfers.forEach(t => {
                  let x1: number | null = null;
                  let y1: number | null = null;
                  // 1. Try fz mode: zone assignment pos_x/pos_y (same coordinate space as mapImgBounds)
                  const asgn = (stripZoneAssignments as StripZoneAssignment[]).find(a => Number(a.strip_id) === Number(t.strip_id));
                  if (asgn) {
                    const zoneData = asgn.zone_id != null ? mapZones.find((z: any) => z.id === asgn.zone_id) : null;
                    const poly = zoneData?.polygon || [];
                    const cx50 = poly.length > 0 ? poly.reduce((s: number, p: any) => s + p.x, 0) / poly.length : 50;
                    const cy50 = poly.length > 0 ? poly.reduce((s: number, p: any) => s + p.y, 0) / poly.length : 50;
                    const pctX = asgn.pos_x != null ? asgn.pos_x : (asgn.zone_id != null ? cx50 : null);
                    const pctY = asgn.pos_y != null ? asgn.pos_y : (asgn.zone_id != null ? cy50 : null);
                    if (pctX != null && pctY != null) {
                      x1 = ib.left + (pctX / 100) * ib.width;
                      y1 = ib.top + (pctY / 100) * ib.height;
                    }
                  }
                  // 2. Fall back to map_pin_x/y (non-fz strips on map)
                  if (x1 == null) {
                    const strip = strips.find((s: any) => String(s.id) === String(t.strip_id) || String(s.id) === 's' + String(t.strip_id));
                    if (!strip || strip.map_pin_x == null || strip.map_pin_y == null) return;
                    x1 = strip.map_pin_x as number;
                    y1 = strip.map_pin_y as number;
                  }
                  const x2 = pin.x;
                  const y2 = pin.y - 20;
                  const mid = { x: (x1 + x2) / 2, y: Math.min(y1!, y2) - 40 };
                  const path = `M${x1},${y1} Q${mid.x},${mid.y} ${x2},${y2}`;
                  const sw = Math.max(1, 2.5 / mapZoom);
                  const dash = `${8 / mapZoom},${4 / mapZoom}`;
                  arrowLines.push(
                    <g key={`parrow-${pIdx}-${t.id}`} pointerEvents="none">
                      <defs>
                        <marker id={`ga-${pIdx}-${t.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                          <path d="M0,0 L0,6 L8,3 z" fill="#22c55e"/>
                        </marker>
                      </defs>
                      <path d={path} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={sw + 1.5} strokeDasharray={dash} opacity="0.5"/>
                      <path d={path} fill="none" stroke="#22c55e" strokeWidth={sw} strokeDasharray={dash} markerEnd={`url(#ga-${pIdx}-${t.id})`} opacity="0.9"/>
                    </g>
                  );
                });
              });
              if (arrowLines.length === 0) return null;
              return (
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 76, overflow: 'visible' }}>
                  {arrowLines}
                </svg>
              );
            })()}

            {/* Flight Zones — Extra-Zone connector lines (icon → centroid of each extra zone) */}
            {isFlightZonesMode && fzShowLines && mapImgBounds && (() => {
              const ib = mapImgBounds;
              const lines: React.ReactNode[] = [];
              stripZoneAssignments.forEach((a: StripZoneAssignment) => {
                const extras = (a.extra_zones || []) as {id: number; zone_id: number; zone_name: string | null; zone_color: string | null}[];
                if (extras.length === 0) return;
                // Icon position (pct)
                const zoneData = a.zone_id != null ? mapZones.find((z: any) => z.id === a.zone_id) : null;
                const poly = zoneData?.polygon || [];
                const cx50 = poly.length > 0 ? poly.reduce((s: number, p: any) => s + p.x, 0) / poly.length : 50;
                const cy50 = poly.length > 0 ? poly.reduce((s: number, p: any) => s + p.y, 0) / poly.length : 50;
                const pctX = a.pos_x != null ? a.pos_x : (a.zone_id != null ? cx50 : 50);
                const pctY = a.pos_y != null ? a.pos_y : (a.zone_id != null ? cy50 : 50);
                if (a.zone_id == null && a.pos_x == null) return;
                extras.forEach(ez => {
                  const ezZone = mapZones.find((z: any) => z.id === ez.zone_id);
                  if (!ezZone || !ezZone.polygon || ezZone.polygon.length === 0) return;
                  const ezPoly = ezZone.polygon;
                  const ezCx = ezPoly.reduce((s: number, p: any) => s + p.x, 0) / ezPoly.length;
                  const ezCy = ezPoly.reduce((s: number, p: any) => s + p.y, 0) / ezPoly.length;
                  const color = ez.zone_color || '#94a3b8';
                  // Convert pct → pixel (absolute page coords, same as pins)
                  const x1 = ib.left + (pctX / 100) * ib.width;
                  const y1 = ib.top  + (pctY / 100) * ib.height;
                  const x2 = ib.left + (ezCx / 100) * ib.width;
                  const y2 = ib.top  + (ezCy / 100) * ib.height;
                  const dotR = Math.max(5, 8 / mapZoom);
                  const sw   = Math.max(1, 2 / mapZoom);
                  lines.push(
                    <g key={`fzline-${a.strip_id}-${ez.id}`} pointerEvents="none">
                      <line
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={color} strokeWidth={sw}
                        strokeDasharray={`${6/mapZoom},${3/mapZoom}`}
                        opacity={0.75}
                      />
                      <circle cx={x2} cy={y2} r={dotR} fill={color} opacity={0.85} />
                      <circle cx={x2} cy={y2} r={dotR * 1.8} fill={color} opacity={0.18} />
                    </g>
                  );
                });
              });
              if (lines.length === 0) return null;
              return (
                <svg
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 43, overflow: 'visible' }}
                >
                  {lines}
                </svg>
              );
            })()}

            {/* Closures Polygon Overlay — geo-anchored, shows enabled closure polygons on map */}
            {enabledClosureIds.size > 0 && mapGeoAnchor && mapImgBounds && (() => {
              const anchor = mapGeoAnchor;
              const activeClos = allClosures.filter((c: any) => enabledClosureIds.has(c.id) && Array.isArray(c.polygon_geo) && c.polygon_geo.length >= 3);
              if (activeClos.length === 0) return null;
              return (
                <svg style={{ position: 'absolute', top: mapImgBounds.top, left: mapImgBounds.left, width: mapImgBounds.width, height: mapImgBounds.height, pointerEvents: 'none', zIndex: 12, overflow: 'visible' }}
                  viewBox={`0 0 ${mapImgBounds.width} ${mapImgBounds.height}`} preserveAspectRatio="none">
                  {activeClos.map((c: any) => {
                    const pts = c.polygon_geo.map((pt: any) => {
                      const pct = geoToImagePct(pt.lat, pt.lon, anchor);
                      return `${(pct.x / 100) * mapImgBounds.width},${(pct.y / 100) * mapImgBounds.height}`;
                    }).join(' ');
                    const cx = c.polygon_geo.reduce((s: number, p: any) => s + p.lat, 0) / c.polygon_geo.length;
                    const cy = c.polygon_geo.reduce((s: number, p: any) => s + p.lon, 0) / c.polygon_geo.length;
                    const cPct = geoToImagePct(cx, cy, anchor);
                    const labelX = (cPct.x / 100) * mapImgBounds.width;
                    const labelY = (cPct.y / 100) * mapImgBounds.height;
                    const col = c.color || '#ef4444';
                    return (
                      <g key={c.id}>
                        <polygon points={pts} fill={col + '33'} stroke={col} strokeWidth="1.5" strokeDasharray="4,2" />
                        <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle"
                          fontSize={Math.max(8, 12 / mapZoom)} fontWeight="bold" fill={col}
                          stroke="#0f172a" strokeWidth={3 / mapZoom} paintOrder="stroke"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}>
                          🚫 {c.name}
                        </text>
                        {(c.alt_min != null || c.alt_max != null) && (
                          <text x={labelX} y={labelY + Math.max(10, 14 / mapZoom)} textAnchor="middle" dominantBaseline="middle"
                            fontSize={Math.max(7, 10 / mapZoom)} fill={col} stroke="#0f172a" strokeWidth={2 / mapZoom} paintOrder="stroke"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            FL{c.alt_min ?? '?'}–{c.alt_max ?? '?'}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()}

            {/* Flight Zones Pin Markers — inside transform div, moves with zoom/pan */}
            {isFlightZonesMode && mapImgBounds && stripZoneAssignments.filter((a: StripZoneAssignment) => {
              const _s = strips.find((s: any) => parseInt(String(s.id).replace(/^s/, ''), 10) === Number(a.strip_id));
              return !_s || showPendingTransfer || _s.status !== 'pending_transfer';
            }).map((a: StripZoneAssignment) => {
              const strip = strips.find((s: any) => parseInt(String(s.id).replace(/^s/, ''), 10) === Number(a.strip_id));
              // Fallback to zone polygon centroid when pos not yet set (skip if no zone)
              const zoneData = a.zone_id != null ? mapZones.find((z: any) => z.id === a.zone_id) : null;
              const poly = zoneData?.polygon || [];
              const cx50 = poly.length > 0 ? poly.reduce((s: number, p: any) => s + p.x, 0) / poly.length : 50;
              const cy50 = poly.length > 0 ? poly.reduce((s: number, p: any) => s + p.y, 0) / poly.length : 50;
              const pctX = a.pos_x != null ? a.pos_x : (a.zone_id != null ? cx50 : 50);
              const pctY = a.pos_y != null ? a.pos_y : (a.zone_id != null ? cy50 : 50);
              // Skip pins with no zone and no stored position (nothing to render)
              if (a.zone_id == null && a.pos_x == null) return null;
              const ib = mapImgBounds;
              const pixX = ib.left + (pctX / 100) * ib.width;
              const pixY = ib.top + (pctY / 100) * ib.height;
              const zoneHex = a.zone_color || '#94a3b8';
              const statusColor = a.is_coordinated ? '#22c55e' : a.status === 'active' ? '#60a5fa' : '#f59e0b';
              const fontSize = Math.max(9, fzPinFontSize / mapZoom);
              const callLabel = strip ? ((strip as any).callSign || (strip as any).call_sign || `#${a.strip_id}`) : `פמ ${a.strip_id}`;
              // Squadron / status colour — grey when no zone
              const sqRaw = String((strip as any)?.sq || (strip as any)?.squadron || '');
              const _fzStC: Record<string,string> = { 'בדרך לאזור': '#f59e0b', 'באזור': '#22c55e', 'עוזב אזור': '#f97316' };
              const sqColor = a.zone_id == null ? '#94a3b8'
                : fzPinColorMode === 'status'
                  ? (_fzStC[a.status] || '#94a3b8')
                  : (sqRaw.includes('118') ? '#f97316' : sqRaw.includes('123') ? '#06b6d4' : sqRaw.includes('124') ? '#a855f7' : zoneHex);
              // Uncoordinated conflict: only check when zone_id is set
              const allZonesA = a.zone_id != null ? [a.zone_id, ...((a.extra_zones||[]) as any[]).map((e:any)=>e.zone_id)] : [];
              const hasConflict = a.zone_id != null && !a.is_coordinated && stripZoneAssignments.some(
                (b: StripZoneAssignment) => {
                  if (b.strip_id === a.strip_id || b.zone_id == null) return false;
                  const allZonesB = [b.zone_id, ...((b.extra_zones||[]) as any[]).map((e:any)=>e.zone_id)];
                  if (!allZonesA.some(z => allZonesB.includes(z))) return false;
                  const altConflicts = a.altitude_range_id === null || b.altitude_range_id === null || a.altitude_range_id === b.altitude_range_id;
                  return altConflicts && !b.is_coordinated;
                }
              );
              const iconSize = Math.max(18, 24 / mapZoom);
              const planeTypeStr = String((strip as any)?.plane_type || '');
              const isHeliType = planeTypeStr.includes('מסוק') || sqRaw.includes('124') || sqRaw.includes('123') || sqRaw.includes('118');
              const heliSrc = sqRaw.includes('124') ? '/heli-yasur.png' : '/heli-yanshuf.png';
              const heliW = fzPinDisplay === 'icon' ? Math.max(44, 62 / mapZoom) : Math.max(36, 54 / mapZoom);
              // Ring colour: white when map is dark, black when map is bright
              const ringV = Math.round(255 * Math.max(0, Math.min(1, 1 - (mapBrightness - 0.2) / 1.6)));
              const ringColor = `rgb(${ringV},${ringV},${ringV})`;
              // Ghost filter — computed once per pin for use in drag ghost
              const ghostFilter = (() => {
                if (hasConflict) return 'drop-shadow(0 0 6px #ef4444) drop-shadow(0 0 14px #ef4444aa)';
                if (a.status === 'בדרך לאזור') return `sepia(1) hue-rotate(-18deg) saturate(9) brightness(1.4) drop-shadow(0 0 8px #f59e0b) drop-shadow(0 0 18px #f59e0baa)`;
                if (a.status === 'עוזב אזור')  return `sepia(1) hue-rotate(8deg) saturate(10) brightness(1.25) drop-shadow(0 0 8px #f97316) drop-shadow(0 0 18px #f97316aa)`;
                if (a.status === 'כניסה')       return `brightness(1.3) drop-shadow(0 0 8px rgba(255,255,255,0.9))`;
                const rr=parseInt(sqColor.slice(1,3),16)/255,gg=parseInt(sqColor.slice(3,5),16)/255,bb_=parseInt(sqColor.slice(5,7),16)/255;
                const mx=Math.max(rr,gg,bb_),mn=Math.min(rr,gg,bb_);
                let hue=0;if(mx!==mn){if(mx===rr)hue=60*((gg-bb_)/(mx-mn));else if(mx===gg)hue=60*((bb_-rr)/(mx-mn))+120;else hue=60*((rr-gg)/(mx-mn))+240;hue=((hue%360)+360)%360;}
                return `sepia(1) hue-rotate(${Math.round(hue-38)}deg) saturate(8) brightness(1.25) drop-shadow(0 0 8px ${sqColor}) drop-shadow(0 0 18px ${sqColor}aa)`;
              })();
              const isDraggingThisPin = fzDragStripId === a.strip_id && fzPinGhost !== null;
              return (
                <div
                  key={`fzpin-${a.strip_id}`}
                  onPointerDown={e => {
                    e.stopPropagation();
                    if (fzPinLongPressRef.current) { clearTimeout(fzPinLongPressRef.current); fzPinLongPressRef.current = null; }
                    fzPinDownPos.current = { x: e.clientX, y: e.clientY, id: a.strip_id };
                    fzPinDragRef.current = a.strip_id;
                    fzDragIsPin.current = true;
                    fzDragIdRef.current = a.strip_id;
                    setFzDragStripId(a.strip_id);
                    setFzDragLabel(callLabel);
                    if (fzOverlayRef.current) { fzOverlayRef.current.style.pointerEvents = 'all'; fzOverlayRef.current.style.background = 'rgba(14,165,233,0.06)'; fzOverlayRef.current.style.border = '2px dashed #0ea5e9'; fzOverlayRef.current.style.cursor = 'grabbing'; fzOverlayRef.current.setPointerCapture(e.pointerId); }
                    fzPinGhostPosRef.current = { x: e.clientX, y: e.clientY };
                    setFzPinGhost({ src: heliSrc, filter: ghostFilter, label: callLabel, color: sqColor, status: a.status });
                  }}
                  onPointerMove={e => {
                    if (fzPinLongPressRef.current && fzPinDownPos.current) {
                      if (Math.hypot(e.clientX - fzPinDownPos.current.x, e.clientY - fzPinDownPos.current.y) > 8) {
                        clearTimeout(fzPinLongPressRef.current); fzPinLongPressRef.current = null;
                      }
                    }
                  }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
                  onMouseEnter={() => setFzHoveredStripId(Number(a.strip_id))}
                  onMouseLeave={() => setFzHoveredStripId(prev => prev === Number(a.strip_id) ? null : prev)}
                  style={{ position: 'absolute', left: pixX, top: pixY, transform: `translate(-50%, -50%) scale(${fzHoveredStripId === Number(a.strip_id) ? 1.35 : 1})`, zIndex: fzHoveredStripId === Number(a.strip_id) ? 50 : 44, cursor: 'grab', userSelect: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${2 / mapZoom}px`, pointerEvents: 'all', touchAction: 'none', opacity: isDraggingThisPin ? 0.25 : 1, transition: 'transform 0.15s, opacity 0.15s' }}
                  title={`${callLabel}${a.zone_name ? ` — ${a.zone_name}` : ' — ללא אזור'}${a.alt_range_name ? ` · ${a.alt_range_name}` : ''}${hasConflict ? ' ⚠️ קונפליקט!' : ''}${a.note ? `\n📝 ${a.note}` : ''}${a.coordination_note ? `\n🤝 ${a.coordination_note}` : ''}`}
                >
                  {/* Helicopter image icon — CSS filter tint keeps background transparent */}
                  <div draggable={false}
                    className={hasConflict ? 'fzring-conflict' : fzAnimPaused ? '' : a.status === 'בדרך לאזור' ? 'fzring-heading' : a.status === 'עוזב אזור' ? 'fzring-leaving' : a.status === 'באזור' ? 'fzring-active' : ''}
                    style={{ position: 'relative', flexShrink: 0, width: heliW, height: heliW, borderRadius: '50%',
                      background: fzPinDisplay === 'icon' ? 'transparent' : (hasConflict ? 'rgba(239,68,68,0.35)' : sqColor + '33'),
                      border: fzPinDisplay === 'icon' ? 'none' : (hasConflict ? '2.5px solid #ef4444' : a.status === 'בדרך לאזור' ? `2.5px dashed ${sqColor}` : `2.5px solid ${sqColor}`),
                      boxShadow: fzPinDisplay === 'icon' ? 'none' : (hasConflict ? '0 0 8px 4px #ef444488' : `0 0 10px 4px ${sqColor}99, 0 0 20px 6px ${sqColor}44, inset 0 0 6px 2px ${sqColor}22`),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', pointerEvents: 'none' }}>
                    {(() => {
                      let imgFilter: string;
                      if (hasConflict) {
                        imgFilter = 'drop-shadow(0 0 4px #ef4444) drop-shadow(0 0 10px #ef4444) drop-shadow(0 0 18px #ef444488)';
                      } else if (a.status === 'בדרך לאזור') {
                        // Amber/golden — heading toward zone
                        imgFilter = `sepia(1) hue-rotate(-18deg) saturate(9) brightness(1.4) drop-shadow(0 0 ${heliW*0.22}px #f59e0b) drop-shadow(0 0 ${heliW*0.42}px #f59e0bbb) drop-shadow(0 0 ${heliW*0.6}px #f59e0b66)`;
                      } else if (a.status === 'עוזב אזור') {
                        // Orange/red — departing zone
                        imgFilter = `sepia(1) hue-rotate(8deg) saturate(10) brightness(1.25) drop-shadow(0 0 ${heliW*0.22}px #f97316) drop-shadow(0 0 ${heliW*0.42}px #f97316bb) drop-shadow(0 0 ${heliW*0.6}px #f9731666)`;
                      } else if (a.status === 'כניסה') {
                        imgFilter = `brightness(1.3) drop-shadow(0 0 ${heliW * 0.15}px rgba(255,255,255,0.8)) drop-shadow(0 0 ${heliW * 0.3}px rgba(255,255,255,0.4))`;
                      } else {
                        // Squadron colour tint
                        const rr = parseInt(sqColor.slice(1,3),16)/255;
                        const gg = parseInt(sqColor.slice(3,5),16)/255;
                        const bb = parseInt(sqColor.slice(5,7),16)/255;
                        const mx = Math.max(rr,gg,bb), mn = Math.min(rr,gg,bb);
                        let hue = 0;
                        if (mx !== mn) {
                          if (mx === rr)      hue = 60*((gg-bb)/(mx-mn));
                          else if (mx === gg) hue = 60*((bb-rr)/(mx-mn))+120;
                          else                hue = 60*((rr-gg)/(mx-mn))+240;
                          hue = ((hue%360)+360)%360;
                        }
                        const rot = Math.round(hue - 38);
                        imgFilter = `sepia(1) hue-rotate(${rot}deg) saturate(8) brightness(1.25) drop-shadow(0 0 ${heliW*0.2}px ${sqColor}) drop-shadow(0 0 ${heliW*0.35}px ${sqColor}bb) drop-shadow(0 0 ${heliW*0.5}px ${sqColor}66)`;
                      }
                      if (fzPinDisplay === 'icon' && !isHeliType) {
                        return (
                          <svg width={heliW} height={heliW} viewBox="0 0 100 100" style={{ display: 'block', filter: imgFilter, pointerEvents: 'none' }} draggable={false}>
                            <polygon points="50,5 60,40 95,45 60,55 65,90 50,80 35,90 40,55 5,45 40,40" fill="white" opacity="0.95"/>
                          </svg>
                        );
                      }
                      return (
                        <img
                          src={heliSrc}
                          alt=""
                          draggable={false}
                          onDragStart={e => e.preventDefault()}
                          className={hasConflict ? 'fzpin-conflict' : fzAnimPaused ? '' : a.status === 'בדרך לאזור' ? 'fzpin-heading' : a.status === 'עוזב אזור' ? 'fzpin-leaving' : a.status === 'באזור' ? 'fzpin-active' : ''}
                          style={{ width: heliW, height: 'auto', display: 'block', filter: imgFilter, pointerEvents: 'none' }}
                        />
                      );
                    })()}
                    {/* Note indicator — moved to top-left */}
                    {(a.note || a.coordination_note) && (
                      <div style={{ position: 'absolute', top: -4, left: -4, width: 14, height: 14, borderRadius: '50%', background: '#f59e0b', color: '#000', fontSize: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: '1.5px solid #0f172a', zIndex: 2, pointerEvents: 'none' }}>!</div>
                    )}
                    {/* Menu button — top-right of circle, click to open strip menu */}
                    <div
                      style={{ position: 'absolute', top: -5, right: -5, width: Math.max(13, 16/mapZoom), height: Math.max(13, 16/mapZoom), borderRadius: '50%', background: '#0f172a', border: `${Math.max(1, 1.5/mapZoom)}px solid #475569`, color: '#94a3b8', fontSize: Math.max(9, 11/mapZoom), display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, zIndex: 3, pointerEvents: 'all', cursor: 'pointer', userSelect: 'none' }}
                      onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                      onClick={e => {
                        e.stopPropagation();
                        e.preventDefault();
                        setFzPinMenu({ stripId: a.strip_id, x: e.clientX, y: e.clientY, strip, assignment: a });
                      }}
                      title="תפריט"
                    >⋮</div>
                  </div>
                  <div style={{ background: fzPinDisplay === 'icon' ? 'rgba(0,0,0,0.65)' : 'rgba(15,23,42,0.9)', color: sqColor, padding: `${1 / mapZoom}px ${4 / mapZoom}px`, borderRadius: `${3 / mapZoom}px`, fontSize: fzPinDisplay === 'icon' ? `${Math.max(7, (fontSize - 1))}px` : fontSize + 'px', fontWeight: 'bold', whiteSpace: 'nowrap', border: `${1 / mapZoom}px solid ${sqColor}55`, lineHeight: 1.2, direction: 'ltr', textShadow: fzPinDisplay === 'icon' ? '0 1px 3px rgba(0,0,0,0.9)' : 'none' }}>
                    {callLabel}{fzPinDisplay === 'strip' && sqRaw ? ` / ${sqRaw}` : ''}
                  </div>
                  {/* Status label below callsign — hidden in icon mode */}
                  {fzPinDisplay !== 'icon' && (() => {
                    const stMeta: Record<string, { label: string; color: string; bg: string }> = {
                      'בדרך לאזור': { label: '➡ בדרך', color: '#f59e0b', bg: 'rgba(120,60,0,0.85)' },
                      'עוזב אזור':  { label: '↗ עוזב',  color: '#f97316', bg: 'rgba(120,40,0,0.85)' },
                      'באזור':      { label: '✓ באזור', color: '#22c55e', bg: 'rgba(0,60,20,0.85)'  },
                      'כניסה':      { label: '⬇ כניסה', color: '#a78bfa', bg: 'rgba(60,0,100,0.85)' },
                    };
                    const m = stMeta[a.status];
                    if (!m) return null;
                    return (
                      <div style={{ background: m.bg, color: m.color, padding: `${1/mapZoom}px ${5/mapZoom}px`, borderRadius: `${3/mapZoom}px`, fontSize: `${Math.max(8, (fzPinFontSize - 1)/mapZoom)}px`, fontWeight: 'bold', whiteSpace: 'nowrap', border: `${1/mapZoom}px solid ${m.color}88`, lineHeight: 1.2, marginTop: `${1/mapZoom}px` }}>
                        {m.label}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Split pins — virtual helicopter markers for fzSplitItems that have a zone assigned */}
            {isFlightZonesMode && mapImgBounds && fzSplitItems.filter(si => si.zoneId != null && si.posX !== undefined && si.posY !== undefined).map(si => {
              const ib = mapImgBounds!;
              const pixX = ib.left + (si.posX! / 100) * ib.width;
              const pixY = ib.top + (si.posY! / 100) * ib.height;
              const parentStrip = strips.find((s: any) => parseInt(String(s.id).replace(/^s/,''),10) === parseInt(String(si.parentStripId).replace(/^s/,''),10));
              const sqRaw = String((parentStrip as any)?.sq || (parentStrip as any)?.squadron || '');
              const sqColor = sqRaw.includes('118') ? '#f97316' : sqRaw.includes('123') ? '#06b6d4' : sqRaw.includes('124') ? '#a855f7' : (si.zoneColor || '#3b82f6');
              const isYasur = sqRaw.includes('124');
              const heliSrc = isYasur ? '/heli-yasur.png' : '/heli-yanshuf.png';
              const heliW = Math.max(28, 40 / mapZoom);
              const fontSize = Math.max(8, 10 / mapZoom);
              const stColors: Record<string, string> = { 'בדרך לאזור': '#f59e0b', 'באזור': '#22c55e', 'עוזב אזור': '#f97316' };
              const stColor = stColors[si.status || ''] || sqColor;
              const filterStr = `sepia(1) hue-rotate(${isYasur ? 270 : 180}deg) saturate(8) brightness(1.3) drop-shadow(0 0 4px ${sqColor})`;
              return (
                <div
                  key={`fzsplit-${si.key}`}
                  ref={el => { if (el) fzSplitPinDomRefs.current.set(si.key, el); else fzSplitPinDomRefs.current.delete(si.key); }}
                  onPointerDown={e => {
                    e.stopPropagation();
                    e.preventDefault();
                    fzSplitPinDragRef.current = { key: si.key, downX: e.clientX, downY: e.clientY };
                    if (fzOverlayRef.current) { fzOverlayRef.current.style.pointerEvents = 'all'; fzOverlayRef.current.style.background = 'rgba(139,92,246,0.05)'; fzOverlayRef.current.style.border = '2px dashed #a78bfa'; fzOverlayRef.current.style.cursor = 'grabbing'; }
                  }}
                  style={{ position: 'absolute', left: pixX, top: pixY, transform: 'translate(-50%, -50%)', zIndex: 45, cursor: 'grab', userSelect: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${2/mapZoom}px`, pointerEvents: 'all', touchAction: 'none' }}
                >
                  <div style={{ position: 'relative', width: heliW, height: heliW, borderRadius: '50%', border: `${2/mapZoom}px dashed ${stColor}`, boxShadow: `0 0 8px 3px ${stColor}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.75)' }}>
                    <img src={heliSrc} alt="" draggable={false} style={{ width: heliW * 0.72, height: 'auto', filter: filterStr, pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: -5/mapZoom, right: -5/mapZoom, width: 14/mapZoom, height: 14/mapZoom, borderRadius: '50%', background: '#7c3aed', color: 'white', fontSize: 9/mapZoom, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `${1/mapZoom}px solid #0f172a`, zIndex: 2, pointerEvents: 'none', fontWeight: 'bold' }}>✂</div>
                  </div>
                  <div style={{ background: 'rgba(15,23,42,0.92)', color: stColor, padding: `${1/mapZoom}px ${4/mapZoom}px`, borderRadius: `${3/mapZoom}px`, fontSize, fontWeight: 'bold', whiteSpace: 'nowrap', border: `${1/mapZoom}px solid ${stColor}66`, lineHeight: 1.2 }}>
                    {si.label}{si.count > 1 ? ` ×${si.count}` : ''}
                  </div>
                </div>
              );
            })}

            
          </div>

          {/* Flight Zones Drop Overlay — OUTSIDE the transform div so it covers the full container regardless of zoom/pan */}
          {isFlightZonesMode && (
            <div
              ref={fzOverlayRef}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, cursor: 'default', background: 'transparent', border: 'none', borderRadius: '4px', pointerEvents: 'none' }}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={handleFzMapDrop}
              onPointerMove={e => {
                if (fzSplitPinDragRef.current) {
                  const el = fzSplitPinDomRefs.current.get(fzSplitPinDragRef.current.key);
                  if (el && mapImgBoundsRef.current) {
                    const ib = mapImgBoundsRef.current;
                    const pctX = Math.max(1, Math.min(99, (e.clientX - ib.left) / ib.width * 100));
                    const pctY = Math.max(1, Math.min(99, (e.clientY - ib.top) / ib.height * 100));
                    el.style.left = (ib.left + pctX / 100 * ib.width) + 'px';
                    el.style.top = (ib.top + pctY / 100 * ib.height) + 'px';
                  }
                } else if (fzPinDragRef.current && fzPinGhostRef.current) {
                  fzPinGhostRef.current.style.left = e.clientX + 'px';
                  fzPinGhostRef.current.style.top = e.clientY + 'px';
                }
              }}
              onPointerUp={handleFzPinPointerUp}
              onPointerLeave={() => {
                if (fzSplitPinDragRef.current) {
                  fzSplitPinDragRef.current = null;
                  if (fzOverlayRef.current) { fzOverlayRef.current.style.pointerEvents = 'none'; fzOverlayRef.current.style.background = 'transparent'; fzOverlayRef.current.style.border = 'none'; fzOverlayRef.current.style.cursor = 'default'; }
                }
                if (fzPinDragRef.current) {
                  fzPinDragRef.current = null;
                  fzDragIsPin.current = false;
                  fzDragIdRef.current = null;
                  setFzDragStripId(null);
                  setFzDragLabel(null);
                  if (fzOverlayRef.current) { fzOverlayRef.current.style.pointerEvents = 'none'; fzOverlayRef.current.style.background = 'transparent'; fzOverlayRef.current.style.border = 'none'; fzOverlayRef.current.style.cursor = 'default'; }
                  setFzPinGhost(null);
                }
              }}
            />
          )}

          {/* (bottom bar moved outside overflow:hidden — see below) */}

          {/* 🖊️ Drawing canvas — map mode only */}
          <canvas
            ref={canvasRef}
            onPointerDown={e => {
              e.preventDefault(); e.stopPropagation();
              if (drawTool === 'pen' || drawTool === 'eraser') {
                startDrawing(e);
              } else if (drawingModeRef.current) {
                e.currentTarget.setPointerCapture(e.pointerId);
                setSelectedShapeId(null);
                const rect = e.currentTarget.getBoundingClientRect();
                shapeStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                setShapePreview({ x1: shapeStartRef.current.x, y1: shapeStartRef.current.y, x2: shapeStartRef.current.x, y2: shapeStartRef.current.y });
              }
            }}
            onPointerMove={e => {
              e.stopPropagation();
              if (drawTool === 'pen' || drawTool === 'eraser') {
                draw(e);
              } else if (shapeStartRef.current) {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left; const y = e.clientY - rect.top;
                setShapePreview(prev => prev ? { ...prev, x2: x, y2: y } : null);
              }
            }}
            onPointerUp={e => {
              e.stopPropagation();
              if (drawTool === 'pen' || drawTool === 'eraser') {
                stopDrawing();
              } else if (shapeStartRef.current && shapePreview) {
                const rect = e.currentTarget.getBoundingClientRect();
                const x2 = e.clientX - rect.left; const y2 = e.clientY - rect.top;
                const x = Math.min(shapeStartRef.current.x, x2);
                const y = Math.min(shapeStartRef.current.y, y2);
                const w = Math.abs(x2 - shapeStartRef.current.x);
                const h = Math.abs(y2 - shapeStartRef.current.y);
                if (w > 5 || h > 5) {
                  setMapShapes(prev => [...prev, { id: Date.now().toString(), type: drawTool as 'circle'|'rect', x, y, w: Math.max(w, 10), h: Math.max(h, 10), color: penColor, filled: shapeFilled, strokeWidth: penSize }]);
                }
                shapeStartRef.current = null; setShapePreview(null);
              }
            }}
            onPointerLeave={e => { e.stopPropagation(); stopDrawing(); }}
            onPointerCancel={e => { e.stopPropagation(); stopDrawing(); shapeStartRef.current = null; setShapePreview(null); }}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              pointerEvents: drawingMode ? 'auto' : 'none',
              cursor: drawingMode ? (eraserMode ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\'%3E%3Cpath d=\'M20 20H7L3 16c-.8-.8-.8-2 0-2.8l10-10c.8-.8 2-.8 2.8 0l7 7c.8.8.8 2 0 2.8L14 22\'/%3E%3Cpath d=\'M6.5 13.5 15 5\'/%3E%3C/svg%3E") 12 12, auto' : 'crosshair') : 'default',
              touchAction: 'none', zIndex: 200
            }}
          />

          {/* Shapes SVG overlay — renders circles & rectangles from mapShapes */}
          {(mapShapes.length > 0 || (shapePreview && (drawTool === 'circle' || drawTool === 'rect'))) && (
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 201, overflow: 'visible' }}>
              {mapShapes.map(shape => shape.type === 'rect'
                ? <rect key={shape.id} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
                    fill={shape.filled ? shape.color + '55' : 'none'} stroke={shape.color} strokeWidth={shape.strokeWidth} rx={2} />
                : <ellipse key={shape.id} cx={shape.x + shape.w / 2} cy={shape.y + shape.h / 2} rx={shape.w / 2} ry={shape.h / 2}
                    fill={shape.filled ? shape.color + '55' : 'none'} stroke={shape.color} strokeWidth={shape.strokeWidth} />
              )}
              {shapePreview && (drawTool === 'circle' || drawTool === 'rect') && (() => {
                const px = Math.min(shapePreview.x1, shapePreview.x2);
                const py = Math.min(shapePreview.y1, shapePreview.y2);
                const pw = Math.abs(shapePreview.x2 - shapePreview.x1);
                const ph = Math.abs(shapePreview.y2 - shapePreview.y1);
                return drawTool === 'rect'
                  ? <rect x={px} y={py} width={pw} height={ph} fill={shapeFilled ? penColor + '33' : 'none'} stroke={penColor} strokeWidth={penSize} strokeDasharray="6 3" opacity={0.85} rx={2} />
                  : <ellipse cx={px + pw / 2} cy={py + ph / 2} rx={pw / 2} ry={ph / 2} fill={shapeFilled ? penColor + '33' : 'none'} stroke={penColor} strokeWidth={penSize} strokeDasharray="6 3" opacity={0.85} />;
              })()}
            </svg>
          )}

          </div>{/* /Map 1 panel wrapper */}

          {/* Flight Zones flash notification banner */}
          {isFlightZonesMode && fzFlashMsg && (
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 520, pointerEvents: 'none', borderRadius: '10px', padding: '10px 24px', fontWeight: 'bold', fontSize: '15px', direction: 'rtl', boxShadow: '0 6px 30px rgba(0,0,0,0.7)', whiteSpace: 'nowrap', ...(fzFlashMsg.startsWith('שגיאה') ? { background: 'rgba(220,38,38,0.97)', color: '#fff', border: '2px solid #ef4444' } : fzFlashMsg.startsWith('אין') || fzFlashMsg.startsWith('לא') ? { background: 'rgba(51,65,85,0.97)', color: '#94a3b8', border: '2px solid #475569' } : { background: 'rgba(253,224,71,0.97)', color: '#0f172a', border: '2px solid #fbbf24' }) }}>
              {fzFlashMsg}
            </div>
          )}

          {/* Flight Zones status bar — outside overflow:hidden so always visible over both maps */}
          {isFlightZonesMode && (
            <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.92)', border: '1px solid #1e3a5f', borderRadius: '8px', padding: '4px 14px', zIndex: 510, fontSize: '11px', color: '#64748b', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap', boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
              <span>✈️ {stripZoneAssignments.length} / {myTableStrips.filter((s: any) => s.status !== 'pending_transfer').length}</span>
              <button onClick={() => setFzShowZones(v => !v)}
                style={{ padding: '2px 10px', borderRadius: '5px', border: `1px solid ${fzShowZones ? '#22c55e' : '#334155'}`, background: fzShowZones ? '#14532d' : '#1e293b', color: fzShowZones ? '#86efac' : '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                {fzShowZones ? '🗺 הסתר' : '🗺 הצג'}
              </button>
              {(['all','occupied','free'] as const).map(f => (
                <button key={f} onClick={() => {
                  if (fzZoneFilter === f && fzShowZones) {
                    setFzShowZones(false);
                  } else {
                    setFzZoneFilter(f);
                    setFzShowZones(true);
                  }
                }}
                  style={{ padding: '2px 8px', borderRadius: '5px', border: `1px solid ${fzZoneFilter === f && fzShowZones ? '#f59e0b' : '#334155'}`, background: fzZoneFilter === f && fzShowZones ? '#2d1d00' : '#1e293b', color: fzZoneFilter === f && fzShowZones ? '#fcd34d' : '#94a3b8', cursor: 'pointer', fontSize: '11px' }}>
                  {f === 'all' ? '🔵 הכל' : f === 'occupied' ? '🔴 תפוסים' : '🟢 פנויים'}
                </button>
              ))}
              <button onClick={() => setFzPinColorMode(m => m === 'squadron' ? 'status' : 'squadron')}
                style={{ padding: '2px 9px', borderRadius: '5px', border: `1px solid ${fzPinColorMode === 'status' ? '#a78bfa' : '#334155'}`, background: fzPinColorMode === 'status' ? '#2e1065' : '#1e293b', color: fzPinColorMode === 'status' ? '#c4b5fd' : '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                {fzPinColorMode === 'status' ? '🎨 סטטוס' : '🎨 טייסת'}
              </button>
              <button onClick={() => setFzShowLines(v => !v)}
                style={{ padding: '2px 9px', borderRadius: '5px', border: `1px solid ${fzShowLines ? '#38bdf8' : '#334155'}`, background: fzShowLines ? '#0c3050' : '#1e293b', color: fzShowLines ? '#7dd3fc' : '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                {fzShowLines ? '〰 הסתר קווים' : '〰 הצג קווים'}
              </button>
              <button onClick={() => setFzAnimPaused(p => !p)}
                style={{ padding: '2px 9px', borderRadius: '5px', border: `1px solid ${fzAnimPaused ? '#f59e0b' : '#334155'}`, background: fzAnimPaused ? '#2d1d00' : '#1e293b', color: fzAnimPaused ? '#fcd34d' : '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                {fzAnimPaused ? '▶ הבהוב' : '⏸ הבהוב'}
              </button>
              {/* Pin font size control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #334155', borderRadius: '5px', padding: '1px 6px', background: '#1e293b' }}>
                <span style={{ fontSize: '10px', color: '#64748b' }}>A</span>
                <button onClick={() => setFzPinFontSize(s => Math.max(7, s - 1))}
                  style={{ padding: '0 4px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', lineHeight: 1, fontWeight: 'bold' }}>−</button>
                <span style={{ fontSize: '11px', color: '#e2e8f0', minWidth: '16px', textAlign: 'center' }}>{fzPinFontSize}</span>
                <button onClick={() => setFzPinFontSize(s => Math.min(22, s + 1))}
                  style={{ padding: '0 4px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', lineHeight: 1, fontWeight: 'bold' }}>+</button>
                <span style={{ fontSize: '13px', color: '#64748b' }}>A</span>
              </div>
              {/* Zone color overrides panel toggle */}
              {fzShowZones && mapZones.length > 0 && (
                <button onClick={() => setFzZoneColorPanel(v => !v)}
                  title="שנה צבעי אזורים"
                  style={{ padding: '2px 9px', borderRadius: '5px', border: `1px solid ${fzZoneColorPanel ? '#06b6d4' : '#334155'}`, background: fzZoneColorPanel ? '#0c4a6e' : '#1e293b', color: fzZoneColorPanel ? '#67e8f9' : '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                  🎨 צבעי אזורים
                </button>
              )}
              {myPresetConfig?.use_map_zones && (
                <button onClick={() => { setUseMapZonesActive(v => !v); useMapZonesRef.current = !useMapZonesRef.current; }}
                  style={{ padding: '2px 10px', borderRadius: '5px', border: `1px solid ${isMapZonesMode ? '#22c55e' : '#334155'}`, background: isMapZonesMode ? '#14532d' : '#1e293b', color: isMapZonesMode ? '#86efac' : '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                  {isMapZonesMode ? '🧭 פעיל' : '🧭 כבוי'}
                </button>
              )}
            </div>
          )}

          {/* Zone color overrides panel */}
          {isFlightZonesMode && fzZoneColorPanel && mapZones.length > 0 && (
            <div style={{ position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.97)', border: '1px solid #0284c7', borderRadius: '10px', padding: '10px 14px', zIndex: 511, backdropFilter: 'blur(8px)', direction: 'rtl', boxShadow: '0 4px 20px rgba(0,0,0,0.7)', minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: '#67e8f9', fontWeight: 'bold' }}>🎨 צבעי אזורים (שינוי לסשן בלבד)</span>
                <button onClick={() => setFzZoneColorPanel(false)}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 2px' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {mapZones.map(z => {
                  const curColor = fzZoneColorOverrides[z.id] ?? z.color;
                  const curOpacity = fzZoneOpacityOverrides[z.id] !== undefined ? fzZoneOpacityOverrides[z.id] : 100;
                  const curNote = fzZoneNotes[z.id] ?? '';
                  return (
                    <div key={z.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="color" value={curColor} onChange={e => setFzZoneColorOverrides(prev => ({ ...prev, [z.id]: e.target.value }))}
                          style={{ width: 28, height: 20, border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'transparent', padding: 0 }} />
                        <span style={{ fontSize: '12px', color: curColor, fontWeight: 'bold', flex: 1 }}>{z.name}</span>
                        {fzZoneColorOverrides[z.id] && (
                          <button onClick={() => setFzZoneColorOverrides(prev => { const n = { ...prev }; delete n[z.id]; return n; })}
                            style={{ fontSize: '9px', color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 4px' }}>↺</button>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '9px', color: '#64748b', marginLeft: '4px', whiteSpace: 'nowrap' }}>שקיפות מילוי:</span>
                        {[100, 75, 50, 25, 0].map(pct => (
                          <button key={pct} onClick={() => setFzZoneOpacityOverrides(prev => ({ ...prev, [z.id]: pct }))}
                            style={{ padding: '1px 5px', fontSize: '10px', borderRadius: '3px', border: `1px solid ${curOpacity === pct ? '#06b6d4' : '#334155'}`, background: curOpacity === pct ? '#0c4a6e' : '#1e293b', color: curOpacity === pct ? '#67e8f9' : '#64748b', cursor: 'pointer', fontWeight: curOpacity === pct ? 'bold' : 'normal' }}>
                            {pct}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '9px', color: '#64748b' }}>✎ הערה לאזור (מוצגת על המפה):</span>
                        <textarea
                          value={curNote}
                          onChange={e => setFzZoneNotes(prev => ({ ...prev, [z.id]: e.target.value }))}
                          placeholder="כתוב הערה..."
                          rows={2}
                          style={{ width: '100%', fontSize: '11px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', padding: '3px 6px', resize: 'vertical', direction: 'rtl', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {(Object.keys(fzZoneColorOverrides).length > 0 || Object.keys(fzZoneOpacityOverrides).length > 0 || Object.keys(fzZoneNotes).some(k => fzZoneNotes[Number(k)]?.trim())) && (
                <button onClick={() => { setFzZoneColorOverrides({}); setFzZoneOpacityOverrides({}); setFzZoneNotes({}); }}
                  style={{ marginTop: '8px', padding: '3px 10px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', width: '100%' }}>
                  ↺ איפוס הכול
                </button>
              )}
            </div>
          )}

          {/* Dual Map: Splitter + Map 2 panel */}
          {isDualMapMode && <>
            {/* Splitter bar */}
            <div
              style={{
                position: 'absolute', zIndex: 500, userSelect: 'none',
                ...(dualMapLayout === 'stacked'
                  ? { top: `${dualMapSplit}%`, left: 0, width: '100%', height: 5, cursor: 'ns-resize', background: '#1e293b' }
                  : { top: 0, left: `${dualMapSplit}%`, width: 5, height: '100%', cursor: 'ew-resize', background: '#1e293b' }),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onPointerDown={e => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const startPos = dualMapLayout === 'stacked' ? e.clientY : e.clientX;
                const startSplit = dualMapSplit;
                const onMove = (me: PointerEvent) => {
                  const container = document.getElementById('map-area');
                  if (!container) return;
                  const rect = container.getBoundingClientRect();
                  const total = dualMapLayout === 'stacked' ? rect.height : rect.width;
                  const delta = (dualMapLayout === 'stacked' ? me.clientY : me.clientX) - startPos;
                  setDualMapSplit(Math.max(20, Math.min(80, startSplit + (delta / total) * 100)));
                };
                const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
              }}
            >
              <div style={{ ...(dualMapLayout === 'stacked' ? { width: 40, height: 3 } : { width: 3, height: 40 }), background: '#475569', borderRadius: 2, pointerEvents: 'none' }} />
            </div>

            {/* Map 2 panel */}
            <div style={{
              position: 'absolute', overflow: 'hidden', background: '#0d1117',
              ...(dualMapLayout === 'stacked'
                ? { top: `calc(${dualMapSplit}% + 5px)`, left: 0, width: '100%', height: `calc(${100 - dualMapSplit}% - 5px)` }
                : { top: 0, left: `calc(${dualMapSplit}% + 5px)`, width: `calc(${100 - dualMapSplit}% - 5px)`, height: '100%' }),
            }}>
              {/* Map 2 full toolbar — same as map 1 */}
              <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(30,41,59,0.9)', padding: '4px', borderRadius: '6px', width: 28 }}>
                <button onClick={() => setMap2Zoom(z => Math.min(z + 0.25, 3))} style={{ width: 20, height: 20, background: '#475569', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', lineHeight: 1, padding: 0 }}>+</button>
                <button onClick={() => setMap2Zoom(z => Math.max(z - 0.25, 0.5))} style={{ width: 20, height: 20, background: '#475569', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', lineHeight: 1, padding: 0 }}>−</button>
                <button onClick={() => { setMap2Zoom(1); setMap2Pan({ x: 0, y: 0 }); }} style={{ width: 20, height: 16, background: '#475569', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '7px', lineHeight: 1, padding: 0 }}>איפוס</button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
                  <button onClick={() => setMap2Pan(p => ({ ...p, y: p.y + 50 }))} style={{ width: 20, height: 16, background: '#334155', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '9px', lineHeight: 1, padding: 0 }}>▲</button>
                  <div style={{ display: 'flex', gap: '1px' }}>
                    <button onClick={() => setMap2Pan(p => ({ ...p, x: p.x + 50 }))} style={{ width: 9, height: 16, background: '#334155', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '7px', lineHeight: 1, padding: 0 }}>◀</button>
                    <button onClick={() => setMap2Pan(p => ({ ...p, x: p.x - 50 }))} style={{ width: 9, height: 16, background: '#334155', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '7px', lineHeight: 1, padding: 0 }}>▶</button>
                  </div>
                  <button onClick={() => setMap2Pan(p => ({ ...p, y: p.y - 50 }))} style={{ width: 20, height: 16, background: '#334155', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '9px', lineHeight: 1, padding: 0 }}>▼</button>
                </div>
                <div style={{ fontSize: '7px', color: '#94a3b8', textAlign: 'center', marginTop: '1px' }}>{Math.round(map2Zoom * 100)}%</div>
                <div style={{ width: '100%', height: '1px', background: '#334155', margin: '2px 0' }} />
                <button onClick={() => setMap2ShowBrightnessPanel(v => !v)} title={`בהירות: ${Math.round(map2Brightness * 100)}%`}
                  style={{ width: 20, height: 20, background: map2ShowBrightnessPanel ? '#1d4ed8' : (map2Brightness !== 1 ? '#92400e' : '#475569'), color: map2Brightness !== 1 ? '#fcd34d' : 'white', border: map2ShowBrightnessPanel ? '1px solid #60a5fa' : 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', lineHeight: 1, padding: 0 }}>☀</button>
                <div style={{ width: '100%', height: '1px', background: '#334155', margin: '2px 0' }} />
                <button onClick={() => setMap2DrawingMode(v => !v)} title={map2DrawingMode ? 'כבה ציור' : 'ציור על מפה 2'}
                  style={{ width: 20, height: 20, background: map2DrawingMode ? '#7c3aed' : '#475569', color: 'white', border: map2DrawingMode ? '1px solid #a78bfa' : 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: 0 }}>✏</button>
              </div>
              {/* Map 2 brightness panel */}
              {map2ShowBrightnessPanel && (
                <div style={{ position: 'absolute', top: 8, left: 44, zIndex: 150, background: 'rgba(15,23,42,0.97)', border: '1px solid #1d4ed8', borderRadius: '8px', padding: '8px 10px', minWidth: '140px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', direction: 'rtl' }}>
                  <div style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 'bold', marginBottom: '6px' }}>☀ בהירות מפה 2</div>
                  <span style={{ fontSize: '13px', color: '#fcd34d', fontWeight: 'bold' }}>{Math.round(map2Brightness * 100)}%</span>
                  <input type="range" min={0.2} max={1.8} step={0.05} value={map2Brightness} onChange={e => setMap2Brightness(Number(e.target.value))}
                    style={{ width: '100%', marginTop: '6px', accentColor: '#1d4ed8' }} />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {[20,35,50,80,100,130].map(pct => (
                      <button key={pct} onClick={() => setMap2Brightness(pct / 100)}
                        style={{ padding: '2px 5px', fontSize: '9px', borderRadius: '3px', border: 'none', background: Math.round(map2Brightness * 100) === pct ? '#1d4ed8' : '#1e293b', color: Math.round(map2Brightness * 100) === pct ? '#fff' : '#94a3b8', cursor: 'pointer' }}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                  {map2Brightness !== 1 && (
                    <button onClick={() => setMap2Brightness(1)} style={{ marginTop: '4px', width: '100%', padding: '2px 0', fontSize: '9px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '3px', cursor: 'pointer' }}>↺ איפוס</button>
                  )}
                </div>
              )}
              {/* Map 2 drawing toolbar */}
              {map2DrawingMode && (
                <div style={{ position: 'absolute', top: 8, left: 44, zIndex: 150, background: 'rgba(15,23,42,0.97)', border: '1px solid #7c3aed', borderRadius: '8px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', direction: 'rtl' }}>
                  <div style={{ fontSize: '11px', color: '#c4b5fd', fontWeight: 'bold', marginBottom: '2px' }}>✏ ציור — מפה 2</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>צבע:</span>
                    <input type="color" value={map2PenColor} onChange={e => setMap2PenColor(e.target.value)} style={{ width: 28, height: 20, border: 'none', borderRadius: '3px', cursor: 'pointer', padding: 0 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>עובי:</span>
                    <input type="range" min={1} max={20} value={map2PenSize} onChange={e => setMap2PenSize(Number(e.target.value))} style={{ flex: 1, accentColor: '#7c3aed' }} />
                    <span style={{ fontSize: '10px', color: '#e9d5ff', minWidth: 16 }}>{map2PenSize}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                    <button onClick={() => { const ctx = map2CanvasRef.current?.getContext('2d'); if (ctx && map2CanvasRef.current) { ctx.clearRect(0, 0, map2CanvasRef.current.width, map2CanvasRef.current.height); } }}
                      style={{ flex: 1, padding: '3px 0', fontSize: '10px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', borderRadius: '4px', cursor: 'pointer' }}>🗑 נקה</button>
                    <button onClick={() => setMap2DrawingMode(false)}
                      style={{ flex: 1, padding: '3px 0', fontSize: '10px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>✕ סגור</button>
                  </div>
                </div>
              )}
              {/* Map 2 image with pan/zoom */}
              <div
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: `translate(${map2Pan.x}px, ${map2Pan.y}px) scale(${map2Zoom})`, transformOrigin: 'center center', cursor: map2DrawingMode ? 'crosshair' : 'grab', touchAction: 'none' }}
                onWheel={e => { e.preventDefault(); const d = e.deltaY < 0 ? 0.1 : -0.1; setMap2Zoom(z => Math.max(0.5, Math.min(3, z + d))); }}
                onPointerDown={e => {
                  if (map2DrawingMode) return;
                  e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.style.cursor = 'grabbing';
                  map2DragRef.current = { startX: e.clientX, startY: e.clientY, panX: map2Pan.x, panY: map2Pan.y };
                }}
                onPointerMove={e => { if (!map2DragRef.current) return; setMap2Pan({ x: map2DragRef.current.panX + (e.clientX - map2DragRef.current.startX), y: map2DragRef.current.panY + (e.clientY - map2DragRef.current.startY) }); }}
                onPointerUp={e => { map2DragRef.current = null; e.currentTarget.style.cursor = map2DrawingMode ? 'crosshair' : 'grab'; }}
                onPointerCancel={() => { map2DragRef.current = null; }}
              >
                {map2Img ? (
                  <img src={map2Img} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', filter: `brightness(${map2Brightness})` }} />
                ) : (
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '14px' }}>טוען מפה שנייה...</div>
                )}
              </div>
              {/* Map 2 drawing canvas */}
              <canvas ref={map2CanvasRef}
                onPointerDown={e => {
                  if (!map2DrawingMode) return;
                  e.preventDefault(); e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left; const y = e.clientY - rect.top;
                  const ctx = map2CanvasRef.current?.getContext('2d');
                  if (ctx) { ctx.beginPath(); ctx.moveTo(x, y); }
                  map2DrawRef.current = { drawing: true, lastX: x, lastY: y };
                }}
                onPointerMove={e => {
                  if (!map2DrawRef.current?.drawing) return;
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left; const y = e.clientY - rect.top;
                  const ctx = map2CanvasRef.current?.getContext('2d');
                  if (ctx) {
                    ctx.strokeStyle = map2PenColor; ctx.lineWidth = map2PenSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    ctx.lineTo(x, y); ctx.stroke();
                  }
                  map2DrawRef.current = { ...map2DrawRef.current, lastX: x, lastY: y };
                }}
                onPointerUp={() => { if (map2DrawRef.current) { map2DrawRef.current.drawing = false; } }}
                onPointerCancel={() => { if (map2DrawRef.current) { map2DrawRef.current.drawing = false; } }}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: map2DrawingMode ? 'auto' : 'none', cursor: 'crosshair', touchAction: 'none', zIndex: 200 }}
              />
              {/* Map 2 label badge */}
              <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(15,23,42,0.85)', border: '1px solid #334155', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', color: '#7dd3fc', pointerEvents: 'none', zIndex: 10 }}>🗺 מפה 2</div>
            </div>
          </>}

          </>}
        </div>

        {/* Block table right-click context menu — rendered outside contain:paint so position:fixed uses the viewport */}
        {btCtxMenu && (
          <div
            style={{ position: 'fixed', ...clampMenuPos(btCtxMenu.x, btCtxMenu.y, 200, 70), background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', zIndex: 10000, minWidth: '180px', boxShadow: '0 6px 24px rgba(0,0,0,0.7)', direction: 'rtl', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {activeBlockTableId === btCtxMenu.btId ? (
              <button
                onClick={() => { setActiveBlockTableId(null); setBtCtxMenu(null); }}
                style={{ width: '100%', textAlign: 'right', padding: '10px 14px', background: 'transparent', border: 'none', color: '#f97316', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span>★</span><span>בטל בלוקים נוכחיים</span>
              </button>
            ) : (
              <button
                onClick={() => { setActiveBlockTableId(btCtxMenu.btId); setBtCtxMenu(null); }}
                style={{ width: '100%', textAlign: 'right', padding: '10px 14px', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span>☆</span><span>הגדר כבלוקים נוכחיים</span>
              </button>
            )}
          </div>
        )}

        {/* Sidebar - Right Side - Shows available strips (from query / received transfers, not yet on board) */}
        <div
          id="sidebar-area"
          style={{ display: isGroundMode ? 'none' : undefined, width: sidebarPinned ? 240 : 36, background: (tablePointerGhost?.overSidebar || sidebarHtmlDragOver) ? '#1a2e1a' : T.bg, padding: sidebarPinned ? '10px' : '6px 4px', borderLeft: (tablePointerGhost?.overSidebar || sidebarHtmlDragOver) ? '2px solid #4ade80' : `1px solid ${T.border}`, overflowY: sidebarPinned ? 'auto' : 'hidden', direction: 'rtl', transition: 'width 0.2s, background 0.1s, border-color 0.1s', flexShrink: 0, position: 'relative' }}
          onDragOver={tableMode ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setSidebarHtmlDragOver(true); } : undefined}
          onDragLeave={tableMode ? () => setSidebarHtmlDragOver(false) : undefined}
          onDrop={tableMode ? e => {
            e.preventDefault();
            setSidebarHtmlDragOver(false);
            const sid = e.dataTransfer.getData('text/strip-id-for-transfer');
            if (sid) {
              // Strip dragged from center back to sidebar = remove from board, delete assignment
              setTableOnBoard(prev => { const n = new Set(prev); n.delete(sid); return n; });
              if (!sidebarPinned) setSidebarPinned(true);
              if (session.presetId) {
                const numId = String(sid).replace(/^s/, '');
                const pid = Number(session.presetId);
                fetch(`${API_URL}/strip-table-assignments/${numId}/${pid}`, { method: 'DELETE' })
                  .then(() => loadData())
                  .catch(() => {});
                setStrips(prev => prev.map((s: any) => String(s.id) === sid
                  ? { ...s, table_preset_ids: (Array.isArray(s.table_preset_ids) ? s.table_preset_ids : []).filter((x: number) => x !== pid) }
                  : s));
              }
            }
          } : undefined}
        >
          {/* Pin toggle button + filter button + add strip */}
          <div style={{ position: sidebarPinned ? 'absolute' : 'relative', top: sidebarPinned ? 6 : 0, left: sidebarPinned ? 4 : 0, zIndex: 10, display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              onClick={() => setSidebarPinned(v => !v)}
              title={sidebarPinned ? 'סגור חלונית' : 'פתח חלונית'}
              style={{ background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', padding: '2px 5px', color: '#475569' }}
            >📌</button>
            {sidebarPinned && (
              <button
                onClick={() => {
                  setPersonalFilterDraft(personalFilter ?? sessionFilter ?? adminFilterQuery ?? null);
                  setShowPersonalFilter(v => !v);
