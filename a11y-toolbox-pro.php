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

/**
 * Enregistre les ressources communes utilisées par le plugin.
 */
function a11ytb_register_assets(): void
{
    $plugin_url = plugin_dir_url(__FILE__);

    wp_register_style(
        'a11ytb/styles',
        $plugin_url . 'src/css/styles.css',
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

    if (function_exists('wp_script_add_data')) {
        wp_script_add_data('a11ytb/app', 'type', 'module');
    }
}
add_action('init', 'a11ytb_register_assets');

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

    if (current_user_can('manage_options')) {
        $config = [
            'geminiApiKey' => get_option('a11ytb_gemini_api_key', ''),
            'geminiQuota' => get_option('a11ytb_gemini_quota', ''),
        ];

        if ($config['geminiApiKey'] !== '' || $config['geminiQuota'] !== '') {
            $inline_config = 'window.a11ytbGeminiConfig = ' . wp_json_encode($config) . ';';
            wp_add_inline_script('a11ytb/app', $inline_config, 'after');
        }
    }
}
add_action('wp_enqueue_scripts', 'a11ytb_enqueue_frontend_assets');

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

    if (function_exists('wp_script_add_data')) {
        wp_script_add_data('a11ytb/admin-app', 'type', 'module');
    }
}
add_action('admin_enqueue_scripts', 'a11ytb_enqueue_admin_assets');

/**
 * Sanitize Gemini related settings before persistence.
 *
 * @param mixed $value Valeur à nettoyer.
 *
 * @return string
 */
function a11ytb_sanitize_gemini_setting($value): string
{
    if (!is_string($value)) {
        $value = (string) $value;
    }

    return sanitize_text_field(trim($value));
}

/**
 * Enregistre les options nécessaires au tableau de bord Gemini.
 */
function a11ytb_register_admin_settings(): void
{
    register_setting(
        'a11ytb_options',
        'a11ytb_gemini_api_key',
        [
            'type' => 'string',
            'sanitize_callback' => 'a11ytb_sanitize_gemini_setting',
            'default' => '',
        ]
    );

    register_setting(
        'a11ytb_options',
        'a11ytb_gemini_quota',
        [
            'type' => 'string',
            'sanitize_callback' => 'a11ytb_sanitize_gemini_setting',
            'default' => '',
        ]
    );
}
add_action('admin_init', 'a11ytb_register_admin_settings');

/**
 * Affiche la page d'administration principale du plugin.
 */
function a11ytb_render_admin_page(): void
{
    $is_enabled = a11ytb_is_enabled();
    $preview_url = plugins_url('index.html', __FILE__);
    $gemini_api_key = get_option('a11ytb_gemini_api_key', '');
    $gemini_quota = get_option('a11ytb_gemini_quota', '');
    ?>
    <div class="wrap a11ytb-admin-page">
        <h1><?php esc_html_e('A11y Toolbox Pro', 'a11ytb'); ?></h1>

        <p class="description">
            <?php esc_html_e('Gérez les modules, consultez les raccourcis et testez la barre latérale directement depuis l’aperçu ci-dessous.', 'a11ytb'); ?>
        </p>

        <?php if (!$is_enabled) : ?>
            <div class="notice notice-warning">
                <p>
                    <?php esc_html_e('Le chargement automatique sur le site est actuellement désactivé via le filtre « a11ytb/is_enabled ».', 'a11ytb'); ?>
                </p>
            </div>
        <?php endif; ?>

        <form method="post" action="options.php" class="a11ytb-admin-settings">
            <?php
            settings_fields('a11ytb_options');
            do_settings_sections('a11y-toolbox-pro');
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

