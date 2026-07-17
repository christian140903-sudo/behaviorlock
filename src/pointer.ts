import type { JsonValue, SelectedValue } from './types.js';

export function selectPointer(root: JsonValue, pointer: string): SelectedValue {
  if (pointer === '') return { found: true, value: root };
  if (!pointer.startsWith('/')) return { found: false };
  let current: JsonValue = root;
  for (const rawToken of pointer.slice(1).split('/')) {
    const token = rawToken.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) return { found: false };
      const item = current[Number(token)];
      if (item === undefined) return { found: false };
      current = item;
      continue;
    }
    if (current && typeof current === 'object' && Object.hasOwn(current, token)) {
      const item = current[token];
      if (item === undefined) return { found: false };
      current = item;
      continue;
    }
    return { found: false };
  }
  return { found: true, value: current };
}
