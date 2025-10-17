<?php
if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/../../');
}

$GLOBALS['__a11ytb_options'] = [];
$GLOBALS['__a11ytb_http_requests'] = [];
$GLOBALS['__a11ytb_http_responses'] = null;
$GLOBALS['__a11ytb_locale'] = 'fr_FR';
$GLOBALS['__a11ytb_users'] = [];
$GLOBALS['__a11ytb_user_meta'] = [];
$GLOBALS['__a11ytb_current_user'] = 0;
$GLOBALS['__a11ytb_cron_events'] = [];
$GLOBALS['__a11ytb_shortcodes'] = [];
$GLOBALS['wp_version'] = '6.2';

if (!function_exists('get_locale')) {
    function get_locale()
    {
        return $GLOBALS['__a11ytb_locale'] ?? 'en_US';
    }
}

if (!function_exists('determine_locale')) {
    function determine_locale()
    {
        return get_locale();
    }
}

if (!class_exists('WP_Error')) {
    class WP_Error
    {
        public $errors = [];
        public $error_data = [];

        public function __construct($code = '', $message = '', $data = [])
        {
            if ($code) {
                $this->errors[$code] = [$message];
                $this->error_data[$code] = $data;
            }
        }

        public function get_error_message($code = '')
        {
            if ($code && isset($this->errors[$code][0])) {
                return $this->errors[$code][0];
            }
            if ($code === '' && $this->errors) {
                $first = reset($this->errors);
                return $first[0] ?? '';
            }
            return '';
        }

        public function add_data($data, $code = '')
        {
            if ($code === '' && $this->errors) {
                $code = array_key_first($this->errors);
            }
            if ($code) {
                $this->error_data[$code] = array_merge($this->error_data[$code] ?? [], $data);
            }
        }
    }
}

if (!function_exists('is_wp_error')) {
    function is_wp_error($thing)
    {
        return $thing instanceof WP_Error;
    }
}

if (!class_exists('WP_REST_Server')) {
    class WP_REST_Server
    {
        public const READABLE = 'GET';
        public const CREATABLE = 'POST';
    }
}

if (!function_exists('add_action')) {
    function add_action($hook, $callback, $priority = 10, $accepted_args = 1)
    {
        // no-op for tests
    }
}

if (!function_exists('add_filter')) {
    function add_filter($hook, $callback, $priority = 10, $accepted_args = 1)
    {
        // no-op for tests
    }
}

if (!function_exists('add_shortcode')) {
    function add_shortcode($tag, $callback)
    {
        $GLOBALS['__a11ytb_shortcodes'][$tag] = $callback;
    }
}

if (!function_exists('shortcode_atts')) {
    function shortcode_atts($pairs, $atts, $shortcode = '')
    {
        $atts = (array) $atts;
        $out = [];
        foreach ($pairs as $name => $default) {
            $out[$name] = array_key_exists($name, $atts) ? $atts[$name] : $default;
        }
        return $out;
    }
}

if (!function_exists('do_action')) {
    function do_action($hook, ...$args)
    {
        // no-op
    }
}

if (!function_exists('apply_filters')) {
    function apply_filters($hook, $value)
    {
        return $value;
    }
}

if (!function_exists('register_activation_hook')) {
    function register_activation_hook($file, $callback)
    {
        // no-op
    }
}

if (!function_exists('register_deactivation_hook')) {
    function register_deactivation_hook($file, $callback)
    {
        // no-op
    }
}

if (!function_exists('plugin_basename')) {
    function plugin_basename($file)
    {
        return basename($file);
    }
}

if (!function_exists('plugin_dir_url')) {
    function plugin_dir_url($file)
    {
        return 'https://example.test/wp-content/plugins/a11y-toolbox-pro/';
    }
}

if (!function_exists('plugins_url')) {
    function plugins_url($path = '', $plugin = '')
    {
        $base = 'https://example.test/wp-content/plugins/a11y-toolbox-pro';
        $clean = ltrim($path, '/');
        return $clean ? $base . '/' . $clean : $base;
    }
}

if (!function_exists('wp_schedule_event')) {
    function wp_schedule_event($timestamp, $recurrence, $hook)
    {
        $GLOBALS['__a11ytb_cron_events'][$hook] = (int) $timestamp;
        return true;
    }
}

if (!function_exists('wp_next_scheduled')) {
    function wp_next_scheduled($hook)
    {
        return $GLOBALS['__a11ytb_cron_events'][$hook] ?? false;
    }
}

if (!function_exists('wp_unschedule_event')) {
    function wp_unschedule_event($timestamp, $hook)
    {
        unset($GLOBALS['__a11ytb_cron_events'][$hook]);
        return true;
    }
}

if (!function_exists('get_users')) {
    function get_users($args = [])
    {
        $ids = array_keys($GLOBALS['__a11ytb_users']);
        return array_map(static function ($id) {
            return (object) ['ID' => $id];
        }, $ids);
    }
}

