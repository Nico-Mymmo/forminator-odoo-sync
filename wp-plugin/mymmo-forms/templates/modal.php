<?php
/**
 * De knop met pop-up: [mymmo_form_button].
 *
 * Een klik opent een venster met LINKS een vaste zijkolom (waar de bezoeker is,
 * wat hem te wachten staat, een afbeelding) en RECHTS de inhoud: het formulier,
 * of de agenda (Calendly). De zijkolom is meteen de keuzebalk -- de twee
 * tabbladen staan erin als twee kaarten onder elkaar.
 *
 * Op een telefoon wordt het venster een vol scherm en klapt die zijkolom samen
 * tot een kopbalk met dezelfde twee keuzes naast elkaar. Afbeelding en
 * opsomming vallen daar weg: op 375px is elke pixel voor het formulier zelf.
 *
 * ZONDER JAVASCRIPT WERKT DIT OOK, en dat is bewust. De knop is een echte link
 * naar het venster en het venster staat gewoon in de pagina:
 *
 *   - open/dicht loopt over `:target` (de link zet de hash, de sluitknop zet
 *     ze terug naar de knop). Zie mymmo-forms-modal.css.
 *   - de tabbladen zijn dan geen tabbladen: beide delen staan onder elkaar, elk
 *     met zijn eigen kopje. Het JS-bestand verbergt die kopjes en maakt er pas
 *     echte tabbladen van.
 *   - het formulier is een gewone POST naar admin-post.php, net als elders.
 *   - alleen de agenda heeft JavaScript nodig (het is een iframe van Calendly);
 *     daar staat dus een echte link naar de Calendly-pagina als terugval.
 *
 * Beschikbaar: $form, $slug, $lang, $flash, $stale, $modal_id, $launch_id,
 * $label, $variant, $extra_class, $heading, $tab_form_label,
 * $tab_calendly_label, $tab_form_sub, $tab_calendly_sub, $close_label,
 * $calendly, $calendly_kleur, $active_tab, $auto_open, $image, $image_alt,
 * $lead, $points, $show_button, $trigger, $accent_style, $thanks_calendly,
 * $goal_calendly, $goal_form.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/** @var array<string,mixed> $form */
/** @var string $slug */
/** @var string $lang */
/** @var array<string,mixed>|null $flash */
/** @var bool $stale */
/** @var string $modal_id */
/** @var string $launch_id */
/** @var string $label */
/** @var string $variant */
/** @var string $extra_class */
/** @var string $heading */
/** @var string $tab_form_label */
/** @var string $tab_calendly_label */
/** @var string $tab_form_sub */
/** @var string $tab_calendly_sub */
/** @var string $close_label */
/** @var string $calendly */
/** @var string $calendly_kleur */
/** @var string $active_tab */
/** @var bool $auto_open */
/** @var string $image */
/** @var string $image_alt */
/** @var string $lead */
/** @var array<int,string> $points */
/** @var bool $show_button */
/** @var string $trigger */
/** @var string $accent_style */
/** @var string $thanks_calendly */
/** @var string $goal_calendly */
/** @var string $goal_form */
/** @var string $watermark */
/** @var string $image_calendly */
/** @var string $image_calendly_alt */

$heeft_agenda = $calendly !== '';
// Een tabblad dat er niet is kan niet openstaan.
$actief = ($heeft_agenda && $active_tab === 'calendly') ? 'calendly' : 'form';

// Heeft de zijkolom iets te zeggen? Enkel een titel is geen zijkolom waard --
// dan wordt het een gewone kopbalk, zoals voorheen. Een leeg gekleurd vlak van
// 300px naast een formulier van vier velden ziet eruit als een fout.
$heeft_zijkolom = $heeft_agenda || $image !== '' || $lead !== '' || $points !== [];

$titel_id       = $modal_id . '-titel';
$tab_form_id    = $modal_id . '-tab-formulier';
$tab_agenda_id  = $modal_id . '-tab-agenda';
$paneel_form_id = $modal_id . '-paneel-formulier';
$paneel_ag_id   = $modal_id . '-paneel-agenda';

// Dezelfde kleuren als het formulier zelf: de knop en de rand van het venster
// volgen het thema dat in de Operations Manager bij dit formulier staat. De
// variabelen worden hier gezet en erven door tot in het venster. $accent_style
// komt uit de shortcode en staat ACHTER het thema, zodat het thema overruled
// wordt door wat er op deze pagina getypt is -- laatste declaratie wint.
$stijl = mymmo_forms_theme_style(is_array($form['theme'] ?? null) ? $form['theme'] : []);

