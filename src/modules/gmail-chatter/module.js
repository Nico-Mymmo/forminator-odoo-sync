/**
 * Gmail → Chatter
 *
 * Route: /gmail-chatter
 *
 * Vangt mail op die medewerkers rechtstreeks in Gmail versturen en ontvangen,
 * en zet die als bericht op de juiste lead in Odoo. De opvangronde draait op de
 * 5-minutencron (zie src/index.js#scheduled → lib/sync.js).
 *
 * WAT DIT SCHERM IS. De sync verdeelt elke mail over drie stapels: geplaatst,
 * genegeerd (intern verkeer, nieuwsbrieven, noreply-afzenders) en de WERKLIJST
 * — echte mail van een echt mens waar we geen lead bij konden vinden. Dat
 * laatste is bewust geen weggooibak: gokken zou correspondentie in het dossier
 * van de verkeerde klant zetten, en dat merk je nooit. Hier wijs je ze zelf toe.
 *
 * IEDEREEN ZIET ALLEEN ZIJN EIGEN MAILBOX. De rijen zijn gekoppeld aan
 * `user_email`, en dat is hetzelfde adres als de OM-login. De routes filteren
 * daar server-side op — een admin kan met `?all=1` alles zien, maar dat is de
 * enige uitzondering en ze staat in routes.js, niet in de UI.
 *
 * DE INHOUD VAN EEN MAIL WORDT HIER NIET BEWAARD. `gmail_captured_messages`
 * houdt alleen headers bij (afzender, onderwerp, datum). Wijs je een mail toe,
 * dan wordt de body op dát moment bij Gmail opgehaald, opgekuist en in de
 * chatter gezet. Zo staat de inhoud van niet-toegewezen mail nergens in onze
 * database.
 */

import { routes } from './routes.js';

export default {
  code:        'gmail_chatter',
  name:        'Gmail → Chatter',
  description: 'Mail uit je Gmail bij de juiste lead in Odoo',
  route:       '/gmail-chatter',
  icon:        'mail-check',
  isActive:    true,
  requiresAuth: true,
  routes
};
