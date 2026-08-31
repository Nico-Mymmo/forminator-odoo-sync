<?php
/**
 * Inschrijfformulier. Overschrijfbaar via
 * {thema}/mymmo-events/registration-form.php
 *
 * Post naar admin-post.php zodat de sitesleutel serverside blijft.
 *
 * @var array $data ['event' => array]
 */

declare(strict_types=1);

$event = $data['event'] ?? [];
$slug = (string) ($event['slug'] ?? '');
$registration = $event['registration'] ?? [];
$open = !empty($registration['open']);
$seats_left = $registration['seats_left'] ?? null;
$past = mymmo_events_is_past($event);
$flash = Mymmo_Events_Registration::flash();

if ($slug === '') {
    return;
}

/**
 * Eerst bepalen WAT we tonen, dan pas opmaak. Zo is er precies een
 * <section> die altijd netjes sluit — vroege returns midden in de HTML
 * lieten hem eerder openstaan.
 */
$state = 'form';
$closed_message = '';

if (is_array($flash) && $flash['status'] === 'success') {
    $state = 'done';
} elseif ($past) {
    $state = 'closed';
    $closed_message = 'Dit event is voorbij. Bekijk het overzicht voor komende events.';
} elseif (!$open) {
    $state = 'closed';
    $closed_message = $seats_left === 0
        ? 'Dit event is volzet.'
        : 'Inschrijven is voor dit event nog niet of niet meer mogelijk.';
}
?>
<section class="mymmo-ev-register" id="mymmo-inschrijven">

    <?php if (is_array($flash)) : ?>
        <div class="mymmo-ev-alert mymmo-ev-alert--<?php echo esc_attr($flash['status'] === 'success' ? 'success' : 'error'); ?>"
             role="status" tabindex="-1">
            <?php echo mymmo_events_icon($flash['status'] === 'success' ? 'check' : 'alert'); ?>
            <div>
                <?php if ($flash['status'] === 'success' && $flash['name'] !== '') : ?>
                    <strong><?php echo esc_html(sprintf('Bedankt, %s.', $flash['name'])); ?></strong><br />
                <?php endif; ?>
                <?php echo esc_html($flash['message']); ?>
            </div>
        </div>
    <?php endif; ?>

    <?php if ($state === 'closed') : ?>
        <p class="mymmo-ev-empty"><?php echo esc_html($closed_message); ?></p>

    <?php elseif ($state === 'form') : ?>
        <h2 class="mymmo-ev-register__title">Schrijf je in</h2>
        <p class="mymmo-ev-register__intro">
            Je krijgt de deelnamelink en een herinnering per e-mail.
            <?php if (is_int($seats_left) && $seats_left <= 5) : ?>
                <strong><?php echo esc_html(sprintf('Nog %d plaats%s vrij.', $seats_left, $seats_left === 1 ? '' : 'en')); ?></strong>
            <?php endif; ?>
        </p>

        <form class="mymmo-ev-form" method="post" action="<?php echo esc_url(Mymmo_Events_Registration::action_url()); ?>">
            <input type="hidden" name="action" value="<?php echo esc_attr(Mymmo_Events_Registration::action_name()); ?>" />
            <input type="hidden" name="event_slug" value="<?php echo esc_attr($slug); ?>" />
            <input type="hidden" name="redirect_to" value="<?php echo esc_url(mymmo_events_permalink($event)); ?>" />
            <?php wp_nonce_field(Mymmo_Events_Registration::action_name() . '_' . $slug); ?>

            <?php foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $utm) : ?>
                <?php if (!empty($_GET[$utm])) : ?>
                    <input type="hidden" name="<?php echo esc_attr($utm); ?>"
                           value="<?php echo esc_attr(sanitize_text_field(wp_unslash($_GET[$utm]))); ?>" />
                <?php endif; ?>
            <?php endforeach; ?>

            <div class="mymmo-ev-form__row">
                <label class="mymmo-ev-field">
                    <span class="mymmo-ev-field__label">Voornaam <em>*</em></span>
                    <input type="text" name="first_name" required autocomplete="given-name" />
                </label>
                <label class="mymmo-ev-field">
                    <span class="mymmo-ev-field__label">Naam</span>
                    <input type="text" name="last_name" autocomplete="family-name" />
                </label>
            </div>

            <div class="mymmo-ev-form__row">
                <label class="mymmo-ev-field">
                    <span class="mymmo-ev-field__label">E-mailadres <em>*</em></span>
                    <input type="email" name="email" required autocomplete="email" inputmode="email" />
                </label>
                <label class="mymmo-ev-field">
                    <span class="mymmo-ev-field__label">Telefoon</span>
                    <input type="tel" name="phone" autocomplete="tel" />
                </label>
            </div>

            <label class="mymmo-ev-field">
                <span class="mymmo-ev-field__label">Naam van je VME of organisatie</span>
                <input type="text" name="company" autocomplete="organization" />
            </label>

            <label class="mymmo-ev-field">
                <span class="mymmo-ev-field__label">Heb je al een vraag? Dan nemen we die zeker mee.</span>
                <textarea name="questions" rows="3"></textarea>
            </label>

            <label class="mymmo-ev-check">
                <input type="checkbox" name="consent" value="1" />
                <span>Hou me op de hoogte van komende events en nieuws.</span>
            </label>

            <?php /* Honeypot: onzichtbaar voor mensen, aantrekkelijk voor bots. */ ?>
            <div class="mymmo-ev-hp" aria-hidden="true">
                <label>Website<input type="text" name="mymmo_website" tabindex="-1" autocomplete="off" /></label>
            </div>

            <button type="submit" class="mymmo-ev-btn mymmo-ev-btn--primary">
                Inschrijven<?php echo mymmo_events_icon('arrow'); ?>
            </button>

            <p class="mymmo-ev-form__fine">
                We gebruiken je gegevens alleen voor dit event en onze communicatie erover.
            </p>
        </form>
    <?php endif; ?>
</section>
