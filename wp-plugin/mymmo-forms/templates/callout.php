<?php
/**
 * De CALLOUT: een blok in de pagina dat één onderdeel van het venster al toont.
 *
 * Dat onderdeel is een STAP, het FORMULIER of de AGENDA uit de opstelling. De
 * bezoeker kan het hier meteen bedienen; klikt hij op de knop, dan gaat het
 * venster open op precies dat onderdeel, met wat hij invulde.
 *
 * TWEE INDELINGEN, en er is geen derde:
 *
 *   kolommen  Twee kolommen. De ene draagt het uitgelichte onderdeel, de andere
 *             de titel, de tekst en een afbeelding -- dat is het deel dat een
 *             marketeer opmaakt.
 *   breed     Eén kolom over de volle breedte. Bovenaan de titel en de
 *             subtekst, daaronder het uitgelichte onderdeel. Voor iets dat
 *             plaats vraagt: dertien keien passen niet in een halve callout.
 *             Staat er een afbeelding, dan komt die naast de titel -- niet
 *             boven het uitgelichte onderdeel, want dat is de hoofdzaak.
 *
 * EEN STAP OF HET FORMULIER IS HETZELFDE ELEMENT ALS IN HET VENSTER.
 * Niet een kopie: bij het openen verhuist het ernaartoe, bij het sluiten komt
 * het terug (zie mymmo-forms-steps.js). Een kopie zou de WAARDE kunnen
 * overdragen maar niet de STAND van de bediening -- een schuifbalk nog wel, een
 * vinkje dat een stap in zijn eigen script bijhoudt niet. Dan staat er in het
 * venster iets anders dan wat de bezoeker aanklikte, en dat ziet niemand.
 *
 * DE AGENDA VERHUIST NIET. Een iframe dat je verplaatst laadt opnieuw; ze krijgt
 * hier dus haar eigen kalender. Er is ook niets over te dragen -- zolang er geen
 * uur gekozen is, is er geen invoer.
 *
 * ER WORDT NIETS WEGGELATEN. Wat een stap meebrengt -- de tekening van het
 * gebouw bij de schuifbalk -- staat hier volledig. Dat IS de ervaring waarvoor
 * een callout bestaat.
 *
 * GEEN SCHUIFBALKEN. Geen vaste hoogte, geen overflow: het kaartje groeit mee
 * met wat erin staat. Past het niet in twee kolommen, dan is dat een reden voor
 * de brede indeling.
 *
 * Beschikbaar: $modal_id, $uitgelicht, $titel, $titel_kort, $tekst, $cta,
 * $beeld, $beeld_alt, $layout, $sectie, $agenda, $klasse, $stijl.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/** @var string $modal_id */
/** @var string $uitgelicht  stap-id, 'form' of 'calendly' */
/** @var string $titel */
/** @var string $titel_kort  kortere kop voor een smal blok, of '' */
/** @var string $tekst */
/** @var string $cta */
/** @var string $beeld */
/** @var string $beeld_alt */
/** @var string $layout      'kolommen' of 'breed' */
/** @var string $sectie      de gedokte sectie (stap of formulier), al opgebouwd */
/** @var array<string,string>|null $agenda  de kalender, als die uitgelicht is */
/** @var string $klasse */
/** @var string $stijl */

$titel_kort = trim((string) ($titel_kort ?? ''));

// Staat er alleen een korte titel, dan is dat gewoon DE titel. Twee koppen
// renderen waarvan er een altijd verborgen is, levert een kop op die op geen
// enkele breedte te zien is.
if ($titel === '' && $titel_kort !== '') {
    $titel      = $titel_kort;
    $titel_kort = '';
}

$breed  = $layout === 'breed';
$agenda = is_array($agenda ?? null) ? $agenda : null;
$sectie = (string) ($sectie ?? '');

