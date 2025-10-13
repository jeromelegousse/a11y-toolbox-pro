const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : undefined);

export const hasStructuredClone = Boolean(globalScope && typeof globalScope.structuredClone === 'function');

export function safeClone(value) {
  if (hasStructuredClone) {
    return globalScope.structuredClone(value);
  }
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('a11ytb: clonage approximatif utilisé (structuredClone indisponible).', error);
    return Array.isArray(value) ? value.slice() : { ...value };
  }
}
