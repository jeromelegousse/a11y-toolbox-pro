<?php

a11ytb_test_reset_state();

$sanitized = a11ytb_sanitize_llava_token('bridge-token');
if (!is_string($sanitized) || $sanitized === '' || $sanitized === 'bridge-token') {
    throw new RuntimeException('Le jeton LLaVA doit être chiffré.');
}

a11ytb_test_reset_state();

update_option('a11ytb_llava_endpoint', 'https://proxy.example.test/vision');
update_option('a11ytb_llava_token', $sanitized);

$config = a11ytb_get_llava_admin_config();
if (($config['hasToken'] ?? false) !== true) {
    throw new RuntimeException('Le flag hasToken devrait être vrai.');
}

if (empty($config['maskedToken'])) {
    throw new RuntimeException('Le secret masqué doit être exposé.');
}

$command = a11ytb_build_llava_command('/tmp/image.png', 'Décrire', 'llava');
if (!is_array($command)) {
    throw new RuntimeException('La commande LLaVA doit être un tableau.');
}

$env = $command['env'] ?? [];
if (!is_array($env) || !$env) {
    throw new RuntimeException('Les variables d’environnement LLaVA sont absentes.');
}

if (($env['A11YTB_LLAVA_ENDPOINT'] ?? '') !== 'https://proxy.example.test/vision') {
    throw new RuntimeException('Endpoint LLaVA absent de lenvironnement.');
}

if (($env['A11YTB_LLAVA_TOKEN_ENCRYPTED'] ?? '') !== $sanitized) {
    throw new RuntimeException('Le secret chiffré doit être transmis au bridge.');
}

$key = $env['A11YTB_SECRET_KEY'] ?? '';
if (!is_string($key) || $key === '') {
    throw new RuntimeException('La clé de chiffrement doit être fournie.');
}

$decodedKey = base64_decode($key, true);
if ($decodedKey === false || strlen($decodedKey) !== 32) {
    throw new RuntimeException('La clé de chiffrement LLaVA est invalide.');
}

return true;
