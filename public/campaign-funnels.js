// Ad & Sales Campaigns — front-end
// Fase 1: puur CRUD (geen AI-assist, geen gedeelde bibliotheek over funnels heen).

var STAGE_LABELS = {
  onderzoek: '1. Onderzoek & actiebladen',
  kernboodschap: '2. Kernboodschap',
  argument: '3. Argument/idee',
  kernargument: '4. Kernargument',
  onderbouwing: '5. Onderbouwing',
  product: '6. Product oplossing',
  conversie: '7. Conversiemomenten'
};
var STAGE_ORDER = ['onderzoek', 'kernboodschap', 'argument', 'kernargument', 'onderbouwing', 'product', 'conversie'];

var STATUS_LABELS = {
  concept: 'Concept',
  lopend: 'Lopend',
  live: 'Live',
  gearchiveerd: 'Gearchiveerd'
};

var state = {
  funnels: [],
  currentFunnel: null, // { funnel, swimlanes: [{...cards:[]}], stages }
  cardModalContext: null, // { swimlaneId, stage, cardId }
  inbox: [], // ongegroepeerde onderzoek-notities van de huidige funnel
  proposal: null // AI-groeperingsvoorstel in bewerking: { groups: [{title, description, waarom, cards:[]}], leftover: [] }
};

// --- API helpers -------------------------------------------------------

async function apiFetch(url, options) {
  var res = await fetch(url, Object.assign({ credentials: 'include' }, options || {}));
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Niet ingelogd');
  }
  return res;
}

async function apiJson(url, options) {
  var res = await apiFetch(url, options);
  var body = await res.json();
  if (!body.success) throw new Error(body.error || ('Fout ' + res.status));
  return body.data;
}

