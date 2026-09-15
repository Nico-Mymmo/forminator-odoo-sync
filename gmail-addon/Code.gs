/**
 * OpenVME — mail bij een lead (Gmail-add-on)
 *
 * Toont bij elke geopende mail of de afzender al bij een lead in Odoo hoort, en
 * laat je in één klik vastleggen dat dat zo is.
 *
 * WAT DEZE ADD-ON NIET DOET: mail opvangen. Dat gebeurt automatisch, elke vijf
 * minuten, door de Operations Manager (module gmail-chatter). Deze add-on is er
 * alleen voor de UITZONDERINGEN — iemand die schrijft vanaf een ander adres dan
 * het adres dat op de lead staat. Je legt dat hier één keer vast, en vanaf dan
 * loopt zijn mail weer automatisch mee.
 *
 * AUTHENTICATIE ZONDER GEHEIM. Er staat bewust geen sleutel in dit script. Bij
 * elke oproep gaat `ScriptApp.getIdentityToken()` mee: een door Google
 * ondertekend token op naam van de ingelogde medewerker. De Worker verifieert
 * dat tegen Google's publieke sleutels en kijkt of het adres een actieve
 * OM-gebruiker is. Een geheim in een script is te lezen door iedereen met
 * scriptrechten en kan je niet wisselen zonder opnieuw uit te rollen; dit wel.
 */

const OM_BASIS = 'https://operations.openvme.be';

// ─── Hulp ────────────────────────────────────────────────────────────────────

/**
 * Een oproep naar de Operations Manager.
 * Gooit een leesbare fout, zodat de kaart iets zinnigs kan tonen.
 */
function omVerzoek_(pad, methode, payload) {
  const opties = {
    method: methode || 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getIdentityToken() }
  };
  if (payload) {
    opties.contentType = 'application/json';
    opties.payload = JSON.stringify(payload);
  }

  const res = UrlFetchApp.fetch(OM_BASIS + pad, opties);
  const tekst = res.getContentText();
  let data;
  try {
    data = JSON.parse(tekst);
  } catch (e) {
    throw new Error('Onverwacht antwoord (' + res.getResponseCode() + ')');
  }
  if (res.getResponseCode() >= 400 || data.success === false) {
    throw new Error(data.error || ('HTTP ' + res.getResponseCode()));
  }
  return data.data;
}

/** Het adres van de tegenpartij uit een bericht halen. */
function tegenpartij_(bericht, ikZelf) {
  const adresUit = function (kop) {
    const m = String(kop || '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);
    return m ? m[0].toLowerCase() : null;
  };

  const van = adresUit(bericht.getFrom());
  if (van && van !== ikZelf) return van;

  // Zelf verstuurd: dan is de ontvanger de tegenpartij.
  const naar = String(bericht.getTo() || '').split(',');
  for (let i = 0; i < naar.length; i++) {
    const a = adresUit(naar[i]);
    if (a && a !== ikZelf) return a;
  }
  return van;
}

function tekstKnop_(tekst, functie, params) {
  const actie = CardService.newAction().setFunctionName(functie);
  if (params) actie.setParameters(params);
  return CardService.newTextButton().setText(tekst).setOnClickAction(actie);
}

function melding_(tekst) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(tekst))
    .build();
}

// ─── De kaart ────────────────────────────────────────────────────────────────

/** Contextuele trigger: draait zodra iemand een mail opent. */
function onGmailMessage(e) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  const bericht = GmailApp.getMessageById(e.gmail.messageId);
  const ikZelf = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const contact = tegenpartij_(bericht, ikZelf);

  if (!contact) {
    return bouwFoutKaart_('Geen tegenpartij gevonden in deze mail.');
  }

  let info;
  try {
    info = omVerzoek_('/gmail-addon/v1/lookup', 'post', { email: contact });
  } catch (err) {
    return bouwFoutKaart_(String(err.message));
  }

  return bouwKaart_(contact, info);
}

function bouwFoutKaart_(tekst) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('OpenVME'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(tekst)))
    .build();
}

function bouwKaart_(contact, info) {
  const kaart = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('OpenVME')
      .setSubtitle(contact));

  const sectie = CardService.newCardSection();

  if (info.herkomst === 'genegeerd') {
    sectie.addWidget(CardService.newTextParagraph()
      .setText('<b>Wordt genegeerd.</b> Mail van dit adres komt niet in Odoo.'));
    sectie.addWidget(tekstKnop_('Toch aan een lead hangen', 'toonZoeken', { contact: contact }));

  } else if (info.lead) {
    const bron = info.herkomst === 'uitzondering'
      ? 'Vastgelegd als uitzondering.'
      : 'Automatisch herkend — dit adres staat op de lead.';
    sectie.addWidget(CardService.newTextParagraph()
      .setText('<b>' + info.lead.name + '</b><br>' + bron));
    sectie.addWidget(CardService.newTextParagraph()
      .setText(info.tellingen.posted + ' mail(s) van dit adres staan al in de chatter.'));
    sectie.addWidget(tekstKnop_('Aan een andere lead hangen', 'toonZoeken', { contact: contact }));

  } else {
    sectie.addWidget(CardService.newTextParagraph()
      .setText('<b>Nog niet gekoppeld.</b><br>Mail van dit adres komt niet automatisch in een lead terecht.'));
    if (info.tellingen.unmatched) {
      sectie.addWidget(CardService.newTextParagraph()
        .setText(info.tellingen.unmatched + ' mail(s) wachten in je werklijst.'));
    }
    sectie.addWidget(tekstKnop_('Aan een lead hangen', 'toonZoeken', { contact: contact }));
    sectie.addWidget(tekstKnop_('Nooit — negeer dit adres', 'negeerContact', { contact: contact }));
  }

  kaart.addSection(sectie);
  return kaart.build();
}

