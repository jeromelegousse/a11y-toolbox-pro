const ENTITY_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeAttr(value) {
  const text = String(value ?? '');
  return text.replace(/[&<>"']/g, (char) => ENTITY_MAP[char] || char);
}
