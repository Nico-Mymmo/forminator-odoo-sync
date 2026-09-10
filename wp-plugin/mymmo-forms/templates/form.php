<?php
/**
 * Het formulier.
 *
 * Beschikbaar: $form (schema uit de OM), $slug, $show_title, $flash, $stale.
 *
 * Toegankelijkheid is hier geen extraatje: dit is het scherm waar een bezoeker
 * zijn gegevens achterlaat. Elk veld heeft een echt <label for>, hulp- en
 * fouttekst hangen via aria-describedby aan het veld, keuzegroepen zitten in
 * een <fieldset> met <legend>, en de meldingenbalk is een live region zodat een
 * schermlezer ze aankondigt na de redirect.
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/** @var array<string,mixed> $form */
/** @var string $slug */
/** @var bool $show_title */
/** @var array{status:string,message:string,values:array<string,mixed>}|null $flash */
/** @var bool $stale */
/** @var string $lang */

$form_id_attr = 'mymmo-form-' . $slug;
$oude_waarden = is_array($flash['values'] ?? null) ? $flash['values'] : [];
$stijl        = mymmo_forms_theme_style(is_array($form['theme'] ?? null) ? $form['theme'] : []);

// De vaste bezoekersteksten in deze taal. Ze komen uit de payload (MESSAGES in
// forms/schema.js), niet uit een tabel hier: zo zijn de meldingen die
// JavaScript toont letterlijk dezelfde als die de Operations Manager
// terugstuurt wanneer JavaScript uit staat.
// Vangnet: een aanroep zonder taal (een oude template-override, een eigen
// integratie) mag geen fatale fout geven op de pagina van een bezoeker.
$lang    = (isset($lang) && is_string($lang) && $lang !== '') ? $lang : Mymmo_Forms_I18n::resolve($form);
$teksten = Mymmo_Forms_I18n::messages($form, $lang);

// Staan we IN de standaardtaal? Dan is de gewone kolom zelf de tekst, en geldt
// de terugvalregel niet. Zonder dit onderscheid verdwijnt een hulptekst of
// placeholder op het Nederlandse formulier, want die staat niet in i18n.
$is_standaardtaal = ($lang === Mymmo_Forms_I18n::default_language($form));

