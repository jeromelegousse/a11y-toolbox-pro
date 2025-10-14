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
        'a11ytb_options_encryption_error',
        esc_html__('Impossible de chiffrer la clé fournie. La valeur précédente a été conservée.', 'a11ytb'),
        'error'
    );

    $previous = get_option('a11ytb_gemini_api_key', '');

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

    if (current_user_can('manage_options')) {
        $admin_data = [
            'gemini' => a11ytb_get_gemini_admin_config(),
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
 * Enregistre les options nécessaires au tableau de bord Gemini.
 */
function a11ytb_register_admin_settings(): void
{
    register_setting(
        'a11ytb_options',
        'a11ytb_gemini_api_key',
        [
            'type' => 'string',
            'sanitize_callback' => 'a11ytb_sanitize_secret',
            'default' => '',
        ]
    );

    register_setting(
        'a11ytb_options',
        'a11ytb_gemini_quota',
        [
            'type' => 'integer',
            'sanitize_callback' => 'a11ytb_sanitize_quota',
            'default' => 15,
        ]
    );
}
add_action('admin_init', 'a11ytb_register_admin_settings');

/**
 * Affiche les champs cachés requis par l’API Settings en évitant les ID dupliqués.
 *
 * @param string $option_group Groupe d’options ciblé.
 * @param string $nonce_suffix Suffixe optionnel pour différencier l’ID du nonce.
 */
function a11ytb_render_settings_hidden_fields(string $option_group, string $nonce_suffix = ''): void
{
    $nonce_field = '_wpnonce';
    $nonce_id = $nonce_field;

    if ($nonce_suffix !== '') {
        $nonce_id .= '_' . sanitize_key($nonce_suffix);
    }

    $nonce_markup = wp_nonce_field($option_group . '-options', $nonce_field, true, false);

    if ($nonce_id !== $nonce_field) {
        $escaped_id = esc_attr($nonce_id);
        $nonce_markup = preg_replace('/id="_wpnonce"/', 'id="' . $escaped_id . '"', $nonce_markup, 1);
    }

    echo $nonce_markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    echo wp_referer_field(false, false); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    printf('<input type="hidden" name="option_page" value="%s" />', esc_attr($option_group));
    echo '<input type="hidden" name="action" value="update" />';
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

