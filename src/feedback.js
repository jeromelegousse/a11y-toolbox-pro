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
    gain.gain.setValueAtTime(volume, now);
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

export function createFeedback() {
  const player = makeTonePlayer();
  const presets = {
    confirm: { frequency: 880, duration: 0.12, type: 'triangle' },
    toggle: { frequency: 540, duration: 0.1, type: 'sine' },
    alert: { frequency: 320, duration: 0.22, type: 'square', volume: 0.18 }
  };

  function play(name = 'confirm') {
    const preset = typeof name === 'object' ? name : presets[name] || presets.confirm;
    if (player.enabled) {
      player.play(preset);
    }
  }

  return { play };
}
