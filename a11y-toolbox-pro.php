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
}
add_action('admin_enqueue_scripts', 'a11ytb_enqueue_admin_assets');

/**
 * Affiche la page d'administration principale du plugin.
 */
function a11ytb_render_admin_page(): void
{
    $is_enabled = a11ytb_is_enabled();
    $preview_url = plugins_url('index.html', __FILE__);
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

        <div class="a11ytb-admin-columns">
            <div class="a11ytb-admin-column">
                <h2><?php esc_html_e('Guide rapide', 'a11ytb'); ?></h2>
                <ol>
                    <li><?php esc_html_e('Ouvrez n’importe quelle page publique de votre site pour voir la boîte à outils.', 'a11ytb'); ?></li>
                    <li><?php esc_html_e('Utilisez le raccourci Alt+Shift+A ou le bouton flottant pour afficher/masquer la barre latérale.', 'a11ytb'); ?></li>
                    <li><?php esc_html_e('Explorez les vues Modules, Options & Profils et Organisation pour configurer l’expérience.', 'a11ytb'); ?></li>
                </ol>

                <h2><?php esc_html_e('Astuces utiles', 'a11ytb'); ?></h2>
                <ul class="a11ytb-admin-shortcuts">
                    <li><?php esc_html_e('Alt+Shift+O : ouvre la vue Options & Profils.', 'a11ytb'); ?></li>
                    <li><?php esc_html_e('Alt+Shift+G : affiche la vue Organisation pour trier les modules.', 'a11ytb'); ?></li>
                    <li><?php esc_html_e('Alt+Shift+H : liste tous les raccourcis clavier disponibles.', 'a11ytb'); ?></li>
                </ul>
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

