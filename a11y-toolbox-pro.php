<?php
/**
 * Plugin Name: A11y Toolbox Pro
 * Plugin URI: https://example.com/a11y-toolbox-pro
 * Description: Démontre la boîte à outils d’accessibilité front-end et l’intègre automatiquement sur le frontal WordPress.
 * Version: 1.0.0
 * Author: A11y Toolbox Pro
 * License: MIT
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Text Domain: a11ytb
 */

if (!defined('ABSPATH')) {
    exit;
}

const A11YTB_PLUGIN_VERSION = '1.0.0';
const A11YTB_MIN_WP_VERSION = '6.2';
const A11YTB_MIN_PHP_VERSION = '7.4';

/**
 * Charge le textdomain du plugin.
 */
function a11ytb_load_textdomain(): void
{
    load_plugin_textdomain('a11ytb', false, dirname(plugin_basename(__FILE__)) . '/languages');
}
add_action('plugins_loaded', 'a11ytb_load_textdomain');

/**
 * Retourne la liste des erreurs de prérequis.
 *
 * @return string[]
 */
function a11ytb_get_requirement_errors(): array
{
    global $wp_version;

    $errors = [];

    if (version_compare(PHP_VERSION, A11YTB_MIN_PHP_VERSION, '<')) {
        $errors[] = sprintf(
            /* translators: %s: version PHP minimale */
            esc_html__('PHP %s ou supérieur est requis.', 'a11ytb'),
            A11YTB_MIN_PHP_VERSION
        );
    }

    if (version_compare((string) $wp_version, A11YTB_MIN_WP_VERSION, '<')) {
        $errors[] = sprintf(
            /* translators: %s: version WordPress minimale */
            esc_html__('WordPress %s ou supérieur est requis.', 'a11ytb'),
            A11YTB_MIN_WP_VERSION
        );
    }

    return $errors;
}

/**
 * Initialise les options du plugin lors de l’activation.
 */
function a11ytb_initialize_options(): void
{
    $defaults = [
        'a11ytb_enable_frontend' => '1',
        'a11ytb_default_dock' => 'right',
        'a11ytb_default_view' => 'modules',
        'a11ytb_auto_open_panel' => '0',
        'a11ytb_gemini_quota' => 15,
        'a11ytb_gemini_api_key' => '',
        'a11ytb_activity_webhook_url' => '',
        'a11ytb_activity_webhook_token' => '',
        'a11ytb_activity_jira_base_url' => '',
        'a11ytb_activity_jira_project_key' => '',
        'a11ytb_activity_jira_token' => '',
        'a11ytb_activity_jira_issue_type' => '',
        'a11ytb_activity_linear_api_key' => '',
        'a11ytb_activity_linear_team_id' => '',
        'a11ytb_activity_slack_webhook_url' => '',
    ];

    foreach ($defaults as $key => $value) {
        if (get_option($key, null) === null) {
            add_option($key, $value);
        }
    }
}

/**
 * Affiche un avis en cas d’environnement incompatible.
 */
function a11ytb_render_requirements_notice(): void
{
    if (!current_user_can('activate_plugins')) {
        return;
    }

    $errors = a11ytb_get_requirement_errors();
    if (!$errors) {
        return;
    }

    $items = array_map(static function ($message) {
        return '<li>' . esc_html($message) . '</li>';
    }, $errors);

    echo '<div class="notice notice-error"><p><strong>' . esc_html__('A11y Toolbox Pro ne peut pas fonctionner :', 'a11ytb') . '</strong></p><ul>' . implode('', $items) . '</ul></div>';
}

add_action('admin_notices', 'a11ytb_render_requirements_notice');

/**
 * Vérifie les prérequis lors de l’activation.
 */
