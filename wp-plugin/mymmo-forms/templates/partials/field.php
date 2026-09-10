<?php
/**
 * Eén veld.
 *
 * Beschikbaar: $veld (uit het schema), $index, $form_id_attr, $oude_waarden.
 *
 * Dit is de ENIGE plek waar een veldtype naar HTML vertaald wordt. Komt er in
 * de OM een type bij (FIELD_TYPES in forms/schema.js), dan hoort het hier een
 * tak te krijgen; zonder tak valt het terug op een gewoon tekstveld, wat
 * lelijk maar niet stuk is.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/** @var array<string,mixed> $veld */
/** @var int $index */
/** @var string $form_id_attr */
/** @var array<string,mixed> $oude_waarden */
/** @var string $lang */
/** @var array<string,string> $teksten */
/** @var bool $is_standaardtaal */

$type  = (string) ($veld['type'] ?? 'text');
$key   = (string) ($veld['key'] ?? '');
// Het label in de taal van deze pagina. Ontbreekt de vertaling, dan de
// standaardtaal: één label in de verkeerde taal is lelijk, een leeg label is
// stuk. Zie Mymmo_Forms_I18n::field_text().
$label = Mymmo_Forms_I18n::field_text($veld, $lang, 'label');
$breed = ($veld['width'] ?? 'full') === 'half' ? 'mymmo-form-field--half' : 'mymmo-form-field--full';

// ── Opmaakblokken: geen invoer, geen naam, geen label ────────────────────────
if ($type === 'heading') {
    echo '<div class="mymmo-form-field mymmo-form-field--full mymmo-form-field--heading"><h3 class="mymmo-form-heading">' . esc_html($label) . '</h3></div>';
    return;
}
if ($type === 'paragraph') {
    // Bewust esc_html en geen HTML: de tekst komt uit de OM en zou anders een
    // injectiepad zijn naar elke site die het formulier toont. wpautop() maakt
    // van lege regels alsnog alinea's.
    echo '<div class="mymmo-form-field mymmo-form-field--full mymmo-form-field--paragraph"><div class="mymmo-form-paragraph">' . wpautop(esc_html($label)) . '</div></div>';
    return;
}

if ($key === '') {
    return;
}

$veld_id   = $form_id_attr . '-' . $key;
$hulp_id   = $veld_id . '-help';
$fout_id   = $veld_id . '-error';
$verplicht = !empty($veld['required']);
// Hulptekst en placeholder vallen NIET terug op de standaardtaal: een halve zin
// Nederlands onder een Frans veld is verwarrender dan geen hulptekst. Maar in de
// standaardtaal ZELF is de gewone kolom de tekst -- daar mag niets wegvallen.
$hulp      = Mymmo_Forms_I18n::field_text($veld, $lang, 'help_text', $is_standaardtaal);
$plaats    = Mymmo_Forms_I18n::field_text($veld, $lang, 'placeholder', $is_standaardtaal);
$opties    = is_array($veld['options'] ?? null) ? $veld['options'] : [];
$validatie = is_array($veld['validation'] ?? null) ? $veld['validation'] : [];

// Na een fout de ingevulde waarde terugzetten; anders de standaardwaarde.
$waarde = array_key_exists($key, $oude_waarden)
    ? (string) $oude_waarden[$key]
    : (string) ($veld['default_value'] ?? '');

// De foutmelding hangt ALTIJD aan het veld, ook als ze nog leeg is. Zo hoeft
// JavaScript straks alleen tekst in te vullen en hoeft het aria-describedby
// niet te herschrijven -- dat is precies het soort ingreep dat een schermlezer
// midden in een zin laat herbeginnen.
$beschrijft_ids = array_filter([$hulp !== '' ? $hulp_id : '', $fout_id]);
$beschrijft = ' aria-describedby="' . esc_attr(implode(' ', $beschrijft_ids)) . '"';
$req_attr   = $verplicht ? ' required aria-required="true"' : '';

