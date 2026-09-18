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
/** @var bool|null $naakt      geen eigen data-mymmo-stappen-wikkel (callout) */
/** @var int|null  $dok_index  welke stap in de pagina staat in plaats van hier */

// Bij een callout ligt de wikkel met data-mymmo-stappen om het venster EN om
// het kaartje in de pagina heen; die wordt daar gezet, niet hier. Wat hier
// blijft staan is de .mymmo-stappen-DIV zelf: die draagt de opmaak en is de
// schakel in de flexketen van het paneel (paneel -> stappen -> stap -> inhoud).
$naakt     = !empty($naakt);
$dok_index = isset($dok_index) ? (int) $dok_index : -1;

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
// De brug moet bestaan VOORDAT de eerste stap geparsed wordt. Een keer per
// pagina, ook als er twee reeksen op staan -- en ook als een callout zijn stap
// al eerder uitschreef. Zie mymmo_forms_stappen_brug().
echo mymmo_forms_stappen_brug(); // phpcs:ignore WordPress.Security.EscapeOutput
?>
<?php
// data-mymmo-stappen-inhoud enkel in de NAAKTE vorm, want daar is het nodig: de
// wikkel met de reeks ligt bij een callout om het hele venster heen, en dat
// venster kan meerdere formulieren bevatten (een tabblad "Stuur een bericht"
// naast een tabblad met stappen). Zonder dit merkteken pakt de reeks het eerste
// formulier dat ze tegenkomt, en dat is het verkeerde -- de waarden uit de
// callout komen dan nergens aan. Zie mymmo-forms-steps.js.
?>
<div class="mymmo-stappen"<?php echo $naakt ? ' data-mymmo-stappen-inhoud' : ''; ?><?php if (!$naakt) : ?>
     id="<?php echo esc_attr($wrap_id); ?>"
     data-mymmo-stappen
     data-mymmo-start="<?php echo esc_attr((string) $start); ?>"
     data-mymmo-slug="<?php echo esc_attr($slug); ?>"
     data-mymmo-teksten="<?php echo esc_attr((string) wp_json_encode($teksten)); ?>"<?php endif; ?><?php echo $reeks_stijl !== '' ? ' style="' . esc_attr($reeks_stijl) . '"' : ''; ?>>

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

    <?php if ($totaal > 1) : ?>
        <?php // "Stap 1 van 1" is geen voortgang maar ruis. ?>
        <p class="mymmo-stappen-teller" data-mymmo-teller aria-live="polite">
            <?php echo esc_html($teller_tekst($start + 1, $totaal)); ?>
        </p>
    <?php endif; ?>

    <?php foreach ($stappen as $index => $stap) : ?>
        <?php if ($index === $dok_index) : ?>
            <?php
            // Deze stap staat in de PAGINA, in het kaartje van de callout. Hier
            // blijft alleen zijn plaats open: zodra het venster opengaat schuift
            // mymmo-forms-steps.js hem hiervoor.
            //
            // Een teken erin, geen leeg element: een leeg element kan onderweg
            // weggefilterd worden (zie CLAUDE.md, de stappen op syndicoach.be) en
            // dan komt de stap in het venster op de verkeerde plek terecht.
            ?>
            <span class="mymmo-stap-anker" data-mymmo-thuis hidden aria-hidden="true">&#160;</span>
        <?php else : ?>
            <?php
            echo mymmo_forms_stap_sectie( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                $stap,
                (int) $index,
                $index !== $start,
                $terug_label,
                $next_label
            );
            ?>
        <?php endif; ?>
    <?php endforeach; ?>

    <?php if (count($stappen) === $dok_index) : ?>
        <?php // Het formulier staat in de PAGINA, in het kaartje van een callout. ?>
        <span class="mymmo-stap-anker" data-mymmo-thuis hidden aria-hidden="true">&#160;</span>
    <?php else : ?>
        <?php
        echo mymmo_forms_formulier_sectie( // phpcs:ignore WordPress.Security.EscapeOutput
            is_array($form) ? $form : [],
            $form_args,
            $lang,
            count($stappen),
            count($stappen) !== $start,
            $terug_label,
            count($stappen) > 0
        );
        ?>
    <?php endif; ?>
</div>
