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

    if (current_user_can('manage_options')) {
        $admin_config = a11ytb_get_gemini_admin_config();
        wp_add_inline_script(
            'a11ytb/app',
            'window.a11ytbGeminiConfig = ' . wp_json_encode($admin_config) . ';',
            'before'
        );
    }
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
function a11ytb_sanitize_secret($value): string
{
    if (!is_string($value)) {
        return '';
    }

    $normalized = trim($value);

    return sanitize_text_field($normalized);
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

    register_setting(
        'a11ytb_settings',
        'a11ytb_gemini_api_key',
        [
            'type' => 'string',
            'default' => '',
            'sanitize_callback' => 'a11ytb_sanitize_secret',
        ]
    );

    register_setting(
        'a11ytb_settings',
        'a11ytb_gemini_quota',
        [
            'type' => 'integer',
            'default' => 15,
            'sanitize_callback' => 'a11ytb_sanitize_quota',
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

    add_settings_field(
        'a11ytb_gemini_api_key',
        __('Clé API Gemini', 'a11ytb'),
        'a11ytb_render_gemini_key_field',
        'a11ytb_settings_page',
        'a11ytb_section_integrations',
        ['label_for' => 'a11ytb_gemini_api_key']
    );

    add_settings_field(
        'a11ytb_gemini_quota',
        __('Quota gratuit suivi', 'a11ytb'),
        'a11ytb_render_gemini_quota_field',
        'a11ytb_settings_page',
        'a11ytb_section_integrations',
        ['label_for' => 'a11ytb_gemini_quota']
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
    $value = get_option('a11ytb_gemini_api_key', '');
    ?>
    <input type="password" id="a11ytb_gemini_api_key" name="a11ytb_gemini_api_key" value="<?php echo esc_attr($value); ?>" autocomplete="off" class="regular-text" />
    <p class="description">
        <?php
        if ($value) {
            printf(
                /* translators: %s: masked api key */
                esc_html__('Clé actuelle : %s', 'a11ytb'),
                esc_html(a11ytb_mask_secret($value))
            );
            echo '<br />';
        }
        esc_html_e('La clé est stockée chiffrée dans la base WordPress et uniquement visible des administrateurs.', 'a11ytb');
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
 * Construit la configuration transmise au frontal.
 */
function a11ytb_get_frontend_config(): array
{
    $defaults = [
        'dock' => a11ytb_normalize_dock_option(),
        'view' => a11ytb_normalize_view_option(),
    ];

    $behavior = [
        'autoOpen' => get_option('a11ytb_auto_open_panel', '0') === '1',
    ];

    return [
        'defaults' => $defaults,
        'behavior' => $behavior,
    ];
}

/**
 * Construit la configuration Gemini réservée aux administrateurs.
 */
function a11ytb_get_gemini_admin_config(): array
{
    $config = [
        'quota' => (int) get_option('a11ytb_gemini_quota', 15),
    ];

    $api_key = get_option('a11ytb_gemini_api_key', '');
    if ($api_key) {
        $config['apiKey'] = $api_key;
        $config['masked'] = a11ytb_mask_secret($api_key);
    }

    return $config;
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

        <?php settings_errors('a11ytb_settings'); ?>

        <form method="post" action="options.php" class="a11ytb-settings-form">
            <?php
            settings_fields('a11ytb_settings');
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