$lengte_attrs = '';
if (isset($validatie['minlength']) && is_numeric($validatie['minlength'])) {
    $lengte_attrs .= ' minlength="' . esc_attr((string) (int) $validatie['minlength']) . '"';
}
if (isset($validatie['maxlength']) && is_numeric($validatie['maxlength'])) {
    $lengte_attrs .= ' maxlength="' . esc_attr((string) (int) $validatie['maxlength']) . '"';
}

// Naam van de URL-queryparameter waarmee dit veld bij het laden van de pagina
// automatisch gevuld wordt (mymmo-forms.js leest dit attribuut uit). Leeg als
// er geen parameter aan dit veld hangt.
$prefill_param = trim((string) ($veld['prefill_param'] ?? ''));
$prefill_attr  = $prefill_param !== '' ? ' data-mymmo-prefill-param="' . esc_attr($prefill_param) . '"' : '';

// ── Verborgen veld: geen wikkel, geen label ──────────────────────────────────
if ($type === 'hidden') {
    echo '<input type="hidden" name="' . esc_attr($key) . '" value="' . esc_attr($waarde) . '"' . $prefill_attr . '>';
    return;
}
?>
<?php
// data-mymmo-label draagt het KALE label, zonder het sterretje en zonder de
// opmaak eromheen. JavaScript bouwt daarmee zijn foutmelding ("Naam is
// verplicht"). Het uit het <label>-element vissen zou werken tot iemand er een
// sterretje of een uitleg tussen zet.
?>
<div class="mymmo-form-field <?php echo esc_attr($breed); ?> mymmo-form-field--<?php echo esc_attr($type); ?>"
     data-mymmo-label="<?php echo esc_attr($label !== '' ? $label : $key); ?>">

    <?php if ($type === 'checkbox') : ?>

        <?php // Eén vinkje: het label hoort NAAST het vakje, niet erboven. ?>
        <div class="mymmo-form-check">
            <input type="checkbox"
                   id="<?php echo esc_attr($veld_id); ?>"
                   name="<?php echo esc_attr($key); ?>"
                   value="ja"
                   <?php checked($waarde === 'ja' || $waarde === '1'); ?>
                   <?php echo $req_attr . $beschrijft; ?>>
            <label for="<?php echo esc_attr($veld_id); ?>">
                <?php echo esc_html($label); ?><?php echo $verplicht ? ' <span class="mymmo-form-req" aria-hidden="true">*</span>' : ''; ?>
            </label>
        </div>

    <?php elseif ($type === 'radio' || $type === 'checkbox_group') : ?>

        <?php
        // Een keuzegroep heeft geen enkel <label for> dat de hele groep dekt.
        // fieldset + legend is de enige constructie die een schermlezer de vraag
        // laat voorlezen bij elke optie.
        $gekozen = $type === 'checkbox_group'
            ? array_map('trim', explode(',', $waarde))
            : [$waarde];
        ?>
        <fieldset class="mymmo-form-group"<?php echo $beschrijft; ?>>
            <legend class="mymmo-form-label">
                <?php echo esc_html($label); ?><?php echo $verplicht ? ' <span class="mymmo-form-req" aria-hidden="true">*</span>' : ''; ?>
            </legend>
            <?php foreach ($opties as $i => $optie) :
                if (!is_array($optie) || !isset($optie['value'])) {
                    continue;
                }
                $optie_id = $veld_id . '-' . $i;
                ?>
                <div class="mymmo-form-check">
                    <input type="<?php echo $type === 'radio' ? 'radio' : 'checkbox'; ?>"
                           id="<?php echo esc_attr($optie_id); ?>"
                           name="<?php echo esc_attr($key . ($type === 'checkbox_group' ? '[]' : '')); ?>"
                           value="<?php echo esc_attr((string) $optie['value']); ?>"
                           <?php checked(in_array((string) $optie['value'], $gekozen, true)); ?>>
                    <label for="<?php echo esc_attr($optie_id); ?>">
                        <?php echo esc_html(Mymmo_Forms_I18n::option_label($veld, $lang, $optie)); ?>
                    </label>
                </div>
            <?php endforeach; ?>
        </fieldset>

    <?php else : ?>

        <label class="mymmo-form-label" for="<?php echo esc_attr($veld_id); ?>">
            <?php echo esc_html($label); ?><?php echo $verplicht ? ' <span class="mymmo-form-req" aria-hidden="true">*</span>' : ''; ?>
        </label>

        <?php if ($type === 'textarea') : ?>

            <textarea id="<?php echo esc_attr($veld_id); ?>"
                      name="<?php echo esc_attr($key); ?>"
                      class="mymmo-form-input"
                      rows="5"
                      placeholder="<?php echo esc_attr($plaats); ?>"
                      <?php echo $req_attr . $beschrijft . $lengte_attrs . $prefill_attr; ?>><?php echo esc_textarea($waarde); ?></textarea>

        <?php elseif ($type === 'select') : ?>

            <select id="<?php echo esc_attr($veld_id); ?>"
                    name="<?php echo esc_attr($key); ?>"
                    class="mymmo-form-input"
                    <?php echo $req_attr . $beschrijft . $prefill_attr; ?>>
                <option value=""><?php echo esc_html($plaats !== '' ? $plaats : ($teksten['choose'] ?? 'Maak een keuze')); ?></option>
                <?php foreach ($opties as $optie) :
                    if (!is_array($optie) || !isset($optie['value'])) {
                        continue;
                    }
                    ?>
                    <option value="<?php echo esc_attr((string) $optie['value']); ?>" <?php selected($waarde === (string) $optie['value']); ?>>
                        <?php echo esc_html(Mymmo_Forms_I18n::option_label($veld, $lang, $optie)); ?>
                    </option>
                <?php endforeach; ?>
            </select>

        <?php else :
            // text, email, tel, number, date -- en alles wat we nog niet kennen.
            $html_type = in_array($type, ['email', 'tel', 'number', 'date'], true) ? $type : 'text';

            // autocomplete helpt de browser invullen; dat scheelt afhakers.
            $autocomplete = '';
            if ($html_type === 'email') {
                $autocomplete = ' autocomplete="email"';
            } elseif ($html_type === 'tel') {
                $autocomplete = ' autocomplete="tel"';
            }

            $getal_attrs = '';
            if ($html_type === 'number') {
                if (isset($validatie['min']) && is_numeric($validatie['min'])) {
                    $getal_attrs .= ' min="' . esc_attr((string) $validatie['min']) . '"';
                }
                if (isset($validatie['max']) && is_numeric($validatie['max'])) {
                    $getal_attrs .= ' max="' . esc_attr((string) $validatie['max']) . '"';
                }
            }
            ?>
            <input type="<?php echo esc_attr($html_type); ?>"
                   id="<?php echo esc_attr($veld_id); ?>"
                   name="<?php echo esc_attr($key); ?>"
                   class="mymmo-form-input"
                   value="<?php echo esc_attr($waarde); ?>"
                   placeholder="<?php echo esc_attr($plaats); ?>"
                   <?php echo $req_attr . $beschrijft . $lengte_attrs . $getal_attrs . $autocomplete . $prefill_attr; ?>>

        <?php endif; ?>

    <?php endif; ?>

    <?php if ($hulp !== '') : ?>
        <p class="mymmo-form-help" id="<?php echo esc_attr($hulp_id); ?>"><?php echo esc_html($hulp); ?></p>
    <?php endif; ?>

    <?php
    // Leeg en verborgen tot JavaScript er iets in zet. Bewust hier in de HTML en
    // niet door JS aangemaakt: zo bestaat het id waar aria-describedby hierboven
    // naar wijst vanaf het begin, en hoeft er bij een fout niets aan de
    // structuur van het veld te veranderen.
    //
    // role=alert en niet aria-live=polite: dit is de reactie op een handeling
    // van de bezoeker (verzenden), en die hoort meteen voorgelezen te worden.
    ?>
    <p class="mymmo-form-error" id="<?php echo esc_attr($fout_id); ?>" role="alert" data-mymmo-error hidden></p>
</div>