if (!function_exists('get_user_meta')) {
    function get_user_meta($user_id, $key, $single = false)
    {
        $user_id = (int) $user_id;
        if (!isset($GLOBALS['__a11ytb_user_meta'][$user_id][$key])) {
            return $single ? '' : [];
        }
        $value = $GLOBALS['__a11ytb_user_meta'][$user_id][$key];
        if ($single) {
            return is_array($value) && isset($value[0]) ? $value[0] : $value;
        }
        return is_array($value) ? $value : [$value];
    }
}

if (!function_exists('update_user_meta')) {
    function update_user_meta($user_id, $key, $value)
    {
        $user_id = (int) $user_id;
        if (!isset($GLOBALS['__a11ytb_user_meta'][$user_id])) {
            $GLOBALS['__a11ytb_user_meta'][$user_id] = [];
        }
        $GLOBALS['__a11ytb_user_meta'][$user_id][$key] = $value;
        return true;
    }
}

if (!function_exists('delete_user_meta')) {
    function delete_user_meta($user_id, $key)
    {
        $user_id = (int) $user_id;
        unset($GLOBALS['__a11ytb_user_meta'][$user_id][$key]);
        return true;
    }
}

if (!function_exists('get_current_user_id')) {
    function get_current_user_id()
    {
        return (int) ($GLOBALS['__a11ytb_current_user'] ?? 0);
    }
}

if (!function_exists('wp_set_current_user')) {
    function wp_set_current_user($user_id)
    {
        $GLOBALS['__a11ytb_current_user'] = (int) $user_id;
    }
}

if (!function_exists('is_user_logged_in')) {
    function is_user_logged_in()
    {
        return get_current_user_id() > 0;
    }
}

if (!function_exists('admin_url')) {
    function admin_url($path = '')
    {
        return 'https://example.test/wp-admin/' . ltrim($path, '/');
    }
}

if (!function_exists('home_url')) {
    function home_url($path = '')
    {
        return 'https://example.test' . $path;
    }
}

if (!function_exists('rest_url')) {
    function rest_url($path = '')
    {
        return 'https://example.test/wp-json/' . ltrim($path, '/');
    }
}

if (!function_exists('__return_true')) {
    function __return_true()
    {
        return true;
    }
}

if (!function_exists('__')) {
    function __($text, $domain = null)
    {
        return $text;
    }
}

if (!function_exists('esc_html__')) {
    function esc_html__($text, $domain = null)
    {
        return $text;
    }
}

if (!function_exists('esc_html_e')) {
    function esc_html_e($text, $domain = null)
    {
        echo $text;
    }
}

if (!function_exists('esc_attr')) {
    function esc_attr($text)
    {
        return $text;
    }
}

if (!function_exists('esc_attr__')) {
    function esc_attr__($text, $domain = null)
    {
        return $text;
    }
}

if (!function_exists('esc_attr_e')) {
    function esc_attr_e($text, $domain = null)
    {
        echo $text;
    }
}

if (!function_exists('esc_url')) {
    function esc_url($url)
    {
        return $url;
    }
}

if (!function_exists('esc_url_raw')) {
    function esc_url_raw($url)
    {
        return $url;
    }
}

if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($text)
    {
        return trim(strip_tags((string) $text));
    }
}

if (!function_exists('sanitize_textarea_field')) {
    function sanitize_textarea_field($text)
    {
        return trim(strip_tags((string) $text));
    }
}

if (!function_exists('sanitize_key')) {
    function sanitize_key($key)
    {
        $key = strtolower((string) $key);
        return preg_replace('/[^a-z0-9_\-]/', '', $key);
    }
}

if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data, $options = 0)
    {
        return json_encode($data, $options);
    }
}

if (!function_exists('wp_salt')) {
    function wp_salt($scheme = 'auth')
    {
        return 'a11ytb-test-salt';
    }
}

if (!function_exists('wp_enqueue_style')) {
    function wp_enqueue_style(...$args)
    {
    }
}

if (!function_exists('wp_enqueue_script')) {
    function wp_enqueue_script(...$args)
    {
    }
}

if (!function_exists('wp_register_style')) {
    function wp_register_style(...$args)
    {
    }
}

if (!function_exists('wp_register_script')) {
    function wp_register_script(...$args)
    {
    }
}

if (!function_exists('wp_add_inline_script')) {
    function wp_add_inline_script(...$args)
    {
    }
}

if (!function_exists('wp_script_add_data')) {
    function wp_script_add_data(...$args)
    {
    }
}

if (!function_exists('did_action')) {
    function did_action($hook)
    {
        return 0;
    }
}

if (!function_exists('is_admin')) {
    function is_admin()
    {
        return false;
    }
}

if (!function_exists('current_user_can')) {
    function current_user_can($capability)
    {
        return false;
    }
}