function jsonBody(obj) {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

// --- Toast ---------------------------------------------------------------

function showToast(message, type) {
  var root = document.getElementById('toastRoot');
  if (!root) return;
  var el = document.createElement('div');
  el.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success') + ' text-sm shadow-lg';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(function () { el.remove(); }, 3500);
}

// --- Auth / navbar ---------------------------------------------------------

async function initNavbar() {
  var res = await apiFetch('/api/auth/me');
  var data = await res.json();
  if (!data.user) { window.location.href = '/'; return; }
  if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
}

// --- List view ---------------------------------------------------------

async function loadFunnelList() {
  try {
    state.funnels = await apiJson('/campaigns/api/funnels');
    renderFunnelList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderFunnelList() {
  var container = document.getElementById('funnelList');
  if (state.funnels.length === 0) {
    container.innerHTML = '<p class="text-base-content/60 text-sm col-span-full">Nog geen funnels. Maak de eerste aan.</p>';
    return;
  }
  container.innerHTML = state.funnels.map(function (f) {
    return '' +
      '<div class="card bg-base-100 border border-base-300 hover:border-primary cursor-pointer transition" data-action="openFunnel" data-id="' + f.id + '">' +
      '  <div class="card-body p-4">' +
      '    <div class="flex items-center justify-between">' +
      '      <h3 class="font-semibold">' + escapeHtml(f.name) + '</h3>' +
      '      <span class="badge badge-sm">' + escapeHtml(STATUS_LABELS[f.status] || f.status) + '</span>' +
      '    </div>' +
      '    <p class="text-sm text-base-content/60 line-clamp-2">' + escapeHtml(f.description || '') + '</p>' +
      '  </div>' +
      '</div>';
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// --- Detail view ---------------------------------------------------------

async function openFunnel(id) {
  try {
    state.currentFunnel = await apiJson('/campaigns/api/funnels/' + id);
    state.proposal = null;
    document.getElementById('viewList').classList.add('hidden');
    document.getElementById('viewDetail').classList.remove('hidden');
    renderDetail();
    switchDetailTab('onderzoek');
    await loadInbox();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function backToList() {
  state.currentFunnel = null;
  state.inbox = [];
  state.proposal = null;
  document.getElementById('viewDetail').classList.add('hidden');
  document.getElementById('viewList').classList.remove('hidden');
  loadFunnelList();
}

function renderDetail() {
  var f = state.currentFunnel.funnel;
  document.getElementById('funnelNameInput').value = f.name;
  document.getElementById('funnelDescInput').value = f.description || '';
  document.getElementById('funnelStatusInput').value = f.status;
  renderSwimlaneGrid();
}

function switchDetailTab(tabName) {
  document.querySelectorAll('[data-detail-tab]').forEach(function (el) {
    el.classList.toggle('tab-active', el.dataset.detailTab === tabName);
  });
  document.getElementById('detailTabOnderzoek').classList.toggle('hidden', tabName !== 'onderzoek');
  document.getElementById('detailTabInzichten').classList.toggle('hidden', tabName !== 'inzichten');
}

function renderSwimlaneGrid() {
  var grid = document.getElementById('swimlaneGrid');
  var swimlanes = state.currentFunnel.swimlanes;

  if (swimlanes.length === 0) {
    grid.innerHTML = '<p class="text-base-content/60 text-sm">Nog geen Inzichten. Voeg onderzoek toe in het tabblad \'Onderzoek\' en groepeer met AI, of maak er handmatig één aan.</p>';
    return;
  }

  grid.innerHTML = swimlanes.map(function (lane) {
    var columns = STAGE_ORDER.map(function (stage) {
      var cards = lane.cards.filter(function (c) { return c.stage === stage; });
      var cardsHtml = cards.map(function (card) {
        return '' +
          '<div class="bg-base-100 border border-base-300 rounded-md p-2 mb-2 text-xs cursor-pointer hover:border-primary" ' +
          'data-action="editCard" data-swimlane-id="' + lane.id + '" data-stage="' + stage + '" data-card-id="' + card.id + '">' +
          (card.card_type ? '<span class="badge badge-ghost badge-xs mb-1">' + escapeHtml(card.card_type) + '</span><br/>' : '') +
          escapeHtml(card.content) +
          (card.source_ref ? '<div class="text-base-content/50 mt-1 truncate">' + escapeHtml(card.source_ref) + '</div>' : '') +
          '</div>';
      }).join('');

      return '' +
        '<div class="min-w-[220px] w-[220px] shrink-0 bg-base-200/40 rounded-lg p-2">' +
        '  <div class="text-xs font-semibold text-base-content/70 mb-2">' + STAGE_LABELS[stage] + '</div>' +
        '  <div>' + cardsHtml + '</div>' +
        '  <button class="btn btn-ghost btn-xs w-full gap-1" data-action="newCard" data-swimlane-id="' + lane.id + '" data-stage="' + stage + '">' +
        '    <i data-lucide="plus" class="w-3 h-3"></i> Kaart' +
        '  </button>' +
        '</div>';
    }).join('');

    return '' +
      '<div class="border border-base-300 rounded-lg p-3">' +
      '  <div class="flex items-center justify-between mb-2">' +
      '    <div>' +
      '      <h3 class="font-semibold">' + escapeHtml(lane.title) + '</h3>' +
      '      <p class="text-xs text-base-content/60">' + escapeHtml(lane.description || '') + '</p>' +
      '    </div>' +
      '    <button class="btn btn-ghost btn-xs text-error" data-action="deleteSwimlane" data-id="' + lane.id + '">' +
      '      <i data-lucide="trash-2" class="w-4 h-4"></i>' +
      '    </button>' +
      '  </div>' +
      '  <div class="flex gap-2 overflow-x-auto pb-2">' + columns + '</div>' +
      '</div>';
  }).join('');

  if (window.lucide) lucide.createIcons();
}

var CARD_TYPE_LABELS = {
  reality_check: 'Reality check',
  gebruikersonderzoek: 'Gebruikersonderzoek',
  eigen_idee: 'Eigen idee',
  actieblad: 'Actieblad',
  developer_input: 'Developer-input'
};

// --- Onderzoek-inbox ---------------------------------------------------------

async function loadInbox() {
  var f = state.currentFunnel.funnel;
  try {
    state.inbox = await apiJson('/campaigns/api/funnels/' + f.id + '/inbox');
    renderInboxList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderInboxList() {
  document.getElementById('inboxCount').textContent = state.inbox.length;
  var list = document.getElementById('inboxList');
  if (state.inbox.length === 0) {
    list.innerHTML = '<p class="text-base-content/60 text-sm">Nog geen onderzoeksnotities. Voeg er hierboven toe.</p>';
    return;
  }
  list.innerHTML = state.inbox.map(function (item) {
    return '' +
      '<div class="flex items-start justify-between gap-2 bg-base-100 border border-base-300 rounded-md p-2 text-sm">' +
      '  <div>' +
      (item.card_type ? '<span class="badge badge-ghost badge-xs mr-2">' + escapeHtml(CARD_TYPE_LABELS[item.card_type] || item.card_type) + '</span>' : '') +
      escapeHtml(item.content) +
      '  </div>' +
      '  <button class="btn btn-ghost btn-xs text-error shrink-0" data-action="deleteInboxItem" data-id="' + item.id + '">' +
      '    <i data-lucide="x" class="w-3 h-3"></i>' +
      '  </button>' +
      '</div>';
  }).join('');
  if (window.lucide) lucide.createIcons();
}

async function addInboxItem() {
  var content = document.getElementById('inboxContentInput').value.trim();
  if (!content) { showToast('Tekst is verplicht', 'error'); return; }
  var f = state.currentFunnel.funnel;
  try {
    await apiJson('/campaigns/api/funnels/' + f.id + '/inbox', Object.assign({ method: 'POST' }, jsonBody({
      content: content,
      card_type: document.getElementById('inboxTypeInput').value || null
    })));
    document.getElementById('inboxContentInput').value = '';
    document.getElementById('inboxTypeInput').value = '';
    discardProposal();
    await loadInbox();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteInboxItem(id) {
  try {
    await apiJson('/campaigns/api/cards/' + id, { method: 'DELETE' });
    discardProposal();
    await loadInbox();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- AI-groepering (voorstel, nog niet gepersisteerd) -----------------------

async function runAiGrouping() {
  if (state.inbox.length === 0) { showToast('Voeg eerst onderzoeksnotities toe', 'error'); return; }
  var f = state.currentFunnel.funnel;
  showToast('AI groepeert de inbox...');
  try {
    var result = await apiJson('/campaigns/api/funnels/' + f.id + '/inbox/suggest-groups', { method: 'POST' });
    var byId = {};
    state.inbox.forEach(function (item) { byId[item.id] = item; });

    state.proposal = {
      groups: (result.groups || []).map(function (g) {
        return {
          title: g.title,
          description: g.description,
          waarom: g.waarom,
          cards: g.card_ids.map(function (id) { return byId[id]; }).filter(Boolean)
        };
      }),
      leftover: (result.ongrouped_card_ids || []).map(function (id) { return byId[id]; }).filter(Boolean)
    };
    renderProposal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderProposal() {
  var section = document.getElementById('proposalSection');
  if (!state.proposal || state.proposal.groups.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  document.getElementById('proposalGroups').innerHTML = state.proposal.groups.map(function (group, gIdx) {
    var cardsHtml = group.cards.map(function (card) {
      return '' +
        '<div class="flex items-start justify-between gap-2 bg-base-200/40 rounded-md p-2 text-xs">' +
        '  <span>' + escapeHtml(card.content) + '</span>' +
        '  <button class="btn btn-ghost btn-xs shrink-0" data-action="removeCardFromGroup" data-group="' + gIdx + '" data-card-id="' + card.id + '">' +
        '    <i data-lucide="x" class="w-3 h-3"></i>' +
        '  </button>' +
        '</div>';
    }).join('');

    return '' +
      '<div class="card bg-base-100 border border-base-300">' +
      '  <div class="card-body p-4">' +
      '    <input class="input input-bordered input-sm font-semibold mb-1" data-proposal-field="title" data-group="' + gIdx + '" value="' + escapeHtml(group.title) + '" placeholder="Kernboodschap" />' +
      '    <textarea class="textarea textarea-bordered textarea-sm mb-1" rows="2" data-proposal-field="description" data-group="' + gIdx + '" placeholder="Samenvatting van het onderzoek">' + escapeHtml(group.description) + '</textarea>' +
      (group.waarom ? '    <p class="text-xs text-base-content/50 italic mb-2">AI-redenering: ' + escapeHtml(group.waarom) + '</p>' : '') +
      '    <div class="space-y-1">' + cardsHtml + '</div>' +
      '  </div>' +
      '</div>';
  }).join('');

  var leftover = state.proposal.leftover || [];
  document.getElementById('proposalLeftover').innerHTML = leftover.length === 0 ? '' : (
    '<h4 class="text-sm font-semibold text-base-content/60 mb-1">Niet gegroepeerd (' + leftover.length + ')</h4>' +
    '<div class="space-y-1">' + leftover.map(function (card) {
      return '<div class="bg-base-200/30 rounded-md p-2 text-xs">' + escapeHtml(card.content) + '</div>';
    }).join('') + '</div>'
  );

  if (window.lucide) lucide.createIcons();
}

function removeCardFromGroup(groupIdx, cardId) {
  var group = state.proposal.groups[groupIdx];
  var idx = group.cards.findIndex(function (c) { return c.id === cardId; });
  if (idx === -1) return;
  var card = group.cards.splice(idx, 1)[0];
  state.proposal.leftover.push(card);
  renderProposal();
}

function discardProposal() {
  state.proposal = null;
  document.getElementById('proposalSection').classList.add('hidden');
}

async function confirmProposal() {
  if (!state.proposal) return;
  var payloadGroups = state.proposal.groups
    .filter(function (g) { return g.title && g.title.trim() && g.cards.length > 0; })
    .map(function (g) {
      return {
        title: g.title.trim(),
        description: (g.description || '').trim(),
        card_ids: g.cards.map(function (c) { return c.id; })
      };
    });
  if (payloadGroups.length === 0) { showToast('Geen geldige groepen om te bevestigen', 'error'); return; }

  var f = state.currentFunnel.funnel;
  try {
    await apiJson('/campaigns/api/funnels/' + f.id + '/inbox/confirm-groups', Object.assign({ method: 'POST' }, jsonBody({ groups: payloadGroups })));
    discardProposal();
    showToast('Inzichten aangemaakt');
    await openFunnel(f.id);
    switchDetailTab('inzichten');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Modals ---------------------------------------------------------

function openModal(id) { document.getElementById(id).showModal(); }
function closeModal(id) { document.getElementById(id).close(); }

function openNewFunnelModal() {
  document.getElementById('newFunnelName').value = '';
  document.getElementById('newFunnelDesc').value = '';
  openModal('modalNewFunnel');
}

async function createFunnel() {
  var name = document.getElementById('newFunnelName').value.trim();
  if (!name) { showToast('Naam is verplicht', 'error'); return; }
  try {
    var funnel = await apiJson('/campaigns/api/funnels', Object.assign({ method: 'POST' }, jsonBody({
      name: name,
      description: document.getElementById('newFunnelDesc').value.trim()
    })));
    closeModal('modalNewFunnel');
    showToast('Funnel aangemaakt');
    await openFunnel(funnel.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveFunnelHeader() {
  var f = state.currentFunnel.funnel;
  try {
    var updated = await apiJson('/campaigns/api/funnels/' + f.id, Object.assign({ method: 'PATCH' }, jsonBody({
      name: document.getElementById('funnelNameInput').value.trim(),
      description: document.getElementById('funnelDescInput').value.trim(),
      status: document.getElementById('funnelStatusInput').value
    })));
    state.currentFunnel.funnel = updated;
    showToast('Opgeslagen');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteFunnel() {
  var f = state.currentFunnel.funnel;
  if (!confirm('Funnel "' + f.name + '" en alles erin verwijderen?')) return;
  try {
    await apiJson('/campaigns/api/funnels/' + f.id, { method: 'DELETE' });
    showToast('Funnel verwijderd');
    backToList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openNewSwimlaneModal() {
  document.getElementById('newSwimlaneTitle').value = '';
  document.getElementById('newSwimlaneDesc').value = '';
  openModal('modalNewSwimlane');
}

async function createSwimlane() {
  var title = document.getElementById('newSwimlaneTitle').value.trim();
  if (!title) { showToast('Titel is verplicht', 'error'); return; }
  var f = state.currentFunnel.funnel;
  try {
    await apiJson('/campaigns/api/funnels/' + f.id + '/swimlanes', Object.assign({ method: 'POST' }, jsonBody({
      title: title,
      description: document.getElementById('newSwimlaneDesc').value.trim()
    })));
    closeModal('modalNewSwimlane');
    showToast('Swimlane aangemaakt');
    await openFunnel(f.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteSwimlane(id) {
  if (!confirm('Deze swimlane en alle kaarten erin verwijderen?')) return;
  try {
    await apiJson('/campaigns/api/swimlanes/' + id, { method: 'DELETE' });
    showToast('Swimlane verwijderd');
    await openFunnel(state.currentFunnel.funnel.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openNewCardModal(swimlaneId, stage) {
  state.cardModalContext = { swimlaneId: swimlaneId, stage: stage, cardId: null };
  document.getElementById('modalCardTitle').textContent = 'Nieuwe kaart — ' + STAGE_LABELS[stage];
  document.getElementById('cardContentInput').value = '';
  document.getElementById('cardTypeInput').value = '';
  document.getElementById('cardSourceInput').value = '';
  document.getElementById('cardDeleteBtn').classList.add('hidden');
  openModal('modalCard');
}

function openEditCardModal(swimlaneId, stage, cardId) {
  var lane = state.currentFunnel.swimlanes.find(function (l) { return l.id === swimlaneId; });
  var card = lane.cards.find(function (c) { return c.id === cardId; });
  state.cardModalContext = { swimlaneId: swimlaneId, stage: stage, cardId: cardId };
  document.getElementById('modalCardTitle').textContent = 'Kaart bewerken — ' + STAGE_LABELS[stage];
  document.getElementById('cardContentInput').value = card.content;
  document.getElementById('cardTypeInput').value = card.card_type || '';
  document.getElementById('cardSourceInput').value = card.source_ref || '';
  document.getElementById('cardDeleteBtn').classList.remove('hidden');
  openModal('modalCard');
}

async function saveCard() {
  var ctx = state.cardModalContext;
  var content = document.getElementById('cardContentInput').value.trim();
  if (!content) { showToast('Tekst is verplicht', 'error'); return; }
  var payload = {
    content: content,
    card_type: document.getElementById('cardTypeInput').value.trim() || null,
    source_ref: document.getElementById('cardSourceInput').value.trim() || null
  };
  try {
    if (ctx.cardId) {
      await apiJson('/campaigns/api/cards/' + ctx.cardId, Object.assign({ method: 'PATCH' }, jsonBody(payload)));
    } else {
      payload.stage = ctx.stage;
      await apiJson('/campaigns/api/swimlanes/' + ctx.swimlaneId + '/cards', Object.assign({ method: 'POST' }, jsonBody(payload)));
    }
    closeModal('modalCard');
    showToast('Opgeslagen');
    await openFunnel(state.currentFunnel.funnel.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCard() {
  var ctx = state.cardModalContext;
  if (!ctx.cardId) return;
  if (!confirm('Deze kaart verwijderen?')) return;
  try {
    await apiJson('/campaigns/api/cards/' + ctx.cardId, { method: 'DELETE' });
    closeModal('modalCard');
    showToast('Kaart verwijderd');
    await openFunnel(state.currentFunnel.funnel.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Central event delegation ---------------------------------------------

document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.dataset.action;

  if (action === 'openNewFunnelModal') return openNewFunnelModal();
  if (action === 'createFunnel') return createFunnel();
  if (action === 'openFunnel') return openFunnel(el.dataset.id);
  if (action === 'backToList') return backToList();
  if (action === 'saveFunnelHeader') return saveFunnelHeader();
  if (action === 'deleteFunnel') return deleteFunnel();
  if (action === 'openNewSwimlaneModal') return openNewSwimlaneModal();
  if (action === 'createSwimlane') return createSwimlane();
  if (action === 'deleteSwimlane') return deleteSwimlane(el.dataset.id);
  if (action === 'newCard') return openNewCardModal(el.dataset.swimlaneId, el.dataset.stage);
  if (action === 'editCard') return openEditCardModal(el.dataset.swimlaneId, el.dataset.stage, el.dataset.cardId);
  if (action === 'saveCard') return saveCard();
  if (action === 'deleteCard') return deleteCard();
  if (action === 'closeModal') return closeModal(el.dataset.modal);
  if (action === 'addInboxItem') return addInboxItem();
  if (action === 'deleteInboxItem') return deleteInboxItem(el.dataset.id);
  if (action === 'runAiGrouping') return runAiGrouping();
  if (action === 'discardProposal') return discardProposal();
  if (action === 'confirmProposal') return confirmProposal();
  if (action === 'removeCardFromGroup') return removeCardFromGroup(parseInt(el.dataset.group, 10), el.dataset.cardId);
});

document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-detail-tab]');
  if (!el) return;
  switchDetailTab(el.dataset.detailTab);
});

document.addEventListener('input', function (e) {
  var el = e.target.closest('[data-proposal-field]');
  if (!el || !state.proposal) return;
  var group = state.proposal.groups[parseInt(el.dataset.group, 10)];
  if (!group) return;
  group[el.dataset.proposalField] = el.value;
});

// --- Init ---------------------------------------------------------

(async function init() {
  await initNavbar();
  await loadFunnelList();
})();
