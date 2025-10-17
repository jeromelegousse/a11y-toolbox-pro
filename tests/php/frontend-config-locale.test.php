<?php

a11ytb_test_reset_state();

a11ytb_test_set_locale('fr_FR');

$config = a11ytb_get_frontend_config();
$defaults = $config['defaults'] ?? [];

if (($defaults['locale'] ?? null) !== 'fr_FR') {
    throw new RuntimeException('La locale front doit reprendre celle du site.');
}

a11ytb_test_set_locale('en_GB');

$config = a11ytb_get_frontend_config();
$defaults = $config['defaults'] ?? [];

if (($defaults['locale'] ?? null) !== 'en_GB') {
    throw new RuntimeException('Le changement de locale doit être reflété.');
}

return true;
