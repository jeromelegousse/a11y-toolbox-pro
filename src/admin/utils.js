export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function formatDuration(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 'Non mesuré';
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes} min ${remaining.toString().padStart(2, '0')} s`;
}

export function formatDateRelative(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'Jamais';
  }
  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 60) {
    return 'Il y a quelques secondes';
  }
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `Il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `Il y a ${hours} heure${hours > 1 ? 's' : ''}`;
  }
  const days = Math.floor(diffSeconds / 86400);
  if (days < 7) {
    return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 6) {
    return `Il y a ${weeks} semaine${weeks > 1 ? 's' : ''}`;
  }
  const date = new Date(timestamp);
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function createBadge(text, tone = 'info') {
  const badge = document.createElement('span');
  badge.className = 'a11ytb-admin-badge';
  badge.dataset.tone = tone;
  badge.textContent = text;
  return badge;
}

export function createTag(text) {
  const tag = document.createElement('span');
  tag.className = 'a11ytb-admin-tag';
  tag.textContent = text;
  return tag;
}

export function updateFilterOptions(select, options, currentValue) {
  const previousValues = Array.from(select.options).map((option) => option.value);
  const nextValues = options.map((option) => option.value);
  const unchanged =
    previousValues.length === nextValues.length &&
    previousValues.every((value, index) => value === nextValues[index]);

  if (!unchanged) {
    select.innerHTML = '';
    options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      if (option.ariaLabel) {
        opt.setAttribute('aria-label', option.ariaLabel);
      }
      select.append(opt);
    });
  }

  if (currentValue && nextValues.includes(currentValue)) {
    select.value = currentValue;
  } else if (options.length > 0) {
    select.value = options[0].value;
  }
}

export function getGeminiConfig() {
  const globalData = globalThis?.a11ytbAdminData;
  if (globalData && typeof globalData === 'object' && globalData !== null) {
    const config = globalData.gemini;
    if (config && typeof config === 'object') {
      return config;
    }
  }

  const legacyConfig = globalThis?.a11ytbGeminiConfig;
  if (legacyConfig && typeof legacyConfig === 'object') {
    return legacyConfig;
  }

  return null;
}
