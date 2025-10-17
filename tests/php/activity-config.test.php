<?php

a11ytb_test_reset_state();

update_option('a11ytb_activity_webhook_url', 'https://proxy.example.test/hook');
update_option('a11ytb_activity_webhook_token', a11ytb_encrypt_secret('token-123'));

$config = a11ytb_get_frontend_config();
$activityConfig = $config['integrations']['activity'] ?? null;
if (!is_array($activityConfig)) {
    throw new RuntimeException('Configuration activité manquante.');
}

if (array_key_exists('authToken', $activityConfig)) {
    throw new RuntimeException('Le jeton ne doit pas être exposé côté client.');
}

if (($activityConfig['hasAuthToken'] ?? false) !== true) {
    throw new RuntimeException('Le flag hasAuthToken doit être à true.');
}

if (($activityConfig['webhookUrl'] ?? '') !== 'https://proxy.example.test/hook') {
    throw new RuntimeException('URL webhook incorrecte dans la configuration.');
}

if (!is_string($activityConfig['proxyUrl'] ?? null) || $activityConfig['proxyUrl'] === '') {
    throw new RuntimeException('L’URL du proxy doit être fournie.');
}

if (!is_string($activityConfig['proxyNonce'] ?? null) || $activityConfig['proxyNonce'] === '') {
    throw new RuntimeException('Le nonce du proxy doit être exposé.');
}

a11ytb_test_reset_state();

update_option('a11ytb_activity_webhook_url', 'https://proxy.example.test/hook');
update_option('a11ytb_activity_webhook_token', a11ytb_encrypt_secret('token-123'));
update_option('a11ytb_activity_jira_base_url', 'https://jira.example.test');
update_option('a11ytb_activity_jira_project_key', 'A11Y');
update_option('a11ytb_activity_jira_token', a11ytb_encrypt_secret('jira-basic'));
update_option('a11ytb_activity_jira_issue_type', 'Bug');
update_option('a11ytb_activity_linear_api_key', a11ytb_encrypt_secret('lin_api_key'));
update_option('a11ytb_activity_linear_team_id', 'team_123');
update_option('a11ytb_activity_slack_webhook_url', a11ytb_encrypt_secret('https://hooks.slack.test/T123'));

$GLOBALS['__a11ytb_http_responses'] = static function ($url, $args) {
    return ['response' => ['code' => 200], 'body' => ''];
};

$payload = [
    'job' => [
        'type' => 'single',
        'entry' => [
            'id' => 'entry-1',
            'message' => 'Observation test',
            'timestamp' => 1700000000000,
            'tags' => ['tag-a', 'tag-b'],
            'payload' => ['foo' => 'bar']
        ]
    ],
    'context' => [
        'page' => 'https://example.test/page'
    ]
];

$result = a11ytb_process_activity_proxy_payload($payload);
if (is_wp_error($result)) {
    throw new RuntimeException('Proxy en erreur : ' . $result->get_error_message());
}

if (($result['success'] ?? false) !== true) {
    throw new RuntimeException('Réponse proxy invalide.');
}

if (($result['count'] ?? 0) !== 1) {
    throw new RuntimeException('Le proxy doit traiter une entrée unique.');
}

$requests = $GLOBALS['__a11ytb_http_requests'];
if (count($requests) !== 4) {
    throw new RuntimeException('Quatre requêtes HTTP étaient attendues, reçu ' . count($requests));
}

[$webhookRequest, $jiraRequest, $linearRequest, $slackRequest] = $requests;

if ($webhookRequest['url'] !== 'https://proxy.example.test/hook') {
    throw new RuntimeException('Webhook appelé sur une URL inattendue.');
}

$webhookHeaders = $webhookRequest['args']['headers'] ?? [];
if (($webhookHeaders['Authorization'] ?? '') !== 'Bearer token-123') {
    throw new RuntimeException('En-tête Authorization webhook absent ou incorrect.');
}

$webhookBody = json_decode($webhookRequest['args']['body'] ?? '{}', true);
if (($webhookBody['event'] ?? '') !== 'a11ytb.activity.entry') {
    throw new RuntimeException('Le webhook doit recevoir un événement entry.');
}

if ($jiraRequest['url'] !== 'https://jira.example.test/rest/api/3/issue') {
    throw new RuntimeException('URL Jira invalide.');
}

$jiraHeaders = $jiraRequest['args']['headers'] ?? [];
if (($jiraHeaders['Authorization'] ?? '') !== 'Basic jira-basic') {
    throw new RuntimeException('Jeton Jira non appliqué.');
}

$jiraBody = json_decode($jiraRequest['args']['body'] ?? '{}', true);
if (($jiraBody['fields']['project']['key'] ?? '') !== 'A11Y') {
    throw new RuntimeException('Clé projet Jira absente dans la charge utile.');
}

if ($linearRequest['url'] !== 'https://api.linear.app/rest/issues') {
    throw new RuntimeException('URL Linear invalide.');
}

$linearHeaders = $linearRequest['args']['headers'] ?? [];
if (($linearHeaders['Authorization'] ?? '') !== 'lin_api_key') {
    throw new RuntimeException('Clé Linear absente.');
}

if ($slackRequest['url'] !== 'https://hooks.slack.test/T123') {
    throw new RuntimeException('Webhook Slack invalide.');
}

$slackBody = json_decode($slackRequest['args']['body'] ?? '{}', true);
if (($slackBody['text'] ?? '') !== 'Observation test') {
    throw new RuntimeException('Corps Slack inattendu.');
}

return true;
