(function () {
  const BLOCK_SELECTOR = '[data-a11ytb-block]';
  const TTS_MESSAGES = {
    speaking: 'Lecture en cours…',
    error: 'Erreur de lecture. Réessayez.',
    unsupported: 'Synthèse vocale indisponible sur ce navigateur.',
  };

  function waitForControls(callback, attempt = 0) {
    if (window.a11ytb?.controls) {
      callback(window.a11ytb.controls);
      return;
    }
    if (attempt > 100) {
      return;
    }
    setTimeout(() => waitForControls(callback, attempt + 1), 200);
  }

  function cleanupNode(node) {
    if (!node) return;
    if (typeof node.__a11ytbCleanup === 'function') {
      try {
        node.__a11ytbCleanup();
      } catch (error) {
        /* ignore cleanup errors */
      }
    }
    delete node.__a11ytbCleanup;
    if (node.dataset) {
      delete node.dataset.a11ytbInit;
    }
  }

  function formatLineHeight(value) {
    const numeric = Number.isFinite(value) ? value : Number(value);
    const resolved = Number.isFinite(numeric) ? numeric : 1.5;
    return `${resolved.toFixed(1)}×`;
  }

  function formatLetterSpacing(value) {
    const numeric = Number.isFinite(value) ? value : Number(value);
    const percent = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
    return `${percent} %`;
  }

  function initTtsBlock(root, controls, subscribe) {
    const selectionBtn = root.querySelector('[data-a11ytb-action="tts-selection"]');
    const pageBtn = root.querySelector('[data-a11ytb-action="tts-page"]');
    const stopBtn = root.querySelector('[data-a11ytb-action="tts-stop"]');
    const statusEl = root.querySelector('[data-a11ytb-bind="tts-status"]');

    selectionBtn?.addEventListener('click', () => controls.speakSelection());
    pageBtn?.addEventListener('click', () => controls.speakPage());
    stopBtn?.addEventListener('click', () => controls.stopSpeaking());

    const render = (snapshot) => {
      const status = snapshot?.tts?.status || 'idle';
      if (statusEl) {
        statusEl.textContent = TTS_MESSAGES[status] || '';
      }
    };

    render(controls.getState?.());
    return subscribe(render);
  }

  function initSttBlock(root, controls, subscribe) {
    const toggleBtn = root.querySelector('[data-a11ytb-action="stt-toggle"]');
    const statusEl = root.querySelector('[data-a11ytb-bind="stt-status"]');

    toggleBtn?.addEventListener('click', () => {
      const status = controls.getState?.()?.stt?.status;
      if (status === 'listening') {
        controls.stopDictation?.();
      } else {
        controls.startDictation?.();
      }
    });

    const render = (snapshot) => {
      const status = snapshot?.stt?.status || 'idle';
      if (toggleBtn) {
        const startLabel = toggleBtn.dataset.labelStart || 'Démarrer la dictée';
        const stopLabel = toggleBtn.dataset.labelStop || 'Arrêter la dictée';
        const active = status === 'listening';
        toggleBtn.textContent = active ? stopLabel : startLabel;
        toggleBtn.setAttribute('aria-pressed', String(active));
      }
      if (statusEl) {
        statusEl.textContent = `Statut : ${status}`;
      }
    };

    render(controls.getState?.());
    return subscribe(render);
  }

  function initBrailleBlock(root, controls, subscribe) {
    const transcribeBtn = root.querySelector('[data-a11ytb-action="braille-selection"]');
    const clearBtn = root.querySelector('[data-a11ytb-action="braille-clear"]');
    const output = root.querySelector('[data-a11ytb-bind="braille-output"]');

    transcribeBtn?.addEventListener('click', () => controls.transcribeSelection?.());
    clearBtn?.addEventListener('click', () => controls.clearBraille?.());

    const render = (snapshot) => {
      if (output) {
        output.value = snapshot?.braille?.output || '';
      }
    };

    render(controls.getState?.());
    return subscribe(render);
  }

  function initContrastBlock(root, controls, subscribe) {
    const toggleBtn = root.querySelector('[data-a11ytb-action="contrast-toggle"]');
    const statusEl = root.querySelector('[data-a11ytb-bind="contrast-status"]');

    toggleBtn?.addEventListener('click', () => controls.toggleContrast?.());

    const render = (snapshot) => {
      const enabled = !!snapshot?.contrast?.enabled;
      if (toggleBtn) {
        const onLabel = toggleBtn.dataset.labelOn || 'Désactiver le contraste';
        const offLabel = toggleBtn.dataset.labelOff || 'Activer le contraste';
        toggleBtn.textContent = enabled ? onLabel : offLabel;
        toggleBtn.setAttribute('aria-pressed', String(enabled));
      }
      if (statusEl) {
        statusEl.textContent = enabled
          ? 'Contraste élevé activé'
          : 'Contraste élevé désactivé';
      }
    };

    render(controls.getState?.());
    return subscribe(render);
  }

  function initSpacingBlock(root, controls, subscribe) {
    const lineHeightEl = root.querySelector('[data-a11ytb-bind="spacing-line-height"]');
    const letterEl = root.querySelector('[data-a11ytb-bind="spacing-letter"]');
    const openBtn = root.querySelector('[data-a11ytb-action="open-options"]');

    openBtn?.addEventListener('click', () => {
      const targetView = openBtn.dataset.targetView || 'options';
      controls.openPanel?.(targetView);
    });

    const render = (snapshot) => {
      const spacing = snapshot?.spacing || {};
      if (lineHeightEl) {
        lineHeightEl.textContent = formatLineHeight(spacing.lineHeight);
      }
      if (letterEl) {
        letterEl.textContent = formatLetterSpacing(spacing.letterSpacing);
      }
    };

    render(controls.getState?.());
    return subscribe(render);
  }

  function initBlock(root, controls) {
    if (!root || root.dataset.a11ytbInit === 'true') {
      return;
    }

    cleanupNode(root);

    const blockId = root.getAttribute('data-a11ytb-block');
    if (!blockId) {
      return;
    }

    const cleanups = [];
    const subscribe = (fn) => {
      if (typeof controls.subscribe !== 'function') {
        return () => {};
      }
      const unsubscribe = controls.subscribe(fn);
      cleanups.push(() => {
        try {
          unsubscribe?.();
        } catch (error) {
          /* ignore */
        }
      });
      return unsubscribe;
    };

    switch (blockId) {
      case 'tts-controls':
        initTtsBlock(root, controls, subscribe);
        break;
      case 'stt-controls':
        initSttBlock(root, controls, subscribe);
        break;
      case 'braille-controls':
        initBrailleBlock(root, controls, subscribe);
        break;
      case 'contrast-controls':
        initContrastBlock(root, controls, subscribe);
        break;
      case 'spacing-controls':
        initSpacingBlock(root, controls, subscribe);
        break;
      default:
        break;
    }

    root.dataset.a11ytbInit = 'true';
    root.__a11ytbCleanup = () => {
      cleanups.forEach((cleanup) => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      });
    };
  }

  function initAll(controls) {
    document.querySelectorAll(BLOCK_SELECTOR).forEach((node) => initBlock(node, controls));
  }

  function observeBlocks(controls) {
    if (typeof MutationObserver !== 'function') {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) {
            return;
          }
          if (node.matches(BLOCK_SELECTOR)) {
            initBlock(node, controls);
          }
          node.querySelectorAll?.(BLOCK_SELECTOR).forEach((child) => initBlock(child, controls));
        });
        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof Element)) {
            return;
          }
          if (node.matches(BLOCK_SELECTOR)) {
            cleanupNode(node);
          }
          node.querySelectorAll?.(BLOCK_SELECTOR).forEach((child) => cleanupNode(child));
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function bootstrap() {
    waitForControls((controls) => {
      initAll(controls);
      observeBlocks(controls);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
