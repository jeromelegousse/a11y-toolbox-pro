<?php

a11ytb_test_reset_state();

$user_id = a11ytb_test_create_user(1);
a11ytb_test_set_current_user($user_id);

$config = a11ytb_get_frontend_config();
$preferencesConfig = $config['integrations']['preferences'] ?? null;

if (!is_array($preferencesConfig)) {
    throw new RuntimeException('Configuration préférences absente.');
}

if (($preferencesConfig['enabled'] ?? false) !== true) {
    throw new RuntimeException('Les préférences doivent être actives pour un utilisateur connecté.');
}

if (empty($preferencesConfig['endpoint'])) {
    throw new RuntimeException('Endpoint REST des préférences manquant.');
}

if (($preferencesConfig['nonce'] ?? '') === '') {
    throw new RuntimeException('Nonce REST manquant pour la synchro des préférences.');
}

$payload = [
    'data' => [
        'ui' => [
            'dock' => 'left',
            'activity' => [
                [
                    'id' => 'log-1',
                    'message' => 'Connexion test',
                    'timestamp' => 1700000000000,
                    'tags' => ['test'],
                ],
            ],
        ],
        'contrast' => ['enabled' => true],
    ],
    'meta' => ['updatedAt' => 1700000000000],
];

$update = a11ytb_rest_update_preferences($payload);
if (is_wp_error($update)) {
    throw new RuntimeException('Mise à jour des préférences refusée : ' . $update->get_error_message());
}

if (($update['data']['contrast']['enabled'] ?? false) !== true) {
    throw new RuntimeException('Les préférences ne conservent pas l’état du contraste.');
}

$fetched = a11ytb_rest_get_preferences([]);
if (is_wp_error($fetched)) {
    throw new RuntimeException('Lecture des préférences échouée : ' . $fetched->get_error_message());
}

if (($fetched['data']['ui']['dock'] ?? '') !== 'left') {
    throw new RuntimeException('La position du dock n’a pas été synchronisée.');
}

if (!isset($fetched['meta']['updatedAt']) || $fetched['meta']['updatedAt'] <= 0) {
    throw new RuntimeException('Métadonnées de synchronisation absentes.');
}

a11ytb_test_set_current_user(null);

$forbidden = a11ytb_rest_get_preferences([]);
if (!is_wp_error($forbidden)) {
    throw new RuntimeException('Les préférences devraient être protégées hors connexion.');
}

return true;
