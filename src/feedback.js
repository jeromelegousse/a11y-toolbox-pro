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

function clampVolume(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function createFeedback(options = {}) {
  const player = makeTonePlayer();
  const presets = {
    confirm: { frequency: 880, duration: 0.12, type: 'triangle' },
    toggle: { frequency: 540, duration: 0.1, type: 'sine' },
    success: { frequency: 760, duration: 0.16, type: 'triangle' },
    info: { frequency: 520, duration: 0.14, type: 'sine' },
    warning: { frequency: 420, duration: 0.2, type: 'sawtooth', volume: 0.16 },
    alert: { frequency: 320, duration: 0.22, type: 'square', volume: 0.18 }
  };

  let masterVolume = 1;
  let eventTable = {};

  function clampVolume(value, fallback = 0.15) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(1, Math.max(0, numeric));
  }

  function normalizePresetName(name) {
    if (typeof name !== 'string') return null;
    const key = name.trim();
    return key ? key : null;
  }

  function play(name = 'confirm') {
    const preset = typeof name === 'object' ? name : presets[name] || presets.confirm;
    if (player.enabled) {
      const base = preset || presets.confirm;
      const options = { ...base };
      const baseVolume = base && typeof base.volume === 'number' ? base.volume : 0.15;
      options.volume = clampVolume(baseVolume * masterVolume, baseVolume);
      player.play(options);
    }
  }

  function configure(options = {}) {
    if (!options || typeof options !== 'object') return;

    if (options.volume !== undefined) {
      const nextVolume = Number(options.volume);
      if (Number.isFinite(nextVolume)) {
        masterVolume = clampVolume(nextVolume, masterVolume);
      }
    }

    if (options.events && typeof options.events === 'object') {
      const normalized = {};
      Object.entries(options.events).forEach(([severity, entry]) => {
        if (!entry || typeof entry !== 'object') return;
        const presetName = normalizePresetName(entry.preset) || normalizePresetName(entry.sound) || null;
        const enabled = entry.enabled !== undefined ? !!entry.enabled : true;
        normalized[severity] = {
          enabled,
          preset: presetName
        };
      });
      eventTable = normalized;
    }
  }

  function getConfig() {
    return {
      volume: masterVolume,
      events: structuredClone(eventTable)
    };
  }

  return { play, configure, getConfig, presets: Object.freeze({ ...presets }) };
}
