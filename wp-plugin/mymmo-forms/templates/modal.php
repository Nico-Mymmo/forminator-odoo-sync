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
/** @var string $tab_extra_label */
/** @var string $tab_form_sub */
/** @var string $tab_calendly_sub */
/** @var string $tab_extra_sub */
/** @var array<int,string> $tab_order   de volgorde van de tabbladen */
/** @var array<string,mixed>|null $extra_form  het formulier van het derde tabblad */
/** @var string $extra_slug */
/** @var string $extra_steps */
/** @var string $extra_lang */
/** @var string $close_label */
/** @var string $calendly */
/** @var string $calendly_kleur */
/** @var string $form_title */
/** @var string $form_sub */
/** @var bool $form_heading  kop ook boven een formulier zonder stappen */
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
/** @var string $goal_extra */
/** @var array<string,array{image:string,title:string,text:string}> $dank  het dankjewelscherm per tabblad */
/** @var string $watermark */
/** @var string $image_calendly */
/** @var string $image_calendly_alt */

$heeft_agenda = $calendly !== '';
$heeft_extra  = is_array($extra_form ?? null);

/*
 * DE TABBLADEN, in de volgorde waarin ze op het scherm komen.
 *
 * Tot 1.14 stonden hier twee vaste blokken HTML (formulier en agenda), en de
 * volgorde was de volgorde waarin ze toevallig in dit bestand stonden. Met een
 * derde tabblad erbij en een instelbare volgorde is dat niet vol te houden:
 * dan staat dezelfde knop drie keer in het bestand, en moet een wijziging aan
 * de opmaak van een tabblad op drie plekken gebeuren. Nu is er EEN lijst en
 * EEN lus.
 *
 * `$tab_order` komt uit de shortcode en bevat alleen tabbladen die ook echt
 * bestaan -- zie Mymmo_Forms_Shortcodes::tab_order().
 */
$tab_bron = [
    'form' => [
        'label' => $tab_form_label,
        'sub'   => $tab_form_sub,
        'form'  => $form,
        'slug'  => $slug,
        'steps' => (string) ($steps ?? ''),
        'lang'  => $lang,
        'inst'  => $modal_id . '-formulier',
    ],
    'extra' => [
        'label' => (string) ($tab_extra_label ?? ''),
        'sub'   => (string) ($tab_extra_sub ?? ''),
        'form'  => $extra_form ?? null,
        'slug'  => (string) ($extra_slug ?? ''),
        'steps' => (string) ($extra_steps ?? ''),
        'lang'  => (string) ($extra_lang ?? $lang),
        // Een EIGEN id-voorvoegsel, ook als het hetzelfde formulier is: anders
        // staan dezelfde veld-id's twee keer in hetzelfde venster en wijst elk
        // <label> naar het verkeerde invoerveld -- in het tabblad dat je NIET
        // open hebt staan. Dat is niet te zien en breekt zowel de toegankelijk-
        // heid als het aanklikken van een label.
        'inst'  => $modal_id . '-extra',
    ],
    'calendly' => [
        'label' => $tab_calendly_label,
        'sub'   => $tab_calendly_sub,
    ],
];

$tabbladen = [];
foreach ((array) ($tab_order ?? ['form']) as $tab_id) {
    if (!isset($tab_bron[$tab_id])) {
        continue;
    }
    $tabbladen[] = $tab_bron[$tab_id] + [
        'id'        => $tab_id,
        'tab_id'    => $modal_id . '-tab-' . $tab_id,
        'paneel_id' => $modal_id . '-paneel-' . $tab_id,
    ];
}
if ($tabbladen === []) {
    $tabbladen[] = $tab_bron['form'] + [
        'id' => 'form', 'tab_id' => $modal_id . '-tab-form', 'paneel_id' => $modal_id . '-paneel-form',
    ];
}

// Een balk met een knop is geen keuze. Pas vanaf twee panelen worden ze over
// elkaar gelegd en krijgt elk paneel zijn eigen kopje.
$heeft_tabs = count($tabbladen) > 1;

// Een tabblad dat er niet is kan niet openstaan.
$ids    = array_column($tabbladen, 'id');
$actief = in_array($active_tab, $ids, true) ? $active_tab : $ids[0];

// Heeft de zijkolom iets te zeggen? Enkel een titel is geen zijkolom waard --
// dan wordt het een gewone kopbalk, zoals voorheen. Een leeg gekleurd vlak van
// 300px naast een formulier van vier velden ziet eruit als een fout.
$heeft_zijkolom = $heeft_tabs || $image !== '' || $lead !== '' || $points !== [];

$titel_id = $modal_id . '-titel';

/* De icoontjes. Vaste opmaak, geen invoer van buiten -- ze worden dus rauw
   uitgeschreven. Het derde tabblad krijgt een lijstje met vinkjes: dat leest
   als "doorloop een paar stappen", ongeacht welk opschrift eroverheen komt. */
