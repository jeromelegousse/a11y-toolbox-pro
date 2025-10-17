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
    'a11ytb_activity_jira_base_url',
    'a11ytb_activity_jira_project_key',
    'a11ytb_activity_jira_token',
    'a11ytb_activity_jira_issue_type',
    'a11ytb_activity_linear_api_key',
    'a11ytb_activity_linear_team_id',
    'a11ytb_activity_slack_webhook_url',
    'a11ytb_activity_sync_errors',
    'a11ytb_activity_sync_last_run',
];

foreach ($option_keys as $option_key) {
    delete_option($option_key);
}

if (function_exists('wp_next_scheduled') && function_exists('wp_unschedule_event')) {
    $timestamp = wp_next_scheduled('a11ytb/activity_sync');
    if ($timestamp) {
        wp_unschedule_event($timestamp, 'a11ytb/activity_sync');
    }
}

if (function_exists('get_users')) {
    $users = get_users(['fields' => ['ID']]);
    foreach ($users as $user) {
        $user_id = isset($user->ID) ? (int) $user->ID : (int) $user;
        if ($user_id <= 0) {
            continue;
        }
        delete_user_meta($user_id, 'a11ytb_preferences');
        delete_user_meta($user_id, 'a11ytb_activity_last_synced');
    }
}
