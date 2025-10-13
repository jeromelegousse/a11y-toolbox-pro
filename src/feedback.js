import { safeClone } from './utils/safe-clone.js';

const AudioContext = window.AudioContext || window.webkitAudioContext;

function makeTonePlayer() {
  if (!AudioContext) {
    return {
      play() {},
      enabled: false
    };
  }
  let ctx = null;
  function ensureContext() {
    if (!ctx) {
      ctx = new AudioContext();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function playTone({ frequency = 660, duration = 0.15, type = 'sine', volume = 0.15 } = {}) {
    const context = ensureContext();
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(Math.max(0, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + duration);
  }
  return {
    play(options) {
      playTone(options);
    },
    enabled: true
  };
}

const EVENT_FAMILIES = {
  confirm: 'confirm',
  toggle: 'confirm',
  success: 'confirm',
  info: 'info',
  notice: 'info',
  alert: 'alert',
  error: 'alert',
  warning: 'warning'
};

const DEFAULT_EVENTS = {
  confirm: true,
  alert: true,
  warning: true,
  info: true
};

const THEMES = {
  classic: {
    confirm: { frequency: 880, duration: 0.12, type: 'triangle', volume: 0.18 },
    toggle: { frequency: 540, duration: 0.1, type: 'sine', volume: 0.14 },
    alert: { frequency: 320, duration: 0.22, type: 'square', volume: 0.2 },
    warning: { frequency: 420, duration: 0.18, type: 'sawtooth', volume: 0.18 },
    info: { frequency: 700, duration: 0.1, type: 'sine', volume: 0.16 }
  },
  soft: {
    confirm: { frequency: 640, duration: 0.16, type: 'sine', volume: 0.16 },
    toggle: { frequency: 480, duration: 0.12, type: 'sine', volume: 0.13 },
    alert: { frequency: 360, duration: 0.28, type: 'triangle', volume: 0.18 },
    warning: { frequency: 420, duration: 0.22, type: 'triangle', volume: 0.16 },
    info: { frequency: 620, duration: 0.14, type: 'sine', volume: 0.14 }
  },
  digital: {
    confirm: { frequency: 940, duration: 0.1, type: 'square', volume: 0.16 },
    toggle: { frequency: 600, duration: 0.08, type: 'square', volume: 0.14 },
    alert: { frequency: 340, duration: 0.18, type: 'square', volume: 0.22 },
    warning: { frequency: 520, duration: 0.14, type: 'sawtooth', volume: 0.18 },
    info: { frequency: 760, duration: 0.09, type: 'triangle', volume: 0.15 }
  }
};

function normalizeKey(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return key ? key : null;
}

function resolveThemeKey(themeName) {
  const key = normalizeKey(themeName);
  return key && THEMES[key] ? key : 'classic';
}

function clampVolume(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function buildPresets(themeName) {
  const resolvedThemeKey = resolveThemeKey(themeName);
  const theme = THEMES[resolvedThemeKey];
  const fallbackTheme = THEMES.classic;
  const events = new Set([
    ...Object.keys(EVENT_FAMILIES),
    ...Object.keys(theme)
  ]);
  const presets = {};
  events.forEach((eventName) => {
    const normalizedEvent = normalizeKey(eventName);
    if (!normalizedEvent) return;
    const family = EVENT_FAMILIES[normalizedEvent] || normalizedEvent;
    const basePreset =
      theme[normalizedEvent] ||
      theme[eventName] ||
      theme[family] ||
      fallbackTheme[normalizedEvent] ||
      fallbackTheme[family];
    if (basePreset) {
      presets[normalizedEvent] = { ...basePreset };
    }
  });
  return { presets, themeKey: resolvedThemeKey };
}

function createDefaultEventTable(presets) {
  return Object.fromEntries(
    Object.keys(presets).map((eventName) => {
      const enabled = DEFAULT_EVENTS[eventName];
      return [eventName, { enabled: enabled !== undefined ? enabled : true, preset: null }];
    })
  );
}

export function createFeedback(options = {}) {
  const player = makeTonePlayer();
  const initialTheme = buildPresets(options.theme);
  let currentThemeKey = initialTheme.themeKey;
  let presets = initialTheme.presets;

  let masterVolume = clampVolume(options.volume, 1);
  let eventTable = createDefaultEventTable(presets);

  function getPreset(presetName) {
    const normalized = normalizeKey(presetName);
    if (!normalized) return presets.confirm;
    return (
      presets[normalized] ||
      presets[EVENT_FAMILIES[normalized]] ||
      presets.confirm
    );
  }

  function shouldPlayEvent(eventName) {
    const normalized = normalizeKey(eventName) || 'confirm';
    const entry = eventTable[normalized];
    if (!entry) return true;
    return entry.enabled !== false;
  }

  function resolveEventPreset(eventName) {
    const normalized = normalizeKey(eventName) || 'confirm';
    const entry = eventTable[normalized];
    const presetKey = entry && entry.preset ? entry.preset : normalized;
    return getPreset(presetKey);
  }

  function play(name = 'confirm') {
    if (!player.enabled) return;
    const presetOptions =
      typeof name === 'object' && name
        ? name
        : shouldPlayEvent(name)
          ? resolveEventPreset(name)
          : null;
    if (!presetOptions) return;
    const optionsToUse = { ...presetOptions };
    const baseVolume =
      typeof presetOptions.volume === 'number'
        ? presetOptions.volume
        : 0.15;
    optionsToUse.volume = clampVolume(baseVolume * masterVolume, baseVolume);
    player.play(optionsToUse);
  }

  function configure(config = {}) {
    if (!config || typeof config !== 'object') return;

    if (config.theme) {
      const { presets: nextPresets, themeKey: nextThemeKey } = buildPresets(config.theme);
      if (Object.keys(nextPresets).length > 0) {
        currentThemeKey = nextThemeKey;
        presets = nextPresets;
        eventTable = {
          ...createDefaultEventTable(presets),
          ...eventTable
        };
      }
    }

    if (config.volume !== undefined) {
      const nextVolume = Number(config.volume);
      if (Number.isFinite(nextVolume)) {
        masterVolume = clampVolume(nextVolume, masterVolume);
      }
    }

    if (config.events && typeof config.events === 'object') {
      const nextTable = { ...eventTable };
      Object.entries(config.events).forEach(([severity, entry]) => {
        if (!entry || typeof entry !== 'object') return;
        const normalizedSeverity = normalizeKey(severity);
        if (!normalizedSeverity) return;
        const presetName = normalizeKey(entry.preset) || normalizeKey(entry.sound);
        const previous = nextTable[normalizedSeverity] || { enabled: true, preset: null };
        nextTable[normalizedSeverity] = {
          enabled: entry.enabled !== undefined ? !!entry.enabled : previous.enabled,
          preset: presetName || previous.preset
        };
      });
      eventTable = nextTable;
    }
  }

  function getConfig() {
    return {
      volume: masterVolume,
      events: safeClone(eventTable),
      theme: currentThemeKey
    };
  }

  configure(options);

  return {
    play,
    configure,
    getConfig,
    get presets() {
      return Object.freeze({ ...presets });
    }
  };
}
