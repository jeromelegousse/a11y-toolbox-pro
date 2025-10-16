import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createNotificationCenter } from '../src/notifications.js';

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function createState(initial = { runtime: { notifications: [] }, ui: { locale: 'fr' } }) {
  let state = clone(initial);
  const listeners = new Set();

  return {
    get(path) {
      if (!path) {
        return clone(state);
      }
      return path
        .split('.')
        .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), state);
    },
    set(path, value) {
      const keys = path.split('.');
      let target = state;
      for (let i = 0; i < keys.length - 1; i += 1) {
        const key = keys[i];
        if (typeof target[key] !== 'object' || target[key] === null) {
          target[key] = {};
        }
        target = target[key];
      }
      target[keys.at(-1)] = value;
      const snapshot = clone(state);
      listeners.forEach((fn) => fn(snapshot));
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const i18nStub = {
  t(key, replacements = {}) {
    switch (key) {
      case 'notifications.dismiss':
        return 'Dismiss';
      case 'notifications.dismissAria':
        return replacements?.title
          ? `Dismiss notification “${replacements.title}”`
          : 'Dismiss notification';
      case 'notifications.regionLabel':
        return 'Notifications';
      case 'notifications.fallbackMessage':
        return 'Notification received.';
      case 'notifications.alertFallbackMessage':
      case 'notifications.defaultAlertTitle':
        return 'Alert';
      case 'notifications.empty':
        return 'No notifications';
      default:
        return key;
    }
  },
};

describe('createNotificationCenter', () => {
  const originalAlert = globalThis.alert;
  let state;

  beforeEach(() => {
    vi.useFakeTimers();
    state = createState();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalAlert === undefined) {
      delete globalThis.alert;
    } else {
      globalThis.alert = originalAlert;
    }
  });

  it('enqueues notifications and removes them after the timeout', () => {
    const center = createNotificationCenter({ state, i18n: i18nStub, overrideAlert: false });

    const id = center.notify({ message: 'Hello world', tone: 'info', timeout: 50 });

    let notifications = state.get('runtime.notifications');
    expect(Array.isArray(notifications)).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ id, message: 'Hello world', tone: 'info' });

    vi.advanceTimersByTime(51);

    notifications = state.get('runtime.notifications');
    expect(notifications).toHaveLength(0);
  });

  it('replaces window.alert with a non-blocking notification', () => {
    const center = createNotificationCenter({ state, i18n: i18nStub, overrideAlert: true });

    expect(typeof globalThis.alert).toBe('function');

    globalThis.alert('Danger');

    const notifications = state.get('runtime.notifications');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      tone: 'alert',
      message: 'Danger',
    });

    center.clear();
    center.restore();
  });

  it('notifies subscribers and supports manual dismissal', () => {
    const center = createNotificationCenter({
      state,
      i18n: i18nStub,
      overrideAlert: false,
      maxItems: 2,
    });
    const listener = vi.fn();
    center.subscribe(listener);

    const firstId = center.notify({ message: 'First', tone: 'warning', timeout: 0 });
    const secondId = center.notify({ message: 'Second', tone: 'info', timeout: 0 });
    const thirdId = center.notify({ message: 'Third', tone: 'success', timeout: 0 });

    const notifications = state.get('runtime.notifications');
    expect(notifications).toHaveLength(2);
    expect(notifications[0].id).toBe(thirdId);
    expect(notifications[1].id).toBe(secondId);
    expect(listener).toHaveBeenCalled();

    center.dismiss(thirdId);
    expect(state.get('runtime.notifications')).toHaveLength(1);

    center.dismiss(firstId);
    expect(state.get('runtime.notifications')).toHaveLength(1);

    center.dismiss(secondId);
    expect(state.get('runtime.notifications')).toHaveLength(0);
  });
});
