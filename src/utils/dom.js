const ATTR_ESCAPE_MAP = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

const ATTR_ESCAPE_REGEX = /[&<>"']/g;

export function escapeAttr(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const input = String(value);
  return input.replace(ATTR_ESCAPE_REGEX, (match) => ATTR_ESCAPE_MAP.get(match));
}
