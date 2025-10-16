import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  summarizeDependencyLiveMessage,
  updateDependencyDisplay,
} from '../src/utils/dependency-display.js';

describe('dependency display helpers', () => {
  const createView = () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const doc = dom.window.document;
    const wrapper = doc.createElement('div');
    const list = doc.createElement('ul');
    const summary = doc.createElement('p');
    const live = doc.createElement('div');
    wrapper.append(list, summary, live);
    return { doc, wrapper, list, summary, live };
  };

  it('fournit des messages cohérents pour les modules sans dépendances', () => {
    const { wrapper, list, summary, live } = createView();
    const { summary: summaryText, live: liveText } = updateDependencyDisplay(
      { wrapper, list, summary, live },
      [],
      { moduleName: 'Module Test' }
    );
    expect(summaryText.toLowerCase()).toContain('aucune dépendance');
    expect(liveText).toContain('Module Test');
    expect(list.children.length).toBe(0);
  });

  it('rend les badges et messages pour chaque dépendance', () => {
    const { wrapper, list, summary, live } = createView();
    const dependencies = [
      {
        id: 'tts',
        label: 'Synthèse vocale',
        status: 'ok',
        statusLabel: 'OK',
        message: 'Module disponible.',
        aria: 'Dépendance Synthèse vocale disponible.',
      },
      {
        id: 'stt',
        label: 'Reconnaissance vocale',
        status: 'incompatible',
        statusLabel: 'Version incompatible',
        message: 'Version détectée 0.5.0 (minimum 1.0.0).',
        aria: 'Dépendance Reconnaissance vocale incompatible.',
      },
    ];

    const { summary: summaryText, live: liveText } = updateDependencyDisplay(
      { wrapper, list, summary, live },
      dependencies,
      { moduleName: 'Module Audio' }
    );

    expect(list.children.length).toBe(2);
    const second = list.children[1];
    expect(second.querySelector('.a11ytb-admin-dependency-badge').textContent).toContain(
      'Version incompatible'
    );
    expect(summaryText).toContain('Version détectée 0.5.0');
    expect(liveText).toContain('Reconnaissance vocale');
  });

  it('synthétise correctement les messages live pour plusieurs conflits', () => {
    const dependencies = [
      { id: 'a', status: 'missing', aria: 'Dépendance A manquante.' },
      { id: 'b', status: 'incompatible', aria: 'Dépendance B incompatible.' },
    ];
    const message = summarizeDependencyLiveMessage(dependencies, 'Module Démo');
    expect(message).toContain('Module Démo');
    expect(message).toContain('Dépendance A');
    expect(message).toContain('Dépendance B');
  });
});
