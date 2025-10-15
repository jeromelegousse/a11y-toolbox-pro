<?php
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$option_keys = [
    'a11ytb_enable_frontend',
    'a11ytb_default_dock',
    'a11ytb_default_view',
    'a11ytb_auto_open_panel',
    'a11ytb_gemini_quota',
    'a11ytb_gemini_api_key',
    'a11ytb_activity_webhook_url',
    'a11ytb_activity_webhook_token',
];

foreach ($option_keys as $option_key) {
    delete_option($option_key);
}