function a11ytb_on_activation(): void
{
    $errors = a11ytb_get_requirement_errors();
    if ($errors) {
        if (!function_exists('deactivate_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        deactivate_plugins(plugin_basename(__FILE__), true);

        $items = array_map(static function ($message) {
            return '<li>' . esc_html($message) . '</li>';
        }, $errors);

        $message = '<p><strong>' . esc_html__('A11y Toolbox Pro ne peut pas être activé :', 'a11ytb') . '</strong></p>';
        $message .= '<ul>' . implode('', $items) . '</ul>';

        wp_die(
            wp_kses_post($message),
            esc_html__('Activation impossible', 'a11ytb'),
            ['back_link' => true]
        );
    }

    a11ytb_initialize_options();
    a11ytb_schedule_activity_sync();
}
register_activation_hook(__FILE__, 'a11ytb_on_activation');

/**
 * Nettoie l’état planifié lors de la désactivation.
 */
function a11ytb_on_deactivation(): void
{
    a11ytb_clear_activity_sync_schedule();
}
register_deactivation_hook(__FILE__, 'a11ytb_on_deactivation');

/**
 * Ajoute un lien vers la page de réglages depuis la liste des extensions.
 *
 * @param string[] $links
 * @return string[]
 */
function a11ytb_register_plugin_action_links(array $links): array
{
    $settings_url = admin_url('admin.php?page=a11y-toolbox-pro');
    $settings_link = '<a href="' . esc_url($settings_url) . '">' . esc_html__('Réglages', 'a11ytb') . '</a>';
    array_unshift($links, $settings_link);

    return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'a11ytb_register_plugin_action_links');

/**
 * Retourne la clé de chiffrement dérivée des salts WordPress.
 */
function a11ytb_get_secret_encryption_key(): string
{
    static $derived = null;

    if (is_string($derived)) {
        return $derived;
    }

    $salt = wp_salt('a11ytb_gemini_api_key');

    if (function_exists('sodium_crypto_generichash') && defined('SODIUM_CRYPTO_SECRETBOX_KEYBYTES')) {
        $derived = sodium_crypto_generichash($salt, '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
    } else {
        $derived = hash('sha256', $salt, true);
    }

    return $derived;
}

/**
 * Chiffre un secret en utilisant Sodium ou OpenSSL selon disponibilité.
 */
function a11ytb_encrypt_secret(string $secret): ?string
{
    if ($secret === '') {
        return '';
    }

    $key = a11ytb_get_secret_encryption_key();

    if (
        function_exists('sodium_crypto_secretbox')
        && defined('SODIUM_CRYPTO_SECRETBOX_NONCEBYTES')
        && defined('SODIUM_CRYPTO_SECRETBOX_KEYBYTES')
    ) {
        try {
            $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        } catch (Exception $exception) {
            $nonce = false;
        }

        if ($nonce !== false) {
            $ciphertext = sodium_crypto_secretbox($secret, $nonce, $key);

            return 's:' . base64_encode($nonce . $ciphertext);
        }
    }

    if (function_exists('openssl_encrypt')) {
        try {
            $iv = random_bytes(12);
        } catch (Exception $exception) {
            $iv = false;
        }

        if ($iv !== false) {
            $tag = '';
            $ciphertext = openssl_encrypt($secret, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);

            if ($ciphertext !== false && is_string($tag)) {
                return 'o1:' . base64_encode($iv . $tag . $ciphertext);
            }
        }

        try {
            $iv = random_bytes(16);
        } catch (Exception $exception) {
            $iv = false;
        }

        if ($iv !== false) {
            $ciphertext = openssl_encrypt($secret, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);

            if ($ciphertext !== false) {
                $mac = hash_hmac('sha256', $ciphertext, $key, true);

                return 'o2:' . base64_encode($iv . $mac . $ciphertext);
            }
        }
    }

    return null;
}

/**
 * Déchiffre un secret précédemment chiffré.
 */
function a11ytb_decrypt_secret($value): ?string
{
    if (!is_string($value) || $value === '') {
        return '';
    }

    $prefix = substr($value, 0, 3);
    $payload = substr($value, 3);

    if (strpos($value, 's:') === 0) {
        if (
            !function_exists('sodium_crypto_secretbox_open')
            || !defined('SODIUM_CRYPTO_SECRETBOX_NONCEBYTES')
        ) {
            return null;
        }

        $encoded = substr($value, 2);
        $decoded = base64_decode($encoded, true);

        if ($decoded === false || strlen($decoded) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return null;
        }

        $nonce = substr($decoded, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = substr($decoded, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $key = a11ytb_get_secret_encryption_key();
        $plaintext = sodium_crypto_secretbox_open($ciphertext, $nonce, $key);

        return $plaintext === false ? null : $plaintext;
    }

    if ($prefix === 'o1:') {
        if (!function_exists('openssl_decrypt')) {
            return null;
        }

        $decoded = base64_decode($payload, true);

        if ($decoded === false || strlen($decoded) <= 28) {
            return null;
        }

        $iv = substr($decoded, 0, 12);
        $tag = substr($decoded, 12, 16);
        $ciphertext = substr($decoded, 28);
        $key = a11ytb_get_secret_encryption_key();
        $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);

        return $plaintext === false ? null : $plaintext;
    }

    if ($prefix === 'o2:') {
        if (!function_exists('openssl_decrypt')) {
            return null;
        }

        $decoded = base64_decode($payload, true);

        if ($decoded === false || strlen($decoded) <= 48) {
            return null;
        }

        $iv = substr($decoded, 0, 16);
        $mac = substr($decoded, 16, 32);
        $ciphertext = substr($decoded, 48);
        $key = a11ytb_get_secret_encryption_key();
        $calculated_mac = hash_hmac('sha256', $ciphertext, $key, true);

        if (!hash_equals($mac, $calculated_mac)) {
            return null;
        }

        $plaintext = openssl_decrypt($ciphertext, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);

        return $plaintext === false ? null : $plaintext;
    }

    return $value;
}

/**
 * Enregistre les ressources communes utilisées par le plugin.
 */
function a11ytb_register_assets(): void
{
    $plugin_url = plugin_dir_url(__FILE__);

    wp_register_style(
        'a11ytb/design-tokens',
        $plugin_url . 'src/css/design-tokens.css',
        [],
        A11YTB_PLUGIN_VERSION
    );

    wp_register_style(
        'a11ytb/styles',
        $plugin_url . 'src/css/styles.css',
        ['a11ytb/design-tokens'],
        A11YTB_PLUGIN_VERSION
    );

    wp_register_style(
        'a11ytb/blocks',
        $plugin_url . 'assets/blocks.css',
        [],
        A11YTB_PLUGIN_VERSION
    );

    wp_register_script(
        'a11ytb/app',
        $plugin_url . 'src/main.js',
        [],
        A11YTB_PLUGIN_VERSION,
        true
    );

    wp_register_script(
        'a11ytb/block-embed',
        $plugin_url . 'assets/block-embed.js',
        ['a11ytb/app'],
        A11YTB_PLUGIN_VERSION,
        true
    );

    wp_register_script(
        'a11ytb/block-editor',
        $plugin_url . 'assets/block-editor.js',
        ['wp-blocks', 'wp-element', 'wp-components', 'wp-i18n', 'wp-block-editor'],
        A11YTB_PLUGIN_VERSION,
        true
    );

    if (function_exists('wp_script_add_data')) {
        wp_script_add_data('a11ytb/app', 'type', 'module');
    }
}
add_action('init', 'a11ytb_register_assets');

/**
 * Force le type "module" sur le script si la fonction d’aide de WordPress n’est pas disponible.
 */
function a11ytb_filter_script_tag($tag, $handle, $src): string
{
    if ($handle !== 'a11ytb/app') {
        return $tag;
    }

    if (strpos($tag, 'type="module"') !== false) {
        return $tag;
    }

    if (false === strpos($tag, ' src=')) {
        return $tag;
    }

    return str_replace(' src=', ' type="module" src=', $tag);
}
add_filter('script_loader_tag', 'a11ytb_filter_script_tag', 10, 3);

/**
 * Determine si le plugin doit être actif sur la requête courante.
 *
 * @return bool
 */
function a11ytb_is_enabled(): bool
{
    /**
     * Permet de désactiver l’injection du plugin via un filtre.
     *
     * @param bool $enabled Vrai par défaut.
     */
    return (bool) apply_filters('a11ytb/is_enabled', true);
}

/**
 * Enfile les ressources front-end nécessaires à l’interface.
 */
function a11ytb_enqueue_frontend_assets(): void
{
    if (is_admin() || !a11ytb_is_enabled()) {
        return;
    }

    wp_enqueue_style('a11ytb/styles');
    wp_enqueue_script('a11ytb/app');

    $config = a11ytb_get_frontend_config();
    wp_add_inline_script(
        'a11ytb/app',
        'window.a11ytbPluginConfig = ' . wp_json_encode($config) . ';',
        'before'
    );

}
add_action('wp_enqueue_scripts', 'a11ytb_enqueue_frontend_assets');

/**
 * Normalise les valeurs booléennes issues des formulaires d’options.
 */
function a11ytb_sanitize_checkbox($value): string
{
    return $value ? '1' : '0';
}

/**
 * Valide la position du dock (gauche/droite/bas).
 */
function a11ytb_sanitize_dock($value): string
{
    $allowed = ['left', 'right', 'bottom'];
    $candidate = is_string($value) ? strtolower($value) : '';
    return in_array($candidate, $allowed, true) ? $candidate : 'right';
}

/**
 * Valide la vue active par défaut.
 */
function a11ytb_sanitize_view($value): string
{
    $allowed = ['modules', 'options', 'organize', 'guides', 'shortcuts'];
    $candidate = is_string($value) ? strtolower($value) : '';
    return in_array($candidate, $allowed, true) ? $candidate : 'modules';
}

/**
 * Nettoie une clé API ou un secret.
 */
function a11ytb_sanitize_secret_option($value, string $option_name): string
{
    if (!is_string($value)) {
        return '';
    }

    $normalized = sanitize_text_field(trim($value));

    if ($normalized === '') {
        return '';
    }

    $encrypted = a11ytb_encrypt_secret($normalized);

    if (is_string($encrypted)) {
        return $encrypted;
    }

    add_settings_error(
        'a11ytb_options',
        'a11ytb_options_encryption_error_' . sanitize_key($option_name),
        esc_html__('Impossible de chiffrer la valeur fournie. La valeur précédente a été conservée.', 'a11ytb'),
        'error'
    );

    $previous = get_option($option_name, '');

    return is_string($previous) ? $previous : '';
}

function a11ytb_sanitize_secret($value): string
{
    return a11ytb_sanitize_secret_option($value, 'a11ytb_gemini_api_key');
}

function a11ytb_sanitize_activity_webhook_token($value): string
{
    return a11ytb_sanitize_secret_option($value, 'a11ytb_activity_webhook_token');
}

function a11ytb_sanitize_webhook_url($value): string
{
    if (!is_string($value)) {
        return '';
    }

    $normalized = trim($value);

    if ($normalized === '') {
        return '';
    }

    $sanitized = esc_url_raw($normalized);

    if ($sanitized !== '') {
        return $sanitized;
    }

    add_settings_error(
        'a11ytb_options',
        'a11ytb_activity_webhook_url_invalid',
        esc_html__('URL de webhook invalide. La valeur précédente a été conservée.', 'a11ytb'),
        'error'
    );

    $previous = get_option('a11ytb_activity_webhook_url', '');

    return is_string($previous) ? $previous : '';
}

/**
 * Sanitize le quota (nombre entier positif).
 */
function a11ytb_sanitize_quota($value): int
{
    $int = is_numeric($value) ? (int) $value : 0;

    return max(0, $int);
}

/**
 * Enregistre les réglages personnalisables dans l’administration.
 */
function a11ytb_register_settings(): void
{
    register_setting(
        'a11ytb_settings',
        'a11ytb_enable_frontend',
        [
            'type' => 'string',
            'default' => '1',
            'sanitize_callback' => 'a11ytb_sanitize_checkbox',
        ]
    );

    register_setting(
        'a11ytb_settings',
        'a11ytb_default_dock',
        [
            'type' => 'string',
            'default' => 'right',
            'sanitize_callback' => 'a11ytb_sanitize_dock',
        ]
    );

    register_setting(
        'a11ytb_settings',
        'a11ytb_default_view',
        [
            'type' => 'string',
            'default' => 'modules',
            'sanitize_callback' => 'a11ytb_sanitize_view',
        ]
    );

    register_setting(
        'a11ytb_settings',
        'a11ytb_auto_open_panel',
        [
            'type' => 'string',
            'default' => '0',
            'sanitize_callback' => 'a11ytb_sanitize_checkbox',
        ]
    );

    add_settings_section(
        'a11ytb_section_general',
        __('Activation & diffusion', 'a11ytb'),
        'a11ytb_render_general_section',
        'a11ytb_settings_page'
    );

    add_settings_section(
        'a11ytb_section_interface',
        __('Expérience utilisateur', 'a11ytb'),
        'a11ytb_render_interface_section',
        'a11ytb_settings_page'
    );

    add_settings_section(
        'a11ytb_section_integrations',
        __('Intégrations vocales & IA', 'a11ytb'),
        'a11ytb_render_integrations_section',
        'a11ytb_settings_page'
    );

    add_settings_field(
        'a11ytb_enable_frontend',
        __('Injection automatique', 'a11ytb'),
        'a11ytb_render_enable_frontend_field',
        'a11ytb_settings_page',
        'a11ytb_section_general',
        ['label_for' => 'a11ytb_enable_frontend']
    );

    add_settings_field(
        'a11ytb_default_dock',
        __('Position du dock', 'a11ytb'),
        'a11ytb_render_default_dock_field',
        'a11ytb_settings_page',
        'a11ytb_section_interface',
        ['label_for' => 'a11ytb_default_dock']
    );

    add_settings_field(
        'a11ytb_default_view',
        __('Vue affichée à l’ouverture', 'a11ytb'),
        'a11ytb_render_default_view_field',
        'a11ytb_settings_page',
        'a11ytb_section_interface',
        ['label_for' => 'a11ytb_default_view']
    );

    add_settings_field(
        'a11ytb_auto_open_panel',
        __('Ouvrir la boîte à outils au chargement', 'a11ytb'),
        'a11ytb_render_auto_open_field',
        'a11ytb_settings_page',
        'a11ytb_section_interface',
        ['label_for' => 'a11ytb_auto_open_panel']
    );

}
add_action('admin_init', 'a11ytb_register_settings');

/**
 * Retourne la valeur normalisée pour la position du dock.
 */
function a11ytb_normalize_dock_option(?string $value = null): string
{
    return a11ytb_sanitize_dock($value ?? get_option('a11ytb_default_dock', 'right'));
}

/**
 * Retourne la valeur normalisée pour la vue par défaut.
 */
function a11ytb_normalize_view_option(?string $value = null): string
{
    return a11ytb_sanitize_view($value ?? get_option('a11ytb_default_view', 'modules'));
}

/**
 * Crée un résumé partiellement masqué d’une clé API.
 */
function a11ytb_mask_secret(string $secret): string
{
    $length = strlen($secret);
    if ($length <= 8) {
        return str_repeat('•', max(0, $length - 2)) . substr($secret, -2);
    }

    return substr($secret, 0, 4) . str_repeat('•', $length - 8) . substr($secret, -4);
}

/**
 * Section : rappel sur l’activation automatique.
 */
function a11ytb_render_general_section(): void
{
    echo '<p class="description">' . esc_html__('Choisissez si la barre latérale est injectée automatiquement sur l’intégralité du site ou uniquement via vos filtres.', 'a11ytb') . '</p>';
}

/**
 * Section : paramètres d’expérience utilisateur.
 */
function a11ytb_render_interface_section(): void
{
    echo '<p class="description">' . esc_html__('Définissez les préférences par défaut pour le bouton flottant et l’interface afin d’offrir une expérience cohérente aux visiteurs.', 'a11ytb') . '</p>';
}

/**
 * Section : paramètres liés aux services Gemini et assimilés.
 */
function a11ytb_render_integrations_section(): void
{
    echo '<p class="description">' . esc_html__('Renseignez vos identifiants Gemini pour activer la dictée assistée ou les fonctionnalités IA prévues par la feuille de route.', 'a11ytb') . '</p>';
}

/**
 * Case à cocher pour activer/désactiver l’injection automatique.
 */
function a11ytb_render_enable_frontend_field(): void
{
    $enabled = get_option('a11ytb_enable_frontend', '1') === '1';
    ?>
    <label for="a11ytb_enable_frontend">
        <input type="checkbox" id="a11ytb_enable_frontend" name="a11ytb_enable_frontend" value="1" <?php checked($enabled); ?> />
        <?php esc_html_e('Activer l’injection de la boîte à outils sur toutes les pages publiques.', 'a11ytb'); ?>
    </label>
    <p class="description"><?php esc_html_e('Décochez pour ne charger la barre latérale que lorsque vous l’autorisez via le filtre « a11ytb/is_enabled ».', 'a11ytb'); ?></p>
    <?php
}

/**
 * Liste déroulante pour le dock par défaut.
 */
function a11ytb_render_default_dock_field(): void
{
    $value = a11ytb_normalize_dock_option();
    ?>
    <select id="a11ytb_default_dock" name="a11ytb_default_dock">
        <option value="right" <?php selected($value, 'right'); ?>><?php esc_html_e('Dock à droite (par défaut)', 'a11ytb'); ?></option>
        <option value="left" <?php selected($value, 'left'); ?>><?php esc_html_e('Dock à gauche', 'a11ytb'); ?></option>
        <option value="bottom" <?php selected($value, 'bottom'); ?>><?php esc_html_e('Barre en bas de page', 'a11ytb'); ?></option>
    </select>
    <p class="description"><?php esc_html_e('Détermine la position initiale du panneau avant que l’utilisateur ne le personnalise.', 'a11ytb'); ?></p>
    <?php
}

/**
 * Liste déroulante pour la vue ouverte par défaut.
 */
function a11ytb_render_default_view_field(): void
{
    $value = a11ytb_normalize_view_option();
    ?>
    <select id="a11ytb_default_view" name="a11ytb_default_view">
        <option value="modules" <?php selected($value, 'modules'); ?>><?php esc_html_e('Modules & actions rapides', 'a11ytb'); ?></option>
        <option value="options" <?php selected($value, 'options'); ?>><?php esc_html_e('Options & Profils', 'a11ytb'); ?></option>
        <option value="organize" <?php selected($value, 'organize'); ?>><?php esc_html_e('Organisation & priorisation', 'a11ytb'); ?></option>
        <option value="guides" <?php selected($value, 'guides'); ?>><?php esc_html_e('Guides interactifs', 'a11ytb'); ?></option>
        <option value="shortcuts" <?php selected($value, 'shortcuts'); ?>><?php esc_html_e('Raccourcis clavier', 'a11ytb'); ?></option>
    </select>
    <p class="description"><?php esc_html_e('Sélectionnez la vue à mettre en avant lorsqu’un visiteur ouvre la boîte à outils.', 'a11ytb'); ?></p>
    <?php
}

/**
 * Case à cocher pour ouvrir le panneau automatiquement.
 */
function a11ytb_render_auto_open_field(): void
{
    $auto_open = get_option('a11ytb_auto_open_panel', '0') === '1';
    ?>
    <label for="a11ytb_auto_open_panel">
        <input type="checkbox" id="a11ytb_auto_open_panel" name="a11ytb_auto_open_panel" value="1" <?php checked($auto_open); ?> />
        <?php esc_html_e('Afficher automatiquement la boîte à outils au premier chargement.', 'a11ytb'); ?>
    </label>
    <p class="description"><?php esc_html_e('Idéal pour mettre en avant un onboarding ou un profil recommandé lors d’une campagne.', 'a11ytb'); ?></p>
    <?php
}

/**
 * Champ pour la clé API Gemini.
 */
function a11ytb_render_gemini_key_field(): void
{
    $stored = get_option('a11ytb_gemini_api_key', '');
    $decrypted = a11ytb_decrypt_secret($stored);
    $decryption_failed = ($stored !== '' && $decrypted === null);
    $value = ($decrypted === null) ? '' : (string) $decrypted;
    ?>
    <input type="password" id="a11ytb_gemini_api_key" name="a11ytb_gemini_api_key" value="<?php echo esc_attr($value); ?>" autocomplete="off" class="regular-text" />
    <p class="description">
        <?php
        if ($value !== '') {
            printf(
                /* translators: %s: masked api key */
                esc_html__('Clé actuelle : %s', 'a11ytb'),
                esc_html(a11ytb_mask_secret($value))
            );
            echo '<br />';
        }
        if ($decryption_failed) {
            esc_html_e('La clé enregistrée n’a pas pu être déchiffrée. Veuillez vérifier vos salts WordPress ou saisir une nouvelle valeur.', 'a11ytb');
            echo '<br />';
        }
        esc_html_e('Les clés sont chiffrées via les salts WordPress avant d’être stockées en base de données.', 'a11ytb');
        ?>
    </p>
    <?php
}

/**
 * Champ pour suivre le quota Gemini.
 */
function a11ytb_render_gemini_quota_field(): void
{
    $value = (int) get_option('a11ytb_gemini_quota', 15);
    ?>
    <input type="number" id="a11ytb_gemini_quota" name="a11ytb_gemini_quota" value="<?php echo esc_attr($value); ?>" min="0" step="1" class="small-text" />
    <p class="description"><?php esc_html_e('Notez ici votre quota gratuit restant (15 requêtes/minute offertes sur Gemini 1.5 Flash).', 'a11ytb'); ?></p>
    <?php
}

/**
 * Applique l’option « activation globale » au filtre principal.
 */
function a11ytb_apply_enable_option(bool $enabled): bool
{
    if (get_option('a11ytb_enable_frontend', '1') !== '1') {
        return false;
    }

    return $enabled;
}
add_filter('a11ytb/is_enabled', 'a11ytb_apply_enable_option');

/**
 * Retourne la locale du site à exposer côté front.
 */
function a11ytb_get_site_locale(): string
{
    $locale = '';

    if (function_exists('determine_locale')) {
        $locale = (string) determine_locale();
    } elseif (function_exists('get_locale')) {
        $locale = (string) get_locale();
    }

    if ($locale === '') {
        $locale = 'fr_FR';
    }

    /**
     * Permet de modifier la locale exposée à l’application front-end.
     *
     * @param string $locale Locale WordPress détectée.
     */
    return (string) apply_filters('a11ytb/default_locale', $locale);
}

/**
 * Retourne la clé méta utilisée pour stocker les préférences synchronisées.
 */
function a11ytb_get_preferences_meta_key(): string
{
    return 'a11ytb_preferences';
}

/**
 * Retourne la clé méta mémorisant la dernière activité synchronisée.
 */
function a11ytb_get_activity_last_synced_meta_key(): string
{
    return 'a11ytb_activity_last_synced';
}

/**
 * Retourne la liste des racines autorisées dans la persistance des préférences.
 *
 * @return string[]
 */
function a11ytb_allowed_preference_roots(): array
{
    return [
        'ui',
        'audio',
        'contrast',
        'spacing',
        'tts',
        'stt',
        'braille',
        'profiles',
        'collaboration',
    ];
}

/**
 * Nettoie le tableau de préférences côté serveur.
 *
 * @param array|mixed $payload
 * @return array<string, mixed>
 */
function a11ytb_sanitize_preferences_payload($payload): array
{
    $allowed = a11ytb_allowed_preference_roots();
    $result = [];

    if (!is_array($payload)) {
        return $result;
    }

    foreach ($allowed as $key) {
        if (array_key_exists($key, $payload)) {
            $result[$key] = $payload[$key];
        }
    }

    return $result;
}

/**
 * Normalise les métadonnées associées aux préférences synchronisées.
 *
 * @param array|mixed $meta
 * @return array{updatedAt:int}
 */
function a11ytb_normalize_preferences_meta($meta): array
{
    $normalized = [];

    if (is_array($meta) && array_key_exists('updatedAt', $meta)) {
        $normalized['updatedAt'] = max(0, (int) $meta['updatedAt']);
    }

    if (!array_key_exists('updatedAt', $normalized)) {
        $normalized['updatedAt'] = (int) floor(microtime(true) * 1000);
    }

    return $normalized;
}

/**
 * Récupère les préférences synchronisées d’un utilisateur donné.
 *
 * @return array{data:array<string,mixed>,meta:array{updatedAt:int}}
 */
function a11ytb_get_user_preferences(int $user_id): array
{
    $raw = get_user_meta($user_id, a11ytb_get_preferences_meta_key(), true);
    $decoded = null;

    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
    } elseif (is_array($raw)) {
        $decoded = $raw;
    }

    if (!is_array($decoded)) {
        $decoded = [];
    }

    $data = a11ytb_sanitize_preferences_payload($decoded['data'] ?? $decoded);
    $meta = a11ytb_normalize_preferences_meta($decoded['meta'] ?? []);

    return [
        'data' => $data,
        'meta' => $meta,
    ];
}

/**
 * Enregistre les préférences synchronisées pour un utilisateur.
 */
function a11ytb_store_user_preferences(int $user_id, array $data, array $meta = []): void
{
    $record = [
        'data' => a11ytb_sanitize_preferences_payload($data),
        'meta' => a11ytb_normalize_preferences_meta($meta),
    ];

    update_user_meta($user_id, a11ytb_get_preferences_meta_key(), $record);
}

/**
 * Vérifie qu’un utilisateur authentifié peut synchroniser ses préférences.
 */
function a11ytb_preferences_permission_callback(): bool
{
    return function_exists('is_user_logged_in') ? is_user_logged_in() : false;
}

/**
 * Construit l’URL publique d’accès aux préférences synchronisées.
 */
function a11ytb_get_preferences_endpoint(): string
{
    if (function_exists('rest_url')) {
        return rest_url('a11ytb/v1/preferences');
    }

    if (function_exists('home_url')) {
        return home_url('/wp-json/a11ytb/v1/preferences');
    }

    return '/wp-json/a11ytb/v1/preferences';
}

/**
 * Retourne les préférences de l’utilisateur courant.
 *
 * @param WP_REST_Request|array<string,mixed>|null $request
 * @return array|WP_Error
 */
function a11ytb_rest_get_preferences($request)
{
    if (!a11ytb_preferences_permission_callback()) {
        $status = function_exists('rest_authorization_required_code')
            ? rest_authorization_required_code()
            : 401;

        return new WP_Error(
            'rest_forbidden',
            __('Authentification requise pour accéder aux préférences.', 'a11ytb'),
            ['status' => $status]
        );
    }

    $user_id = function_exists('get_current_user_id') ? (int) get_current_user_id() : 0;
    if ($user_id <= 0) {
        return new WP_Error('rest_forbidden', __('Utilisateur inconnu.', 'a11ytb'), ['status' => 401]);
    }

    $payload = a11ytb_get_user_preferences($user_id);

    return rest_ensure_response([
        'data' => $payload['data'],
        'meta' => $payload['meta'],
    ]);
}

/**
 * Met à jour les préférences de l’utilisateur courant.
 *
 * @param WP_REST_Request|array<string,mixed>|null $request
 * @return array|WP_Error
 */
function a11ytb_rest_update_preferences($request)
{
    if (!a11ytb_preferences_permission_callback()) {
        $status = function_exists('rest_authorization_required_code')
            ? rest_authorization_required_code()
            : 401;

        return new WP_Error(
            'rest_forbidden',
            __('Authentification requise pour synchroniser les préférences.', 'a11ytb'),
            ['status' => $status]
        );
    }

    $user_id = function_exists('get_current_user_id') ? (int) get_current_user_id() : 0;
    if ($user_id <= 0) {
        return new WP_Error('rest_forbidden', __('Utilisateur inconnu.', 'a11ytb'), ['status' => 401]);
    }

    $params = [];
    if (is_object($request) && method_exists($request, 'get_json_params')) {
        $params = $request->get_json_params();
    } elseif (is_object($request) && method_exists($request, 'get_body')) {
        $params = json_decode((string) $request->get_body(), true) ?: [];
    } elseif (is_array($request)) {
        $params = $request;
    }

    if (!is_array($params)) {
        $params = [];
    }

    $data = a11ytb_sanitize_preferences_payload($params['data'] ?? []);
    $meta = a11ytb_normalize_preferences_meta($params['meta'] ?? []);

    a11ytb_store_user_preferences($user_id, $data, $meta);

    return rest_ensure_response([
        'success' => true,
        'data' => $data,
        'meta' => $meta,
    ]);
}

/**
 * Déclare la route REST permettant de lire/écrire les préférences utilisateurs.
 */
function a11ytb_register_preferences_route(): void
{
    $readable = defined('WP_REST_Server::READABLE') ? WP_REST_Server::READABLE : 'GET';
    $creatable = defined('WP_REST_Server::CREATABLE') ? WP_REST_Server::CREATABLE : 'POST';

    register_rest_route(
        'a11ytb/v1',
        '/preferences',
        [
            [
                'methods' => $readable,
                'callback' => 'a11ytb_rest_get_preferences',
                'permission_callback' => 'a11ytb_preferences_permission_callback',
            ],
            [
                'methods' => $creatable,
                'callback' => 'a11ytb_rest_update_preferences',
                'permission_callback' => 'a11ytb_preferences_permission_callback',
            ],
        ]
    );
}
add_action('rest_api_init', 'a11ytb_register_preferences_route');

/**
 * Construit la configuration exposée au frontal pour la synchronisation des préférences.
 */
function a11ytb_get_preferences_integration_config(): array
{
    $enabled = a11ytb_preferences_permission_callback();

    if (!$enabled) {
        return ['enabled' => false];
    }

    return [
        'enabled' => true,
        'endpoint' => a11ytb_get_preferences_endpoint(),
        'nonce' => function_exists('wp_create_nonce') ? wp_create_nonce('wp_rest') : '',
        'throttleMs' => 4000,
    ];
}

/**
 * @deprecated 1.19.0  Utilisez a11ytb_get_preferences_integration_config().
 */
function a11ytb_get_preferences_sync_config(): array
{
    if (function_exists('_deprecated_function')) {
        _deprecated_function(__FUNCTION__, '1.19.0', 'a11ytb_get_preferences_integration_config');
    }

    return a11ytb_get_preferences_integration_config();
}

/**
 * Retourne les définitions des déclencheurs inline à partir du manifeste JSON.
 *
 * @return array<string, array<string, mixed>>
 */
function a11ytb_get_inline_block_definitions(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $cache = [];
    $path = plugin_dir_path(__FILE__) . 'blocks/blocks.json';
    if (!file_exists($path)) {
        return $cache;
    }

    $raw = file_get_contents($path);
    if (!is_string($raw)) {
        return $cache;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || empty($decoded['blocks']) || !is_array($decoded['blocks'])) {
        return $cache;
    }

    $iconMap = [
        'audit' => '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v3h3v13h-8v-3h-2v3H3zm2 2v11h4v-3h6v3h4V10h-3V7H5zm9 1V5H5v3z"/></svg>',
        'tts' => '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 9v6h3l4 4V5L7 9H4zm13 3a3 3 0 00-3-3v6a3 3 0 003-3zm-3-6.9v2.07a5 5 0 010 9.66V18a7 7 0 000-13.9z"/></svg>',
        'stt' => '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm5-3a1 1 0 012 0 7 7 0 01-6 6.92V21h3v1H8v-1h3v-3.08A7 7 0 015 11a1 1 0 012 0 5 5 0 0010 0z"/></svg>',
        'braille' => '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M6 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 11 0-4 2 2 0 010 4zm12-14a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4z"/></svg>',
        'contrast' => '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 2a10 10 0 100 20V2z"/></svg>',
        'spacing' => '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M7 4h10v2H7V4zm-2 5h14v2H5V9zm3 5h8v2H8v-2zm-3 5h14v2H5v-2z"/></svg>',
    ];

    foreach ($decoded['blocks'] as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $id = isset($entry['id']) ? sanitize_key($entry['id']) : '';
        $module = isset($entry['module']) ? sanitize_key($entry['module']) : '';

        if ($id === '' || $module === '') {
            continue;
        }

        $cache[$id] = [
            'id' => $id,
            'module' => $module,
            'title' => isset($entry['title']) ? (string) $entry['title'] : ucfirst($module),
            'description' => isset($entry['description']) ? (string) $entry['description'] : '',
            'cta' => isset($entry['cta']) ? (string) $entry['cta'] : __('Ouvrir', 'a11ytb'),
            'action' => isset($entry['action']) ? (string) $entry['action'] : 'open-panel',
            'path' => isset($entry['path']) ? (string) $entry['path'] : null,
            'view' => isset($entry['view']) ? (string) $entry['view'] : null,
            'icon' => $iconMap[$module] ?? '',
        ];
    }

    return $cache;
}

/**
 * Génère le HTML d’un déclencheur inline.
 *
 * @param array<string,mixed> $definition
 * @param array<string,mixed> $attributes
 */
function a11ytb_render_inline_trigger(array $definition, array $attributes = []): string
{
    $title = isset($attributes['title']) ? (string) $attributes['title'] : $definition['title'];
    $description = isset($attributes['description']) ? (string) $attributes['description'] : $definition['description'];
    $cta = isset($attributes['cta']) ? (string) $attributes['cta'] : $definition['cta'];
    $align = isset($attributes['align']) ? (string) $attributes['align'] : '';

    $classes = ['a11ytb-inline-trigger'];
    if ($align === 'wide' || $align === 'full') {
        $classes[] = 'is-wide';
    }
    if (!empty($attributes['className'])) {
        $classes[] = (string) $attributes['className'];
    }

    $data_attrs = sprintf(
        ' data-a11ytb-module-trigger="%1$s" data-a11ytb-module="%2$s" data-a11ytb-action="%3$s"',
        esc_attr($definition['id']),
        esc_attr($definition['module']),
        esc_attr($definition['action'])
    );

    if (!empty($definition['path'])) {
        $data_attrs .= ' data-a11ytb-path="' . esc_attr($definition['path']) . '"';
    }

    if (!empty($definition['view'])) {
        $data_attrs .= ' data-a11ytb-view="' . esc_attr($definition['view']) . '"';
    }

    $icon = $definition['icon'] ?? '';

    $button_attrs = '';
    if ($definition['action'] === 'toggle') {
        $button_attrs .= ' aria-pressed="false"';
    }

    ob_start();
    ?>
    <div class="<?php echo esc_attr(implode(' ', array_filter($classes))); ?>"<?php echo $data_attrs; ?> role="group">
        <div class="a11ytb-inline-trigger__header">
            <?php if ($icon !== '') : ?>
                <span class="a11ytb-inline-trigger__icon" aria-hidden="true"><?php echo $icon; ?></span>
            <?php endif; ?>
            <h3 class="a11ytb-inline-trigger__title"><?php echo esc_html($title); ?></h3>
        </div>
        <?php if ($description !== '') : ?>
            <p class="a11ytb-inline-trigger__description"><?php echo esc_html($description); ?></p>
        <?php endif; ?>
        <button type="button" class="a11ytb-inline-trigger__button"<?php echo $button_attrs; ?>><?php echo esc_html($cta); ?></button>
    </div>
    <?php
    return trim((string) ob_get_clean());
}

/**
 * Enregistre les blocs dynamiques exposant les déclencheurs inline.
 */
function a11ytb_register_inline_blocks(): void
{
    if (!function_exists('register_block_type')) {
        return;
    }

    foreach (a11ytb_get_inline_block_definitions() as $definition) {
        $block_id = 'a11y-toolbox/' . $definition['id'];
        register_block_type($block_id, [
            'api_version' => 3,
            'title' => __($definition['title'], 'a11ytb'),
            'description' => __($definition['description'], 'a11ytb'),
            'category' => 'widgets',
            'style' => 'a11ytb/blocks',
            'render_callback' => static function ($attributes = []) use ($definition) {
                if (!is_array($attributes)) {
                    $attributes = [];
                }
                return a11ytb_render_inline_trigger($definition, $attributes);
            },
            'attributes' => [
                'title' => [
                    'type' => 'string',
                    'default' => $definition['title'],
                ],
                'description' => [
                    'type' => 'string',
                    'default' => $definition['description'],
                ],
                'cta' => [
                    'type' => 'string',
                    'default' => $definition['cta'],
                ],
                'align' => [
                    'type' => 'string',
                ],
                'className' => [
                    'type' => 'string',
                ],
            ],
            'supports' => [
                'align' => ['wide', 'full'],
                'spacing' => [
                    'margin' => true,
                    'padding' => true,
                ],
                'html' => false,
            ],
        ]);
    }
}
add_action('init', 'a11ytb_register_inline_blocks');

/**
 * Rendu du shortcode [a11ytb_module].
 *
 * @param array<string,mixed> $atts
 */
function a11ytb_render_module_shortcode($atts): string
{
    if (!is_array($atts)) {
        $atts = [];
    }

    $atts = shortcode_atts([
        'module' => '',
        'title' => '',
        'description' => '',
        'cta' => '',
        'align' => '',
        'class' => '',
    ], $atts, 'a11ytb_module');

    $module = sanitize_key($atts['module']);
    if ($module === '') {
        return '';
    }

    $definitions = a11ytb_get_inline_block_definitions();
    $definition = null;
    foreach ($definitions as $entry) {
        if ($entry['module'] === $module || $entry['id'] === $module) {
            $definition = $entry;
            break;
        }
    }

    if (!$definition) {
        return '';
    }

    if (function_exists('wp_enqueue_style')) {
        wp_enqueue_style('a11ytb/blocks');
    }

    $attributes = [
        'title' => $atts['title'] !== '' ? $atts['title'] : $definition['title'],
        'description' => $atts['description'] !== '' ? $atts['description'] : $definition['description'],
        'cta' => $atts['cta'] !== '' ? $atts['cta'] : $definition['cta'],
        'align' => $atts['align'],
        'className' => $atts['class'],
    ];

    return a11ytb_render_inline_trigger($definition, $attributes);
}

/**
 * Enregistre le shortcode permettant d’insérer un déclencheur inline.
 */
function a11ytb_register_inline_shortcodes(): void
{
    if (!function_exists('add_shortcode')) {
        return;
    }

    add_shortcode('a11ytb_module', 'a11ytb_render_module_shortcode');
}
add_action('init', 'a11ytb_register_inline_shortcodes');

/**
 * Retourne le contexte utilisateur exposé au frontal.
 */
function a11ytb_get_current_user_context(): array
{
    $context = [
        'authenticated' => false,
        'id' => 0,
        'displayName' => '',
        'email' => '',
        'avatar' => '',
        'roles' => [],
        'permissions' => [],
    ];

    if (!function_exists('is_user_logged_in') || !is_user_logged_in()) {
        /**
         * Permet de filtrer le contexte utilisateur exposé au frontal.
         *
         * @param array       $context Contexte par défaut.
         * @param object|null $user    Utilisateur courant.
         */
        return apply_filters('a11ytb/current_user_context', $context, null);
    }

    $user_id = function_exists('get_current_user_id') ? (int) get_current_user_id() : 0;
    if ($user_id <= 0) {
        return apply_filters('a11ytb/current_user_context', $context, null);
    }

    $context['authenticated'] = true;
    $context['id'] = $user_id;

    $user = null;
    if (function_exists('wp_get_current_user')) {
        $user = wp_get_current_user();
    } elseif (function_exists('get_userdata')) {
        $user = get_userdata($user_id);
    }

    if (is_object($user)) {
        $display_name = isset($user->display_name) && is_string($user->display_name)
            ? $user->display_name
            : '';
        if ($display_name !== '' && function_exists('wp_strip_all_tags')) {
            $display_name = wp_strip_all_tags($display_name);
        }
        $context['displayName'] = $display_name;

        $email = isset($user->user_email) && is_string($user->user_email) ? $user->user_email : '';
        if ($email !== '' && function_exists('sanitize_email')) {
            $email = sanitize_email($email);
        }
        $context['email'] = $email;

        if (function_exists('get_avatar_url')) {
            $avatar = get_avatar_url($user_id);
            if (is_string($avatar)) {
                $context['avatar'] = $avatar;
            }
        }

        $roles = [];
        if (isset($user->roles) && is_array($user->roles)) {
            foreach ($user->roles as $role) {
                if (!is_string($role) || $role === '') {
                    continue;
                }
                $roles[] = function_exists('sanitize_key') ? sanitize_key($role) : strtolower($role);
            }
        }
        if ($roles) {
            $context['roles'] = array_values(array_unique($roles));
        }
    }

    if (function_exists('current_user_can')) {
        $context['permissions'] = [
            'manageOptions' => current_user_can('manage_options'),
            'editPosts' => current_user_can('edit_posts'),
        ];
    }

    return apply_filters('a11ytb/current_user_context', $context, $user);
}

/**
 * Construit la configuration transmise au frontal.
 */
function a11ytb_get_frontend_config(): array
{
    $defaults = [
        'dock' => a11ytb_normalize_dock_option(),
        'view' => a11ytb_normalize_view_option(),
        'locale' => a11ytb_get_site_locale(),
    ];

    $behavior = [
        'autoOpen' => get_option('a11ytb_auto_open_panel', '0') === '1',
    ];

    $integrations = [
        'preferences' => a11ytb_get_preferences_integration_config(),
        'activity' => a11ytb_get_activity_integration_config(),
    ];

    return [
        'defaults' => $defaults,
        'behavior' => $behavior,
        'integrations' => $integrations,
        'user' => a11ytb_get_current_user_context(),
    ];
}

/**
 * Construit la configuration Gemini réservée aux administrateurs.
 */
function a11ytb_get_gemini_admin_config(): array
{
    $config = [
        'quota' => (int) get_option('a11ytb_gemini_quota', 15),
        'hasKey' => false,
    ];

    $api_key = get_option('a11ytb_gemini_api_key', '');
    if ($api_key) {
        $config['masked'] = a11ytb_mask_secret($api_key);
        $config['hasKey'] = true;
    }

    return $config;
}

/**
 * Construit la configuration d’intégration du journal d’activité.
 */
function a11ytb_get_activity_integration_config(): array
{
    $url = get_option('a11ytb_activity_webhook_url', '');
    $normalized_url = is_string($url) ? trim($url) : '';
    $stored_token = get_option('a11ytb_activity_webhook_token', '');
    $has_token = false;

    if ($stored_token !== '' && $stored_token !== null) {
        $decrypted_token = a11ytb_decrypt_secret((string) $stored_token);
        $has_token = is_string($decrypted_token) && $decrypted_token !== '';
    }

    return [
        'enabled' => $normalized_url !== '',
        'webhookUrl' => $normalized_url,
        'hasAuthToken' => $has_token,
        'proxyUrl' => a11ytb_get_activity_proxy_url(),
        'proxyNonce' => function_exists('wp_create_nonce') ? wp_create_nonce('a11ytb_activity_sync') : '',
    ];
}

/**
 * Retourne l’URL du proxy de synchronisation d’activité.
 */
function a11ytb_get_activity_proxy_url(): string
{
    if (function_exists('rest_url')) {
        return rest_url('a11ytb/v1/activity/sync');
    }

    if (function_exists('home_url')) {
        return home_url('/wp-json/a11ytb/v1/activity/sync');
    }

    return '/wp-json/a11ytb/v1/activity/sync';
}

/**
 * Retourne la définition des blocs front-end disponibles.
 */
function a11ytb_get_block_catalog(): array
{
    static $catalog = null;

    if (is_array($catalog)) {
        return $catalog;
    }

    $path = plugin_dir_path(__FILE__) . 'blocks/blocks.json';

    if (!file_exists($path) || !is_readable($path)) {
        $catalog = [];
        return $catalog;
    }

    $contents = file_get_contents($path);

    if (!is_string($contents) || $contents === '') {
        $catalog = [];
        return $catalog;
    }

    $decoded = json_decode($contents, true);

    if (!is_array($decoded) || !isset($decoded['blocks']) || !is_array($decoded['blocks'])) {
        $catalog = [];
        return $catalog;
    }

    $module_defaults = [
        'tts' => [
            'title' => __('Synthèse vocale', 'a11ytb'),
            'description' => __('Expose des actions de lecture audio accessibles.', 'a11ytb'),
            'defaultLabel' => __('Synthèse vocale', 'a11ytb'),
            'defaultDescription' => __('Écoutez la page ou une sélection de texte.', 'a11ytb'),
            'icon' => 'universal-access-alt',
        ],
        'stt' => [
            'title' => __('Reconnaissance vocale', 'a11ytb'),
            'description' => __('Permet de dicter du texte depuis le navigateur.', 'a11ytb'),
            'defaultLabel' => __('Dictée vocale', 'a11ytb'),
            'defaultDescription' => __('Démarrez ou arrêtez une transcription vocale.', 'a11ytb'),
            'icon' => 'microphone',
        ],
        'braille' => [
            'title' => __('Transcription braille', 'a11ytb'),
            'description' => __('Convertit la sélection courante en braille.', 'a11ytb'),
            'defaultLabel' => __('Transcription braille', 'a11ytb'),
            'defaultDescription' => __('Générez et copiez un extrait braille en un clic.', 'a11ytb'),
            'icon' => 'editor-spellcheck',
        ],
        'contrast' => [
            'title' => __('Contraste élevé', 'a11ytb'),
            'description' => __('Ajoute un bouton pour activer ou désactiver le contraste renforcé.', 'a11ytb'),
            'defaultLabel' => __('Contraste élevé', 'a11ytb'),
            'defaultDescription' => __('Renforcez les contrastes du site pour une meilleure lisibilité.', 'a11ytb'),
            'icon' => 'visibility',
        ],
        'spacing' => [
            'title' => __('Espacements typographiques', 'a11ytb'),
            'description' => __('Affiche les réglages d’interlignage et d’espacement des lettres.', 'a11ytb'),
            'defaultLabel' => __('Espacements améliorés', 'a11ytb'),
            'defaultDescription' => __('Consultez et ajustez les espacements dans la barre d’accessibilité.', 'a11ytb'),
            'icon' => 'editor-paragraph',
        ],
    ];

    $catalog = [];

    foreach ($decoded['blocks'] as $entry) {
        if (!is_array($entry) || empty($entry['id'])) {
            continue;
        }

        $id = sanitize_key($entry['id']);

        if ($id === '') {
            continue;
        }

        $module = isset($entry['module']) ? sanitize_key($entry['module']) : '';
        $defaults = $module_defaults[$module] ?? [
            'title' => ucwords(str_replace('-', ' ', $id)),
            'description' => '',
            'defaultLabel' => ucwords(str_replace('-', ' ', $id)),
            'defaultDescription' => '',
            'icon' => 'universal-access-alt',
        ];

        $catalog[$id] = [
            'id' => $id,
            'module' => $module,
            'title' => $defaults['title'],
            'description' => $defaults['description'],
            'defaultLabel' => $defaults['defaultLabel'],
            'defaultDescription' => $defaults['defaultDescription'],
            'icon' => $defaults['icon'],
        ];
    }

    return $catalog;
}

/**
 * Rend le HTML pour un bloc/shortcode d’accessibilité embarqué.
 *
 * @param array $definition
 * @param array $attributes
 */
function a11ytb_render_accessibility_block(array $definition, array $attributes = []): string
{
    wp_enqueue_style('a11ytb/block-embed');
    wp_enqueue_script('a11ytb/block-embed');

    $label = isset($attributes['label']) && $attributes['label'] !== ''
        ? sanitize_text_field($attributes['label'])
        : $definition['defaultLabel'];
    $description = isset($attributes['description']) && $attributes['description'] !== ''
        ? wp_kses_post($attributes['description'])
        : $definition['defaultDescription'];

    $classes = ['a11ytb-embed', 'a11ytb-embed--' . sanitize_html_class($definition['id'])];
    $block_id = esc_attr($definition['id']);

    $label_markup = $label !== ''
        ? '<h3 class="a11ytb-embed__title">' . esc_html($label) . '</h3>'
        : '';
    $description_markup = $description !== ''
        ? '<p class="a11ytb-embed__description">' . $description . '</p>'
        : '';

    $body = '';

    switch ($definition['id']) {
        case 'tts-controls':
            $body = '<div class="a11ytb-embed__actions">'
                . '<button type="button" class="a11ytb-embed__button" data-a11ytb-action="tts-selection">'
                . esc_html__('Lire la sélection', 'a11ytb')
                . '</button>'
                . '<button type="button" class="a11ytb-embed__button" data-a11ytb-action="tts-page">'
                . esc_html__('Lire la page', 'a11ytb')
                . '</button>'
                . '<button type="button" class="a11ytb-embed__button" data-a11ytb-action="tts-stop">'
                . esc_html__('Arrêter la lecture', 'a11ytb')
                . '</button>'
                . '</div>'
                . '<p class="a11ytb-embed__status" data-a11ytb-bind="tts-status" aria-live="polite"></p>';
            break;
        case 'stt-controls':
            $body = '<div class="a11ytb-embed__actions">'
                . '<button type="button" class="a11ytb-embed__button" data-a11ytb-action="stt-toggle"'
                . ' aria-pressed="false"'
                . ' data-label-start="' . esc_attr__('Démarrer la dictée', 'a11ytb') . '"'
                . ' data-label-stop="' . esc_attr__('Arrêter la dictée', 'a11ytb') . '">'
                . esc_html__('Démarrer la dictée', 'a11ytb')
                . '</button>'
                . '</div>'
                . '<p class="a11ytb-embed__status" data-a11ytb-bind="stt-status" aria-live="polite">'
                . esc_html__('Statut : inactif', 'a11ytb')
                . '</p>';
            break;
        case 'braille-controls':
            $output_id = function_exists('wp_unique_id') ? wp_unique_id('a11ytb-braille-') : uniqid('a11ytb-braille-');
            $body = '<div class="a11ytb-embed__actions">'
                . '<button type="button" class="a11ytb-embed__button" data-a11ytb-action="braille-selection">'
                . esc_html__('Transcrire la sélection', 'a11ytb')
                . '</button>'
                . '<button type="button" class="a11ytb-embed__button" data-a11ytb-action="braille-clear">'
                . esc_html__('Effacer', 'a11ytb')
                . '</button>'
                . '</div>'
                . '<div class="a11ytb-embed__field">'
                . '<label class="a11ytb-embed__label" for="' . esc_attr($output_id) . '">' . esc_html__('Sortie braille', 'a11ytb') . '</label>'
                . '<textarea id="' . esc_attr($output_id) . '" class="a11ytb-embed__textarea" rows="4" readonly data-a11ytb-bind="braille-output"></textarea>'
                . '</div>';
            break;
        case 'contrast-controls':
            $body = '<div class="a11ytb-embed__actions">'
                . '<button type="button" class="a11ytb-embed__button" data-a11ytb-action="contrast-toggle" aria-pressed="false"'
                . ' data-label-on="' . esc_attr__('Désactiver le contraste', 'a11ytb') . '"'
                . ' data-label-off="' . esc_attr__('Activer le contraste', 'a11ytb') . '">'
                . esc_html__('Activer le contraste', 'a11ytb')
                . '</button>'
                . '</div>'
                . '<p class="a11ytb-embed__status" data-a11ytb-bind="contrast-status" aria-live="polite"></p>';
            break;
        case 'spacing-controls':
            $body = '<dl class="a11ytb-embed__summary">'
                . '<div><dt>' . esc_html__('Interlignage', 'a11ytb') . '</dt>'
                . '<dd data-a11ytb-bind="spacing-line-height">1.6×</dd></div>'
                . '<div><dt>' . esc_html__('Espacement des lettres', 'a11ytb') . '</dt>'
                . '<dd data-a11ytb-bind="spacing-letter">5 %</dd></div>'
                . '</dl>'
                . '<div class="a11ytb-embed__actions">'
                . '<button type="button" class="a11ytb-embed__button" data-a11ytb-action="open-options"'
                . ' data-target-view="options">' . esc_html__('Ouvrir Options & Profils', 'a11ytb') . '</button>'
                . '</div>';
            break;
        default:
            /**
             * Permet de personnaliser le rendu HTML d’un bloc inconnu.
             *
             * @param string $html       Markup par défaut (vide).
             * @param array  $definition Définition du bloc.
             * @param array  $attributes Attributs fournis.
             */
            $body = apply_filters('a11ytb/render_unknown_block', '', $definition, $attributes);
    }

    $html = '<section class="' . esc_attr(implode(' ', $classes)) . '" data-a11ytb-block="' . $block_id . '">'
        . $label_markup
        . $description_markup
        . $body
        . '</section>';

    return $html;
}

/**
 * Enregistre les blocs dynamiques et shortcodes publics.
 */
function a11ytb_register_content_blocks(): void
{
    $catalog = a11ytb_get_block_catalog();

    if (!$catalog) {
        return;
    }

    foreach ($catalog as $definition) {
        if (function_exists('register_block_type')) {
            register_block_type(
                'a11ytb/' . $definition['id'],
                [
                    'api_version' => 2,
                    'title' => $definition['title'],
                    'description' => $definition['description'],
                    'render_callback' => static function ($attributes) use ($definition) {
                        return a11ytb_render_accessibility_block($definition, is_array($attributes) ? $attributes : []);
                    },
                    'attributes' => [
                        'label' => [
                            'type' => 'string',
                            'default' => $definition['defaultLabel'],
                        ],
                        'description' => [
                            'type' => 'string',
                            'default' => $definition['defaultDescription'],
                        ],
                    ],
                    'supports' => [
                        'align' => ['wide', 'full'],
                        'anchor' => true,
                    ],
                ]
            );
        }

        $shortcode_tag = 'a11ytb_' . str_replace('-', '_', $definition['id']);

        add_shortcode($shortcode_tag, static function ($atts = []) use ($definition) {
            $atts = is_array($atts) ? $atts : [];
            $attributes = [
                'label' => $atts['label'] ?? '',
                'description' => $atts['description'] ?? '',
            ];

            return a11ytb_render_accessibility_block($definition, $attributes);
        });
    }

    add_shortcode('a11ytb', static function ($atts = []) use ($catalog) {
        $atts = shortcode_atts(
            [
                'id' => '',
                'module' => '',
                'label' => '',
                'description' => '',
            ],
            $atts,
            'a11ytb'
        );

        $id = $atts['id'] !== '' ? sanitize_key($atts['id']) : sanitize_key($atts['module']);

        if ($id === '' || !isset($catalog[$id])) {
            return '';
        }

        $definition = $catalog[$id];

        return a11ytb_render_accessibility_block($definition, [
            'label' => $atts['label'],
            'description' => $atts['description'],
        ]);
    });
}
add_action('init', 'a11ytb_register_content_blocks');

/**
 * Enfile les ressources d’éditeur pour les blocs dynamiques.
 */
function a11ytb_enqueue_block_editor_assets(): void
{
    $catalog = array_values(a11ytb_get_block_catalog());

    if (!$catalog) {
        return;
    }

    wp_enqueue_script('a11ytb/block-editor');
    wp_add_inline_script(
        'a11ytb/block-editor',
        'window.a11ytbBlockDefinitions = ' . wp_json_encode($catalog) . ';',
        'before'
    );
}
add_action('enqueue_block_editor_assets', 'a11ytb_enqueue_block_editor_assets');

/**
 * Récupère et déchiffre un secret stocké en base d’options.
 */
function a11ytb_get_decrypted_option_value(string $option_name): string
{
    $stored = get_option($option_name, '');

    if ($stored === '' || $stored === null) {
        return '';
    }

    $decrypted = a11ytb_decrypt_secret((string) $stored);

    if (!is_string($decrypted) || $decrypted === '') {
        return '';
    }

    return trim((string) $decrypted);
}

/**
 * Construit la configuration des connecteurs d’activité avec secrets déchiffrés.
 */
function a11ytb_get_activity_connector_settings(): array
{
    $settings = [
        'webhook' => [
            'url' => trim((string) get_option('a11ytb_activity_webhook_url', '')),
            'token' => a11ytb_get_decrypted_option_value('a11ytb_activity_webhook_token'),
        ],
        'jira' => [
            'baseUrl' => trim((string) get_option('a11ytb_activity_jira_base_url', '')),
            'projectKey' => trim((string) get_option('a11ytb_activity_jira_project_key', '')),
            'token' => a11ytb_get_decrypted_option_value('a11ytb_activity_jira_token'),
            'issueType' => trim((string) get_option('a11ytb_activity_jira_issue_type', '')),
        ],
        'linear' => [
            'apiKey' => a11ytb_get_decrypted_option_value('a11ytb_activity_linear_api_key'),
            'teamId' => trim((string) get_option('a11ytb_activity_linear_team_id', '')),
        ],
        'slack' => [
            'webhookUrl' => a11ytb_get_decrypted_option_value('a11ytb_activity_slack_webhook_url'),
        ],
    ];

    $filtered = apply_filters('a11ytb/activity_connector_settings', $settings);

    return is_array($filtered) ? $filtered : $settings;
}

/**
 * Définit la métadonnée statique des connecteurs disponibles.
 *
 * @return array<int, array{id:string,label:string,help:string,fields:array<int,array{id:string,label:string,description?:string}>,supportsBulk?:bool}>
 */
function a11ytb_get_activity_connector_definitions(): array
{
    return [
        [
            'id' => 'webhook',
            'label' => 'Webhook générique',
            'help' => 'Envoi POST JSON vers un endpoint HTTPS externe avec jeton optionnel.',
            'fields' => [
                [
                    'id' => 'webhookUrl',
                    'label' => 'URL du webhook',
                    'description' => 'Endpoint HTTPS recevant les notifications activité.',
                ],
                [
                    'id' => 'authToken',
                    'label' => 'Jeton Bearer (facultatif)',
                    'description' => 'Transmis dans l’en-tête Authorization pour sécuriser le webhook.',
                ],
            ],
            'supportsBulk' => true,
        ],
        [
            'id' => 'jira',
            'label' => 'Jira (REST)',
            'help' => 'Crée une demande dans un projet Jira Cloud via l’API REST v3.',
            'fields' => [
                [
                    'id' => 'jiraBaseUrl',
                    'label' => 'URL de base Jira',
                    'description' => 'Ex. https://votre-instance.atlassian.net',
                ],
                [
                    'id' => 'jiraProjectKey',
                    'label' => 'Clé projet',
                    'description' => 'Identifiant court du projet cible (ex. A11Y).',
                ],
                [
                    'id' => 'jiraToken',
                    'label' => 'Jeton API',
                    'description' => 'Encodé en Basic Auth (email:token) pour authentifier la requête.',
                ],
                [
                    'id' => 'jiraIssueType',
                    'label' => 'Type de ticket',
                    'description' => 'Nom du type (ex. Bug, Task). Défaut : Task.',
                ],
            ],
        ],
        [
            'id' => 'linear',
            'label' => 'Linear (REST)',
            'help' => 'Enregistre un ticket Linear via l’API REST stable.',
            'fields' => [
                [
                    'id' => 'linearApiKey',
                    'label' => 'Clé API Linear',
                    'description' => 'Clé personnelle avec accès écriture (format lin_api_…).',
                ],
                [
                    'id' => 'linearTeamId',
                    'label' => 'Identifiant équipe',
                    'description' => 'Identifiant unique de l’équipe cible (ex. team_123).',
                ],
            ],
        ],
        [
            'id' => 'slack',
            'label' => 'Slack (Webhook)',
            'help' => 'Publie un message formaté dans un canal Slack via un webhook entrant.',
            'fields' => [
                [
                    'id' => 'slackWebhookUrl',
                    'label' => 'URL du webhook Slack',
                    'description' => 'URL fournie par l’intégration « Incoming Webhook ».',
                ],
            ],
            'supportsBulk' => true,
        ],
    ];
}

/**
 * Prépare les connecteurs disponibles pour l’exécution et retourne métadonnées + callbacks.
 *
 * @param array $settings
 * @return array<int, array{meta:array{id:string,label:string,help:string,fields:array,supportsBulk:bool,enabled:bool,status:string},dispatch:(callable|null)}>
 */
function a11ytb_prepare_activity_connectors(array $settings): array
{
    $definitions = a11ytb_get_activity_connector_definitions();
    $connectors = [];

    foreach ($definitions as $definition) {
        $meta = [
            'id' => $definition['id'],
            'label' => $definition['label'],
            'help' => $definition['help'],
            'fields' => $definition['fields'],
            'supportsBulk' => !empty($definition['supportsBulk']),
            'enabled' => false,
            'status' => 'configuration manquante',
        ];

        $dispatch = null;

        switch ($definition['id']) {
            case 'webhook':
                $url = isset($settings['webhook']['url']) ? trim((string) $settings['webhook']['url']) : '';
                $token = isset($settings['webhook']['token']) ? trim((string) $settings['webhook']['token']) : '';

                if ($url !== '') {
                    $meta['enabled'] = true;
                    $meta['status'] = 'prêt';
                    $dispatch = static function (array $job, array $context) use ($url, $token) {
                        return a11ytb_dispatch_activity_webhook($job, $context, [
                            'url' => $url,
                            'token' => $token,
                        ]);
                    };
                }
                break;

            case 'jira':
                $base_url = isset($settings['jira']['baseUrl']) ? trim((string) $settings['jira']['baseUrl']) : '';
                $project_key = isset($settings['jira']['projectKey']) ? trim((string) $settings['jira']['projectKey']) : '';
                $token = isset($settings['jira']['token']) ? trim((string) $settings['jira']['token']) : '';
                $issue_type = isset($settings['jira']['issueType']) ? trim((string) $settings['jira']['issueType']) : '';
                $meta['status'] = 'configuration incomplète';

                if ($base_url !== '' && $project_key !== '' && $token !== '') {
                    $meta['enabled'] = true;
                    $meta['status'] = 'prêt';
                    $dispatch = static function (array $job, array $context) use ($base_url, $project_key, $token, $issue_type) {
                        return a11ytb_dispatch_activity_jira($job, $context, [
                            'baseUrl' => $base_url,
                            'projectKey' => $project_key,
                            'token' => $token,
                            'issueType' => $issue_type,
                        ]);
                    };
                }
                break;

            case 'linear':
                $api_key = isset($settings['linear']['apiKey']) ? trim((string) $settings['linear']['apiKey']) : '';
                $team_id = isset($settings['linear']['teamId']) ? trim((string) $settings['linear']['teamId']) : '';
                $meta['status'] = 'configuration incomplète';

                if ($api_key !== '' && $team_id !== '') {
                    $meta['enabled'] = true;
                    $meta['status'] = 'prêt';
                    $dispatch = static function (array $job) use ($api_key, $team_id) {
                        return a11ytb_dispatch_activity_linear($job, [
                            'apiKey' => $api_key,
                            'teamId' => $team_id,
                        ]);
                    };
                }
                break;

            case 'slack':
                $webhook_url = isset($settings['slack']['webhookUrl']) ? trim((string) $settings['slack']['webhookUrl']) : '';

                if ($webhook_url !== '') {
                    $meta['enabled'] = true;
                    $meta['status'] = 'prêt';
                    $dispatch = static function (array $job) use ($webhook_url) {
                        return a11ytb_dispatch_activity_slack($job, $webhook_url);
                    };
                }
                break;
        }

        $connectors[] = [
            'meta' => $meta,
            'dispatch' => $dispatch,
        ];
    }

    return $connectors;
}

/**
 * Clone en profondeur une charge utile potentiellement complexe.
 *
 * @param mixed $value
 * @return mixed
 */
function a11ytb_clone_activity_payload($value)
{
    if ($value === null) {
        return null;
    }

    $encode = function_exists('wp_json_encode') ? 'wp_json_encode' : 'json_encode';
    $encoded = $encode($value);

    if (!is_string($encoded) || $encoded === '') {
        return is_scalar($value) ? ['type' => 'text', 'value' => (string) $value] : null;
    }

    $decoded = json_decode($encoded, true);

    if (json_last_error() === JSON_ERROR_NONE) {
        return $decoded;
    }

    if (is_scalar($value)) {
        return ['type' => 'text', 'value' => (string) $value];
    }

    return null;
}

/**
 * Nettoie une entrée de journal d’activité.
 *
 * @param mixed $entry
 */
function a11ytb_sanitize_activity_entry($entry): ?array
{
    if (!is_array($entry)) {
        return null;
    }

    $message = isset($entry['message']) ? (string) $entry['message'] : '';
    if ($message !== '') {
        if (function_exists('sanitize_textarea_field')) {
            $message = sanitize_textarea_field($message);
        } else {
            $message = trim(strip_tags($message));
        }
    }

    if ($message === '') {
        return null;
    }

    $id = isset($entry['id']) ? (string) $entry['id'] : '';
    if ($id !== '') {
        if (function_exists('sanitize_text_field')) {
            $id = sanitize_text_field($id);
        } else {
            $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $id);
        }
    }

    if ($id === '') {
        $id = uniqid('a11ytb_', true);
    }

    $timestamp = isset($entry['timestamp']) ? (int) $entry['timestamp'] : 0;
    if ($timestamp <= 0) {
        $timestamp = (int) (microtime(true) * 1000);
    }

    $module = isset($entry['module']) ? (string) $entry['module'] : '';
    if ($module !== '') {
        if (function_exists('sanitize_key')) {
            $module = sanitize_key($module);
        } else {
            $module = strtolower(preg_replace('/[^a-z0-9_-]/', '', $module));
        }
    }
    $module = $module !== '' ? $module : null;

    $severity = isset($entry['severity']) ? (string) $entry['severity'] : '';
    if ($severity !== '' && function_exists('sanitize_text_field')) {
        $severity = sanitize_text_field($severity);
    }
    $severity = $severity !== '' ? $severity : null;

    $tone = isset($entry['tone']) ? (string) $entry['tone'] : '';
    if ($tone !== '' && function_exists('sanitize_text_field')) {
        $tone = sanitize_text_field($tone);
    }
    $tone = $tone !== '' ? $tone : null;

    $tags = [];
    if (!empty($entry['tags']) && is_array($entry['tags'])) {
        foreach ($entry['tags'] as $tag) {
            $tag_value = (string) $tag;
            if ($tag_value === '') {
                continue;
            }
            if (function_exists('sanitize_text_field')) {
                $tag_value = sanitize_text_field($tag_value);
            }
            if ($tag_value !== '') {
                $tags[] = $tag_value;
            }
        }
    }

    $payload = array_key_exists('payload', $entry) ? $entry['payload'] : null;
    $cloned_payload = a11ytb_clone_activity_payload($payload);

    return [
        'id' => $id,
        'message' => $message,
        'timestamp' => $timestamp,
        'module' => $module,
        'severity' => $severity,
        'tone' => $tone,
        'tags' => $tags,
        'payload' => $cloned_payload,
    ];
}

/**
 * Normalise la structure du job envoyé au proxy.
 *
 * @param mixed $job
 * @return array|WP_Error
 */
function a11ytb_normalize_activity_job($job)
{
    if (!is_array($job)) {
        return new WP_Error('a11ytb_invalid_job', __('Requête invalide : champ « job » manquant.', 'a11ytb'), ['status' => 400]);
    }

    $type = isset($job['type']) ? strtolower((string) $job['type']) : 'single';

    if ($type === 'bulk') {
        $entries_raw = isset($job['entries']) && is_array($job['entries']) ? $job['entries'] : [];
        $entries = [];
        foreach ($entries_raw as $entry) {
            $sanitized = a11ytb_sanitize_activity_entry($entry);
            if ($sanitized !== null) {
                $entries[] = $sanitized;
            }
        }

        if (!$entries) {
            return new WP_Error('a11ytb_invalid_job', __('Aucune entrée valide fournie pour la synchronisation.', 'a11ytb'), ['status' => 400]);
        }

        return [
            'type' => 'bulk',
            'entries' => $entries,
        ];
    }

    $entry = a11ytb_sanitize_activity_entry($job['entry'] ?? null);
    if ($entry === null) {
        return new WP_Error('a11ytb_invalid_job', __('Entrée de journal d’activité invalide.', 'a11ytb'), ['status' => 400]);
    }

    return [
        'type' => 'single',
        'entry' => $entry,
    ];
}

/**
 * Nettoie le contexte transmis par le client.
 *
 * @param mixed $context
 */
function a11ytb_normalize_activity_context($context): array
{
    $page = null;

    if (is_array($context) && isset($context['page'])) {
        $candidate = is_string($context['page']) ? trim($context['page']) : '';
        if ($candidate !== '') {
            if (function_exists('esc_url_raw')) {
                $candidate = esc_url_raw($candidate);
            }
            $page = $candidate;
        }
    }

    return [
        'page' => $page,
    ];
}

/**
 * Construit l’enveloppe JSON envoyée aux connecteurs HTTP.
 */
function a11ytb_build_activity_envelope(array $job, array $context): array
{
    $envelope = [
        'source' => 'a11y-toolbox-pro',
        'sentAt' => gmdate('c'),
    ];

    if (!empty($context['page'])) {
        $envelope['page'] = $context['page'];
    }

    if ($job['type'] === 'bulk') {
        $envelope['event'] = 'a11ytb.activity.bulk';
        $envelope['entries'] = $job['entries'];
    } else {
        $envelope['event'] = 'a11ytb.activity.entry';
        $envelope['entry'] = $job['entry'];
    }

    return $envelope;
}

/**
 * Retourne l’entrée principale à utiliser pour les connecteurs unitaires.
 */
function a11ytb_extract_primary_activity_entry(array $job): ?array
{
    if ($job['type'] === 'bulk') {
        return $job['entries'][0] ?? null;
    }

    return $job['entry'] ?? null;
}

/**
 * Déclenche l’envoi via le webhook générique.
 */
function a11ytb_dispatch_activity_webhook(array $job, array $context, array $config)
{
    $url = isset($config['url']) ? (string) $config['url'] : '';
    if ($url === '') {
        return new WP_Error('a11ytb_webhook_missing', __('Webhook d’activité non configuré.', 'a11ytb'));
    }

    $headers = [
        'Content-Type' => 'application/json',
        'Accept' => 'application/json',
    ];

    if (!empty($config['token'])) {
        $headers['Authorization'] = 'Bearer ' . $config['token'];
    }

    $body = (function_exists('wp_json_encode') ? wp_json_encode(a11ytb_build_activity_envelope($job, $context)) : json_encode(a11ytb_build_activity_envelope($job, $context)));

    $response = wp_remote_post($url, [
        'headers' => $headers,
        'body' => $body,
        'timeout' => 15,
    ]);

    return a11ytb_validate_http_response($response, 'webhook');
}

/**
 * Déclenche l’envoi vers Jira.
 */
function a11ytb_dispatch_activity_jira(array $job, array $context, array $config)
{
    $entry = a11ytb_extract_primary_activity_entry($job);
    if (!$entry) {
        return true;
    }

    $base_url = isset($config['baseUrl']) ? rtrim((string) $config['baseUrl'], '/') : '';
    $project_key = isset($config['projectKey']) ? (string) $config['projectKey'] : '';
    $token = isset($config['token']) ? (string) $config['token'] : '';
    $issue_type = isset($config['issueType']) && $config['issueType'] !== '' ? (string) $config['issueType'] : 'Task';

    if ($base_url === '' || $project_key === '' || $token === '') {
        return new WP_Error('a11ytb_jira_config', __('Configuration Jira incomplète.', 'a11ytb'));
    }

    $description_parts = [$entry['message']];
    if ($entry['payload'] !== null) {
        $description_parts[] = '---';
        $description_parts[] = (function_exists('wp_json_encode') ? wp_json_encode($entry['payload'], JSON_PRETTY_PRINT) : json_encode($entry['payload'], JSON_PRETTY_PRINT));
    }
    if (!empty($entry['tags'])) {
        $description_parts[] = 'Tags : ' . implode(', ', $entry['tags']);
    }

    $summary = mb_substr($entry['message'], 0, 240);
    if ($summary === '') {
        $summary = __('Observation accessibilité', 'a11ytb');
    }

    $body = [
        'fields' => [
            'project' => ['key' => $project_key],
            'summary' => $summary,
            'description' => implode("\n", $description_parts),
            'issuetype' => ['name' => $issue_type],
        ],
    ];

    $endpoint = $base_url . '/rest/api/3/issue';

    $response = wp_remote_post($endpoint, [
        'headers' => [
            'Content-Type' => 'application/json',
            'Authorization' => 'Basic ' . $token,
        ],
        'body' => (function_exists('wp_json_encode') ? wp_json_encode($body) : json_encode($body)),
        'timeout' => 15,
    ]);

    return a11ytb_validate_http_response($response, 'jira');
}

/**
 * Déclenche l’envoi vers Linear.
 */
function a11ytb_dispatch_activity_linear(array $job, array $config)
{
    $entry = a11ytb_extract_primary_activity_entry($job);
    if (!$entry) {
        return true;
    }

    $api_key = isset($config['apiKey']) ? (string) $config['apiKey'] : '';
    $team_id = isset($config['teamId']) ? (string) $config['teamId'] : '';

    if ($api_key === '' || $team_id === '') {
        return new WP_Error('a11ytb_linear_config', __('Configuration Linear incomplète.', 'a11ytb'));
    }

    $payload = [
        'teamId' => $team_id,
        'title' => (mb_substr($entry['message'], 0, 240) ?: __('Observation accessibilité', 'a11ytb')),
        'description' => (function_exists('wp_json_encode') ? wp_json_encode($entry, JSON_PRETTY_PRINT) : json_encode($entry, JSON_PRETTY_PRINT)),
    ];

    $response = wp_remote_post('https://api.linear.app/rest/issues', [
        'headers' => [
            'Content-Type' => 'application/json',
            'Authorization' => $api_key,
        ],
        'body' => (function_exists('wp_json_encode') ? wp_json_encode($payload) : json_encode($payload)),
        'timeout' => 15,
    ]);

    return a11ytb_validate_http_response($response, 'linear');
}

/**
 * Déclenche l’envoi vers Slack.
 */
function a11ytb_dispatch_activity_slack(array $job, string $webhook_url)
{
    $entry = a11ytb_extract_primary_activity_entry($job);
    if (!$entry) {
        return true;
    }

    $blocks = [
        [
            'type' => 'section',
            'text' => ['type' => 'mrkdwn', 'text' => '*' . $entry['message'] . '*'],
        ],
        [
            'type' => 'context',
            'elements' => [
                ['type' => 'mrkdwn', 'text' => 'Module : ' . ($entry['module'] ?? 'activité')],
                ['type' => 'mrkdwn', 'text' => 'Niveau : ' . ($entry['severity'] ?? $entry['tone'] ?? 'info')],
            ],
        ],
    ];

    if (!empty($entry['tags'])) {
        $blocks[] = [
            'type' => 'context',
            'elements' => [
                ['type' => 'mrkdwn', 'text' => '*Tags* : ' . implode(', ', $entry['tags'])],
            ],
        ];
    }

    if ($entry['payload'] !== null) {
        $blocks[] = [
            'type' => 'section',
            'text' => [
                'type' => 'mrkdwn',
                'text' => '```' . (function_exists('wp_json_encode') ? wp_json_encode($entry['payload'], JSON_PRETTY_PRINT) : json_encode($entry['payload'], JSON_PRETTY_PRINT)) . '```',
            ],
        ];
    }

    $payload = [
        'text' => $entry['message'],
        'blocks' => $blocks,
    ];

    $response = wp_remote_post($webhook_url, [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => (function_exists('wp_json_encode') ? wp_json_encode($payload) : json_encode($payload)),
        'timeout' => 15,
    ]);

    return a11ytb_validate_http_response($response, 'slack');
}

/**
 * Extrait le code de réponse HTTP en préservant la compatibilité.
 */
function a11ytb_get_http_response_code($response): int
{
    if (function_exists('wp_remote_retrieve_response_code')) {
        return (int) wp_remote_retrieve_response_code($response);
    }

    if (is_array($response) && isset($response['response']['code'])) {
        return (int) $response['response']['code'];
    }

    return 0;
}

/**
 * Extrait le corps de réponse HTTP.
 */
function a11ytb_get_http_response_body($response): string
{
    if (function_exists('wp_remote_retrieve_body')) {
        $body = wp_remote_retrieve_body($response);
        if (is_string($body)) {
            return $body;
        }
    }

    if (is_array($response) && isset($response['body'])) {
        return (string) $response['body'];
    }

    return '';
}

/**
 * Valide une réponse HTTP et retourne WP_Error en cas d’échec.
 */
function a11ytb_validate_http_response($response, string $connector_id)
{
    if (is_wp_error($response)) {
        return new WP_Error('a11ytb_http_error', $response->get_error_message(), ['connector' => $connector_id]);
    }

    $code = a11ytb_get_http_response_code($response);
    if ($code < 200 || $code >= 300) {
        $body = a11ytb_get_http_response_body($response);
        $snippet = $body !== '' ? mb_substr($body, 0, 200) : '';
        $message = $snippet !== '' ? sprintf('HTTP %1$d – %2$s', $code, $snippet) : sprintf('HTTP %d', $code);

        return new WP_Error('a11ytb_http_error', $message, [
            'connector' => $connector_id,
            'status' => $code,
        ]);
    }

    return true;
}

/**
 * Traite la requête proxy et déclenche les connecteurs.
 *
 * @param array $payload
 * @return array|WP_Error
 */
function a11ytb_process_activity_proxy_payload(array $payload)
{
    $job = a11ytb_normalize_activity_job($payload['job'] ?? null);
    if (is_wp_error($job)) {
        return $job;
    }

    $context = a11ytb_normalize_activity_context($payload['context'] ?? []);

    $settings = a11ytb_get_activity_connector_settings();
    $connectors = a11ytb_prepare_activity_connectors($settings);

    $active = array_filter($connectors, static function ($connector) {
        return $connector['meta']['enabled'] && is_callable($connector['dispatch']);
    });

    if (!$active) {
        return new WP_Error('a11ytb_no_connectors', __('Aucun connecteur de synchronisation configuré.', 'a11ytb'), ['status' => 400]);
    }

    foreach ($active as $connector) {
        $result = call_user_func($connector['dispatch'], $job, $context);
        if (is_wp_error($result)) {
            if (method_exists($result, 'add_data')) {
                $result->add_data(['connector' => $connector['meta']['id']]);
            }
            return $result;
        }
    }

    $metadata = array_map(static function ($connector) {
        return $connector['meta'];
    }, $connectors);

    return [
        'success' => true,
        'jobType' => $job['type'],
        'count' => $job['type'] === 'bulk' ? count($job['entries']) : 1,
        'connectors' => $metadata,
        'results' => array_map(static function ($connector) {
            return [
                'id' => $connector['meta']['id'],
                'status' => 'success',
            ];
        }, $active),
    ];
}

/**
 * Regroupe les entrées activité en attente de synchronisation côté serveur.
 *
 * @return array{entries:array<int,array<string,mixed>>,last_ids:array<int,string>}
 */
function a11ytb_collect_pending_activity_entries(): array
{
    $result = [
        'entries' => [],
        'last_ids' => [],
    ];

    if (!function_exists('get_users') || !function_exists('get_user_meta')) {
        return $result;
    }

    $users = get_users(['fields' => ['ID']]);
    foreach ($users as $user) {
        $user_id = isset($user->ID) ? (int) $user->ID : (int) $user;
        if ($user_id <= 0) {
            continue;
        }

        $preferences = a11ytb_get_user_preferences($user_id);
        $activity = $preferences['data']['ui']['activity'] ?? [];
        if (!is_array($activity) || !$activity) {
            continue;
        }

        $last_synced = get_user_meta($user_id, a11ytb_get_activity_last_synced_meta_key(), true);
        $last_synced = is_string($last_synced) ? $last_synced : '';

        $ordered = array_reverse($activity);
        $collect = $last_synced === '';
        $found_last = $collect;
        $collected = [];

        foreach ($ordered as $entry) {
            $entry_id = isset($entry['id']) ? (string) $entry['id'] : '';
            if (!$collect) {
                if ($entry_id === $last_synced) {
                    $collect = true;
                    $found_last = true;
                }
                continue;
            }

            $sanitized = a11ytb_sanitize_activity_entry($entry);
            if ($sanitized) {
                $collected[] = $sanitized;
            }
        }

        if (!$found_last && $last_synced !== '') {
            $collected = [];
            foreach ($ordered as $entry) {
                $sanitized = a11ytb_sanitize_activity_entry($entry);
                if ($sanitized) {
                    $collected[] = $sanitized;
                }
            }
        }

        if (!$collected) {
            continue;
        }

        $result['entries'] = array_merge($result['entries'], $collected);
        $last_entry = end($collected);
        if ($last_entry && isset($last_entry['id'])) {
            $result['last_ids'][$user_id] = (string) $last_entry['id'];
        }
    }

    return $result;
}

/**
 * Exécute la synchronisation programmée des entrées activité.
 *
 * @return array<string,mixed>|WP_Error
 */
function a11ytb_execute_activity_sync()
{
    $collected = a11ytb_collect_pending_activity_entries();
    if (empty($collected['entries'])) {
        return [
            'success' => false,
            'message' => __('Aucune nouvelle activité à synchroniser.', 'a11ytb'),
        ];
    }

    $payload = [
        'job' => [
            'type' => 'bulk',
            'entries' => $collected['entries'],
        ],
        'context' => [
            'source' => 'wp-cron',
        ],
    ];

    $result = a11ytb_process_activity_proxy_payload($payload);
    if (is_wp_error($result)) {
        update_option('a11ytb_activity_sync_errors', [
            'message' => $result->get_error_message(),
            'code' => $result->get_error_code(),
            'time' => time(),
        ]);

        return $result;
    }

    foreach ($collected['last_ids'] as $user_id => $entry_id) {
        update_user_meta($user_id, a11ytb_get_activity_last_synced_meta_key(), $entry_id);
    }

    update_option('a11ytb_activity_sync_last_run', time());
    delete_option('a11ytb_activity_sync_errors');

    $result['syncedEntries'] = count($collected['entries']);
    $result['syncedUsers'] = array_keys($collected['last_ids']);

    return $result;
}

/**
 * Callback exécuté par WP-Cron pour synchroniser automatiquement les entrées.
 */
function a11ytb_run_scheduled_activity_sync(): void
{
    $result = a11ytb_execute_activity_sync();
    if (is_wp_error($result)) {
        error_log('a11ytb: échec de la synchronisation programmée – ' . $result->get_error_message());
    }
}
add_action('a11ytb/activity_sync', 'a11ytb_run_scheduled_activity_sync');

/**
 * Planifie la tâche cron si nécessaire.
 */
function a11ytb_schedule_activity_sync(): void
{
    if (!function_exists('wp_next_scheduled') || !function_exists('wp_schedule_event')) {
        return;
    }

    if (!wp_next_scheduled('a11ytb/activity_sync')) {
        wp_schedule_event(time() + 300, 'hourly', 'a11ytb/activity_sync');
    }
}
add_action('init', 'a11ytb_schedule_activity_sync');

/**
 * Supprime la tâche cron planifiée.
 */
function a11ytb_clear_activity_sync_schedule(): void
{
    if (!function_exists('wp_next_scheduled') || !function_exists('wp_unschedule_event')) {
        return;
    }

    $timestamp = wp_next_scheduled('a11ytb/activity_sync');
    if ($timestamp) {
        wp_unschedule_event($timestamp, 'a11ytb/activity_sync');
    }
}

if (defined('WP_CLI') && WP_CLI) {
    WP_CLI::add_command('a11ytb activity sync', function (): void {
        $result = a11ytb_execute_activity_sync();
        if (is_wp_error($result)) {
            WP_CLI::error($result->get_error_message());
        }

        $count = isset($result['syncedEntries']) ? (int) $result['syncedEntries'] : 0;
        WP_CLI::success(sprintf('%d entrée(s) synchronisée(s).', $count));
    });
}

/**
 * Callback REST API gérant GET/POST sur le proxy d’activité.
 *
 * @param WP_REST_Request|array $request
 * @return WP_REST_Response|array|WP_Error
 */
function a11ytb_handle_activity_proxy_request($request)
{
    $method = 'GET';
    if (is_object($request) && method_exists($request, 'get_method')) {
        $method = strtoupper($request->get_method());
    }

    if ($method === 'GET') {
        $metadata = array_map(static function ($connector) {
            return $connector['meta'];
        }, a11ytb_prepare_activity_connectors(a11ytb_get_activity_connector_settings()));

        return rest_ensure_response([
            'success' => true,
            'connectors' => $metadata,
        ]);
    }

    $params = [];
    if (is_object($request)) {
        if (method_exists($request, 'get_json_params')) {
            $params = $request->get_json_params();
        } elseif (method_exists($request, 'get_body')) {
            $params = json_decode((string) $request->get_body(), true);
        }
    } elseif (is_array($request)) {
        $params = $request;
    }

    if (!is_array($params)) {
        $params = [];
    }

    $result = a11ytb_process_activity_proxy_payload($params);

    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response($result);
}

/**
 * Valide l'accès à la route REST du proxy d'activité.
 *
 * @param WP_REST_Request|array $request
 * @return bool|WP_Error
 */
function a11ytb_activity_proxy_permissions($request)
{
    if (function_exists('current_user_can') && current_user_can('manage_options')) {
        return true;
    }

    $nonce_candidates = [];

    if (is_object($request)) {
        if (method_exists($request, 'get_header')) {
            $nonce_candidates[] = $request->get_header('X-WP-Nonce');
        }
        if (method_exists($request, 'get_param')) {
            $nonce_candidates[] = $request->get_param('_wpnonce');
        }
    }

    if (isset($_SERVER['HTTP_X_WP_NONCE'])) {
        $nonce_candidates[] = $_SERVER['HTTP_X_WP_NONCE'];
    }

    if (isset($_REQUEST['_wpnonce'])) {
        $nonce_candidates[] = $_REQUEST['_wpnonce'];
    }

    $nonce = '';
    foreach ($nonce_candidates as $candidate) {
        if (is_string($candidate) && $candidate !== '') {
            $nonce = $candidate;
            break;
        }
    }

    if ($nonce !== '' && function_exists('sanitize_text_field')) {
        $nonce = sanitize_text_field($nonce);
    }

    if ($nonce !== '' && function_exists('wp_verify_nonce') && wp_verify_nonce($nonce, 'a11ytb_activity_sync')) {
        return true;
    }

    $status = function_exists('rest_authorization_required_code') ? rest_authorization_required_code() : 403;

    return new WP_Error(
        'rest_forbidden',
        __('Vous n’avez pas l’autorisation d’utiliser ce proxy.', 'a11ytb'),
        ['status' => $status]
    );
}

/**
 * Enregistre la route REST API dédiée au proxy d’activité.
 */
function a11ytb_register_activity_proxy_route(): void
{
    $readable = defined('WP_REST_Server::READABLE') ? WP_REST_Server::READABLE : 'GET';
    $creatable = defined('WP_REST_Server::CREATABLE') ? WP_REST_Server::CREATABLE : 'POST';

    register_rest_route(
        'a11ytb/v1',
        '/activity/sync',
        [
            [
                'methods' => $readable,
                'callback' => 'a11ytb_handle_activity_proxy_request',
                'permission_callback' => 'a11ytb_activity_proxy_permissions',
            ],
            [
                'methods' => $creatable,
                'callback' => 'a11ytb_handle_activity_proxy_request',
                'permission_callback' => 'a11ytb_activity_proxy_permissions',
            ],
        ]
    );
}
add_action('rest_api_init', 'a11ytb_register_activity_proxy_route');

/**
 * Vérifie l’accès aux endpoints de préférences utilisateur.
 */
function a11ytb_preferences_permissions($request)
{
    /**
     * Permet de personnaliser la vérification d’accès aux préférences.
     *
     * @param bool|WP_Error          $permission Résultat par défaut.
     * @param WP_REST_Request|mixed  $request    Requête courante.
     */
    $filtered = apply_filters('a11ytb/preferences_permissions', null, $request);

    if ($filtered instanceof WP_Error) {
        return $filtered;
    }

    if (is_bool($filtered)) {
        return $filtered;
    }

    if (!function_exists('is_user_logged_in') || !is_user_logged_in()) {
        $status = function_exists('rest_authorization_required_code')
            ? rest_authorization_required_code()
            : 401;

        return new WP_Error(
            'rest_forbidden',
            __('Vous devez être connecté pour synchroniser vos préférences.', 'a11ytb'),
            ['status' => $status]
        );
    }

    return true;
}

/**
 * Retourne l’instantané de préférences pour l’utilisateur courant.
 */
function a11ytb_handle_preferences_get($request)
{
    $user_id = function_exists('get_current_user_id') ? (int) get_current_user_id() : 0;

    if ($user_id <= 0) {
        return new WP_Error('rest_forbidden', __('Utilisateur introuvable.', 'a11ytb'), ['status' => 401]);
    }

    $snapshot = a11ytb_get_user_preferences_snapshot($user_id);
    $updated_at = (int) get_user_meta($user_id, a11ytb_get_preferences_updated_meta_key(), true);

    return rest_ensure_response([
        'userId' => $user_id,
        'snapshot' => $snapshot,
        'updatedAt' => $updated_at,
    ]);
}

/**
 * Met à jour les préférences persistées pour l’utilisateur courant.
 */
function a11ytb_handle_preferences_update($request)
{
    $user_id = function_exists('get_current_user_id') ? (int) get_current_user_id() : 0;

    if ($user_id <= 0) {
        return new WP_Error('rest_forbidden', __('Utilisateur introuvable.', 'a11ytb'), ['status' => 401]);
    }

    $payload = [];

    if ($request instanceof WP_REST_Request) {
        $payload = $request->get_json_params();
    } elseif (is_array($request)) {
        $payload = $request;
    }

    if (!is_array($payload)) {
        $payload = [];
    }

    $snapshot = isset($payload['snapshot']) && is_array($payload['snapshot'])
        ? $payload['snapshot']
        : $payload;

    if (!is_array($snapshot)) {
        return new WP_Error(
            'a11ytb_invalid_preferences',
            __('Format de préférences invalide.', 'a11ytb'),
            ['status' => 400]
        );
    }

    $result = a11ytb_update_user_preferences_snapshot($user_id, $snapshot);

    return rest_ensure_response(
        [
            'success' => true,
            'snapshot' => $result['snapshot'],
            'updatedAt' => $result['updatedAt'],
        ]
    );
}

/**
 * Enregistre la route REST dédiée aux préférences persistées.
 */
function a11ytb_register_preferences_rest_route(): void
{
    if (!function_exists('register_rest_route')) {
        return;
    }

    $readable = defined('WP_REST_Server::READABLE') ? WP_REST_Server::READABLE : 'GET';
    $editable = defined('WP_REST_Server::EDITABLE') ? WP_REST_Server::EDITABLE : 'POST';

    register_rest_route(
        'a11ytb/v1',
        '/preferences',
        [
            [
                'methods' => $readable,
                'callback' => 'a11ytb_handle_preferences_get',
                'permission_callback' => 'a11ytb_preferences_permissions',
            ],
            [
                'methods' => $editable,
                'callback' => 'a11ytb_handle_preferences_update',
                'permission_callback' => 'a11ytb_preferences_permissions',
            ],
        ]
    );
}
add_action('rest_api_init', 'a11ytb_register_preferences_rest_route');

/**
 * Enregistre un intervalle personnalisé pour les synchronisations programmées.
 */
function a11ytb_register_cron_schedule($schedules)
{
    if (!is_array($schedules)) {
        $schedules = [];
    }

    $interval = defined('MINUTE_IN_SECONDS') ? 15 * MINUTE_IN_SECONDS : 900;
    $schedules['a11ytb_quarter_hour'] = [
        'interval' => $interval,
        'display' => __('A11y Toolbox Pro – toutes les 15 minutes', 'a11ytb'),
    ];

    return $schedules;
}
add_filter('cron_schedules', 'a11ytb_register_cron_schedule');

/**
 * Programme la tâche cron de synchronisation des connecteurs.
 */
function a11ytb_schedule_activity_cron(): void
{
    if (!function_exists('wp_next_scheduled') || !function_exists('wp_schedule_event')) {
        return;
    }

    if (wp_next_scheduled('a11ytb/activity_cron')) {
        return;
    }

    $timestamp = time() + 300;
    wp_schedule_event($timestamp, 'a11ytb_quarter_hour', 'a11ytb/activity_cron');
}

/**
 * Supprime la programmation cron personnalisée.
 */
function a11ytb_clear_activity_cron(): void
{
    if (function_exists('wp_clear_scheduled_hook')) {
        wp_clear_scheduled_hook('a11ytb/activity_cron');
    }
}

/**
 * Collecte les entrées d’activité à synchroniser.
 *
 * @param array $args
 * @return array<int, array{user:WP_User,entries:array<int,array>}> Retourne une liste de lots.
 */
function a11ytb_collect_activity_sync_batches(array $args = []): array
{
    if (!function_exists('get_users')) {
        return [];
    }

    $user_id = isset($args['user_id']) ? (int) $args['user_id'] : 0;
    $number = isset($args['number']) ? max(1, (int) $args['number']) : 50;
    $since = array_key_exists('since', $args) ? (int) $args['since'] : null;

    $query = [
        'fields' => ['ID', 'display_name', 'user_email'],
        'number' => $number,
        'orderby' => 'ID',
        'order' => 'ASC',
        'meta_query' => [
            [
                'key' => a11ytb_get_preferences_meta_key(),
                'compare' => 'EXISTS',
            ],
        ],
    ];

    if ($user_id > 0) {
        $query['include'] = [$user_id];
    }

    $users = get_users($query);
    $batches = [];

    foreach ($users as $user) {
        if (!($user instanceof WP_User)) {
            continue;
        }

        $snapshot = a11ytb_get_user_preferences_snapshot((int) $user->ID);
        $activity = $snapshot['ui']['activity'] ?? null;

        if (!is_array($activity) || !$activity) {
            continue;
        }

        $last_synced = $since !== null
            ? $since
            : (int) get_user_meta($user->ID, a11ytb_get_activity_last_synced_meta_key(), true);

        $entries = [];

        foreach ($activity as $entry) {
            $sanitized = a11ytb_sanitize_activity_entry($entry);
            if (!$sanitized) {
                continue;
            }
            $timestamp = isset($sanitized['timestamp']) ? (int) $sanitized['timestamp'] : 0;
            if ($timestamp <= $last_synced) {
                continue;
            }
            $entries[] = $sanitized;
        }

        if (!$entries) {
            continue;
        }

        usort(
            $entries,
            static function ($a, $b) {
                $a_ts = isset($a['timestamp']) ? (int) $a['timestamp'] : 0;
                $b_ts = isset($b['timestamp']) ? (int) $b['timestamp'] : 0;
                if ($a_ts === $b_ts) {
                    return 0;
                }
                return $a_ts < $b_ts ? -1 : 1;
            }
        );

        $batches[] = [
            'user' => $user,
            'entries' => $entries,
        ];
    }

    /**
     * Permet de filtrer les lots de synchronisation calculés.
     *
     * @param array $batches Lots collectés.
     * @param array $args    Paramètres d’appel.
     */
    $filtered = apply_filters('a11ytb/activity_sync_batches', $batches, $args);

    return is_array($filtered) ? $filtered : $batches;
}

/**
 * Lance l’exécution des synchronisations pour les lots collectés.
 *
 * @param array $args
 * @return array{processed:int,dispatched:int,errors:array}
 */
function a11ytb_run_activity_sync_jobs(array $args = []): array
{
    $batches = a11ytb_collect_activity_sync_batches($args);

    $results = [
        'processed' => 0,
        'dispatched' => 0,
        'errors' => [],
    ];

    if (!$batches) {
        return $results;
    }

    $connectors = a11ytb_prepare_activity_connectors(a11ytb_get_activity_connector_settings());
    $active = array_filter(
        $connectors,
        static function ($connector) {
            return !empty($connector['meta']['enabled']) && is_callable($connector['dispatch']);
        }
    );

    if (!$active) {
        return $results;
    }

    foreach ($batches as $batch) {
        $entries = $batch['entries'];
        if (!$entries) {
            continue;
        }

        $job_type = count($entries) > 1 ? 'bulk' : 'single';
        $payload = [
            'job' => $job_type === 'bulk'
                ? ['type' => 'bulk', 'entries' => $entries]
                : ['type' => 'single', 'entry' => $entries[0]],
            'context' => [
                'source' => $args['source'] ?? 'scheduler',
                'userId' => $batch['user']->ID,
                'userDisplayName' => $batch['user']->display_name,
                'userEmail' => $batch['user']->user_email,
            ],
        ];

        $response = a11ytb_process_activity_proxy_payload($payload);

        if (is_wp_error($response)) {
            $results['errors'][] = $response;
            /**
             * Notifie les échecs de synchronisation planifiée.
             *
             * @param WP_Error $response Réponse d’erreur.
             * @param WP_User  $user     Utilisateur concerné.
             * @param array    $entries  Entrées traitées.
             */
            do_action('a11ytb/activity_sync_failed', $response, $batch['user'], $entries);
            continue;
        }

        $results['processed']++;
        $results['dispatched'] += $job_type === 'bulk' ? count($entries) : 1;

        $last_entry = end($entries);
        $last_timestamp = isset($last_entry['timestamp']) ? (int) $last_entry['timestamp'] : time();
        update_user_meta($batch['user']->ID, a11ytb_get_activity_last_synced_meta_key(), $last_timestamp);

        /**
         * Signale une synchronisation terminée avec succès.
         *
         * @param array   $response Réponse du proxy.
         * @param WP_User $user     Utilisateur concerné.
         * @param array   $entries  Entrées synchronisées.
         */
        do_action('a11ytb/activity_sync_succeeded', $response, $batch['user'], $entries);
    }

    return $results;
}

/**
 * Gestionnaire cron déclenchant la synchronisation des connecteurs.
 */
function a11ytb_activity_cron_handler(): void
{
    $result = a11ytb_run_activity_sync_jobs(['source' => 'cron']);

    if (!empty($result['errors'])) {
        foreach ($result['errors'] as $error) {
            if ($error instanceof WP_Error) {
                error_log('A11y Toolbox Pro – échec de synchronisation : ' . $error->get_error_message());
            }
        }
    }
}
add_action('a11ytb/activity_cron', 'a11ytb_activity_cron_handler');

if (defined('WP_CLI') && WP_CLI) {
    WP_CLI::add_command('a11ytb activity-sync', 'a11ytb_wpcli_activity_sync');
}

/**
 * Commande WP-CLI pour lancer une synchronisation immédiate.
 */
function a11ytb_wpcli_activity_sync($args, $assoc_args)
{
    $params = [];

    if (!empty($assoc_args['user'])) {
        $params['user_id'] = (int) $assoc_args['user'];
    }

    if (!empty($assoc_args['since'])) {
        $params['since'] = (int) $assoc_args['since'];
    }

    if (!empty($assoc_args['number'])) {
        $params['number'] = (int) $assoc_args['number'];
    }

    $result = a11ytb_run_activity_sync_jobs(array_merge($params, ['source' => 'cli']));

    if (!empty($result['errors'])) {
        foreach ($result['errors'] as $error) {
            if ($error instanceof WP_Error) {
                WP_CLI::warning($error->get_error_message());
            }
        }
        WP_CLI::error(sprintf(__('Synchronisation incomplète (%d lot(s) en erreur).', 'a11ytb'), count($result['errors'])));
    }

    WP_CLI::success(
        sprintf(
            __('Synchronisation réussie (%1$d lot(s), %2$d entrée(s)).', 'a11ytb'),
            $result['processed'],
            $result['dispatched']
        )
    );
}

/**
 * Ajoute le point de montage requis dans le footer.
 */
function a11ytb_render_mount_point(): void
{
    if (is_admin() || !a11ytb_is_enabled()) {
        return;
    }

    if (did_action('a11ytb/render_root')) {
        return;
    }

    echo '<div id="a11ytb-root" class="a11ytb-root-anchor"></div>';

    /**
     * Signale aux développeurs que le point de montage a été rendu.
     */
    do_action('a11ytb/render_root');
}
add_action('wp_footer', 'a11ytb_render_mount_point', 5);

/**
 * Enregistre le menu d'administration dédié au plugin.
 */
function a11ytb_register_admin_menu(): void
{
    add_menu_page(
        __('A11y Toolbox Pro', 'a11ytb'),
        __('A11y Toolbox Pro', 'a11ytb'),
        'manage_options',
        'a11y-toolbox-pro',
        'a11ytb_render_admin_page',
        'dashicons-universal-access-alt',
        58
    );
}
add_action('admin_menu', 'a11ytb_register_admin_menu');

/**
 * Enfile les ressources spécifiques à la page d'administration du plugin.
 *
 * @param string $hook Page courante.
 */
function a11ytb_enqueue_admin_assets(string $hook): void
{
    if ($hook !== 'toplevel_page_a11y-toolbox-pro') {
        return;
    }

    $plugin_url = plugin_dir_url(__FILE__);

    wp_enqueue_style(
        'a11ytb/admin',
        $plugin_url . 'assets/admin.css',
        [],
        A11YTB_PLUGIN_VERSION
    );

    wp_enqueue_script(
        'a11ytb/admin-app',
        $plugin_url . 'src/admin/admin-app.js',
        [],
        A11YTB_PLUGIN_VERSION,
        true
    );

    wp_script_add_data('a11ytb/admin-app', 'type', 'module');

    add_filter('script_loader_tag', 'a11ytb_force_admin_app_module_type', 10, 3);

    if (current_user_can('manage_options')) {
        $admin_data = [
            'gemini' => a11ytb_get_gemini_admin_config(),
            'activity' => a11ytb_get_activity_integration_config(),
        ];

        wp_add_inline_script(
            'a11ytb/admin-app',
            'window.a11ytbAdminData = Object.freeze(' . wp_json_encode($admin_data) . ');',
            'before'
        );
    }
}
add_action('admin_enqueue_scripts', 'a11ytb_enqueue_admin_assets');

/**
 * Garantit que le script de l’application d’administration est chargé en module ES6.
 */


function a11ytb_force_admin_app_module_type(string $tag, string $handle, string $src): string
{
    if ($handle !== 'a11ytb/admin-app') {
        return $tag;
    }

    if (strpos($tag, 'type=') === false) {
        return str_replace('<script ', "<script type=\"module\" ", $tag);
    }

    return preg_replace("/type=('|\")( [^'\"]*)('|\")/i", "type=\"module\"", $tag);
}

/**
 * Affiche la page d'administration principale du plugin.
 */
function a11ytb_render_admin_page(): void
{
    $is_enabled = a11ytb_is_enabled();
    $preview_url = plugins_url('index.html', __FILE__);
    $stored_gemini_api_key = get_option('a11ytb_gemini_api_key', '');
    $decrypted_gemini_api_key = a11ytb_decrypt_secret($stored_gemini_api_key);
    $gemini_key_error = ($stored_gemini_api_key !== '' && $decrypted_gemini_api_key === null);
    $gemini_api_key = ($decrypted_gemini_api_key === null) ? '' : (string) $decrypted_gemini_api_key;
    $gemini_quota = (int) get_option('a11ytb_gemini_quota', 15);
    $activity_webhook_url = (string) get_option('a11ytb_activity_webhook_url', '');
    $stored_activity_webhook_token = get_option('a11ytb_activity_webhook_token', '');
    $decrypted_activity_webhook_token = a11ytb_decrypt_secret($stored_activity_webhook_token);
    $activity_token_error = ($stored_activity_webhook_token !== '' && $decrypted_activity_webhook_token === null);
    $activity_webhook_token = ($decrypted_activity_webhook_token === null) ? '' : (string) $decrypted_activity_webhook_token;
    ?>
    <div class="wrap a11ytb-admin-page">
        <h1><?php esc_html_e('A11y Toolbox Pro', 'a11ytb'); ?></h1>

        <p class="description">
            <?php esc_html_e('Gérez les modules, consultez les raccourcis et testez la barre latérale directement depuis l’aperçu ci-dessous.', 'a11ytb'); ?>
        </p>

        <?php settings_errors('a11ytb_settings'); ?>

        <form method="post" action="options.php" class="a11ytb-settings-form">
            <?php
            a11ytb_render_settings_hidden_fields('a11ytb_settings', 'general');
            do_settings_sections('a11ytb_settings_page');
            submit_button(__('Enregistrer les réglages', 'a11ytb'));
            ?>
        </form>

        <?php if (!$is_enabled) : ?>
            <div class="notice notice-warning">
                <p>
                    <?php esc_html_e('Le chargement automatique sur le site est actuellement désactivé via le filtre « a11ytb/is_enabled ».', 'a11ytb'); ?>
                </p>
            </div>
        <?php endif; ?>

        <?php settings_errors('a11ytb_options'); ?>

        <form method="post" action="options.php" class="a11ytb-admin-settings">
            <?php
            a11ytb_render_settings_hidden_fields('a11ytb_options', 'gemini');
            ?>

            <div class="a11ytb-admin-field">
                <label for="a11ytb_gemini_api_key" class="a11ytb-admin-label">
                    <?php esc_html_e('Clé API Gemini', 'a11ytb'); ?>
                </label>
                <input
                    type="password"
                    id="a11ytb_gemini_api_key"
                    name="a11ytb_gemini_api_key"
                    value="<?php echo esc_attr($gemini_api_key); ?>"
                    class="regular-text"
                    autocomplete="off"
                />
                <p class="description">
                    <?php
                    if ($gemini_api_key !== '') {
                        printf(
                            /* translators: %s: masked api key */
                            esc_html__('Clé actuelle : %s', 'a11ytb'),
                            esc_html(a11ytb_mask_secret($gemini_api_key))
                        );
                        echo '<br />';
                    }
                    if ($gemini_key_error) {
                        esc_html_e('La clé enregistrée n’a pas pu être déchiffrée. Veuillez vérifier vos salts WordPress ou saisir une nouvelle valeur.', 'a11ytb');
                        echo '<br />';
                    }
                    esc_html_e('Les clés sont chiffrées via les salts WordPress avant d’être stockées en base de données.', 'a11ytb');
                    ?>
                </p>
            </div>

            <div class="a11ytb-admin-field">
                <label for="a11ytb_gemini_quota" class="a11ytb-admin-label">
                    <?php esc_html_e('Consommation du quota gratuit', 'a11ytb'); ?>
                </label>
                <input
                    type="number"
                    id="a11ytb_gemini_quota"
                    name="a11ytb_gemini_quota"
                    value="<?php echo esc_attr($gemini_quota); ?>"
                    class="small-text"
                    min="0"
                />
                <p class="description">
                    <?php esc_html_e('15 requêtes/minute offertes sur Gemini 1.5 Flash.', 'a11ytb'); ?>
                </p>
            </div>

            <div class="a11ytb-admin-field">
                <label for="a11ytb_activity_webhook_url" class="a11ytb-admin-label">
                    <?php esc_html_e('Webhook activité (URL)', 'a11ytb'); ?>
                </label>
                <input
                    type="url"
                    id="a11ytb_activity_webhook_url"
                    name="a11ytb_activity_webhook_url"
                    value="<?php echo esc_attr($activity_webhook_url); ?>"
                    class="regular-text"
                />
                <p class="description">
                    <?php esc_html_e('Utilisez une URL HTTPS dédiée (par exemple un connecteur Slack ou un endpoint serverless).', 'a11ytb'); ?>
                </p>
            </div>

            <div class="a11ytb-admin-field">
                <label for="a11ytb_activity_webhook_token" class="a11ytb-admin-label">
                    <?php esc_html_e('Webhook activité (jeton)', 'a11ytb'); ?>
                </label>
                <input
                    type="password"
                    id="a11ytb_activity_webhook_token"
                    name="a11ytb_activity_webhook_token"
                    value="<?php echo esc_attr($activity_webhook_token); ?>"
                    class="regular-text"
                    autocomplete="off"
                />
                <p class="description">
                    <?php
                    if ($activity_webhook_token !== '') {
                        printf(
                            /* translators: %s: masked webhook token */
                            esc_html__('Jeton actuel : %s', 'a11ytb'),
                            esc_html(a11ytb_mask_secret($activity_webhook_token))
                        );
                        echo '<br />';
                    }
                    if ($activity_token_error) {
                        esc_html_e('Le jeton enregistré n’a pas pu être déchiffré. Veuillez vérifier vos salts WordPress ou saisir une nouvelle valeur.', 'a11ytb');
                        echo '<br />';
                    }
                    esc_html_e('Optionnel : sera envoyé dans l’en-tête Authorization (Bearer). Les valeurs sont chiffrées via les salts WordPress.', 'a11ytb');
                    ?>
                </p>
            </div>

            <?php submit_button(__('Enregistrer', 'a11ytb')); ?>
        </form>

        <div class="a11ytb-admin-columns">
            <div class="a11ytb-admin-column">
                <div
                    id="a11ytb-admin-app"
                    class="a11ytb-admin-app-mount"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <p class="a11ytb-admin-app-placeholder">
                        <?php esc_html_e('Chargement du tableau de bord d’administration…', 'a11ytb'); ?>
                    </p>
                </div>
            </div>

            <div class="a11ytb-admin-column a11ytb-admin-column--preview">
                <h2><?php esc_html_e('Aperçu interactif', 'a11ytb'); ?></h2>
                <p class="description">
                    <?php esc_html_e('L’aperçu charge la démo embarquée afin de tester la barre latérale sans quitter l’administration.', 'a11ytb'); ?>
                </p>
                <div class="a11ytb-admin-preview">
                    <iframe
                        title="<?php echo esc_attr__('Prévisualisation A11y Toolbox Pro', 'a11ytb'); ?>"
                        src="<?php echo esc_url($preview_url); ?>"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                    ></iframe>
                </div>
            </div>
        </div>
    </div>
    <?php
}

