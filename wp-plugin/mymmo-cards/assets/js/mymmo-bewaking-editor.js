/**
 * DE AFRONDING STAAT STANDAARD IN BEELD -- op elk blok dat ze kan krijgen.
 *
 * Het thema (Blockify) geeft ook een video, een ingesloten film (Vimeo,
 * YouTube), een afbeelding en een kolom een paneel "Rand". Maar het zet daar
 * standaard enkel de randdikte en de randkleur in beeld; de afronding zit
 * achter het "+"-menu van dat paneel. De bewaking (class-bewaking.php) zet
 * dikte en kleur uit, want dat zijn geen keuzes van de huisstijl. Wat
 * overblijft, is een paneel zonder een enkel veld -- en dat leest als "dit
 * blok kan geen afgeronde hoeken krijgen", terwijl de keuze er wel is.
 *
 * Daarom: elk blok dat afronding ondersteunt, toont ze meteen. Het thema zet
 * zijn ondersteuning in de editor op prioriteit 0 (blocks.registerBlockType);
 * dit draait erna.
 *
 * Bestand onder de bewaking: wijzigen enkel met goedkeuring van Nico.
 */
(function (wp) {
    if (!wp || !wp.hooks) {
        return;
    }

    var SLEUTELS = ['border', '__experimentalBorder'];

    function metAfronding(rand) {
        if (rand === true) {
            // "Alles aan" zonder lijst: de bewaking laat enkel de afronding door.
            rand = { radius: true, width: true, color: true, style: true };
        }
        if (!rand || typeof rand !== 'object' || rand.radius === false) {
            return rand;
        }
        var standaard = Object.assign({}, rand.__experimentalDefaultControls || {}, { radius: true });
        return Object.assign({}, rand, { radius: true, __experimentalDefaultControls: standaard });
    }

    wp.hooks.addFilter(
        'blocks.registerBlockType',
        'mymmo/afronding-in-beeld',
        function (instellingen) {
            var ondersteuning = instellingen && instellingen.supports;
            if (!ondersteuning || typeof ondersteuning !== 'object') {
                return instellingen;
            }
            var nieuw = null;
            SLEUTELS.forEach(function (sleutel) {
                if (!(sleutel in ondersteuning)) {
                    return;
                }
                var rand = metAfronding(ondersteuning[sleutel]);
                if (rand === ondersteuning[sleutel]) {
                    return;
                }
                nieuw = nieuw || Object.assign({}, ondersteuning);
                nieuw[sleutel] = rand;
            });
            if (!nieuw) {
                return instellingen;
            }
            return Object.assign({}, instellingen, { supports: nieuw });
        },
        20
    );
})(window.wp);
