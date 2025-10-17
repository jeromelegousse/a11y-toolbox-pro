<?php

a11ytb_test_reset_state();

$optionKeys = [
    'a11ytb_activity_webhook_url',
    'a11ytb_activity_webhook_token',
    'a11ytb_activity_jira_base_url',
    'a11ytb_activity_jira_project_key',
    'a11ytb_activity_jira_token',
    'a11ytb_activity_jira_issue_type',
    'a11ytb_activity_linear_api_key',
    'a11ytb_activity_linear_team_id',
    'a11ytb_activity_slack_webhook_url',
];

foreach ($optionKeys as $key) {
    update_option($key, 'persisted');
}

if (!defined('WP_UNINSTALL_PLUGIN')) {
    define('WP_UNINSTALL_PLUGIN', true);
}

require __DIR__ . '/../../uninstall.php';

foreach ($optionKeys as $key) {
    if (get_option($key, null) !== null) {
        throw new RuntimeException('Option non purgée : ' . $key);
    }
}

return true;
