const DEFAULT_RETRY_INITIAL = 2000;
const DEFAULT_RETRY_MAX = 30000;

function clonePayload(value) {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return { type: 'text', value: String(value) };
  }
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  return {
    id: entry.id,
    message: entry.message,
    timestamp: entry.timestamp,
    module: entry.module || null,
    severity: entry.severity || null,
    tone: entry.tone || null,
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    payload: clonePayload(entry.payload ?? null),
  };
}

function resolvePageUrl() {
  try {
    if (typeof window !== 'undefined' && window?.location?.href) {
      return window.location.href;
    }
  } catch (error) {
    /* ignore cross-origin failures */
  }
  return undefined;
}

function buildProxyPayload(job) {
  const pageUrl = resolvePageUrl();
  const context = pageUrl ? { page: pageUrl } : {};
  if (job.type === 'bulk') {
    return { job: { type: 'bulk', entries: job.entries }, context };
  }
  return { job: { type: 'single', entry: job.entry }, context };
}

const CONNECTOR_DEFINITIONS = new Map([
  [
    'webhook',
    {
      id: 'webhook',
      label: 'Webhook générique',
      help: 'Envoi POST JSON vers un endpoint HTTPS externe avec jeton optionnel.',
      fields: [
        {
          id: 'webhookUrl',
          label: 'URL du webhook',
          description: 'Endpoint HTTPS recevant les notifications activité.',
        },
        {
          id: 'authToken',
          label: 'Jeton Bearer (facultatif)',
          description: 'Transmis dans l’en-tête Authorization pour sécuriser le webhook.',
        },
      ],
      supportsBulk: true,
      defaultStatus: 'configuration manquante',
    },
  ],
  [
    'jira',
    {
      id: 'jira',
      label: 'Jira (REST)',
      help: 'Crée une demande dans un projet Jira Cloud via l’API REST v3.',
      fields: [
        {
          id: 'jiraBaseUrl',
          label: 'URL de base Jira',
          description: 'Ex. https://votre-instance.atlassian.net',
        },
        {
          id: 'jiraProjectKey',
          label: 'Clé projet',
          description: 'Identifiant court du projet cible (ex. A11Y).',
        },
        {
          id: 'jiraToken',
          label: 'Jeton API',
          description: 'Encodé en Basic Auth (email:token) pour authentifier la requête.',
        },
        {
          id: 'jiraIssueType',
          label: 'Type de ticket',
          description: 'Nom du type (ex. Bug, Task). Défaut : Task.',
        },
      ],
      supportsBulk: false,
      defaultStatus: 'configuration incomplète',
    },
  ],
  [
    'linear',
    {
      id: 'linear',
      label: 'Linear (REST)',
      help: 'Enregistre un ticket Linear via l’API REST stable.',
      fields: [
        {
          id: 'linearApiKey',
          label: 'Clé API Linear',
          description: 'Clé personnelle avec accès écriture (format lin_api_…).',
        },
        {
          id: 'linearTeamId',
          label: 'Identifiant équipe',
          description: 'Identifiant unique de l’équipe cible (ex. team_123).',
        },
      ],
      supportsBulk: false,
      defaultStatus: 'configuration incomplète',
    },
  ],
  [
    'slack',
    {
      id: 'slack',
      label: 'Slack (Webhook)',
      help: 'Publie un message formaté dans un canal Slack via un webhook entrant.',
      fields: [
        {
          id: 'slackWebhookUrl',
          label: 'URL du webhook Slack',
          description: 'URL fournie par l’intégration « Incoming Webhook ».',
        },
      ],
      supportsBulk: true,
      defaultStatus: 'configuration manquante',
    },
  ],
]);

function buildConnectorList(statuses = []) {
  const statusMap = new Map();
  (Array.isArray(statuses) ? statuses : []).forEach((status) => {
    if (status && typeof status.id === 'string') {
      statusMap.set(status.id, status);
    }
  });

  return Array.from(CONNECTOR_DEFINITIONS.values()).map((definition) => {
    const status = statusMap.get(definition.id) || {};
    const enabled = status.enabled === true;
    const computedStatus =
      typeof status.status === 'string'
        ? status.status
        : enabled
          ? 'prêt'
          : definition.defaultStatus || 'inactif';

    return {
      id: definition.id,
      label: definition.label,
      help: definition.help,
      fields: Array.isArray(definition.fields)
        ? definition.fields.map((field) => ({ ...field }))
        : [],
      supportsBulk: Boolean(definition.supportsBulk),
      enabled,
      status: computedStatus,
    };
  });
}