// Het thema van DEZE site ertussen: het wint van de Operations Manager en
// verliest van wat er op de shortcode staat. Zie mymmo_forms_site_theme_style().
$site_stijl = mymmo_forms_site_theme_style();
if ($site_stijl !== '') {
    $stijl = $stijl === '' ? $site_stijl : $stijl . ';' . $site_stijl;
}

if ($accent_style !== '') {
    $stijl = $stijl === '' ? $accent_style : $stijl . ';' . $accent_style;
}

// Waar de sluitknop naartoe wijst zonder JavaScript: terug naar de knop waar de
// bezoeker vandaan kwam. Dat haalt de :target van het venster weg EN zet hem op
// de plek in de pagina waar hij stond -- href="#" zou naar boven springen.
$terug = '#' . $launch_id;

$launch_class = 'mymmo-modal-launch';
if (!$show_button) {
    // Geen eigen knop: de wikkel mag dan geen plek innemen in de tekst. Ze
    // blijft wel staan, want ze draagt de CSS-variabelen van het thema.
    $launch_class .= ' mymmo-modal-launch--stil';
}
if ($extra_class !== '') {
    $launch_class .= ' ' . $extra_class;
}

$panel_class = 'mymmo-modal-panel';
$panel_class .= $heeft_zijkolom ? ' mymmo-modal-panel--zijkolom' : ' mymmo-modal-panel--kaal';
// Met een agenda erbij moet het venster breed genoeg zijn voor de kalender van
// Calendly IN de rechterkolom. Onder ~640px schakelt Calendly zelf naar zijn
// smalle weergave, en dan staat de maand onder de uren in plaats van ernaast.
$panel_class .= $heeft_agenda ? ' mymmo-modal-panel--breed' : '';
?>
<div class="<?php echo esc_attr($launch_class); ?>"
     id="<?php echo esc_attr($launch_id); ?>"
     lang="<?php echo esc_attr($lang); ?>"<?php echo $stijl !== '' ? ' style="' . esc_attr($stijl) . '"' : ''; ?>>

    <?php if ($show_button) : ?>
        <a class="mymmo-modal-button mymmo-modal-button--<?php echo esc_attr($variant); ?>"
           href="#<?php echo esc_attr($modal_id); ?>"
           data-mymmo-modal-open="<?php echo esc_attr($modal_id); ?>"
           aria-haspopup="dialog"
           aria-expanded="false"
           aria-controls="<?php echo esc_attr($modal_id); ?>"><?php echo esc_html($label); ?></a>
    <?php else : ?>
        <?php
        // Geen eigen knop: iets anders op de pagina moet dit venster openen. Het
        // id staat daarom in een HTML-commentaar -- zonder dat moet je de
        // broncode van de pagina afspeuren om te weten waar je knop naartoe moet
        // wijzen, en dat is precies waar iemand het opgeeft.
        ?>
        <!-- Mymmo Forms: dit venster opent met een link naar #<?php echo esc_html($modal_id); ?> -->
    <?php endif; ?>

    <div class="mymmo-modal"
         id="<?php echo esc_attr($modal_id); ?>"
         data-mymmo-modal<?php echo $auto_open ? ' data-mymmo-modal-open-now="1"' : ''; ?><?php echo $trigger !== '' ? ' data-mymmo-trigger="' . esc_attr($trigger) . '"' : ''; ?>>

        <?php
        // De achtergrond is een echte link, zodat wegklikken ook zonder
        // JavaScript sluit. aria-hidden + tabindex -1: met toetsenbord hoort de
        // sluitknop de weg naar buiten te zijn, niet dit vlak.
        ?>
        <a class="mymmo-modal-backdrop"
           href="<?php echo esc_url($terug); ?>"
           tabindex="-1"
           aria-hidden="true"
           data-mymmo-modal-close></a>

        <div class="<?php echo esc_attr($panel_class); ?>"
             role="dialog"
             aria-modal="true"
             <?php if ($heading !== '') : ?>aria-labelledby="<?php echo esc_attr($titel_id); ?>"<?php else : ?>aria-label="<?php echo esc_attr($label); ?>"<?php endif; ?>>

            <?php
            // De sluitknop hangt boven alles, rechtsboven in het venster. Als
            // eerste focusbare element: wie met een toetsenbord binnenkomt hoort
            // de uitgang meteen te vinden, niet pas na alle velden.
            ?>
            <a class="mymmo-modal-close"
               href="<?php echo esc_url($terug); ?>"
               data-mymmo-modal-close
               aria-label="<?php echo esc_attr($close_label); ?>"
               title="<?php echo esc_attr($close_label); ?>">
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
                    <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                </svg>
            </a>

            <?php
            // De kop staat over de VOLLE BREEDTE, boven de twee kolommen. Ze
            // zegt waar je bent; dat hoort niet in een van de twee kolommen
            // thuis maar erboven.
            ?>
            <?php if ($heading !== '') : ?>
                <div class="mymmo-modal-kop">
                    <h2 class="mymmo-modal-title" id="<?php echo esc_attr($titel_id); ?>"><?php echo esc_html($heading); ?></h2>
                </div>
            <?php endif; ?>

            <?php
            // Zijkolom en inhoud samen in een wikkel: die twee staan naast
            // elkaar, de kop hierboven eroverheen.
            ?>
            <div class="mymmo-modal-lijf">

            <?php if ($heeft_zijkolom) : ?>
            <aside class="mymmo-modal-aside">

                <?php if ($lead !== '') : ?>
                    <p class="mymmo-modal-lead"><?php echo esc_html($lead); ?></p>
                <?php endif; ?>

                <?php if ($heeft_agenda) : ?>
                    <?php
                    // hidden in de HTML, en het JS-bestand haalt het weg. Zonder
                    // JavaScript doen deze knoppen niets, en een balk met twee
                    // knoppen die niets doen is erger dan geen balk: beide delen
                    // staan dan gewoon onder elkaar met hun eigen kopje.
                    ?>
                    <div class="mymmo-modal-tabs" role="tablist" data-mymmo-tablist hidden>
                        <button type="button"
                                role="tab"
                                class="mymmo-modal-tab<?php echo $actief === 'form' ? ' is-active' : ''; ?>"
                                id="<?php echo esc_attr($tab_form_id); ?>"
                                aria-controls="<?php echo esc_attr($paneel_form_id); ?>"
                                aria-selected="<?php echo $actief === 'form' ? 'true' : 'false'; ?>"
                                tabindex="<?php echo $actief === 'form' ? '0' : '-1'; ?>"
                                data-mymmo-tab="form">
                            <span class="mymmo-modal-tab-icoon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">
                                    <path d="M4 5.5h16v11H8l-4 3.5z"></path>
                                    <path d="M8 9.5h8M8 12.5h5"></path>
                                </svg>
                            </span>
                            <span class="mymmo-modal-tab-tekst">
                                <span class="mymmo-modal-tab-label"><?php echo esc_html($tab_form_label); ?></span>
                                <?php if ($tab_form_sub !== '') : ?>
                                    <span class="mymmo-modal-tab-sub"><?php echo esc_html($tab_form_sub); ?></span>
                                <?php endif; ?>
                            </span>
                        </button>
                        <button type="button"
                                role="tab"
                                class="mymmo-modal-tab<?php echo $actief === 'calendly' ? ' is-active' : ''; ?>"
                                id="<?php echo esc_attr($tab_agenda_id); ?>"
                                aria-controls="<?php echo esc_attr($paneel_ag_id); ?>"
                                aria-selected="<?php echo $actief === 'calendly' ? 'true' : 'false'; ?>"
                                tabindex="<?php echo $actief === 'calendly' ? '0' : '-1'; ?>"
                                data-mymmo-tab="calendly">
                            <span class="mymmo-modal-tab-icoon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">
                                    <rect x="3.5" y="5" width="17" height="15" rx="2.5"></rect>
                                    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"></path>
                                </svg>
                            </span>
                            <span class="mymmo-modal-tab-tekst">
                                <span class="mymmo-modal-tab-label"><?php echo esc_html($tab_calendly_label); ?></span>
                                <?php if ($tab_calendly_sub !== '') : ?>
                                    <span class="mymmo-modal-tab-sub"><?php echo esc_html($tab_calendly_sub); ?></span>
                                <?php endif; ?>
                            </span>
                        </button>
                    </div>
                <?php endif; ?>

                <?php if ($points !== []) : ?>
                    <ul class="mymmo-modal-punten">
                        <?php foreach ($points as $punt) : ?>
                            <li class="mymmo-modal-punt">
                                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
                                    <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                                </svg>
                                <span><?php echo esc_html($punt); ?></span>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>

                <?php if ($image !== '' || $watermark !== '' || $image_calendly !== '') : ?>
                    <?php
                    // alt="" als er geen beschrijving is: dit is sfeerbeeld, geen
                    // informatie. Een schermlezer die de bestandsnaam voorleest
                    // is erger dan stilte.
                    //
                    // Het WATERMERK zit IN dit vlak en niet in de zijkolom. Dat
                    // is met opzet: zo houdt het zijn plaats ten opzichte van de
                    // tekening ervoor, ook als het venster van breedte
                    // verandert. Zat het aan de zijkolom vast, dan schoven de
                    // twee bij elke schermbreedte anders op en klopte de
                    // compositie alleen op het scherm waarop ze gemaakt is.
                    ?>
                    <div class="mymmo-modal-figuur<?php echo $image === '' ? ' mymmo-modal-figuur--leeg' : ''; ?>">
                        <?php
                        // De wikkel draagt de schaal, de verschuiving en de
                        // rotatie; de img alleen zichzelf. Zo staat alles in
                        // EEN transform, en heeft de bewerklaag in de bouwer
                        // een element om een greep in te hangen -- in een img
                        // kan dat niet, die heeft geen kinderen.
                        ?>
                        <?php if ($watermark !== '') : ?>
                            <span class="mymmo-modal-wm" data-mymmo-greep="watermerk">
                                <img class="mymmo-modal-watermerk"
                                     src="<?php echo esc_url($watermark); ?>"
                                     alt=""
                                     aria-hidden="true"
                                     loading="lazy"
                                     decoding="async">
                            </span>
                        <?php endif; ?>
                        <?php
                        // Een tekening per tabblad. Ze liggen over elkaar in
                        // dezelfde rastercel; het script laat zien welke bij het
                        // open tabblad hoort. Staat er maar een, dan blijft die
                        // gewoon staan bij het wisselen -- wegfaden naar niets
                        // is geen overgang maar een gat.
                        //
                        // is-actief staat hier al op de eerste: zonder
                        // JavaScript wisselt er niets, en dan hoort er wel iets
                        // te staan.
                        ?>
                        <?php if ($image !== '') : ?>
                            <span class="mymmo-modal-beeld<?php echo $actief === 'form' || $image_calendly === '' ? ' is-actief' : ''; ?>"
                                  data-mymmo-beeld="form">
                                <?php
                                // De wikkel hierboven doet de overgang tussen de
                                // tabbladen, deze laag de schaal en de
                                // verschuiving. Twee transforms op EEN element
                                // overschrijven elkaar, vandaar de splitsing --
                                // en in de bouwer hangen de omlijning en de
                                // grepen aan deze laag, zodat ze meebewegen.
                                ?>
                                <span class="mymmo-modal-stand" data-mymmo-greep="form">
                                    <img class="mymmo-modal-tekening"
                                         src="<?php echo esc_url($image); ?>"
                                         alt="<?php echo esc_attr($image_alt); ?>"
                                         loading="lazy"
                                         decoding="async">
                                </span>
                            </span>
                        <?php endif; ?>

                        <?php if ($image_calendly !== '' && $heeft_agenda) : ?>
                            <span class="mymmo-modal-beeld<?php echo $actief === 'calendly' || $image === '' ? ' is-actief' : ''; ?>"
                                  data-mymmo-beeld="calendly">
                                <span class="mymmo-modal-stand" data-mymmo-greep="calendly">
                                    <img class="mymmo-modal-tekening"
                                         src="<?php echo esc_url($image_calendly); ?>"
                                         alt="<?php echo esc_attr($image_calendly_alt); ?>"
                                         loading="lazy"
                                         decoding="async">
                                </span>
                            </span>
                        <?php endif; ?>
                    </div>
                <?php endif; ?>

            </aside>
            <?php endif; ?>

            <div class="mymmo-modal-main">
                <?php
                // data-mymmo-modal-body draagt de klasse --tabs alleen als er
                // echt twee panelen zijn: pas dan worden de panelen over elkaar
                // gelegd (zie CSS), en dat is precies wat de agenda nodig heeft
                // om haar breedte te kunnen meten terwijl ze nog onzichtbaar is.
                ?>
                <div class="mymmo-modal-body<?php echo $heeft_agenda ? ' mymmo-modal-body--tabs' : ''; ?>"
                     data-mymmo-modal-body>

                    <section class="mymmo-modal-paneel<?php echo $heeft_agenda && $actief === 'form' ? ' is-actief' : ''; ?>"
                             id="<?php echo esc_attr($paneel_form_id); ?>"
                             <?php if ($heeft_agenda) : ?>role="tabpanel" aria-labelledby="<?php echo esc_attr($tab_form_id); ?>" tabindex="0"<?php endif; ?>
                             data-mymmo-paneel="form">

                        <?php if ($heeft_agenda) : ?>
                            <h3 class="mymmo-modal-paneel-titel"><?php echo esc_html($tab_form_label); ?></h3>
                        <?php endif; ?>

                        <?php
                        echo mymmo_forms_render('form', [
                            'form' => $form,
                            'slug' => $slug,
                            // De kop staat al in de zijkolom; twee keer dezelfde
                            // titel onder elkaar leest als een fout.
                            'show_title'  => false,
                            // En de inleiding ook, als ze daar al staat.
                            'show_intro'  => $lead === '',
                            'flash'       => $flash,
                            'stale'       => $stale,
                            'lang'        => $lang,
                            // Eigen id-voorvoegsel: hetzelfde formulier mag ook
                            // nog gewoon in de tekst van deze pagina staan.
                            'instance_id' => $modal_id . '-formulier',
                            // Na het versturen weer hier uitkomen, met het
                            // venster open. Zie Mymmo_Forms_Submit::finish().
                            'anchor'      => $modal_id,
                            // Het pad dat vroeger de bedankpagina was; het
                            // reist mee in de conversiegebeurtenis.
                            'goal'        => $goal_form,
                            // En de stijl van DEZE plaatsing (kleur, opvulling,
                            // tussenruimte). Die staat al op de wikkel hierboven,
                            // maar .mymmo-form-wrap declareert dezelfde
                            // variabelen zélf -- en een eigen declaratie wint van
                            // een geërfde. Zonder deze regel bleef een accent=""
                            // of gap="" op de shortcode dus zonder effect op de
                            // velden en de verzendknop: de knop van het venster
                            // kleurde mee, het formulier erin niet.
                            'extra_style' => $accent_style,
                        ]);
                        ?>
                    </section>

                    <?php if ($heeft_agenda) : ?>
                        <section class="mymmo-modal-paneel mymmo-modal-paneel--agenda<?php echo $actief === 'calendly' ? ' is-actief' : ''; ?>"
                                 id="<?php echo esc_attr($paneel_ag_id); ?>"
                                 role="tabpanel"
                                 aria-labelledby="<?php echo esc_attr($tab_agenda_id); ?>"
                                 tabindex="0"
                                 data-mymmo-paneel="calendly">

                            <h3 class="mymmo-modal-paneel-titel"><?php echo esc_html($tab_calendly_label); ?></h3>

                            <?php
                            // De agenda zelf is een iframe van Calendly en heeft
                            // dus JavaScript nodig. Het script wordt in de
                            // achtergrond opgehaald zodra de pagina rustig is,
                            // en de kalender wordt opgebouwd zodra het VENSTER
                            // opengaat -- niet pas bij een klik op het tabblad.
                            // Tot dan (en als het ophalen mislukt) blijft de link
                            // hieronder staan, die gewoon werkt.
                            //
                            // De herkomst (utm's, bezoeker-UUID) staat hier BEWUST
                            // niet in de HTML, maar wordt in de browser opgehaald --
                            // zie mymmo-forms-modal.js. Deze pagina kan gecached
                            // zijn, en dan zou de UUID van de VORIGE bezoeker in de
                            // HTML gebakken zitten en met het gesprek van de
                            // volgende meegaan. Dat geeft geen foutmelding; er komt
                            // gewoon een afspraak, aan de verkeerde persoon gehangen.
                            // Om diezelfde reden leest de inzending haar cookies
                            // server-side op het moment van versturen.
                            ?>
                            <div class="mymmo-modal-agenda"
                                 data-mymmo-calendly="<?php echo esc_url($calendly); ?>"<?php echo $calendly_kleur !== '' ? ' data-mymmo-calendly-kleur="' . esc_attr($calendly_kleur) . '"' : ''; ?>
                                 data-mymmo-dank="<?php echo esc_attr($thanks_calendly); ?>"<?php echo $goal_calendly !== '' ? ' data-mymmo-doel="' . esc_attr($goal_calendly) . '"' : ''; ?>>
                                <p class="mymmo-modal-agenda-terugval">
                                    <a class="mymmo-modal-agenda-link"
                                       href="<?php echo esc_url($calendly); ?>"
                                       target="_blank"
                                       rel="noopener noreferrer"><?php echo esc_html($tab_calendly_label); ?></a>
                                </p>
                            </div>
                        </section>
                    <?php endif; ?>

                </div>
            </div>

            </div><?php // .mymmo-modal-lijf ?>
        </div>
    </div>
</div>
