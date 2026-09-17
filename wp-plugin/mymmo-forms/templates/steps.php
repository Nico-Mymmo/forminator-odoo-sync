<?php
/**
 * De stappenreeks.
 *
 * Beschikbaar: $stappen (uit Mymmo_Forms_Steps::resolve), $form_args (alles wat
 * templates/form.php nodig heeft), $form, $slug, $wrap_id, $ontbrekend, $lang.
 *
 * De LAATSTE stap is altijd het formulier zelf. De stappen ervoor zijn ruwe
 * HTML uit wp-admin; ze worden hier server-side uitgeschreven en niet met
 * innerHTML ingevoegd. Dat is geen detail: een <script> dat via innerHTML in de
 * pagina komt wordt door de browser NIET uitgevoerd, en dan doet een
 * interactieve stap gewoon niets -- zonder foutmelding.
 *
 * ZONDER JAVASCRIPT
 * -----------------
 * Een stappenreeks met interactieve stappen kan niet zonder JavaScript werken.
 * De eerlijke terugval is dan ook niet "toon stap 1" (daar kom je nooit voorbij)
 * maar: laat de HTML-stappen weg en toon meteen het echte formulier. De
 * bezoeker kan dan versturen; de verborgen velden blijven leeg. Dat gebeurt met
 * een <noscript><style>, want dat is het enige dat werkt zonder dat er eerst
 * script moet draaien om iets te tonen -- en dus zonder dat er iets flikkert
 * voor wie JavaScript wél aan heeft.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/** @var array<int,array<string,mixed>> $stappen */
/** @var array<string,mixed> $form_args */
/** @var array<string,mixed> $form */
/** @var string $slug */
/** @var string $wrap_id */
/** @var array<int,string> $ontbrekend */
/** @var string $lang */
/** @var string|null $extra_style  stijl van DEZE plaatsing */

// step_messages() en niet messages(): 'back'/'next'/'step_of' kunnen in een
// oudere payload nog ontbreken, en een naamloze knop is geen knop.
$teksten = Mymmo_Forms_I18n::step_messages($form, $lang);

// De sleutels van de verborgen velden in het formulier. Alleen daarin kan een
// stap een waarde kwijt; de rest van het formulier is zichtbare invoer.
$verborgen = [];
foreach ((array) ($form['fields'] ?? []) as $veld) {
    if (is_array($veld) && ($veld['type'] ?? '') === 'hidden' && ($veld['key'] ?? '') !== '') {
        $verborgen[] = (string) $veld['key'];
    }
}

// Wat een stap belooft af te leveren maar nergens heen kan. Alleen zichtbaar
// voor een beheerder: een bezoeker kan er niets mee, en het is precies het
// soort fout dat je anders pas in Odoo merkt -- als een leeg veld.
$zwevend = [];
foreach ($stappen as $stap) {
    foreach ((array) $stap['fields'] as $sleutel) {
        if (!in_array($sleutel, $verborgen, true) && !in_array($sleutel, $zwevend, true)) {
            $zwevend[] = $sleutel;
        }
    }
}

// Waar begint de bezoeker? Normaal bij de eerste stap. Maar komt hij terug van
// een mislukte inzending, dan staat zijn melding bij het FORMULIER en moeten we
// daar ook uitkomen -- hem opnieuw door de schuifbalken sturen terwijl zijn
// antwoorden nog in de verborgen velden zitten, is het ergste wat je kan doen.
$start = is_array($form_args['flash'] ?? null) ? count($stappen) : 0;
$totaal = count($stappen) + 1;

// Dezelfde cascade als het formulier eronder. Nodig omdat de knoppen van de
// reeks BUITEN .mymmo-form-wrap staan en dus niets van die variabelen erven.
$reeks_stijl = mymmo_forms_wrap_style(
    is_array($form['theme'] ?? null) ? $form['theme'] : [],
    (isset($extra_style) && is_string($extra_style)) ? $extra_style : ''
);