async function readErrorResponse(response) {
  if (!response) {
    return 'Réponse invalide';
  }
  let reason = response.status ? `HTTP ${response.status}` : 'Réponse invalide';
  if (typeof response.text === 'function') {
    try {
      const text = await response.text();
      if (text) {
        reason += ` – ${text.slice(0, 200)}`;
      }
    } catch (error) {
      /* ignore */
    }
  }
  return reason;
}

function createResultSummary(job) {
  return {
    jobType: job.type,
    count: job.type === 'bulk' ? job.entries.length : 1,
  };
}

export function listConnectorMetadata(config = {}, fetchFnAvailable = true) {
  const base = buildConnectorList(config?.connectors);
  if (fetchFnAvailable) {
    return base;
  }
  return base.map((connector) =>
    connector.enabled
      ? { ...connector, enabled: false, status: 'API fetch indisponible' }
      : connector
  );
}

export function createActivityIntegration({
  config = {},
  fetchFn = null,
  notify = () => {},
  onSyncEvent = () => {},
  onConnectorsChange = () => {},
  retry = {
    initialDelay: DEFAULT_RETRY_INITIAL,
    maxDelay: DEFAULT_RETRY_MAX,
  },
} = {}) {
  const proxyUrl =
    typeof config?.proxyUrl === 'string' && config.proxyUrl.trim()
      ? config.proxyUrl.trim()
      : typeof config?.proxy?.url === 'string'
        ? config.proxy.url.trim()
        : '';

  const retryOptions = {
    initialDelay: Number.isFinite(retry?.initialDelay)
      ? Math.max(0, retry.initialDelay)
      : DEFAULT_RETRY_INITIAL,
    maxDelay: Number.isFinite(retry?.maxDelay) ? Math.max(0, retry.maxDelay) : DEFAULT_RETRY_MAX,
  };

  const state = {
    queue: [],
    processing: false,
    retryTimer: null,
    connectors: buildConnectorList(config?.connectors),
    connectorsFetched: !proxyUrl,
  };

  function emitConnectors() {
    try {
      onConnectorsChange(state.connectors.map((connector) => ({ ...connector })));
    } catch (error) {
      console.warn('a11ytb: erreur lors de la notification des connecteurs', error);
    }
  }

  emitConnectors();

  function activeConnectors() {
    return state.connectors.filter((connector) => connector.enabled);
  }

  function setConnectors(statuses = []) {
    state.connectors = buildConnectorList(statuses);
    state.connectorsFetched = true;
    emitConnectors();
    if (!activeConnectors().length && state.queue.length) {
      notify('Aucun connecteur de synchronisation configuré.', {
        tone: 'warning',
        tags: ['export'],
      });
      state.queue.length = 0;
    } else if (activeConnectors().length && state.queue.length) {
      processQueue(true);
    }
  }

  function scheduleRetry(delay) {
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
    }
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      processQueue();
    }, delay);
  }

  async function refreshConnectorMetadata() {
    if (!proxyUrl || !fetchFn) {
      state.connectorsFetched = true;
      return;
    }
    try {
      const response = await fetchFn(proxyUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (response?.ok && typeof response.json === 'function') {
        try {
          const data = await response.json();
          if (data && Array.isArray(data.connectors)) {
            setConnectors(data.connectors);
            return;
          }
        } catch (error) {
          /* ignore invalid JSON */
        }
      }
    } catch (error) {
      /* ignore network issues */
    }
    state.connectorsFetched = true;
  }

  refreshConnectorMetadata().catch(() => {});

  async function processQueue(force = false) {
    if (!fetchFn || !proxyUrl) {
      return;
    }
    if (state.processing) {
      return;
    }
    if (!state.queue.length) {
      return;
    }
    if (!state.connectorsFetched && !activeConnectors().length) {
      return;
    }
    if (state.connectorsFetched && !activeConnectors().length) {
      state.queue.length = 0;
      return;
    }

    state.processing = true;
    try {
      while (state.queue.length) {
        const job = state.queue[0];
        if (!force && typeof job.nextAttempt === 'number' && job.nextAttempt > Date.now()) {
          break;
        }
        try {
          const payload = buildProxyPayload(job);
          const response = await fetchFn(proxyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!response || response.ok !== true) {
            const reason = await readErrorResponse(response);
            throw new Error(reason);
          }

          if (typeof response.json === 'function') {
            try {
              const data = await response.json();
              if (data && Array.isArray(data.connectors)) {
                setConnectors(data.connectors);
              }
            } catch (error) {
              /* ignore */
            }
          }

          state.queue.shift();
          const summary = createResultSummary(job);
          onSyncEvent({
            connector: 'all',
            status: 'success',
            jobType: summary.jobType,
            count: summary.count,
          });
          notify(`Synchronisation envoyée (${summary.count} entrée(s)).`, {
            tone: 'confirm',
            tags: ['export'],
            payload: {
              type: 'activity-sync',
              status: 'success',
              jobType: summary.jobType,
            },
          });
        } catch (error) {
          job.attempts = (job.attempts || 0) + 1;
          const delay = Math.min(
            retryOptions.maxDelay,
            retryOptions.initialDelay * job.attempts || retryOptions.initialDelay
          );
          job.nextAttempt = Date.now() + delay;
          notify(
            `Échec d’envoi de la synchronisation, nouvelle tentative dans ${Math.round(delay / 1000)}s.`,
            {
              tone: 'warning',
              tags: ['export'],
              payload: {
                type: 'activity-sync',
                status: 'error',
                jobType: job.type,
                retryInMs: delay,
                attempts: job.attempts,
                error: error?.message || 'Erreur proxy',
              },
            }
          );
          onSyncEvent({
            connector: 'all',
            status: 'error',
            jobType: job.type,
            error: error?.message,
          });
          scheduleRetry(delay);
          break;
        }
      }
    } finally {
      state.processing = false;
    }
  }

  function enqueue(job) {
    if (state.connectorsFetched && !activeConnectors().length) {
      notify('Aucun connecteur de synchronisation configuré.', {
        tone: 'warning',
        tags: ['export'],
      });
      return;
    }
    state.queue.push(job);
    processQueue();
  }

  return {
    get connectors() {
      return state.connectors;
    },
    get hasConnectors() {
      return activeConnectors().length > 0;
    },
    enqueueEntry(entry) {
      const sanitized = sanitizeEntry(entry);
      if (!sanitized) return;
      enqueue({ type: 'single', entry: sanitized, attempts: 0 });
    },
    enqueueBatch(entries) {
      const sanitized = (Array.isArray(entries) ? entries : [])
        .map((entry) => sanitizeEntry(entry))
        .filter(Boolean);
      if (!sanitized.length) return;
      enqueue({ type: 'bulk', entries: sanitized, attempts: 0 });
    },
    triggerManualSend(entries = []) {
      if (state.connectorsFetched && !activeConnectors().length) {
        notify('Aucun connecteur de synchronisation configuré.', {
          tone: 'warning',
          tags: ['export'],
        });
        return;
      }
      const sanitized = (Array.isArray(entries) ? entries : [])
        .map((entry) => sanitizeEntry(entry))
        .filter(Boolean);
      if (!sanitized.length) {
        notify('Aucune activité à envoyer pour le moment.', { tone: 'info', tags: ['export'] });
        return;
      }
      state.queue.push({ type: 'bulk', entries: sanitized, attempts: 0 });
      notify(`Envoi manuel de ${sanitized.length} entrée(s) en cours…`, {
        tone: 'info',
        tags: ['export'],
        payload: {
          type: 'activity-sync',
          status: 'queued',
          jobType: 'bulk',
          count: sanitized.length,
        },
      });
      onSyncEvent({
        connector: 'all',
        status: 'queued',
        jobType: 'bulk',
        count: sanitized.length,
      });
      processQueue(true);
    },
    processQueue,
    refreshConnectors: refreshConnectorMetadata,
  };
}
