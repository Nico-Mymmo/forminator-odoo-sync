<?php
/**
 * HET TEAM OVERNEMEN VAN EEN BESTAANDE PAGINA: Team -> Overnemen.
 *
 * Op openvme.be/over-ons stond het team als handgebouwde kaarten met een
 * eigen CSS-klasse (hover-cover): een cover met de foto en de tekst, met de
 * naam en de functie eronder. Dit scherm leest zo'n pagina op de site zelf
 * (de blokken, niet de HTML), toont wat het vond, en maakt na een klik de
 * teamleden aan: naam, functie, tekst, foto en volgorde zoals op de pagina.
 *
 * HOE EEN KAART HERKEND WORDT. Elk blok met de klasse hover-cover is een
 * teamlid.
 *   - De foto: het beeld van de cover (id, anders de url als die in de
 *     mediabibliotheek staat), anders het eerste beeldblok erin.
 *   - De tekst: de alinea's in dat blok.
 *   - De naam en de functie: de eerste twee teksten (kop of alinea) die
 *     erna komen in dezelfde kolom of groep, tot de volgende kaart. Staat er
 *     geen naam onder, dan het vetgedrukte woord vooraan in de tekst.
 * Een herbruikbaar blok (gesynchroniseerd patroon) in de pagina wordt mee
 * gelezen.
 *
 * NIETS DUBBEL: een teamlid met dezelfde naam dat al in de lijst staat, wordt
 * overgeslagen. De pagina zelf blijft ongewijzigd.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Team_Overnemen {

    private const SLUG   = 'mymmo-team-overnemen';
    private const ACTIE  = 'mymmo_team_overnemen';
    private const KLASSE = 'hover-cover';
    private const DIEPTE = 5;
    private const RECHT  = 'edit_others_posts';

    public static function init(): void {
        add_action('admin_menu', [self::class, 'menu']);
        add_action('admin_post_' . self::ACTIE, [self::class, 'bewaar']);
        add_action('admin_notices', [self::class, 'melding']);
    }

    public static function menu(): void {
        // Enkel waar het team beheerd wordt: elders is er geen lijst.
        if (!Mymmo_Cards_Team::is_bron()) {
            return;
        }
        add_submenu_page(
            'edit.php?post_type=' . Mymmo_Cards_Team::TYPE,
            'Team overnemen van een pagina',
            'Overnemen',
            self::RECHT,
            self::SLUG,
            [self::class, 'scherm']
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Het scherm
    // ─────────────────────────────────────────────────────────────────────────

    public static function scherm(): void {
        if (!current_user_can(self::RECHT)) {
            return;
        }

        echo '<div class="wrap"><h1>Team overnemen van een pagina</h1>';

        $pagina = isset($_GET['pagina']) ? (int) $_GET['pagina'] : 0;
        if ($pagina <= 0) {
            self::kies_pagina();
        } else {
            self::voorbeeld($pagina);
        }

        echo '</div>';
    }

    private static function kies_pagina(): void {
        $paginas = self::paginas_met_kaarten();

        echo '<p>Op een pagina met de oude teamkaarten (klasse <code>' . esc_html(self::KLASSE) . '</code>) lees ik de naam, de functie, de tekst en de foto van elke kaart. Je ziet eerst wat er gevonden is; pas na je klik komen ze in de lijst Team. De pagina zelf verandert niet.</p>';

        if ($paginas === []) {
            echo '<div class="notice notice-warning inline"><p>Op deze site staat geen pagina met teamkaarten (klasse <code>' . esc_html(self::KLASSE) . '</code>).</p></div>';
            return;
        }

        echo '<form method="get" action="' . esc_url(admin_url('edit.php')) . '">'
            . '<input type="hidden" name="post_type" value="' . esc_attr(Mymmo_Cards_Team::TYPE) . '">'
            . '<input type="hidden" name="page" value="' . esc_attr(self::SLUG) . '">'
            . '<p><label for="mymmo-team-pagina"><strong>Pagina</strong></label><br><select name="pagina" id="mymmo-team-pagina">';
        foreach ($paginas as $p) {
            echo '<option value="' . esc_attr((string) $p->ID) . '">' . esc_html(get_the_title($p) . ' (' . wp_make_link_relative((string) get_permalink($p)) . ')') . '</option>';
        }
        echo '</select></p>';
        submit_button('Bekijk wat er gevonden wordt', 'primary', '', false);
        echo '</form>';
    }

    private static function voorbeeld(int $pagina): void {
        $bericht = get_post($pagina);
        if (!$bericht instanceof WP_Post) {
            echo '<div class="notice notice-error inline"><p>Die pagina bestaat niet.</p></div>';
            return;
        }

        $kaarten = self::kaarten($bericht);
        $terug = admin_url('edit.php?post_type=' . Mymmo_Cards_Team::TYPE . '&page=' . self::SLUG);

        if ($kaarten === []) {
            echo '<div class="notice notice-warning inline"><p>Op "' . esc_html(get_the_title($bericht)) . '" vond ik geen kaarten met de klasse <code>' . esc_html(self::KLASSE) . '</code>.</p></div>'
                . '<p><a href="' . esc_url($terug) . '">Een andere pagina kiezen</a></p>';
            return;
        }

        $bestaand = self::bestaande_namen();

        echo '<p>Op "' . esc_html(get_the_title($bericht)) . '" staan ' . count($kaarten) . ' kaarten. Vink uit wie je niet wil overnemen. Klopt een naam of functie niet, dan pas je die na het overnemen aan in de lijst Team.</p>';

        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">'
            . '<input type="hidden" name="action" value="' . esc_attr(self::ACTIE) . '">'
            . '<input type="hidden" name="pagina" value="' . esc_attr((string) $pagina) . '">';
        wp_nonce_field(self::ACTIE . '_' . $pagina, 'mymmo_team_nonce');

        echo '<table class="widefat striped"><thead><tr>'
            . '<td class="check-column"></td><th>Foto</th><th>Naam</th><th>Functie</th><th>Tekst</th>'
            . '</tr></thead><tbody>';

        foreach ($kaarten as $i => $k) {
            $al = $k['naam'] !== '' && isset($bestaand[self::sleutel($k['naam'])]);
            echo '<tr>'
                . '<th scope="row" class="check-column"><input type="checkbox" name="kaart[]" value="' . esc_attr((string) $i) . '"' . ($al || $k['naam'] === '' ? ' disabled' : ' checked') . '></th>'
                . '<td>' . ($k['foto'] > 0 ? (string) wp_get_attachment_image($k['foto'], [60, 60]) : '<em>geen foto gevonden</em>') . '</td>'
                . '<td>' . ($k['naam'] !== '' ? esc_html($k['naam']) : '<em>geen naam gevonden</em>') . ($al ? '<br><em>staat al in de lijst</em>' : '') . '</td>'
                . '<td>' . esc_html($k['functie']) . '</td>'
                . '<td>' . esc_html(wp_trim_words(wp_strip_all_tags($k['tekst']), 18)) . '</td>'
                . '</tr>';
        }

        echo '</tbody></table>';
        submit_button('Overnemen in de lijst Team');
        echo '</form><p><a href="' . esc_url($terug) . '">Een andere pagina kiezen</a></p>';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Overnemen
    // ─────────────────────────────────────────────────────────────────────────

    public static function bewaar(): void {
        $pagina = isset($_POST['pagina']) ? (int) $_POST['pagina'] : 0;
        if (!current_user_can(self::RECHT) || !isset($_POST['mymmo_team_nonce'])
            || !wp_verify_nonce(sanitize_text_field(wp_unslash((string) $_POST['mymmo_team_nonce'])), self::ACTIE . '_' . $pagina)) {
            wp_die('Dat mag niet.', '', ['response' => 403]);
        }

        // Opnieuw gelezen op de server: wat er gepost wordt, is enkel welke.
        $bericht = get_post($pagina);
        $kaarten = $bericht instanceof WP_Post ? self::kaarten($bericht) : [];
        $gekozen = array_map('intval', (array) ($_POST['kaart'] ?? []));
        $bestaand = self::bestaande_namen();

        $aantal = 0;
        foreach ($kaarten as $i => $k) {
            if (!in_array($i, $gekozen, true) || $k['naam'] === '' || isset($bestaand[self::sleutel($k['naam'])])) {
                continue;
            }

            $id = wp_insert_post([
                'post_type'    => Mymmo_Cards_Team::TYPE,
                'post_status'  => 'publish',
                'post_title'   => $k['naam'],
                'post_content' => $k['tekst'],
                'menu_order'   => ($i + 1) * 10,
            ], true);
            if (is_wp_error($id) || !$id) {
                continue;
            }

            if ($k['functie'] !== '') {
                update_post_meta((int) $id, Mymmo_Cards_Team::FUNCTIE, $k['functie']);
            }
            if ($k['foto'] > 0) {
                set_post_thumbnail((int) $id, $k['foto']);
            }
            $bestaand[self::sleutel($k['naam'])] = true;
            $aantal++;
        }

        wp_safe_redirect(add_query_arg(['post_type' => Mymmo_Cards_Team::TYPE, 'mymmo_team_overgenomen' => $aantal], admin_url('edit.php')));
        exit;
    }

    public static function melding(): void {
        if (!isset($_GET['mymmo_team_overgenomen'])) {
            return;
        }
        $aantal = (int) $_GET['mymmo_team_overgenomen'];
        echo '<div class="notice notice-success is-dismissible"><p>'
            . esc_html($aantal === 1 ? '1 teamlid overgenomen.' : $aantal . ' teamleden overgenomen.')
            . ' Kies nu per persoon de kleur achter de tekst (vak Functie en kleur) en kijk de volgorde na.</p></div>';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // De pagina lezen
    // ─────────────────────────────────────────────────────────────────────────

    /** @return array<int,WP_Post> */
    private static function paginas_met_kaarten(): array {
        $uit = [];
        $kandidaten = get_posts([
            'post_type'      => ['page', 'post', 'wp_block'],
            'post_status'    => ['publish', 'draft', 'private', 'future', 'pending'],
            'posts_per_page' => 50,
            's'              => self::KLASSE,
            'no_found_rows'  => true,
        ]);
        foreach ($kandidaten as $p) {
            if ($p instanceof WP_Post && strpos((string) $p->post_content, self::KLASSE) !== false) {
                $uit[] = $p;
            }
        }

        return $uit;
    }

    /**
     * De kaarten van een pagina, in de volgorde waarin ze staan.
     *
     * @return array<int,array{naam:string,functie:string,tekst:string,foto:int}>
     */
    public static function kaarten(WP_Post $bericht): array {
        $uit = [];
        self::zoek(parse_blocks((string) $bericht->post_content), $uit, 0);

        return $uit;
    }

    /**
     * @param array<int,array<string,mixed>>                                      $blokken
     * @param array<int,array{naam:string,functie:string,tekst:string,foto:int}> $uit
     */
    private static function zoek(array $blokken, array &$uit, int $diepte): void {
        if ($diepte > self::DIEPTE) {
            return;
        }

        $blokken = array_values(array_filter($blokken, static function ($b): bool {
            return is_array($b) && !empty($b['blockName']);
        }));

        foreach ($blokken as $i => $blok) {
            if ($blok['blockName'] === 'core/block') {
                $ref = get_post((int) ($blok['attrs']['ref'] ?? 0));
                if ($ref instanceof WP_Post) {
                    self::zoek(parse_blocks((string) $ref->post_content), $uit, $diepte + 1);
                }
                continue;
            }

            if (!self::is_kaart($blok)) {
                self::zoek((array) ($blok['innerBlocks'] ?? []), $uit, $diepte);
                continue;
            }

            // De naam en de functie: de teksten na de kaart, tot de volgende.
            $teksten = [];
            for ($j = $i + 1; $j < count($blokken) && count($teksten) < 2; $j++) {
                if (self::is_kaart($blokken[$j]) || self::bevat_kaart($blokken[$j])) {
                    break;
                }
                foreach (self::teksten_in($blokken[$j]) as $t) {
                    if (count($teksten) < 2) {
                        $teksten[] = $t;
                    }
                }
            }

            $alineas = self::alineas_in($blok);

            // Staan de naam (een kop) en de functie IN de kaart, dan zijn
            // dat de kop en de alinea erna, en de rest is de tekst.
            if ($teksten === []) {
                $binnen = self::binnen($blok);
                foreach ($binnen as $k => $deel) {
                    if ($deel['blockName'] !== 'core/heading') {
                        continue;
                    }
                    $teksten = self::teksten_in($deel);
                    $volgende = $binnen[$k + 1] ?? null;
                    if ($volgende !== null && $volgende['blockName'] === 'core/paragraph') {
                        $teksten = array_merge($teksten, self::teksten_in($volgende));
                        $html = (string) $volgende['innerHTML'];
                        $alineas = array_values(array_filter($alineas, static function ($a) use ($html): bool {
                            return trim(wp_strip_all_tags((string) $a['innerHTML'])) !== trim(wp_strip_all_tags($html));
                        }));
                    }
                    break;
                }
            }

            $tekst = serialize_blocks($alineas);
            $naam = $teksten[0] ?? '';
            if ($naam === '' && $alineas !== [] && preg_match('#^\s*<p[^>]*>\s*<strong>([^<]{2,40})</strong>#i', (string) ($alineas[0]['innerHTML'] ?? ''), $m)) {
                $naam = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            }

            $uit[] = [
                'naam'    => sanitize_text_field($naam),
                'functie' => sanitize_text_field($teksten[1] ?? ''),
                'tekst'   => $tekst,
                'foto'    => self::foto_in($blok),
            ];
        }
    }

    /** @param array<string,mixed> $blok */
    private static function is_kaart(array $blok): bool {
        $klassen = (string) ($blok['attrs']['className'] ?? '');

        return in_array(self::KLASSE, preg_split('/\s+/', $klassen) ?: [], true);
    }

    /** @param array<string,mixed> $blok */
    private static function bevat_kaart(array $blok): bool {
        foreach ((array) ($blok['innerBlocks'] ?? []) as $kind) {
            if (is_array($kind) && (self::is_kaart($kind) || self::bevat_kaart($kind))) {
                return true;
            }
        }

        return false;
    }

    /**
     * De niet-lege teksten (koppen en alinea's) in een blok, als platte tekst.
     *
     * @param array<string,mixed> $blok
     * @return array<int,string>
     */
    private static function teksten_in(array $blok): array {
        $naam = (string) ($blok['blockName'] ?? '');
        if (in_array($naam, ['core/heading', 'core/paragraph'], true)) {
            $t = trim(html_entity_decode(wp_strip_all_tags((string) ($blok['innerHTML'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            $t = trim(str_replace("\xc2\xa0", ' ', $t));

            return $t !== '' ? [$t] : [];
        }

        $uit = [];
        foreach ((array) ($blok['innerBlocks'] ?? []) as $kind) {
            if (is_array($kind)) {
                $uit = array_merge($uit, self::teksten_in($kind));
            }
        }

        return $uit;
    }

    /**
     * De koppen en alinea's in een blok, in volgorde, hoe diep ook.
     *
     * @param array<string,mixed> $blok
     * @return array<int,array<string,mixed>>
     */
    private static function binnen(array $blok): array {
        $uit = [];
        foreach ((array) ($blok['innerBlocks'] ?? []) as $kind) {
            if (!is_array($kind)) {
                continue;
            }
            if (in_array($kind['blockName'] ?? '', ['core/heading', 'core/paragraph'], true)) {
                $uit[] = $kind;
                continue;
            }
            $uit = array_merge($uit, self::binnen($kind));
        }

        return $uit;
    }

    /**
     * De alinea's met inhoud in een kaart, als blokken.
     *
     * @param array<string,mixed> $blok
     * @return array<int,array<string,mixed>>
     */
    private static function alineas_in(array $blok): array {
        $uit = [];
        foreach ((array) ($blok['innerBlocks'] ?? []) as $kind) {
            if (!is_array($kind)) {
                continue;
            }
            if (($kind['blockName'] ?? '') === 'core/paragraph') {
                if (mymmo_cards_heeft_inhoud((string) ($kind['innerHTML'] ?? ''))) {
                    // Enkel de tekst: geen kleur, maat of klasse van de oude kaart.
                    $kind['attrs'] = [];
                    $html = (string) preg_replace('#^\s*<p\b[^>]*>#i', '<p>', (string) $kind['innerHTML']);
                    $kind['innerHTML'] = $html;
                    $kind['innerContent'] = [$html];
                    $uit[] = $kind;
                }
                continue;
            }
            $uit = array_merge($uit, self::alineas_in($kind));
        }

        return $uit;
    }

    /**
     * De foto van een kaart: een id uit de mediabibliotheek, of 0.
     *
     * @param array<string,mixed> $blok
     */
    private static function foto_in(array $blok): int {
        $attrs = (array) ($blok['attrs'] ?? []);
        $id = (int) ($attrs['id'] ?? 0);
        if ($id > 0 && wp_attachment_is_image($id)) {
            return $id;
        }
        $url = (string) ($attrs['url'] ?? '');
        if ($url !== '') {
            $id = (int) attachment_url_to_postid($url);
            if ($id <= 0) {
                // Een verkleinde versie (-600x900.jpg): het origineel zoeken.
                $id = (int) attachment_url_to_postid((string) preg_replace('/-\d+x\d+(?=\.[a-z]+$)/i', '', $url));
            }
            if ($id > 0) {
                return $id;
            }
        }
        foreach ((array) ($blok['innerBlocks'] ?? []) as $kind) {
            if (is_array($kind) && ($kind['blockName'] ?? '') === 'core/image') {
                $id = (int) ($kind['attrs']['id'] ?? 0);
                if ($id > 0) {
                    return $id;
                }
            }
        }

        return 0;
    }

    /** @return array<string,bool> */
    private static function bestaande_namen(): array {
        $uit = [];
        $leden = get_posts([
            'post_type'      => Mymmo_Cards_Team::TYPE,
            'post_status'    => ['publish', 'draft', 'private', 'pending', 'future'],
            'posts_per_page' => -1,
            'no_found_rows'  => true,
        ]);
        foreach ($leden as $l) {
            if ($l instanceof WP_Post) {
                $uit[self::sleutel((string) $l->post_title)] = true;
            }
        }

        return $uit;
    }

    private static function sleutel(string $naam): string {
        $naam = trim(html_entity_decode($naam, ENT_QUOTES | ENT_HTML5, 'UTF-8'));

        return function_exists('mb_strtolower') ? mb_strtolower($naam) : strtolower($naam);
    }
}