$terug_label = (string) $teksten['back'];
$next_label  = (string) $teksten['next'];
$teller_tekst = static function (int $nu, int $van) use ($teksten): string {
    return str_replace(['{n}', '{total}'], [(string) $nu, (string) $van], (string) $teksten['step_of']);
};
?>
<?php
// De brug moet bestaan VOORDAT de eerste stap geparsed wordt: het script van
// een stap draait tijdens het parsen van de pagina, en mymmo-forms-steps.js
// staat in de voettekst. Dit stukje is dus geen dubbel werk maar de enige
// volgorde die kan. Het bewaart alleen wat er binnenkomt; het echte script
// werkt de rij daarna af.
//
// Een keer per pagina, ook als er twee reeksen op staan.
if (!defined('MYMMO_FORMS_STAPPEN_BRUG')) {
    define('MYMMO_FORMS_STAPPEN_BRUG', true);
    echo wp_get_inline_script_tag(
        'window.MymmoStappen=window.MymmoStappen||{_rij:[],stap:function(s,f){this._rij.push([s,f]);}};'
    );
}
?>
<div class="mymmo-stappen"
     id="<?php echo esc_attr($wrap_id); ?>"
     data-mymmo-stappen
     data-mymmo-start="<?php echo esc_attr((string) $start); ?>"
     data-mymmo-slug="<?php echo esc_attr($slug); ?>"
     data-mymmo-teksten="<?php echo esc_attr((string) wp_json_encode($teksten)); ?>"<?php echo $reeks_stijl !== '' ? ' style="' . esc_attr($reeks_stijl) . '"' : ''; ?>>

    <noscript>
        <style>
            #<?php echo esc_html($wrap_id); ?> [data-mymmo-stap] { display: block !important; }
            #<?php echo esc_html($wrap_id); ?> [data-mymmo-stap].mymmo-stap--html { display: none !important; }
            #<?php echo esc_html($wrap_id); ?> .mymmo-stappen-teller,
            #<?php echo esc_html($wrap_id); ?> .mymmo-stap-nav { display: none !important; }
        </style>
    </noscript>

    <?php if (current_user_can('manage_options') && ($ontbrekend !== [] || $zwevend !== [])) : ?>
        <div class="mymmo-form-notice mymmo-form-notice--admin">
            <?php if ($ontbrekend !== []) : ?>
                Deze stappen bestaan niet (meer): <?php echo esc_html(implode(', ', $ontbrekend)); ?>.
                Kijk na bij Instellingen → Mymmo Forms → Stappen.
            <?php endif; ?>
            <?php if ($zwevend !== []) : ?>
                <?php echo $ontbrekend !== [] ? '<br>' : ''; ?>
                Deze sleutels worden door een stap gevuld, maar het formulier
                "<?php echo esc_html($slug); ?>" heeft er geen verborgen veld voor:
                <?php echo esc_html(implode(', ', $zwevend)); ?>.
                Voeg ze toe in de Operations Manager, anders komt die waarde nergens aan.
            <?php endif; ?>
        </div>
    <?php endif; ?>

    <p class="mymmo-stappen-teller" data-mymmo-teller aria-live="polite">
        <?php echo esc_html($teller_tekst($start + 1, $totaal)); ?>
    </p>

    <?php foreach ($stappen as $index => $stap) : ?>
        <?php
        $zelf = ($stap['nav'] ?? '') === Mymmo_Forms_Steps::NAV_ZELF;
        ?>
        <section class="mymmo-stap mymmo-stap--html"
                 data-mymmo-stap="<?php echo esc_attr((string) $index); ?>"
                 data-mymmo-stap-naam="<?php echo esc_attr((string) $stap['id']); ?>"
                 data-mymmo-stap-velden="<?php echo esc_attr(implode(',', (array) $stap['fields'])); ?>"
                 data-mymmo-stap-nav="<?php echo esc_attr($zelf ? 'zelf' : 'plugin'); ?>"
                 <?php echo $index === $start ? '' : 'hidden'; ?>>

            <?php $stap_sub = (string) ($stap['sub'] ?? ''); ?>
            <?php if (($stap['title'] ?? '') !== '') : ?>
                <h3 class="mymmo-stap-titel<?php echo $stap_sub !== '' ? ' mymmo-stap-titel--met-tekst' : ''; ?>"
                    data-mymmo-kop="titel"><?php echo esc_html((string) $stap['title']); ?></h3>
            <?php endif; ?>

            <?php if ($stap_sub !== '') : ?>
                <p class="mymmo-stap-tekst" data-mymmo-kop="sub"><?php echo esc_html($stap_sub); ?></p>
            <?php endif; ?>

            <div class="mymmo-stap-inhoud" data-mymmo-stap-inhoud>
                <?php
                // Bewust ongefilterd. Dit is de hele reden dat deze pagina achter
                // `unfiltered_html` zit: wat hier staat is door een beheerder
                // geschreven, net als een Custom HTML-blok in een pagina.
                //
                // render_html() en niet $stap['html']: dat past de tekst-
                // aanpassingen toe die iemand in het voorbeeld van de bouwer
                // maakte. Ze staan apart van de HTML bewaard, zodat het opnieuw
                // inladen van het bestand ze niet wist.
                echo Mymmo_Forms_Steps::render_html($stap); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                ?>
            </div>

            <?php if (!$zelf) : ?>
                <div class="mymmo-stap-nav">
                    <?php
                    // De eerste stap heeft geen "Vorige" -- er is niets ervoor.
                    // Hij blijft wel in de rij staan (zichtbaar uitgeschakeld zou
                    // beloven dat er iets terug is), dus de knop wordt weggelaten
                    // en de "Volgende" staat rechts door justify-content.
                    ?>
                    <?php if ($index > 0) : ?>
                        <button type="button" class="mymmo-stap-knop mymmo-stap-knop--terug" data-mymmo-vorige>
                            <?php echo esc_html(($stap['back'] ?? '') !== '' ? (string) $stap['back'] : $terug_label); ?>
                        </button>
                    <?php endif; ?>
                    <button type="button" class="mymmo-stap-knop mymmo-stap-knop--verder" data-mymmo-volgende>
                        <?php echo esc_html(($stap['next'] ?? '') !== '' ? (string) $stap['next'] : $next_label); ?>
                    </button>
                </div>
            <?php endif; ?>
        </section>
    <?php endforeach; ?>

    <section class="mymmo-stap mymmo-stap--formulier"
             data-mymmo-stap="<?php echo esc_attr((string) count($stappen)); ?>"
             data-mymmo-stap-naam="formulier"
             <?php echo count($stappen) === $start ? '' : 'hidden'; ?>>

        <?php
        // De laatste stap IS het formulier en heeft dus geen stap-record met
        // een titel erin. Zonder kop begint stap 2 abrupt met een invoerveld
        // terwijl stap 1 een titel en een regel uitleg had. Dezelfde kop als op
        // een tabblad zonder stappen: zie mymmo_forms_form_kop() -- de shortcode
        // wint, anders de naam en de inleiding uit de OM.
        $kop_html = is_array($form) ? mymmo_forms_form_kop($form, array_merge($form_args, ['lang' => $lang])) : '';
        echo $kop_html; // phpcs:ignore WordPress.Security.EscapeOutput -- opgebouwd met esc_html()
        ?>

        <?php
        // De "Vorige" van de laatste stap gaat MEE in het formulier, naast de
        // verzendknop. Een eigen knoppenrij eronder zou twee rijen knoppen
        // geven waarvan de onderste de belangrijkste niet is.
        echo mymmo_forms_render('form', array_merge($form_args, [
            'step_back' => count($stappen) > 0 ? $terug_label : '',
            // De kop staat hierboven al als stap-titel en regel uitleg; het
            // formulier mag ze niet nog eens tonen.
            'show_title' => $kop_html === '' ? ($form_args['show_title'] ?? true) : false,
            'show_intro' => $kop_html === '' ? ($form_args['show_intro'] ?? null) : false,
            'kop_html'   => '',
        ]));
        ?>
    </section>
</div>
