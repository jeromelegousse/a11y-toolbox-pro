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
  let themeId = 'classic';
  let masterVolume = 1;
  let eventSettings = { ...DEFAULT_EVENTS };

  function resolveTheme(id) {
    return THEMES[id] || THEMES.classic;
  }

  function configure(config = {}) {
    if (config.theme) {
      themeId = THEMES[config.theme] ? config.theme : themeId;
    }
    if (config.masterVolume !== undefined) {
      masterVolume = clampVolume(config.masterVolume);
    }
    if (config.events && typeof config.events === 'object') {
      const next = { ...eventSettings };
      Object.keys(DEFAULT_EVENTS).forEach((key) => {
        if (config.events[key] !== undefined) {
          next[key] = !!config.events[key];
        }
      });
      eventSettings = next;
    }
  }

  function shouldPlay(name) {
    const family = EVENT_FAMILIES[name] || 'confirm';
    return eventSettings[family] !== false;
  }

  function withMasterVolume(preset) {
    const options = { ...preset };
    if (options.volume !== undefined) {
      options.volume = Math.max(0, options.volume * masterVolume);
    } else {
      options.volume = 0.15 * masterVolume;
    }
    return options;
  }

  function play(name = 'confirm') {
    if (!player.enabled) return;
    if (typeof name === 'string' && !shouldPlay(name)) return;
    const presets = resolveTheme(themeId);
    const preset = typeof name === 'object'
      ? name
      : presets[name] || THEMES.classic[name] || presets.confirm;
    const optionsToPlay = withMasterVolume(preset);
    player.play(optionsToPlay);
  }

  const initialConfig = options.initialConfig
    || (typeof options.getInitialConfig === 'function' ? options.getInitialConfig() : undefined);
  if (initialConfig) configure(initialConfig);

  if (typeof options.subscribe === 'function') {
    options.subscribe((nextConfig) => {
      if (nextConfig) configure(nextConfig);
    });
  }

  return { play, configure };
}
