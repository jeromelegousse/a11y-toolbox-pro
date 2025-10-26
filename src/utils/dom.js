const ESCAPE_LOOKUP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ESCAPE_PATTERN = /[&<>"']/g;

export function escapeAttr(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(ESCAPE_PATTERN, (char) => ESCAPE_LOOKUP[char] || char);
}