$titel = Mymmo_Forms_I18n::text($form, $lang, 'name');
$intro = Mymmo_Forms_I18n::text($form, $lang, 'description', $is_standaardtaal);
$knop  = Mymmo_Forms_I18n::text($form, $lang, 'submit_label');
?>
<?php
// lang op de wikkel: een schermlezer schakelt daardoor van stem, en de browser
// gebruikt de juiste woordafbreking. Alleen zetten als het formulier een ANDERE
// taal heeft dan de pagina zelf zou zijn -- altijd zetten is onschadelijk, maar
// dit is de plek waar het echt uitmaakt.
?>
<div class="mymmo-form-wrap"
     id="<?php echo esc_attr($form_id_attr); ?>"
     lang="<?php echo esc_attr($lang); ?>"<?php echo $stijl !== '' ? ' style="' . esc_attr($stijl) . '"' : ''; ?>>

    <?php if (is_array($flash)) : ?>
        <div class="mymmo-form-notice mymmo-form-notice--<?php echo esc_attr($flash['status']); ?>"
             role="<?php echo $flash['status'] === 'error' ? 'alert' : 'status'; ?>"
             tabindex="-1"
             data-mymmo-focus>
            <?php echo esc_html($flash['message']); ?>
        </div>
    <?php endif; ?>

    <?php if (is_array($flash) && $flash['status'] === 'success') : ?>
        <?php // Na een geslaagde inzending het formulier niet opnieuw tonen: dat
              // nodigt uit tot een tweede, identieke inzending. ?>
    <?php else : ?>

        <?php if ($stale && current_user_can('manage_options')) : ?>
            <div class="mymmo-form-notice mymmo-form-notice--admin">
                Let op: dit formulier komt uit de lokale cache — de Operations Manager was niet bereikbaar.
            </div>
        <?php endif; ?>

        <?php if ($show_title && $titel !== '') : ?>
            <h2 class="mymmo-form-title"><?php echo esc_html($titel); ?></h2>
        <?php endif; ?>

        <?php if ($intro !== '') : ?>
            <p class="mymmo-form-intro"><?php echo esc_html($intro); ?></p>
        <?php endif; ?>

        <?php
        // novalidate staat er bewust: de browser toont anders zijn eigen ballon
        // ("Please fill out this field."), en die volgt de taal van de BROWSER,
        // niet die van de pagina. Een Franstalige bezoeker met een Engelse
        // Chrome kreeg zo Engelse meldingen op een Nederlands formulier.
        // De meldingen hieronder komen uit de catalogus van dit formulier.
        ?>
        <form class="mymmo-form"
              method="post"
              action="<?php echo esc_url(Mymmo_Forms_Submit::action_url()); ?>"
              data-mymmo-messages="<?php echo esc_attr((string) wp_json_encode($teksten)); ?>"
              novalidate>

            <?php wp_nonce_field(Mymmo_Forms_Submit::action_name() . '_' . $slug); ?>
            <input type="hidden" name="action" value="<?php echo esc_attr(Mymmo_Forms_Submit::action_name()); ?>">
            <input type="hidden" name="mymmo_form_slug" value="<?php echo esc_attr($slug); ?>">
            <?php // De taal mee terug, zodat een foutmelding in dezelfde taal terugkomt en meta_lang naar Odoo gaat. ?>
            <input type="hidden" name="mymmo_lang" value="<?php echo esc_attr($lang); ?>">
            <input type="hidden" name="mymmo_redirect_to" value="<?php echo esc_url(get_permalink() ?: home_url('/')); ?>">
            <input type="hidden" name="mymmo_page_title" value="<?php echo esc_attr(wp_get_document_title()); ?>">
            <input type="hidden" name="<?php echo esc_attr(Mymmo_Forms_Submit::TIME_FIELD); ?>" value="<?php echo esc_attr(Mymmo_Forms_Submit::time_token()); ?>">

            <?php
            // UTM's doorgeven zoals ze in de URL staan. Zo komt de herkomst mee
            // in de payload en kan ze in Odoo gemapt worden.
            foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $utm) :
                if (empty($_GET[$utm])) {
                    continue;
                }
                ?>
                <input type="hidden" name="<?php echo esc_attr($utm); ?>" value="<?php echo esc_attr(sanitize_text_field(wp_unslash($_GET[$utm]))); ?>">
            <?php endforeach; ?>

            <?php
            // Honeypot. Buiten beeld gezet met CSS én aria-hidden + tabindex,
            // zodat een schermlezer hem niet aankondigt en toetsenbordnavigatie
            // hem overslaat. display:none alleen is niet genoeg: sommige bots
            // slaan verborgen velden juist over.
            ?>
            <div class="mymmo-form-hp" aria-hidden="true">
                <label for="<?php echo esc_attr($form_id_attr . '-hp'); ?>">Laat dit veld leeg</label>
                <input type="text"
                       id="<?php echo esc_attr($form_id_attr . '-hp'); ?>"
                       name="<?php echo esc_attr(Mymmo_Forms_Submit::HONEYPOT_FIELD); ?>"
                       value=""
                       tabindex="-1"
                       autocomplete="off">
            </div>

            <div class="mymmo-form-grid">
                <?php
                foreach ((array) ($form['fields'] ?? []) as $index => $veld) {
                    if (!is_array($veld)) {
                        continue;
                    }
                    echo mymmo_forms_render('partials/field', [
                        'veld'         => $veld,
                        'index'        => (int) $index,
                        'form_id_attr' => $form_id_attr,
                        'oude_waarden' => $oude_waarden,
                        'lang'         => $lang,
                        'teksten'      => $teksten,
                        'is_standaardtaal' => $is_standaardtaal,
                    ]);
                }
                ?>
            </div>

            <div class="mymmo-form-actions">
                <button type="submit" class="mymmo-form-submit">
                    <?php echo esc_html($knop !== '' ? $knop : 'Versturen'); ?>
                </button>
            </div>
        </form>

    <?php endif; ?>
</div>
