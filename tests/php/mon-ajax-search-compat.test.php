<?php

declare(strict_types=1);

$fixture = __DIR__ . '/support/fixtures/mon-ajax-search/IndexManager.php';
$tempDir = sys_get_temp_dir() . '/a11ytb_mon_ajax_' . uniqid('', true);
$target = $tempDir . '/IndexManager.php';

if (!mkdir($tempDir, 0777, true) && !is_dir($tempDir)) {
    throw new RuntimeException('Impossible de créer le répertoire temporaire.');
}

if (!copy($fixture, $target)) {
    throw new RuntimeException('Impossible de copier le fichier fixture.');
}

$result = a11ytb_patch_mon_ajax_search_index_manager_file($target);
if ($result !== true) {
    throw new RuntimeException('Le correctif devrait modifier le fichier la première fois.');
}

$patched = file_get_contents($target);
if ($patched === false) {
    throw new RuntimeException('Impossible de lire le fichier corrigé.');
}

if (strpos($patched, 'public $event_recorder = null;') === false) {
    throw new RuntimeException('La propriété event_recorder est absente du fichier corrigé.');
}

$expectedDocBlock = "    /**\n     * Event recorder instance or null when disabled.\n     *\n     * @var mixed|null\n     */";
if (strpos($patched, $expectedDocBlock) === false) {
    throw new RuntimeException('Le bloc de documentation attendu est manquant.');
}

$secondPass = a11ytb_patch_mon_ajax_search_index_manager_file($target);
if ($secondPass !== false) {
    throw new RuntimeException('Le correctif ne doit pas modifier un fichier déjà patché.');
}

a11ytb_patch_mon_ajax_search_index_manager_file('/path/to/does/not/exist');

return true;