// ─── Zoeken en koppelen ──────────────────────────────────────────────────────

/** Tweede kaart: een lead zoeken. */
function toonZoeken(e) {
  const contact = e.parameters.contact;

  const invoer = CardService.newTextInput()
    .setFieldName('zoekterm')
    .setTitle('Zoek een lead')
    .setHint('Naam, contactpersoon of e-mailadres')
    .setOnChangeAction(CardService.newAction()
      .setFunctionName('zoekLeads')
      .setParameters({ contact: contact }));

  const kaart = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Aan welke lead?').setSubtitle(contact))
    .addSection(CardService.newCardSection().addWidget(invoer))
    .build();

  return CardService.newNavigation().pushCard(kaart);
}

/** Resultaten tonen. Wordt aangeroepen zodra het zoekveld verandert. */
function zoekLeads(e) {
  const contact = e.parameters.contact;
  const term = (e.formInput && e.formInput.zoekterm) || '';

  const sectie = CardService.newCardSection();

  if (String(term).trim().length < 2) {
    sectie.addWidget(CardService.newTextParagraph().setText('Typ minstens twee tekens.'));
  } else {
    let leads;
    try {
      leads = omVerzoek_('/gmail-addon/v1/leads?q=' + encodeURIComponent(term), 'get');
    } catch (err) {
      sectie.addWidget(CardService.newTextParagraph().setText('Fout: ' + err.message));
      leads = [];
    }

    if (!leads.length) {
      sectie.addWidget(CardService.newTextParagraph().setText('Geen lead gevonden.'));
    }
    for (let i = 0; i < leads.length; i++) {
      const l = leads[i];
      const bijschrift = [l.contact_name, l.email_from].filter(Boolean).join(' · ');
      sectie.addWidget(CardService.newDecoratedText()
        .setText(l.name || '(naamloos)')
        .setBottomLabel(bijschrift)
        .setButton(tekstKnop_('Koppel', 'koppelAanLead', {
          contact: contact,
          leadId: String(l.id),
          leadNaam: l.name || ''
        })));
    }
  }

  const invoer = CardService.newTextInput()
    .setFieldName('zoekterm')
    .setTitle('Zoek een lead')
    .setValue(term)
    .setOnChangeAction(CardService.newAction()
      .setFunctionName('zoekLeads')
      .setParameters({ contact: contact }));

  const kaart = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Aan welke lead?').setSubtitle(contact))
    .addSection(CardService.newCardSection().addWidget(invoer))
    .addSection(sectie)
    .build();

  return CardService.newNavigation().updateCard(kaart);
}

/** De koppeling vastleggen. */
function koppelAanLead(e) {
  const p = e.parameters;
  try {
    const res = omVerzoek_('/gmail-addon/v1/link', 'post', {
      email: p.contact,
      lead_id: Number(p.leadId)
    });
    let tekst = 'Gekoppeld aan ' + res.lead;
    if (res.geplaatst) tekst += ' — ' + res.geplaatst + ' mail(s) geplaatst';
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(tekst))
      .setNavigation(CardService.newNavigation().popToRoot())
      .build();
  } catch (err) {
    return melding_('Mislukt: ' + err.message);
  }
}

/** Het adres voorgoed negeren. */
function negeerContact(e) {
  try {
    omVerzoek_('/gmail-addon/v1/ignore', 'post', { email: e.parameters.contact });
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Wordt voortaan genegeerd'))
      .setNavigation(CardService.newNavigation().popToRoot())
      .build();
  } catch (err) {
    return melding_('Mislukt: ' + err.message);
  }
}

// ─── Eenmalig bij het installeren ────────────────────────────────────────────

/**
 * Draai deze functie één keer met de hand (knop "Uitvoeren" in de editor) en
 * kijk in het uitvoeringslogboek. Ze toont de `aud` van je ID-token: dat is de
 * client-id die als secret `GMAIL_ADDON_CLIENT_ID` in de Worker moet staan.
 *
 * Zonder die secret weigert de Worker elk verzoek — bewust: zonder controle op
 * `aud` zou élk Google-token van eender welke toepassing hier geldig zijn.
 */
function toonMijnClientId() {
  const token = ScriptApp.getIdentityToken();
  const delen = token.split('.');
  const lading = Utilities.newBlob(
    Utilities.base64DecodeWebSafe(delen[1])
  ).getDataAsString();
  const claims = JSON.parse(lading);

  Logger.log('GMAIL_ADDON_CLIENT_ID = ' + claims.aud);
  Logger.log('(token op naam van ' + claims.email + ')');
  return claims.aud;
}
