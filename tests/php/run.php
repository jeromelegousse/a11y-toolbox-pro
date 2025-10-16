<?php
declare(strict_types=1);

require __DIR__ . '/support/stubs.php';

require_once __DIR__ . '/../../a11y-toolbox-pro.php';

a11ytb_test_reset_state();

$testFiles = glob(__DIR__ . '/*.test.php');
$failures = 0;

foreach ($testFiles as $file) {
    $label = basename($file);
    try {
        $result = require $file;
        if ($result === false) {
            throw new RuntimeException('Le test a retourné false.');
        }
        echo "[OK] {$label}\n";
    } catch (Throwable $throwable) {
        $failures += 1;
        fwrite(STDERR, "[FAIL] {$label}: " . $throwable->getMessage() . "\n");
    }

    a11ytb_test_reset_state();
}

if ($failures > 0) {
    exit(1);
}
