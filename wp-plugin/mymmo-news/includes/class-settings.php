<?php
/**
 * Instellingen: de verbinding met de Operations Manager.
 *
 * Twee waarden, en allebei horen ze bij de SITE, niet bij een pagina: de
 * basis-URL van de Worker en de sitesleutel. De sleutel wordt nooit
 * teruggetoond in het formulier -- wel of hij ingesteld is.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_News_Settings {

    private const OPTION_BASE = 'mymmo_news_base_url';
    private const OPTION_KEY = 'mymmo_news_site_key';
    private const GROUP = 'mymmo_news_settings';

    public static function base_url(): string {
        $waarde = (string) get_option(self::OPTION_BASE, '');
        return $waarde !== '' ? untrailingslashit($waarde) : '';
    }

    public static function site_key(): string {
        return (string) get_option(self::OPTION_KEY, '');
    }

    public static function menu(): void {
        add_options_page(
            'Mymmo News',
            'Mymmo News',
            'manage_options',
            'mymmo-news',
            [self::class, 'page']
        );
    }

    public static function register(): void {
        register_setting(self::GROUP, self::OPTION_BASE, [
            'type' => 'string',
            'sanitize_callback' => [self::class, 'sanitize_base'],
            'default' => '',
        ]);
        register_setting(self::GROUP, self::OPTION_KEY, [
            'type' => 'string',
            'sanitize_callback' => [self::class, 'sanitize_key_value'],
            'default' => '',
        ]);
    }

    public static function sanitize_base($waarde): string {
        $url = esc_url_raw(trim((string) $waarde));
        return $url !== '' ? untrailingslashit($url) : '';
    }

    /**
     * Een leeg veld betekent "niet wijzigen", niet "wissen".
     *
     * Het veld toont de sleutel nooit, dus bij elke andere instelling die je
     * opslaat zou een leeg veld hem anders weggooien -- en dan valt de feed
     * op de hele site stil door een bewerking die er niets mee te maken had.
     */
    public static function sanitize_key_value($waarde): string {
        $nieuw = trim((string) $waarde);
        if ($nieuw === '') {
            return self::site_key();
        }
        return sanitize_text_field($nieuw);
    }

    public static function page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $taxonomy = Mymmo_News_Api_Client::get_taxonomy();
        $fout = Mymmo_News_Api_Client::last_error();
        $verbonden = !empty($taxonomy['types']) || !empty($taxonomy['tags']);
        $shape = Mymmo_News_Api_Client::shape_mismatch();

        ?>
        <div class="wrap">
            <h1>Mymmo News</h1>

            <?php if ($verbonden) : ?>
                <div class="notice notice-success"><p>
                    Verbonden met de Operations Manager
                    — <?php echo (int) count($taxonomy['types']); ?> categorieën,
                    <?php echo (int) count($taxonomy['tags']); ?> labels.
                </p></div>
            <?php elseif ($fout) : ?>
                <div class="notice notice-error"><p>
                    Geen verbinding: <?php echo esc_html($fout); ?>
                </p></div>
            <?php endif; ?>

            <?php if ($shape !== null) : ?>
                <div class="notice notice-warning"><p>
                    De Operations Manager stuurt payloadversie <?php echo (int) $shape; ?>,
                    en deze plugin is op versie 2 gebouwd. Alles blijft werken, maar
                    nieuwe onderdelen worden pas getoond na een update van de plugin.
                </p></div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields(self::GROUP); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="mymmo_news_base_url">Basis-URL</label></th>
                        <td>
                            <input type="url" id="mymmo_news_base_url"
                                   name="<?php echo esc_attr(self::OPTION_BASE); ?>"
                                   value="<?php echo esc_attr(self::base_url()); ?>"
                                   class="regular-text" placeholder="https://operations.openvme.be">
                            <p class="description">Zonder pad. De plugin zet er zelf
                                <code>/content-feed/public/v1</code> achter.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="mymmo_news_site_key">Sitesleutel</label></th>
                        <td>
                            <input type="password" id="mymmo_news_site_key"
                                   name="<?php echo esc_attr(self::OPTION_KEY); ?>"
                                   value="" class="regular-text" autocomplete="off"
                                   placeholder="<?php echo self::site_key() !== ''
                                       ? 'Ingesteld — laat leeg om te behouden'
                                       : 'Nog niet ingesteld'; ?>">
                            <p class="description">Leeg laten verandert niets. De sleutel
                                blijft serverside en komt nooit in de HTML.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>

            <h2>De shortcode</h2>
            <p>Zet dit op de pagina waar de feed moet staan:</p>
            <p><code>[mymmo_news]</code></p>

            <table class="widefat striped" style="max-width:52rem">
                <thead><tr><th>Attribuut</th><th>Wat het doet</th><th>Standaard</th></tr></thead>
                <tbody>
                    <tr><td><code>categories</code></td>
                        <td>Welke categorieën deze feed toont, komma-gescheiden. Leeg = alle.</td>
                        <td><em>leeg</em></td></tr>
                    <tr><td><code>tags</code></td>
                        <td>Vast voorfilter op labels. Die labels staan dan niet meer in de filterbalk.</td>
                        <td><em>leeg</em></td></tr>
                    <tr><td><code>filters</code></td>
                        <td><code>tags</code>, <code>types</code>, <code>both</code> of <code>none</code>.</td>
                        <td><code>tags</code></td></tr>
                    <tr><td><code>limit</code></td><td>Berichten per pagina.</td><td><code>12</code></td></tr>
                    <tr><td><code>layout</code></td><td><code>feed</code> of <code>grid</code>.</td><td><code>feed</code></td></tr>
                    <tr><td><code>heading</code></td><td>Optionele kop boven de feed.</td><td><em>leeg</em></td></tr>
                    <tr><td><code>autoload</code></td><td>Bijladen bij scrollen. <code>no</code> = enkel de knop.</td><td><code>yes</code></td></tr>
                </tbody>
            </table>

            <?php if (!empty($taxonomy['types'])) : ?>
                <h3>Beschikbare categorieën</h3>
                <p><?php
                    $stukken = [];
                    foreach ($taxonomy['types'] as $type) {
                        if (empty($type['slug'])) {
                            continue;
                        }
                        $stukken[] = '<code>' . esc_html((string) $type['slug']) . '</code> — '
                            . esc_html((string) ($type['name'] ?? ''));
                    }
                    echo wp_kses_post(implode('<br>', $stukken));
                ?></p>
            <?php endif; ?>

            <?php if (!empty($taxonomy['tags'])) : ?>
                <h3>Beschikbare labels</h3>
                <p><?php
                    $stukken = [];
                    foreach ($taxonomy['tags'] as $tag) {
                        if (empty($tag['slug'])) {
                            continue;
                        }
                        $stukken[] = '<code>' . esc_html((string) $tag['slug']) . '</code> — '
                            . esc_html((string) ($tag['name'] ?? ''));
                    }
                    echo wp_kses_post(implode('<br>', $stukken));
                ?></p>
            <?php endif; ?>
        </div>
        <?php
    }
}