if (!function_exists('wp_die')) {
    function wp_die($message = '', $title = '', $args = [])
    {
        throw new RuntimeException('wp_die called: ' . (is_string($message) ? $message : '')); 
    }
}

if (!function_exists('deactivate_plugins')) {
    function deactivate_plugins(...$args)
    {
    }
}

if (!function_exists('register_setting')) {
    function register_setting(...$args)
    {
    }
}

if (!function_exists('settings_errors')) {
    function settings_errors(...$args)
    {
    }
}

if (!function_exists('do_settings_sections')) {
    function do_settings_sections(...$args)
    {
    }
}

if (!function_exists('submit_button')) {
    function submit_button(...$args)
    {
    }
}

if (!function_exists('wp_nonce_field')) {
    function wp_nonce_field(...$args)
    {
        return '<input type="hidden" name="_wpnonce" value="nonce" />';
    }
}

if (!function_exists('wp_create_nonce')) {
    function wp_create_nonce($action = -1)
    {
        return 'nonce-' . md5((string) $action);
    }
}

if (!function_exists('wp_verify_nonce')) {
    function wp_verify_nonce($nonce, $action = -1)
    {
        return $nonce === 'nonce-' . md5((string) $action);
    }
}

if (!function_exists('wp_referer_field')) {
    function wp_referer_field(...$args)
    {
        return '';
    }
}

if (!function_exists('get_option')) {
    function get_option($name, $default = false)
    {
        return $GLOBALS['__a11ytb_options'][$name] ?? $default;
    }
}

if (!function_exists('add_option')) {
    function add_option($name, $value)
    {
        if (array_key_exists($name, $GLOBALS['__a11ytb_options'])) {
            return false;
        }
        $GLOBALS['__a11ytb_options'][$name] = $value;
        return true;
    }
}

if (!function_exists('update_option')) {
    function update_option($name, $value)
    {
        $GLOBALS['__a11ytb_options'][$name] = $value;
        return true;
    }
}

if (!function_exists('delete_option')) {
    function delete_option($name)
    {
        unset($GLOBALS['__a11ytb_options'][$name]);
        return true;
    }
}

if (!function_exists('wp_remote_post')) {
    function wp_remote_post($url, $args = [])
    {
        $GLOBALS['__a11ytb_http_requests'][] = ['url' => $url, 'args' => $args];
        if (is_callable($GLOBALS['__a11ytb_http_responses'])) {
            return call_user_func($GLOBALS['__a11ytb_http_responses'], $url, $args);
        }
        return ['response' => ['code' => 200], 'body' => ''];
    }
}

if (!function_exists('wp_remote_retrieve_response_code')) {
    function wp_remote_retrieve_response_code($response)
    {
        if (is_array($response) && isset($response['response']['code'])) {
            return (int) $response['response']['code'];
        }
        return 0;
    }
}

if (!function_exists('wp_remote_retrieve_body')) {
    function wp_remote_retrieve_body($response)
    {
        if (is_array($response) && isset($response['body'])) {
            return (string) $response['body'];
        }
        return '';
    }
}

if (!function_exists('register_rest_route')) {
    function register_rest_route($namespace, $route, $args)
    {
        $GLOBALS['__a11ytb_registered_routes'][] = [$namespace, $route, $args];
    }
}

if (!function_exists('rest_ensure_response')) {
    function rest_ensure_response($response)
    {
        return $response;
    }
}

function a11ytb_test_set_locale(string $locale): void
{
    $GLOBALS['__a11ytb_locale'] = $locale;
}

function a11ytb_test_create_user(?int $user_id = null): int
{
    if ($user_id === null) {
        $user_id = count($GLOBALS['__a11ytb_users']) + 1;
    }
    $user_id = max(1, (int) $user_id);
    $GLOBALS['__a11ytb_users'][$user_id] = ['ID' => $user_id];
    if (!isset($GLOBALS['__a11ytb_user_meta'][$user_id])) {
        $GLOBALS['__a11ytb_user_meta'][$user_id] = [];
    }

    return $user_id;
}

function a11ytb_test_set_current_user(?int $user_id): void
{
    $GLOBALS['__a11ytb_current_user'] = $user_id ? (int) $user_id : 0;
}

function a11ytb_test_reset_state(): void
{
    $GLOBALS['__a11ytb_options'] = [];
    $GLOBALS['__a11ytb_http_requests'] = [];
    $GLOBALS['__a11ytb_http_responses'] = null;
    $GLOBALS['__a11ytb_registered_routes'] = [];
    $GLOBALS['__a11ytb_locale'] = 'fr_FR';
    $GLOBALS['__a11ytb_users'] = [];
    $GLOBALS['__a11ytb_user_meta'] = [];
    $GLOBALS['__a11ytb_cron_events'] = [];
    $GLOBALS['__a11ytb_shortcodes'] = [];
    $GLOBALS['__a11ytb_current_user'] = 0;
}
