<?php

a11ytb_test_reset_state();

update_option('a11ytb_activity_webhook_url', 'https://sync.example.test/hook');
$GLOBALS['__a11ytb_http_responses'] = static function ($url, $args) {
    return ['response' => ['code' => 200], 'body' => ''];
};

$user_id = a11ytb_test_create_user(1);

$entries = [
    [
        'id' => 'activity-2',
        'message' => 'Seconde entrée',
        'timestamp' => 1700000005000,
        'tags' => ['export'],
    ],
    [
        'id' => 'activity-1',
        'message' => 'Première entrée',
        'timestamp' => 1700000000000,
        'tags' => ['audit'],
    ],
];

a11ytb_store_user_preferences($user_id, ['ui' => ['activity' => $entries]], ['updatedAt' => 1700000006000]);
update_user_meta($user_id, a11ytb_get_activity_last_synced_meta_key(), 'activity-1');

$result = a11ytb_execute_activity_sync();
if (is_wp_error($result)) {
    throw new RuntimeException('Synchronisation activité échouée : ' . $result->get_error_message());
}

if (($result['syncedEntries'] ?? 0) !== 1) {
    throw new RuntimeException('Une entrée nouvelle devait être synchronisée.');
}

$last_synced = get_user_meta($user_id, a11ytb_get_activity_last_synced_meta_key(), true);
if ($last_synced !== 'activity-2') {
    throw new RuntimeException('La dernière entrée synchronisée n’a pas été mémorisée.');
}

if (count($GLOBALS['__a11ytb_http_requests']) !== 1) {
    throw new RuntimeException('Une seule requête webhook était attendue.');
}

$GLOBALS['__a11ytb_http_requests'] = [];
$second = a11ytb_execute_activity_sync();
if (is_wp_error($second)) {
    throw new RuntimeException('La synchronisation vide ne doit pas retourner d’erreur.');
}

if (($second['success'] ?? null) !== false) {
    throw new RuntimeException('La seconde exécution devait signaler l’absence de nouveautés.');
}

if ($GLOBALS['__a11ytb_http_requests']) {
    throw new RuntimeException('Aucune requête ne devait partir lors de la seconde exécution.');
}

return true;
