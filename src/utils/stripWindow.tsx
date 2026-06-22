import React from 'react';
import type { QGroup } from '../types';

export const SW_TEXTURES: { id: string; label: string; getStyle: (col: string) => React.CSSProperties }[] = [
  { id: '',        label: 'אחיד',           getStyle: col => ({ background: col }) },
  { id: 'dots',    label: 'נקודות',          getStyle: col => ({ backgroundColor: col, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)', backgroundSize: '14px 14px' }) },
  { id: 'grid',    label: 'גריד',            getStyle: col => ({ backgroundColor: col, backgroundImage: 'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '20px 20px' }) },
  { id: 'diag',    label: 'אלכסוני',         getStyle: col => ({ backgroundColor: col, backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 10px)' }) },
  { id: 'diag2',   label: 'אלכסוני הפוך',    getStyle: col => ({ backgroundColor: col, backgroundImage: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 10px)' }) },
  { id: 'hlines',  label: 'קווים אופקיים',   getStyle: col => ({ backgroundColor: col, backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) 1px, transparent 1px, transparent 18px)' }) },
  { id: 'vlines',  label: 'קווים אנכיים',    getStyle: col => ({ backgroundColor: col, backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) 1px, transparent 1px, transparent 18px)' }) },
  { id: 'cross',   label: 'רשת צפופה',       getStyle: col => ({ backgroundColor: col, backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '10px 10px' }) },
  { id: 'checker', label: 'לוח שחמט',        getStyle: col => ({ backgroundColor: col, backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, transparent 0% 50%)', backgroundSize: '20px 20px' }) },
];
export const swGetBgStyle = (bgColor?: string, bgTexture?: string): React.CSSProperties => {
  const col = bgColor || '#0f172a';
  const t = SW_TEXTURES.find(tx => tx.id === (bgTexture || ''));
  return t ? t.getStyle(col) : { background: col };
};
export interface SWLeaf { id: string; type: 'leaf'; waypoint: string; waypoint_mode?: 'מקבל' | 'מוסר'; label: string; query: QGroup | null; bg_color: string; bg_texture?: string; header_color: string; header_height?: number; header_text_color?: string; header_font_size?: number; content_title?: string; content_title_color?: string; content_title_bg?: string; content_title_font_size?: number; content_title_bold?: boolean; content_title_align?: 'right' | 'center' | 'left'; }
export interface SWSplit { id: string; type: 'split'; direction: 'h' | 'v'; sizes: number[]; children: SWNode[]; }
export type SWNode = SWLeaf | SWSplit;
export const swGenId = () => Math.random().toString(36).slice(2, 9);
export const swDefaultLeaf = (): SWLeaf => ({ id: swGenId(), type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' });
export function swRemapIds(node: SWNode): SWNode {
  if (node.type === 'leaf') return { ...node, id: swGenId() };
  return { ...node, id: swGenId(), children: (node as SWSplit).children.map(swRemapIds) } as SWSplit;
}
export const SW_TEMPLATES: { id: string; label: string; desc: string; build: () => SWNode }[] = [
  { id: 'tpl_blank', label: 'ריק', desc: 'תא אחד ריק', build: () => swDefaultLeaf() },
  { id: 'tpl_2col', label: '2 טורים', desc: 'שני טורים זה לצד זה', build: () => swRemapIds({ id: 'r', type: 'split', direction: 'v', sizes: [50, 50], children: [{ id: 'a', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' }, { id: 'b', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' }] }) },
  { id: 'tpl_3col', label: '3 טורים', desc: 'שלושה טורים שווים', build: () => swRemapIds({ id: 'r', type: 'split', direction: 'v', sizes: [33.3, 33.4, 33.3], children: [{ id: 'a', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' }, { id: 'b', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' }, { id: 'c', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' }] }) },
  { id: 'tpl_civil_terminal', label: 'אזרחי — מסוף', desc: '2 תאים צרים + 2×3 רשת (כמו בתמונה)', build: () => swRemapIds({ id: 'r', type: 'split', direction: 'v', sizes: [22, 22, 56], children: [
    { id: 'l1', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#2d3e6b', header_color: '#1e2d52' },
    { id: 'l2', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#2d3e6b', header_color: '#1e2d52' },
    { id: 'rs', type: 'split', direction: 'h', sizes: [50, 50], children: [
      { id: 'r1', type: 'split', direction: 'v', sizes: [33.3, 33.4, 33.3], children: [
        { id: 'r1a', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#1a5c5c', header_color: '#124040' },
        { id: 'r1b', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#1a5c5c', header_color: '#124040' },
        { id: 'r1c', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#1a5c5c', header_color: '#124040' },
      ] },
      { id: 'r2', type: 'split', direction: 'v', sizes: [33.3, 33.4, 33.3], children: [
        { id: 'r2a', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#1a5c5c', header_color: '#124040' },
        { id: 'r2b', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#1a5c5c', header_color: '#124040' },
        { id: 'r2c', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#1a5c5c', header_color: '#124040' },
      ] },
    ] },
  ] }) },
  { id: 'tpl_2row_3col', label: '2 שורות × 3 טורים', desc: 'רשת 2 שורות, 3 טורים', build: () => swRemapIds({ id: 'r', type: 'split', direction: 'h', sizes: [50, 50], children: [
    { id: 'row1', type: 'split', direction: 'v', sizes: [33.3, 33.4, 33.3], children: [
      { id: 'a', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' },
      { id: 'b', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' },
      { id: 'c', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' },
    ] },
    { id: 'row2', type: 'split', direction: 'v', sizes: [33.3, 33.4, 33.3], children: [
      { id: 'd', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' },
      { id: 'e', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' },
      { id: 'f', type: 'leaf', waypoint: '', label: '', query: null, bg_color: '#0f172a', header_color: '#1e3a5f' },
    ] },
  ] }) },
];
export function swUpdate(node: SWNode, id: string, fn: (n: any) => any): SWNode {
  if (node.id === id) return fn(node);
  if (node.type === 'split') return { ...node, children: node.children.map(c => swUpdate(c, id, fn)) };
  return node;
}
export function swSplit(node: SWNode, id: string, dir: 'h' | 'v'): SWNode {
  if (node.id === id && node.type === 'leaf') return { id: swGenId(), type: 'split', direction: dir, sizes: [50, 50], children: [node, swDefaultLeaf()] };
  if (node.type === 'split') return { ...node, children: node.children.map(c => swSplit(c, id, dir)) };
  return node;
}
export function swRemove(node: SWNode, id: string): SWNode {
  if (node.type === 'leaf') return node;
  const keep = node.children.filter(c => c.id !== id);
  if (keep.length === node.children.length) return { ...node, children: node.children.map(c => swRemove(c, id)) };
  if (keep.length === 0) return swDefaultLeaf();
  if (keep.length === 1) return swRemove(keep[0], id);
  const keptIdx = node.children.reduce<number[]>((acc, c, i) => c.id !== id ? [...acc, i] : acc, []);
  const rawSizes = keptIdx.map(i => node.sizes[i] ?? (100 / node.children.length));
  const total = rawSizes.reduce((s, n) => s + n, 0);
  return { ...node, children: keep, sizes: rawSizes.map(s => (s / total) * 100) };
}
export function swFindLeaf(node: SWNode, id: string): SWLeaf | null {
  if (node.type === 'leaf') return node.id === id ? node : null;
  for (const c of node.children) { const r = swFindLeaf(c, id); if (r) return r; }
  return null;
}
