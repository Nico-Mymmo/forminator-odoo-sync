<?php
/**
 * De knop met pop-up: [mymmo_form_button].
 *
 * Een knop in de tekst; een klik opent een venster met twee tabbladen -- het
 * formulier, en de agenda (Calendly) om meteen een gesprek te kiezen.
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
 * $tab_calendly_label, $close_label, $calendly, $active_tab, $auto_open.
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
/** @var string $close_label */
/** @var string $calendly */
/** @var string $active_tab */
/** @var bool $auto_open */

$heeft_agenda = $calendly !== '';
// Een tabblad dat er niet is kan niet openstaan.
$actief = ($heeft_agenda && $active_tab === 'calendly') ? 'calendly' : 'form';

$titel_id       = $modal_id . '-titel';
$tab_form_id    = $modal_id . '-tab-formulier';
$tab_agenda_id  = $modal_id . '-tab-agenda';
$paneel_form_id = $modal_id . '-paneel-formulier';
$paneel_ag_id   = $modal_id . '-paneel-agenda';

// Dezelfde kleuren als het formulier zelf: de knop en de rand van het venster
// volgen het thema dat in de Operations Manager bij dit formulier staat. De
// variabelen worden hier gezet en erven door tot in het venster.
$stijl = mymmo_forms_theme_style(is_array($form['theme'] ?? null) ? $form['theme'] : []);

// Waar de sluitknop naartoe wijst zonder JavaScript: terug naar de knop waar de
// bezoeker vandaan kwam. Dat haalt de :target van het venster weg EN zet hem op
// de plek in de pagina waar hij stond -- href="#" zou naar boven springen.
$terug = '#' . $launch_id;
?>
<div class="mymmo-modal-launch<?php echo $extra_class !== '' ? ' ' . esc_attr($extra_class) : ''; ?>"
     id="<?php echo esc_attr($launch_id); ?>"
     lang="<?php echo esc_attr($lang); ?>"<?php echo $stijl !== '' ? ' style="' . esc_attr($stijl) . '"' : ''; ?>>

    <a class="mymmo-modal-button mymmo-modal-button--<?php echo esc_attr($variant); ?>"
       href="#<?php echo esc_attr($modal_id); ?>"
       data-mymmo-modal-open="<?php echo esc_attr($modal_id); ?>"
       aria-haspopup="dialog"
       aria-expanded="false"
       aria-controls="<?php echo esc_attr($modal_id); ?>"><?php echo esc_html($label); ?></a>

    <div class="mymmo-modal"
         id="<?php echo esc_attr($modal_id); ?>"
         data-mymmo-modal<?php echo $auto_open ? ' data-mymmo-modal-open-now="1"' : ''; ?>>

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

        <div class="mymmo-modal-panel"
             role="dialog"
             aria-modal="true"
             <?php if ($heading !== '') : ?>aria-labelledby="<?php echo esc_attr($titel_id); ?>"<?php else : ?>aria-label="<?php echo esc_attr($label); ?>"<?php endif; ?>>

            <div class="mymmo-modal-head">
                <?php if ($heading !== '') : ?>
                    <h2 class="mymmo-modal-title" id="<?php echo esc_attr($titel_id); ?>"><?php echo esc_html($heading); ?></h2>
                <?php else : ?>
                    <span class="mymmo-modal-title mymmo-modal-title--leeg" aria-hidden="true"></span>
                <?php endif; ?>

                <a class="mymmo-modal-close"
                   href="<?php echo esc_url($terug); ?>"
                   data-mymmo-modal-close
                   aria-label="<?php echo esc_attr($close_label); ?>"
                   title="<?php echo esc_attr($close_label); ?>">
                    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
                        <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                    </svg>
                </a>
            </div>

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
                            data-mymmo-tab="form"><?php echo esc_html($tab_form_label); ?></button>
                    <button type="button"
                            role="tab"
                            class="mymmo-modal-tab<?php echo $actief === 'calendly' ? ' is-active' : ''; ?>"
                            id="<?php echo esc_attr($tab_agenda_id); ?>"
                            aria-controls="<?php echo esc_attr($paneel_ag_id); ?>"
                            aria-selected="<?php echo $actief === 'calendly' ? 'true' : 'false'; ?>"
                            tabindex="<?php echo $actief === 'calendly' ? '0' : '-1'; ?>"
                            data-mymmo-tab="calendly"><?php echo esc_html($tab_calendly_label); ?></button>
                </div>
            <?php endif; ?>

            <div class="mymmo-modal-body" data-mymmo-modal-body>

                <section class="mymmo-modal-paneel"
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
                        // De kop staat al bovenaan het venster; twee keer
                        // dezelfde titel onder elkaar leest als een fout.
                        'show_title'  => false,
                        'flash'       => $flash,
                        'stale'       => $stale,
                        'lang'        => $lang,
                        // Eigen id-voorvoegsel: hetzelfde formulier mag ook nog
                        // gewoon in de tekst van deze pagina staan.
                        'instance_id' => $modal_id . '-formulier',
                        // Na het versturen weer hier uitkomen, met het venster
                        // open. Zie Mymmo_Forms_Submit::finish().
                        'anchor'      => $modal_id,
                    ]);
                    ?>
                </section>

                <?php if ($heeft_agenda) : ?>
                    <section class="mymmo-modal-paneel"
                             id="<?php echo esc_attr($paneel_ag_id); ?>"
                             role="tabpanel"
                             aria-labelledby="<?php echo esc_attr($tab_agenda_id); ?>"
                             tabindex="0"
                             data-mymmo-paneel="calendly">

                        <h3 class="mymmo-modal-paneel-titel"><?php echo esc_html($tab_calendly_label); ?></h3>

                        <?php
                        // De agenda zelf is een iframe van Calendly en heeft dus
                        // JavaScript nodig. Het script wordt pas opgehaald als
                        // iemand dit tabblad echt opent -- een bezoeker die
                        // alleen het formulier invult, haalt niets bij Calendly
                        // op. Tot dan (en als het ophalen mislukt) blijft de
                        // link hieronder staan, die gewoon werkt.
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
                             data-mymmo-calendly="<?php echo esc_url($calendly); ?>">
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
    </div>
</div>
