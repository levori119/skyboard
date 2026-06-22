import type { SGNode, SGCell, SGSplit } from '../types/stripGrid';

let _sgBlinkStyleInjected = false;
export const ensureSGBlinkStyle = () => {
  if (_sgBlinkStyleInjected) return;
  const el = document.createElement('style');
  el.textContent = '@keyframes sg-cell-blink { 0%,49%{background-color:var(--sg-bb);} 50%,100%{background-color:var(--sg-bt);} }';
  document.head.appendChild(el);
  _sgBlinkStyleInjected = true;
};
export const sgGenId = () => Math.random().toString(36).slice(2, 9);
export const sgDefaultCell = (): SGCell => ({ id: sgGenId(), type: 'cell', fieldKey: '', textAlign: 'center' });
export function sgUpdate(node: SGNode, id: string, fn: (n: any) => any): SGNode {
  if (node.id === id) return fn(node);
  if (node.type === 'split') return { ...node, children: node.children.map(c => sgUpdate(c, id, fn)) };
  return node;
}
export function sgSplit(node: SGNode, id: string, dir: 'h'|'v'): SGNode {
  if (node.id === id && node.type === 'cell') return { id: sgGenId(), type: 'split', direction: dir, sizes: [50, 50], children: [node, sgDefaultCell()] };
  if (node.type === 'split') return { ...node, children: node.children.map(c => sgSplit(c, id, dir)) };
  return node;
}
export function sgRemove(node: SGNode, id: string): SGNode {
  if (node.type === 'cell') return node;
  const keep = node.children.filter(c => c.id !== id);
  if (keep.length === node.children.length) return { ...node, children: node.children.map(c => sgRemove(c, id)) };
  if (keep.length === 0) return sgDefaultCell();
  if (keep.length === 1) return sgRemove(keep[0], id);
  const keptIdx = node.children.reduce<number[]>((acc, c, i) => c.id !== id ? [...acc, i] : acc, []);
  const newSizes = keptIdx.map(i => node.sizes[i] ?? (100 / node.children.length));
  const total = newSizes.reduce((s, x) => s + x, 0);
  return { ...node, children: keep.map(c => sgRemove(c, id)), sizes: newSizes.map(s => (s / total) * 100) };
}
export function sgGetAllCells(node: SGNode): SGCell[] {
  if (node.type === 'cell') return [node];
  return (node as SGSplit).children.flatMap(c => sgGetAllCells(c));
}
