<?php
/**
 * DE HUISSTIJL: de stylesheet met de enige toegelaten waarden, en de eigen
 * categorie in de blok-editor.
 *
 * De waarden zelf staan in `assets/css/mymmo-huisstijl.css`. Elke andere
 * stylesheet van deze plugin hangt daarvan af (`wp_register_style(..., [HANDLE])`),
 * zodat de variabelen er altijd zijn -- op de pagina en in het canvas van de
 * editor. De controle weigert een stylesheet die die afhankelijkheid niet heeft.
 *
 * DE CATEGORIE "Mymmo" staat bovenaan in de inserter. Alle blokken van deze
 * plugin staan daarin, en alleen daarin: wie een Mymmo-component zoekt, vindt
 * ze op één plek, en wie in "Ontwerp" kijkt, ziet enkel wat WordPress zelf
 * meebrengt.
 *
 * Bestand onder CODEOWNERS: wijzigen enkel met goedkeuring van Nico.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

final class Mymmo_Cards_Huisstijl {

    /** De handle van de stylesheet waar elke andere van afhangt. */
    public const HANDLE = 'mymmo-huisstijl';

    /** De categorie in de inserter. */
    public const CATEGORIE = 'mymmo';

    public static function init(): void {
        // Vóór de andere registraties (prioriteit 10), al maakt het voor de
        // afhankelijkheden niet uit: die worden pas bij het afdrukken opgelost.
        add_action('init', [self::class, 'register'], 5);
        add_filter('block_categories_all', [self::class, 'categorie'], 10, 1);
    }

    public static function register(): void {
        wp_register_style(
            self::HANDLE,
            MYMMO_CARDS_URL . 'assets/css/mymmo-huisstijl.css',
            [],
            MYMMO_CARDS_VERSION
        );
    }

    /**
     * De categorie bovenaan de lijst, en maar één keer.
     *
     * @param array<int, array<string, mixed>> $categorieen
     * @return array<int, array<string, mixed>>
     */
    public static function categorie(array $categorieen): array {
        foreach ($categorieen as $rij) {
            if (($rij['slug'] ?? '') === self::CATEGORIE) {
                return $categorieen;
            }
        }

        array_unshift($categorieen, [
            'slug'  => self::CATEGORIE,
            'title' => 'Mymmo',
            'icon'  => null,
        ]);

        return $categorieen;
    }
}
