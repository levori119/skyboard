import React from 'react';
import { AircraftIconType } from '../types';

// ─── Aircraft Icon System (extracted from App.tsx lines 22-59) ────────────────

export function getSquadronAircraftType(sq: string): AircraftIconType {
  const s = String(sq || '').trim().replace(/^0+/, '');
  if (['133', '106', '69'].includes(s)) return 'f15';
  if (['101', '109', '107', '201', '119', '253'].includes(s)) return 'f16';
  if (['140', '116', '117'].includes(s)) return 'f35';
  if (s === '120') return 'b707';
  if (s === '122') return 'gulfstream';
  if (['103', '131'].includes(s)) return 'c130';
  if (['118', '114'].includes(s)) return 'yasur';
  if (['113', '190'].includes(s)) return 'apache';
  if (['123', '124'].includes(s)) return 'blackhawk';
  if (s === '193') return 'naval-blackhawk';
  if (['160', '200', '161', '166', '210'].includes(s)) return 'uav';
  return 'jet';
}

export function isHeliAircraftType(t: AircraftIconType): boolean {
  return ['yasur', 'apache', 'blackhawk', 'naval-blackhawk'].includes(t);
}

export function getHeliPngSrc(t: AircraftIconType): string {
  return t === 'yasur' ? '/heli-yasur.png' : '/heli-yanshuf.png';
}

export function renderAircraftSvgPaths(t: AircraftIconType): React.ReactNode {
  switch (t) {
    case 'f15':
      return React.createElement('path', { d: 'M12,2L13,9L22,16L22,17L13,15L13,20L16,22L16,23L12,22L8,23L8,22L11,20L11,15L2,17L2,16L11,9Z', fill: 'white', opacity: '0.95' });
    case 'f16':
      return React.createElement('path', { d: 'M12,2L13.5,9L21,15L21,16L13,14.5L13,19L15,21L15,22L12,21.5L9,22L9,21L11,19L11,14.5L3,16L3,15L10.5,9Z', fill: 'white', opacity: '0.95' });
    case 'f35':
      return React.createElement('path', { d: 'M12,2L14,9L23,13L23,14L13.5,14L13,19.5L16,22L14,22L12,20.5L10,22L8,22L11,19.5L10.5,14L1,14L1,13L10,9Z', fill: 'white', opacity: '0.95' });
    case 'b707':
      return React.createElement('path', { d: 'M21,16V14L13,9V3.5A1.5,1.5 0 0,0 11.5,2A1.5,1.5 0 0,0 10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5L21,16Z', fill: 'white', opacity: '0.95' });
    case 'gulfstream':
      return React.createElement('path', { d: 'M12,3.5L13.5,9L22,13V14.5L13,12.5V19L15,20.5V21.5L12,21L9,21.5V20.5L11,19V12.5L2,14.5V13L10.5,9Z', fill: 'white', opacity: '0.95' });
    case 'c130':
      return React.createElement('path', { d: 'M12,2A2,2 0 0,0 10,4V9L1,12V15L10,13V19L7,21V22L12,21L17,22V21L14,19V13L23,15V12L14,9V4A2,2 0 0,0 12,2M8,10.5A1.5,1.5 0 0,1 9.5,12A1.5,1.5 0 0,1 8,13.5A1.5,1.5 0 0,1 6.5,12A1.5,1.5 0 0,1 8,10.5M16,10.5A1.5,1.5 0 0,1 17.5,12A1.5,1.5 0 0,1 16,13.5A1.5,1.5 0 0,1 14.5,12A1.5,1.5 0 0,1 16,10.5Z', fill: 'white', opacity: '0.95' });
    case 'yasur':
      return React.createElement('path', { d: 'M13,2A1,1 0 0,1 14,3C14,3.4 13.7,3.7 13.4,3.9L19,5.5C20.7,6 22,7.2 22,9V12A2,2 0 0,1 20,14H19L16,17H12V14H7.3L4,16.5V14H3A2,2 0 0,1 1,12V10A2,2 0 0,1 3,8H4L5,4H7L6.2,8H10.4L9.4,3.1C9.2,2.5 9.6,2 10.2,2H13M12,4A1,1 0 0,0 11,5A1,1 0 0,0 12,6A1,1 0 0,0 13,5A1,1 0 0,0 12,4Z', fill: 'white', opacity: '0.95' });
    case 'apache':
      return React.createElement('path', { d: 'M22,10H13.8L17,4H15L11.2,10H9V8H7V10H4A2,2 0 0,0 2,12V14A2,2 0 0,0 4,16H5.2L3,19H5L7.2,16H11V18H9V20H13V16H20A2,2 0 0,0 22,14V10Z', fill: 'white', opacity: '0.95' });
    case 'blackhawk':
      return React.createElement('path', { d: 'M12,2A1,1 0 0,1 13,3V5H20A2,2 0 0,1 22,7V11A2,2 0 0,1 20,13H17.5L14,17H9V13H4.5L2,15V13H1A1,1 0 0,1 0,12V10A1,1 0 0,1 1,9H5L7,5H11V3A1,1 0 0,1 12,2Z', fill: 'white', opacity: '0.95' });
    case 'naval-blackhawk':
      return React.createElement('path', { d: 'M12,2A1,1 0 0,1 13,3V5H20A2,2 0 0,1 22,7V11A2,2 0 0,1 20,13H17.5L14,17H9V13H4.5L2,15V13H1A1,1 0 0,1 0,12V10A1,1 0 0,1 1,9H5L7,5H11V3A1,1 0 0,1 12,2 M17,11V9H15V11H17Z', fill: 'white', opacity: '0.95' });
    case 'uav':
      return React.createElement('path', { d: 'M12,6L13,11L23,13V14L13,14L12,18L14,20V21L12,20.5L10,21V20L12,18L11,14L1,14V13L11,11Z', fill: 'white', opacity: '0.95' });
    default:
      return React.createElement('path', { d: 'M12,2L13.5,9L21,15L21,16L13,14.5L13,19L15,21L15,22L12,21.5L9,22L9,21L11,19L11,14.5L3,16L3,15L10.5,9Z', fill: 'white', opacity: '0.95' });
  }
}
