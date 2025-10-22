<?php

a11ytb_test_reset_state();

a11ytb_test_grant_capabilities([]);

a11ytb_test_set_current_user(null);

$config = a11ytb_get_frontend_config();
$vision = $config['integrations']['vision'] ?? null;

if (!is_array($vision)) {
    throw new RuntimeException('Configuration vision absente.');
}

if (($vision['enabled'] ?? null) !== false) {
    throw new RuntimeException('La vision doit être désactivée sans capacité.');
}

$user_id = a11ytb_test_create_user(7);
a11ytb_test_set_current_user($user_id);
a11ytb_test_grant_capabilities(['upload_files']);

$config = a11ytb_get_frontend_config();
$vision = $config['integrations']['vision'] ?? null;

if (!is_array($vision)) {
    throw new RuntimeException('Configuration vision absente pour un utilisateur autorisé.');
}

if (($vision['enabled'] ?? null) !== true) {
    throw new RuntimeException('La vision devrait être active pour les utilisateurs autorisés.');
}

if (empty($vision['endpoint']) || empty($vision['nonce'])) {
    throw new RuntimeException('Endpoint ou nonce REST manquant pour la vision.');
}

$missingPrompt = a11ytb_rest_analyze_image([
    'imageTmpFile' => __FILE__,
]);

if (!is_wp_error($missingPrompt) || $missingPrompt->get_error_message() === '') {
    throw new RuntimeException('Un prompt absent devrait retourner une erreur explicite.');
}

$missingImage = a11ytb_rest_analyze_image([
    'prompt' => 'Décrire la scène',
]);

if (!is_wp_error($missingImage) || $missingImage->get_error_message() === '') {
    throw new RuntimeException('Une image absente devrait retourner une erreur explicite.');
}

$execution = a11ytb_rest_analyze_image([
    'prompt' => 'Décrire la scène',
    'imageTmpFile' => __FILE__,
]);

if (!is_wp_error($execution)) {
    throw new RuntimeException('Le moteur factice devrait retourner une erreur en environnement de test.');
}

return true;