$klassen = 'mymmo-callout mymmo-callout--' . ($breed ? 'breed' : 'kolommen');
if ($beeld === '') {
    $klassen .= ' mymmo-callout--zonder-beeld';
}
if ($klasse !== '') {
    $klassen .= ' ' . $klasse;
}
?>
<section class="<?php echo esc_attr($klassen); ?>"<?php echo $stijl !== '' ? ' style="' . esc_attr($stijl) . '"' : ''; ?>>
  <?php
  // Het raster staat in een EIGEN element, zodat de callout eromheen de
  // container kan zijn waar de kolommen op reageren. Een callout staat in de
  // inhoudskolom van een pagina, en die is vaak smaller dan het scherm -- op de
  // breedte van het SCHERM omslaan gaf dus één kolom op een plek waar er twee
  // pasten. Zie mymmo-forms-callout.css.
  ?>
  <div class="mymmo-callout-raster">

    <?php
    // De kolom van de marketeer: titel, tekst, afbeelding. In de brede indeling
    // staat dit blok bovenaan over de volle breedte.
    ?>
    <div class="mymmo-callout-tekst">
        <?php if ($titel !== '' || $tekst !== '') : ?>
            <div class="mymmo-callout-kop">
                <?php if ($titel !== '') : ?>
                    <?php
                    // Beide koppen staan in de markup; de CSS toont er een, op de
                    // breedte van het BLOK. Server-side kiezen kan niet: de pagina
                    // wordt gecachet en weet dus niet op welk scherm ze belandt.
                    ?>
                    <h2 class="mymmo-callout-titel<?php echo $titel_kort !== '' ? ' mymmo-callout-titel--lang' : ''; ?>"><?php echo esc_html($titel); ?></h2>
                    <?php if ($titel_kort !== '') : ?>
                        <h2 class="mymmo-callout-titel mymmo-callout-titel--kort"><?php echo esc_html($titel_kort); ?></h2>
                    <?php endif; ?>
                <?php endif; ?>
                <?php if ($tekst !== '') : ?>
                    <p class="mymmo-callout-uitleg"><?php echo esc_html($tekst); ?></p>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <?php if ($beeld !== '') : ?>
            <?php
            // alt="" als er geen beschrijving is: dit is sfeerbeeld, geen
            // informatie. Een schermlezer die de bestandsnaam voorleest is erger
            // dan stilte.
            ?>
            <div class="mymmo-callout-figuur">
                <img class="mymmo-callout-beeld"
                     src="<?php echo esc_url($beeld); ?>"
                     alt="<?php echo esc_attr($beeld_alt); ?>"
                     loading="lazy"
                     decoding="async">
            </div>
        <?php endif; ?>
    </div>

    <?php // De kolom met het uitgelichte onderdeel, plus de knop die opent. ?>
    <div class="mymmo-callout-uitgelicht">
        <?php
        // Het DOK. Hier woont de stap of het formulier zolang het venster dicht
        // is; zodra het opengaat schuift mymmo-forms-steps.js het naar de plek
        // die daar voor hem opengehouden wordt.
        //
        // Het staat er SERVER-SIDE al in, niet pas na een script: anders ziet de
        // bezoeker eerst een leeg kaartje en springt het daarna vol.
        ?>
        <div class="mymmo-callout-dok" data-mymmo-dok>
            <?php if ($agenda !== null) : ?>
                <?php
                // Dezelfde kalender als op het tabblad van het venster, met
                // dezelfde gegevens. mymmo-forms-modal.js bouwt elke agenda die
                // niet in een venster staat meteen op.
                ?>
                <div class="mymmo-modal-agenda"
                     data-mymmo-calendly="<?php echo esc_url((string) $agenda['url']); ?>"
                     <?php echo (string) $agenda['kleur'] !== '' ? 'data-mymmo-calendly-kleur="' . esc_attr((string) $agenda['kleur']) . '"' : ''; ?>
                     data-mymmo-dank="<?php echo esc_attr((string) $agenda['dank']); ?>"
                     <?php echo (string) $agenda['doel'] !== '' ? 'data-mymmo-doel="' . esc_attr((string) $agenda['doel']) . '"' : ''; ?>>
                    <p class="mymmo-modal-agenda-terugval">
                        <a class="mymmo-modal-agenda-link"
                           href="<?php echo esc_url((string) $agenda['url']); ?>"
                           target="_blank"
                           rel="noopener noreferrer"><?php echo esc_html((string) $agenda['label']); ?></a>
                    </p>
                </div>
            <?php else : ?>
                <?php echo $sectie; // phpcs:ignore WordPress.Security.EscapeOutput -- mymmo_forms_gedokte_sectie() ?>
            <?php endif; ?>
        </div>

        <div class="mymmo-callout-actie">
            <?php
            // Een echte link naar het venster, net als de knop van een
            // knop-ingang. Zonder JavaScript opent dat het venster via :target;
            // met JavaScript vangt mymmo-forms-modal.js de klik af en verhuist
            // het uitgelichte onderdeel mee.
            ?>
            <a class="mymmo-callout-knop"
               href="#<?php echo esc_attr($modal_id); ?>"
               data-mymmo-modal-open="<?php echo esc_attr($modal_id); ?>"
               data-mymmo-callout-knop
               aria-haspopup="dialog"
               aria-expanded="false"
               aria-controls="<?php echo esc_attr($modal_id); ?>">
                <span class="mymmo-callout-knop-tekst"><?php echo esc_html($cta); ?></span>
                <svg class="mymmo-callout-pijl" viewBox="0 0 20 20" width="16" height="16"
                     aria-hidden="true" focusable="false">
                    <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor"
                          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </a>
        </div>
    </div>

  </div>
</section>
