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
    payload: clonePayload(entry.payload ?? null)
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

function buildEnvelope(job) {
  const base = {
    source: 'a11y-toolbox-pro',
    sentAt: new Date().toISOString(),
    page: resolvePageUrl()
  };
  if (job.type === 'bulk') {
    return { ...base, event: 'a11ytb.activity.bulk', entries: job.entries };
  }
  return { ...base, event: 'a11ytb.activity.entry', entry: job.entry };
}

function ensureString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const CONNECTOR_DEFINITIONS = [
  {
    id: 'webhook',
    label: 'Webhook générique',
    help: 'Envoi POST JSON vers un endpoint HTTPS externe avec jeton optionnel.',
    fields: [
      {
        id: 'webhookUrl',
        label: 'URL du webhook',
        description: 'Endpoint HTTPS recevant les notifications activité.'
      },
      {
        id: 'authToken',
        label: 'Jeton Bearer (facultatif)',
        description: 'Transmis dans l’en-tête Authorization pour sécuriser le webhook.'
      }
    ],
    create(config, context) {
      const url = ensureString(config?.webhookUrl || config?.url);
      if (!url) {
        return {
          id: this.id,
          label: this.label,
          help: this.help,
          fields: this.fields,
          enabled: false,
          status: 'configuration manquante'
        };
      }
      if (!context.fetchFn) {
        return {
          id: this.id,
          label: this.label,
          help: this.help,
          fields: this.fields,
          enabled: false,
          status: 'API fetch indisponible'
        };
      }
      const token = ensureString(config?.authToken || config?.token);
      return {
        id: this.id,
        label: this.label,
        help: this.help,
        fields: this.fields,
        enabled: true,
        status: 'prêt',
        supportsBulk: true,
        async send(job) {
          const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          };
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
          const body = JSON.stringify(buildEnvelope(job));
          const response = await context.fetchFn(url, {
            method: 'POST',
            headers,
            body
          });
          if (!response || response.ok !== true) {
            let reason = response ? `HTTP ${response.status}` : 'Réponse invalide';
            if (response && typeof response.text === 'function') {
              try {
                const text = await response.text();
                if (text) {
                  reason += ` – ${text.slice(0, 200)}`;
                }
              } catch (error) {
                /* ignore */
              }
            }
            const error = new Error(reason);
            error.response = response;
            throw error;
          }
        }
      };
    }
  },
  {
    id: 'jira',
    label: 'Jira (REST)',
    help: 'Crée une demande dans un projet Jira Cloud via l’API REST v3.',
    fields: [
      {
        id: 'jiraBaseUrl',
        label: 'URL de base Jira',
        description: 'Ex. https://votre-instance.atlassian.net'
      },
      {
        id: 'jiraProjectKey',
        label: 'Clé projet',
        description: 'Identifiant court du projet cible (ex. A11Y).'
      },
      {
        id: 'jiraToken',
        label: 'Jeton API',
        description: 'Encodé en Basic Auth (email:token) pour authentifier la requête.'
      },
      {
        id: 'jiraIssueType',
        label: 'Type de ticket',
        description: 'Nom du type (ex. Bug, Task). Défaut : Task.'
      }
    ],
    create(config, context) {
      const baseUrl = ensureString(config?.jiraBaseUrl || config?.baseUrl);
      const projectKey = ensureString(config?.jiraProjectKey || config?.projectKey);
      const token = ensureString(config?.jiraToken || config?.token);
      const issueType = ensureString(config?.jiraIssueType || config?.issueType) || 'Task';
      if (!baseUrl || !projectKey || !token) {
        return {
          id: this.id,
          label: this.label,
          help: this.help,
          fields: this.fields,
          enabled: false,
          status: 'configuration incomplète'
        };
      }
      if (!context.fetchFn) {
        return {
          id: this.id,
          label: this.label,
          help: this.help,
          fields: this.fields,
          enabled: false,
          status: 'API fetch indisponible'
        };
      }
      const endpoint = `${baseUrl.replace(/\/?$/, '')}/rest/api/3/issue`;
      return {
        id: this.id,
        label: this.label,
        help: this.help,
        fields: this.fields,
        enabled: true,
        status: 'prêt',
        supportsBulk: false,
        async send(job) {
          const entry = job.type === 'bulk' ? job.entries?.[0] : job.entry;
          if (!entry) {
            return;
          }
          const descriptionParts = [];
          descriptionParts.push(entry.message);
          if (entry.payload) {
            descriptionParts.push('---');
            descriptionParts.push(JSON.stringify(entry.payload, null, 2));
          }
          if (Array.isArray(entry.tags) && entry.tags.length) {
            descriptionParts.push(`Tags : ${entry.tags.join(', ')}`);
          }
          const body = {
            fields: {
              project: { key: projectKey },
              summary: entry.message.slice(0, 240) || 'Observation accessibilité',
              description: descriptionParts.join('\n'),
              issuetype: { name: issueType }
            }
          };
          const response = await context.fetchFn(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${token}`
            },
            body: JSON.stringify(body)
          });
          if (!response || response.ok !== true) {
            let reason = response ? `HTTP ${response.status}` : 'Réponse invalide';
            if (response && typeof response.text === 'function') {
              try {
                const text = await response.text();
                if (text) {
                  reason += ` – ${text.slice(0, 200)}`;
                }
              } catch (error) {
                /* ignore */
              }
            }
            const error = new Error(reason);
            error.response = response;
            throw error;
          }
        }
      };
    }
  },
  {
    id: 'linear',
    label: 'Linear (REST)',
    help: 'Enregistre un ticket Linear via l’API REST stable.',
    fields: [
      {
        id: 'linearApiKey',
        label: 'Clé API Linear',
        description: 'Clé personnelle avec accès écriture (format lin_api_…).'
      },
      {
        id: 'linearTeamId',
        label: 'Identifiant équipe',
        description: 'Identifiant unique de l’équipe cible (ex. team_123).'
      }
    ],
    create(config, context) {
      const apiKey = ensureString(config?.linearApiKey || config?.apiKey);
      const teamId = ensureString(config?.linearTeamId || config?.teamId);
      if (!apiKey || !teamId) {
        return {
          id: this.id,
          label: this.label,
          help: this.help,
          fields: this.fields,
          enabled: false,
          status: 'configuration incomplète'
        };
      }
      if (!context.fetchFn) {
        return {
          id: this.id,
          label: this.label,
          help: this.help,
          fields: this.fields,
          enabled: false,
          status: 'API fetch indisponible'
        };
      }
      const endpoint = 'https://api.linear.app/rest/issues';
      return {
        id: this.id,
        label: this.label,
        help: this.help,
        fields: this.fields,
        enabled: true,
        status: 'prêt',
        supportsBulk: false,
        async send(job) {
          const entry = job.type === 'bulk' ? job.entries?.[0] : job.entry;
          if (!entry) return;
          const payload = {
            teamId,
            title: entry.message.slice(0, 240) || 'Observation accessibilité',
            description: JSON.stringify(entry, null, 2)
          };
          const response = await context.fetchFn(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: apiKey
            },
            body: JSON.stringify(payload)
          });
          if (!response || response.ok !== true) {
            let reason = response ? `HTTP ${response.status}` : 'Réponse invalide';
            if (response && typeof response.text === 'function') {
              try {
                const text = await response.text();
                if (text) {
                  reason += ` – ${text.slice(0, 200)}`;
                }
              } catch (error) {
                /* ignore */
              }
            }
            const error = new Error(reason);
            error.response = response;
            throw error;
          }
        }
      };
    }
  },
  {
    id: 'slack',
    label: 'Slack (Webhook)',
    help: 'Publie un message formaté dans un canal Slack via un webhook entrant.',
    fields: [
      {
        id: 'slackWebhookUrl',
        label: 'URL du webhook Slack',
        description: 'URL fournie par l’intégration « Incoming Webhook ». '
      }
    ],
    create(config, context) {
      const url = ensureString(config?.slackWebhookUrl);
      if (!url) {
        return {
          id: this.id,
          label: this.label,
          help: this.help,
          fields: this.fields,
          enabled: false,
          status: 'configuration manquante'
        };
      }
      if (!context.fetchFn) {
        return {
          id: this.id,
          label: this.label,
          help: this.help,
          fields: this.fields,
          enabled: false,
          status: 'API fetch indisponible'
        };
      }
      return {
        id: this.id,
        label: this.label,
        help: this.help,
        fields: this.fields,
        enabled: true,
        status: 'prêt',
        supportsBulk: true,
        async send(job) {
          const entry = job.type === 'bulk' ? job.entries?.[0] : job.entry;
          if (!entry) return;
          const contextBlocks = [];
          if (Array.isArray(entry.tags) && entry.tags.length) {
            contextBlocks.push({
              type: 'mrkdwn',
              text: `*Tags* : ${entry.tags.join(', ')}`
            });
          }
          const payload = {
            text: entry.message,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `*${entry.message}*` }
              },
              {
                type: 'context',
                elements: [
                  { type: 'mrkdwn', text: `Module : ${entry.module || 'activité'}` },
                  { type: 'mrkdwn', text: `Niveau : ${entry.severity || entry.tone || 'info'}` }
                ]
              }
            ]
          };
          if (contextBlocks.length) {
            payload.blocks.push({ type: 'context', elements: contextBlocks });
          }
          if (entry.payload) {
            payload.blocks.push({
              type: 'section',
              text: { type: 'mrkdwn', text: '```' + JSON.stringify(entry.payload, null, 2) + '```' }
            });
          }
          await context.fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      };
    }
  }
];

export function listConnectorMetadata(config = {}, fetchFnAvailable = true) {
  return CONNECTOR_DEFINITIONS.map((definition) => {
    const instance = definition.create(config, { fetchFn: fetchFnAvailable ? () => Promise.resolve({ ok: true }) : null });
    return {
      id: definition.id,
      label: definition.label,
      help: definition.help,
      fields: definition.fields,
      enabled: instance.enabled === true
    };
  });
}

export function createActivityIntegration({
  config = {},
  fetchFn = null,
  notify = () => {},
  onSyncEvent = () => {},
  retry = {
    initialDelay: DEFAULT_RETRY_INITIAL,
    maxDelay: DEFAULT_RETRY_MAX
  }
} = {}) {
  const state = {
    queue: [],
    processing: false,
    retryTimer: null
  };

  const context = { fetchFn };

  const connectors = CONNECTOR_DEFINITIONS.map((definition) => {
    const instance = definition.create(config, context);
    return {
      ...instance,
      id: definition.id,
      label: definition.label,
      help: definition.help,
      fields: definition.fields ?? []
    };
  });

  const activeConnectors = connectors.filter((connector) => connector.enabled && typeof connector.send === 'function');

  function scheduleRetry(delay) {
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
    }
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      processQueue();
    }, delay);
  }

  async function processQueue(force = false) {
    if (!activeConnectors.length || !fetchFn) {
      return;
    }
    if (state.processing) {
      return;
    }
    if (!state.queue.length) {
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
          for (const connector of activeConnectors) {
            await connector.send(job);
          }
          state.queue.shift();
          onSyncEvent({
            connector: 'all',
            status: 'success',
            jobType: job.type,
            count: job.type === 'bulk' ? job.entries.length : 1
          });
          notify(`Synchronisation envoyée (${job.type === 'bulk' ? job.entries.length : 1} entrée(s)).`, {
            tone: 'confirm',
            tags: ['export'],
            payload: {
              type: 'activity-sync',
              status: 'success',
              jobType: job.type
            }
          });
        } catch (error) {
          job.attempts = (job.attempts || 0) + 1;
          const delay = Math.min(retry.maxDelay, retry.initialDelay * job.attempts);
          job.nextAttempt = Date.now() + delay;
          notify(`Échec d’envoi de la synchronisation, nouvelle tentative dans ${Math.round(delay / 1000)}s.`, {
            tone: 'warning',
            tags: ['export'],
            payload: {
              type: 'activity-sync',
              status: 'error',
              jobType: job.type,
              retryInMs: delay,
              attempts: job.attempts,
              error: error?.message || 'Erreur réseau'
            }
          });
          onSyncEvent({
            connector: 'all',
            status: 'error',
            jobType: job.type,
            error: error?.message
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
    if (!activeConnectors.length) {
      notify('Aucun connecteur de synchronisation configuré.', { tone: 'warning', tags: ['export'] });
      return;
    }
    state.queue.push(job);
    processQueue();
  }

  return {
    connectors,
    hasConnectors: activeConnectors.length > 0,
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
      if (!activeConnectors.length) {
        notify('Aucun connecteur de synchronisation configuré.', { tone: 'warning', tags: ['export'] });
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
          count: sanitized.length
        }
      });
      onSyncEvent({
        connector: 'all',
        status: 'queued',
        jobType: 'bulk',
        count: sanitized.length
      });
      processQueue(true);
    },
    processQueue
  };
}
