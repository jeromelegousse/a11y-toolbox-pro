export function buildSparklinePath(values, width, height) {
  if (!Array.isArray(values) || values.length === 0) {
    return '';
  }
  const sanitized = values.filter((value) => Number.isFinite(value));
  if (!sanitized.length) {
    return '';
  }
  const max = Math.max(...sanitized);
  const min = Math.min(...sanitized);
  const span = max - min || 1;
  const step = sanitized.length > 1 ? width / (sanitized.length - 1) : width;
  return sanitized
    .map((value, index) => {
      const x = sanitized.length > 1 ? index * step : width;
      const normalized = (value - min) / span;
      const y = height - normalized * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}
