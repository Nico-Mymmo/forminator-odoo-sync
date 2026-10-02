<?php
/**
 * Plugin Name:       Mymmo Componenten
 * Description:       Bouwstenen voor de blok-editor: de kaartenstapel en de markeerstift. Elk component bezit geometrie en gedrag, nooit typografie -- de letter komt altijd uit het thema.
 * Version:           1.8.7
 * Requires at least: 6.2
 * Requires PHP:      8.0
 * Author:            Mymmo
 * Text Domain:       mymmo-cards
 *
 * ONTWERPUITGANGSPUNT
 * -------------------
 * DIT COMPONENT BEZIT GEOMETRIE EN GEDRAG, NOOIT TYPOGRAFIE.
 *
 * In de stylesheet van deze plugin staat geen enkele `font-family`,
 * `font-size`, `font-weight` of `color` voor tekst. De inhoud van een kaart
 * bestaat uit gewone core-blokken (kop, alinea, afbeelding, video), dus de
 * letter komt per definitie uit het thema -- net als in elke andere kaart op de
 * pagina. Dat is de hele reden dat deze plugin bestaat.
 *
 * Wat eraan voorafging: de kaartenstapel was met de hand gebouwd uit
 * core-Groepen met per kaart eigen inline-opvullingen, plus een stuk CSS in
 * "Extra CSS" van één site, plus een los script voor de beweging. Daar tussenin
 * stond één kaart die uit een andere plugin kwam (de callout van Mymmo Forms)
 * en die haar eigen titel, opvulling en achtergrond meebracht. Die kaart gelijk
 * krijgen met de andere betekende: eigenschap per eigenschap overtypen, via een
 * instellingenscherm, met een plugin-release per eigenschap. Dat convergeert
 * niet -- de kaarten waarmee je vergelijkt waren zelf niet gelijk.
 *
 * Daarom:
 *
 *   1. De OPVULLING staat op de STAPEL, niet per kaart. Kaarten kunnen dus niet
 *      uit elkaar lopen. Een kaart mag afwijken, maar enkel uit een gesloten
 *      lijst (krap / normaal / ruim).
 *   2. De GELIJKE HOOGTE wordt gemeten, niet ingetypt. Geen magisch getal meer
 *      dat met de hand gelijk moet blijven aan de hoogste kaart.
 *   3. MOBIEL is een eigen indeling, geen afgeleide: één breekpunt (782px,
 *      hetzelfde als de kolommen van WordPress), één opvullingsschaal, en een
 *      instelbare volgorde per kaart.
 *   4. De BEWEGING staat in deze plugin, in git, met een versienummer -- niet
 *      in "Extra CSS" van één site.
 *
 * De ingang van Mymmo Forms (het formulier of een stap, meteen bedienbaar in de
 * pagina) is gewoon een blok dat je in een kolom van een kaart zet, in zijn
 * kale modus: zonder eigen titel, achtergrond of opvulling. Deze plugin weet
 * daar niets van en heeft geen enkele koppeling met Mymmo Forms.
 *
 * EEN PLUGIN, MEERDERE COMPONENTEN
 * --------------------------------
 * Sinds 1.5.0 is dit niet meer alleen de kaartenstapel. Er komen bouwstenen bij
 * waarmee een marketeer sneller een pagina zet, en die horen bij elkaar in EEN
 * plugin: ze delen dezelfde uitgangspunten (geometrie en gedrag, nooit
 * typografie; gesloten lijsten in plaats van vrije waarden; het palet van het
 * thema als bron voor kleur) en een tweede plugin zou betekenen dat iemand er
 * een moet activeren die hij niet kent.
 *
 *   - de KAARTENSTAPEL (`includes/class-blocks.php`) -- vier blokken
 *   - de MARKEERSTIFT (`includes/class-markering.php`) -- een opmaakknop in de
 *     werkbalk van elke kop en alinea
 *   - de KNOP DIE EEN VENSTER OPENT (`includes/class-knop.php`) -- de kern-knop
 *     van WordPress met eréén keuze bij: welk tabblad van welke pop-up van
 *     Mymmo Forms hij opent
 *   - de KEIENWOLK (`includes/class-keien.php`) -- grote zwevende keien met
 *     eigen inhoud, omringd door keitjes die parallax voorbijschuiven
 *
 * De MAPNAAM blijft `mymmo-cards`. WordPress herkent een plugin aan haar pad:
 * hernoemen zou op de site een TWEEDE plugin opleveren naast de bestaande, en
 * dan staat er tot iemand het merkt twee keer dezelfde code te draaien.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('MYMMO_CARDS_VERSION', '1.8.7');
define('MYMMO_CARDS_FILE', __FILE__);
define('MYMMO_CARDS_DIR', plugin_dir_path(__FILE__));
define('MYMMO_CARDS_URL', plugin_dir_url(__FILE__));

require_once MYMMO_CARDS_DIR . 'includes/helpers.php';
require_once MYMMO_CARDS_DIR . 'includes/class-blocks.php';
require_once MYMMO_CARDS_DIR . 'includes/class-markering.php';
require_once MYMMO_CARDS_DIR . 'includes/class-knop.php';
require_once MYMMO_CARDS_DIR . 'includes/class-keien.php';

function mymmo_cards_bootstrap(): void {
    Mymmo_Cards_Blocks::init();
    Mymmo_Cards_Markering::init();
    Mymmo_Cards_Knop::init();
    Mymmo_Cards_Keien::init();
}
add_action('plugins_loaded', 'mymmo_cards_bootstrap');
