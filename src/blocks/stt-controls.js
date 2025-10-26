import { escapeAttr } from '../utils/dom.js';

const DEFAULT_SOURCE_LABEL = 'Micro par défaut';

function getSourceLabel(snapshot) {
  return snapshot?.stt?.inputSource || DEFAULT_SOURCE_LABEL;
}

export function createSttControlsBlock({ icon } = {}) {
  return {
    id: 'stt-controls',
    moduleId: 'stt',
    title: 'Reconnaissance vocale (STT)',
    icon,
    category: 'interaction',
    keywords: ['dictée', 'micro', 'voix'],
    render: (state) => {
      const snapshot = state.get?.() ?? {};
      const sttState = snapshot.stt ?? {};
      const status = sttState.status ?? 'idle';
      const transcript = sttState.transcript ?? '';
      const badgeState = status === 'listening' ? '' : ' hidden';

      return `
      <div class="a11ytb-row">
        <button class="a11ytb-button" data-action="start">Démarrer</button>
        <button class="a11ytb-button" data-action="stop">Arrêter</button>
      </div>
      <div class="a11ytb-status-line">
        <span class="a11ytb-badge" data-ref="badge"${badgeState}>Écoute en cours</span>
        <span class="a11ytb-status-text">Statut&nbsp;: <strong data-ref="status">${status}</strong></span>
        <button
          type="button"
          class="a11ytb-chip a11ytb-chip--ghost a11ytb-audio-source"
          data-action="refresh-source"
          data-ref="source-button"
          aria-label="Source audio"
          title="Source audio"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a1 1 0 012 0 7 7 0 01-6 6.92V21h3v1H8v-1h3v-3.08A7 7 0 015 11a1 1 0 012 0 5 5 0 0010 0z" />
          </svg>
          <span aria-live="polite" data-ref="source-label"></span>
        </button>
      </div>
      <textarea rows="3" style="width:100%" placeholder="Transcription..." data-ref="txt">${transcript}</textarea>
    `;
    },
    wire: ({ root, state }) => {
      const txt = root.querySelector('[data-ref="txt"]');
      const statusEl = root.querySelector('[data-ref="status"]');
      const badge = root.querySelector('[data-ref="badge"]');
      const sourceButton = root.querySelector('[data-ref="source-button"]');
      const sourceLabel = root.querySelector('[data-ref="source-label"]');

      root
        .querySelector('[data-action="start"]')
        ?.addEventListener('click', () => window.a11ytb?.stt?.start?.());
      root
        .querySelector('[data-action="stop"]')
        ?.addEventListener('click', () => window.a11ytb?.stt?.stop?.());

      if (sourceButton) {
        sourceButton.addEventListener('click', () => {
          window.a11ytb?.stt?.refreshInputSource?.();
        });
      }

      const applySnapshot = (snapshot) => {
        const sttState = snapshot?.stt ?? {};
        const label = getSourceLabel(snapshot);
        const statusValue = sttState.status ?? 'idle';

        if (txt) {
          txt.value = sttState.transcript || '';
        }
        if (statusEl) {
          statusEl.textContent = statusValue;
        }
        if (badge) {
          if (statusValue === 'listening') {
            badge.removeAttribute('hidden');
          } else {
            badge.setAttribute('hidden', '');
          }
        }
        if (sourceLabel) {
          sourceLabel.textContent = label;
        }
        if (sourceButton) {
          const escapedLabel = escapeAttr(label);
          sourceButton.setAttribute('aria-label', `Source audio : ${escapedLabel}`);
          sourceButton.setAttribute('title', `Source audio : ${escapedLabel}`);
        }
      };

      applySnapshot(state.get?.() ?? {});
      state.on?.((snapshot) => {
        applySnapshot(snapshot ?? {});
      });
    },
  };
}
