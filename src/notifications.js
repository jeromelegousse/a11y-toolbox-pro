const DEFAULT_TONE = 'info';
const DEFAULT_TIMEOUT = 6000;

function toMessage(input) {
  if (input === null || input === undefined) {
    return '';
  }
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof Error) {
    return input.message || input.toString();
  }
  if (typeof input === 'object' && 'message' in input) {
    return String(input.message);
  }
  return String(input);
}

export function createNotificationCenter({ state, i18n, overrideAlert = true, maxItems = 5 } = {}) {
  if (!state || typeof state.get !== 'function' || typeof state.set !== 'function') {
    throw new Error('Notification center requires a valid state store.');
  }

  const timers = new Map();
  let counter = 0;
  const listeners = new Set();

  function getNotifications(snapshot) {
    if (snapshot && snapshot.runtime && Array.isArray(snapshot.runtime.notifications)) {
      return snapshot.runtime.notifications;
    }
    const stored = state.get('runtime.notifications');
    return Array.isArray(stored) ? stored : [];
  }

  function emit(nextNotifications) {
    listeners.forEach((fn) => {
      try {
        fn(nextNotifications);
      } catch (error) {
        console.error('a11ytb: notification listener failed.', error);
      }
    });
  }

  function scheduleRemoval(id, timeout) {
    if (timers.has(id)) {
      clearTimeout(timers.get(id));
      timers.delete(id);
    }
    if (!timeout || timeout <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      timers.delete(id);
      dismiss(id);
    }, timeout);
    timers.set(id, timer);
  }

  function persistNotifications(notifications) {
    state.set('runtime.notifications', notifications);
    emit(notifications);
  }

  function dismiss(id) {
    const notifications = getNotifications();
    const next = notifications.filter((notification) => notification.id !== id);
    if (next.length !== notifications.length) {
      persistNotifications(next);
    }
  }

  function clear() {
    getNotifications().forEach((notification) => {
      if (timers.has(notification.id)) {
        clearTimeout(timers.get(notification.id));
        timers.delete(notification.id);
      }
    });
    persistNotifications([]);
  }

  function resolveText(key, replacements) {
    if (!i18n || typeof i18n.t !== 'function') {
      return '';
    }
    return i18n.t(key, replacements);
  }

  function notify(input) {
    const payload = typeof input === 'string' ? { message: input } : input || {};
    const {
      tone = DEFAULT_TONE,
      title,
      titleKey,
      message,
      messageKey,
      replacements,
      timeout = DEFAULT_TIMEOUT,
      sticky = false,
    } = payload;

    const resolvedTitle = titleKey ? resolveText(titleKey, replacements) : title;
    const resolvedMessage = messageKey
      ? resolveText(messageKey, replacements)
      : (message ?? payload.detail ?? payload.description);

    const finalMessage = toMessage(resolvedMessage);
    const finalTitle =
      resolvedTitle || (tone === 'alert' ? resolveText('notifications.defaultAlertTitle') : '');

    const notifications = getNotifications();
    const id = `notification-${Date.now()}-${counter++}`;
    const entry = {
      id,
      tone,
      title: finalTitle || undefined,
      message: finalMessage || resolveText('notifications.fallbackMessage'),
      createdAt: Date.now(),
      sticky: Boolean(sticky || timeout === 0),
      timeout: timeout ?? DEFAULT_TIMEOUT,
    };

    const next = [entry, ...notifications].slice(0, Math.max(maxItems, 1));
    persistNotifications(next);
    scheduleRemoval(id, entry.sticky ? 0 : entry.timeout);
    return id;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') {
      return () => {};
    }
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  let originalAlert;
  if (overrideAlert && typeof globalThis !== 'undefined') {
    const target = globalThis;
    if (typeof target.alert === 'function') {
      originalAlert = target.alert.bind(target);
    }
    target.alert = (value) => {
      notify({
        tone: 'alert',
        message: toMessage(value) || resolveText('notifications.alertFallbackMessage'),
        sticky: true,
      });
    };
  }

  const unsubscribeState = state.on((snapshot) => {
    emit(getNotifications(snapshot));
  });

  return {
    notify,
    dismiss,
    clear,
    subscribe,
    restore() {
      if (originalAlert && typeof globalThis !== 'undefined') {
        globalThis.alert = originalAlert;
      }
      listeners.clear();
      clear();
      unsubscribeState();
    },
  };
}

export default {
  createNotificationCenter,
};