$tab_iconen = [
    'form' => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">'
        . '<path d="M4 5.5h16v11H8l-4 3.5z"></path><path d="M8 9.5h8M8 12.5h5"></path></svg>',
    'calendly' => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">'
        . '<rect x="3.5" y="5" width="17" height="15" rx="2.5"></rect><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"></path></svg>',
    'extra' => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">'
        . '<path d="M3.5 6.5l1.5 1.5 2.5-2.5M3.5 12l1.5 1.5 2.5-2.5M3.5 17.5l1.5 1.5 2.5-2.5"></path>'
        . '<path d="M11.5 6.5h9M11.5 12h9M11.5 17.5h6"></path></svg>',
];

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

                <?php if ($heeft_tabs) : ?>
                    <?php
                    // hidden in de HTML, en het JS-bestand haalt het weg. Zonder
                    // JavaScript doen deze knoppen niets, en een balk met knoppen
                    // die niets doen is erger dan geen balk: alle delen staan dan
                    // gewoon onder elkaar met hun eigen kopje.
                    ?>
                    <div class="mymmo-modal-tabs" role="tablist" data-mymmo-tablist hidden>
                        <?php foreach ($tabbladen as $tb) : $is_actief = $actief === $tb['id']; ?>
                        <button type="button"
                                role="tab"
                                class="mymmo-modal-tab<?php
                                    echo $tb['sub'] === '' ? ' mymmo-modal-tab--kaal' : '';
                                    echo $is_actief ? ' is-active' : '';
                                ?>"
                                id="<?php echo esc_attr($tb['tab_id']); ?>"
                                aria-controls="<?php echo esc_attr($tb['paneel_id']); ?>"
                                aria-selected="<?php echo $is_actief ? 'true' : 'false'; ?>"
                                tabindex="<?php echo $is_actief ? '0' : '-1'; ?>"
                                data-mymmo-tab="<?php echo esc_attr($tb['id']); ?>">
                            <span class="mymmo-modal-tab-icoon" aria-hidden="true"><?php
                                echo $tab_iconen[$tb['id']] ?? $tab_iconen['form'];
                            ?></span>
                            <span class="mymmo-modal-tab-tekst">
                                <span class="mymmo-modal-tab-label"><?php echo esc_html($tb['label']); ?></span>
                                <?php if ($tb['sub'] !== '') : ?>
                                    <span class="mymmo-modal-tab-sub"><?php echo esc_html($tb['sub']); ?></span>
                                <?php endif; ?>
                            </span>
                        </button>
                        <?php endforeach; ?>
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
                <div class="mymmo-modal-body<?php echo $heeft_tabs ? ' mymmo-modal-body--tabs' : ''; ?>"
                     data-mymmo-modal-body>

                    <?php foreach ($tabbladen as $tb) : $is_actief = $actief === $tb['id']; ?>
                    <section class="mymmo-modal-paneel<?php
                                 echo $tb['id'] === 'calendly' ? ' mymmo-modal-paneel--agenda' : '';
                                 echo $heeft_tabs && $is_actief ? ' is-actief' : '';
                             ?>"
                             id="<?php echo esc_attr($tb['paneel_id']); ?>"
                             <?php if ($heeft_tabs) : ?>role="tabpanel" aria-labelledby="<?php echo esc_attr($tb['tab_id']); ?>" tabindex="0"<?php endif; ?>
                             data-mymmo-paneel="<?php echo esc_attr($tb['id']); ?>">

                        <?php if ($heeft_tabs) : ?>
                            <h3 class="mymmo-modal-paneel-titel"><?php echo esc_html($tb['label']); ?></h3>
                        <?php endif; ?>

                        <?php if ($tb['id'] === 'calendly') : ?>
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
                                       rel="noopener noreferrer"><?php echo esc_html($tb['label']); ?></a>
                                </p>
                            </div>
                            <?php
                            // Het dankjewelscherm na een geboekt gesprek, als
                            // sjabloon. mymmo-forms-modal.js zet het zichtbaar en
                            // de agenda weg; zie toonBedankt().
                            $dank_agenda = (array) (($dank ?? [])['calendly'] ?? []);
                            if (($dank_agenda['text'] ?? '') === '') {
                                $dank_agenda['text'] = $thanks_calendly !== ''
                                    ? $thanks_calendly
                                    : 'Je gesprek staat ingepland. Je krijgt de bevestiging per mail.';
                            }
                            echo mymmo_forms_render_dank('calendly', $dank_agenda, false); // phpcs:ignore WordPress.Security.EscapeOutput
                            ?>
                        <?php else : ?>
                            <?php
                            // Staat er een stappenreeks op dit tabblad, dan is dit
                            // paneel de hele reeks en is het formulier de laatste
                            // stap ervan. Exact dezelfde aanroep als bij
                            // [mymmo_form] in een pagina -- zie
                            // mymmo_forms_render_body().
                            // Het dankjewelscherm van DIT tabblad. De standaardtekst
                            // is de bedanktekst uit de OM -- dezelfde zin die tot
                            // 1.15 als melding boven het formulier stond.
                            $dank_tab = (array) (($dank ?? [])[$tb['id']] ?? []);
                            if (($dank_tab['text'] ?? '') === '' && is_array($tb['form'])) {
                                $dank_tab['text'] = Mymmo_Forms_I18n::text($tb['form'], $tb['lang'], 'success_message');
                                if ($dank_tab['text'] === '') {
                                    $dank_tab['text'] = 'Bedankt, we hebben je bericht goed ontvangen.';
                                }
                            }

                            // Hoort de melding na het versturen bij DIT tabblad?
                            // Een melding zonder tabblad (van voor 1.16) hoort bij
                            // elk tabblad met hetzelfde formulier.
                            $flash_hier = is_array($flash)
                                && ($flash['slug'] ?? '') === $tb['slug']
                                && in_array((string) ($flash['tab'] ?? ''), ['', $tb['id']], true)
                                ? $flash : null;

                            $doel_tab = $tb['id'] === 'extra' ? (string) ($goal_extra ?? $goal_form) : $goal_form;

                            $geslaagd = is_array($flash_hier) && ($flash_hier['status'] ?? '') === 'success' && is_array($tb['form']);
                            if ($geslaagd) :
                                // Geen eigen tekst getypt: dan de melding van de
                                // inzending zelf -- de bedanktekst uit de OM in de
                                // taal waarin de bezoeker verstuurde.
                                if ((string) ((($dank ?? [])[$tb['id']] ?? [])['text'] ?? '') === ''
                                    && (string) ($flash_hier['message'] ?? '') !== '') {
                                    $dank_tab['text'] = (string) $flash_hier['message'];
                                }
                                echo mymmo_forms_render_dank_geslaagd($tb['form'], $tb['slug'], [ // phpcs:ignore WordPress.Security.EscapeOutput
                                    'goal'        => $doel_tab,
                                    'tab'         => $tb['id'],
                                    'extra_style' => $accent_style,
                                ], $dank_tab);
                            else :
                            echo mymmo_forms_render_body($tb['steps'], $tb['form'], $tb['slug'], [
                                'form' => $tb['form'],
                                'slug' => $tb['slug'],
                                // De kop staat al in de zijkolom; twee keer dezelfde
                                // titel onder elkaar leest als een fout.
                                'show_title'  => false,
                                // En de inleiding ook, als ze daar al staat.
                                'show_intro'  => $lead === '',
                                'flash'       => $flash_hier,
                                'stale'       => $stale,
                                'lang'        => $tb['lang'],
                                // Eigen id-voorvoegsel: hetzelfde formulier mag ook
                                // nog gewoon in de tekst van deze pagina staan, en
                                // kan bovendien in twee tabbladen tegelijk staan.
                                'instance_id' => $tb['inst'],
                                // Na het versturen weer hier uitkomen, met het
                                // venster open. Zie Mymmo_Forms_Submit::finish().
                                'anchor'      => $modal_id,
                                // Het pad dat vroeger de bedankpagina was; het
                                // reist mee in de conversiegebeurtenis.
                                'goal'        => $doel_tab,
                                // Welk tabblad: gaat mee in de POST, zodat het
                                // dankjewelscherm van DIT tabblad terugkomt.
                                'tab'         => $tb['id'],
                                // En de stijl van DEZE plaatsing (kleur, opvulling,
                                // tussenruimte). Die staat al op de wikkel hierboven,
                                // maar .mymmo-form-wrap declareert dezelfde
                                // variabelen zelf -- en een eigen declaratie wint van
                                // een geerfde. Zonder deze regel bleef een accent=""
                                // of gap="" op de shortcode dus zonder effect op de
                                // velden en de verzendknop: de knop van het venster
                                // kleurde mee, het formulier erin niet.
                                'extra_style' => $accent_style,
                                // De kop boven het formulier wanneer het de
                                // laatste stap van een reeks is. Zonder die kop
                                // begint stap 2 abrupt met een invoerveld
                                // terwijl stap 1 een titel had.
                                'form_title'  => $form_title,
                                'form_sub'    => $form_sub,
                                // En dezelfde kop boven een formulier ZONDER
                                // stappen ("Stuur een bericht"), tenzij uitgezet.
                                'form_heading' => !isset($form_heading) || $form_heading,
                            ]);
                                // Het sjabloon voor de bouwer (bewerken in het voorbeeld).
                                echo mymmo_forms_render_dank($tb['id'], $dank_tab, false); // phpcs:ignore WordPress.Security.EscapeOutput
                            endif;
                            ?>
                        <?php endif; ?>
                    </section>
                    <?php endforeach; ?>

                </div>
            </div>

            </div><?php // .mymmo-modal-lijf ?>
        </div>
    </div>
</div>
