/**
 * Lead Resolution Service (Addendum G)
 *
 * Deterministic lead selection per partner:
 * OPEN -> CLOSED_WON -> CLOSED_LOST -> no lead
 *
 * Tie-break ordering:
 * write_date DESC, then create_date DESC, then id DESC
 */

import { getLeadsByPartnerIds } from '../odoo-client.js';

const LEAD_BATCH_SIZE = 200;

function chunkArray(items, chunkSize) {
  if (!Array.isArray(items) || items.length === 0 || chunkSize <= 0) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function parseMany2OneId(value) {
  if (Array.isArray(value) && value.length > 0) {
    const candidate = Number(value[0]);
    return Number.isInteger(candidate) ? candidate : null;
  }

  const candidate = Number(value);
  return Number.isInteger(candidate) ? candidate : null;
}

function parseDateMs(value) {
  if (!value || typeof value !== 'string') {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseWonStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'won' || normalized === 'lost') {
    return normalized;
  }
  return null;
}

function parseActive(value) {
  return value !== false;
}

function parseStageName(stageValue) {
  if (Array.isArray(stageValue) && stageValue.length > 1) {
    return stageValue[1] != null ? String(stageValue[1]).trim() : null;
  }
  return null;
}

function parseMany2OneName(value) {
  if (Array.isArray(value) && value.length > 1) {
    return value[1] != null ? String(value[1]).trim() : null;
  }
  return null;
}

function isUnknownLostReason(lead) {
  const reasonName = parseMany2OneName(lead?.lost_reason_id);
  if (!reasonName) {
    return false;
  }

  return reasonName.toLowerCase() === 'unknown';
}

function shouldExcludeArchivedLead(lead) {
  const active = parseActive(lead?.active);
  const wonStatus = parseWonStatus(lead?.won_status);

  if (active !== false) {
    return false;
  }

  if (wonStatus === 'pending') {
    return true;
  }

  if (wonStatus === 'lost' && isUnknownLostReason(lead)) {
    return true;
  }

  return false;
}

function classifyLeadStatus(lead) {
  const wonStatus = parseWonStatus(lead?.won_status);
  const active = parseActive(lead?.active);

  if (wonStatus === 'pending' && active === true) {
    return {
      bucket: 'OPEN',
      resolvedLeadStatus: 'pending',
      anomaly: false
    };
  }

  if (wonStatus === 'won' && active === true) {
    return {
      bucket: 'CLOSED_WON',
      resolvedLeadStatus: 'won',
      anomaly: false
    };
  }

  if (wonStatus === 'lost' && active === false) {
    return {
      bucket: 'CLOSED_LOST',
      resolvedLeadStatus: 'lost',
      anomaly: false
    };
  }

  return {
    bucket: 'OPEN',
    resolvedLeadStatus: 'pending',
    anomaly: true
  };
}

function compareLeadRecencyDescending(left, right) {
  const leftWriteDate = parseDateMs(left?.write_date);
  const rightWriteDate = parseDateMs(right?.write_date);
  if (leftWriteDate !== rightWriteDate) {
    return rightWriteDate - leftWriteDate;
  }

  const leftCreateDate = parseDateMs(left?.create_date);
  const rightCreateDate = parseDateMs(right?.create_date);
  if (leftCreateDate !== rightCreateDate) {
    return rightCreateDate - leftCreateDate;
  }

  const leftId = Number(left?.id) || 0;
  const rightId = Number(right?.id) || 0;
  return rightId - leftId;
}

function toLeadDto(lead, classification) {
  const stageName = parseStageName(lead?.stage_id);
  const resolvedLeadStatus = classification?.resolvedLeadStatus || 'pending';

  return {
    id: Number(lead.id),
    name: lead.name || null,
    stageId: parseMany2OneId(lead.stage_id),
    stageName: stageName || null,
    active: parseActive(lead.active),
    wonStatus: parseWonStatus(lead?.won_status),
    resolved_lead_status: resolvedLeadStatus,
    resolved_lead_stage_name: resolvedLeadStatus === 'pending' ? (stageName || null) : null,
    tier: classification?.bucket || 'OPEN',
    writeDate: lead.write_date || null,
    createDate: lead.create_date || null
  };
}

function resolveDisplayLead(partnerId, leads) {
  if (!Array.isArray(leads) || leads.length === 0) {
    return null;
  }

  const openLeads = [];
  const closedWonLeads = [];
  const closedLostLeads = [];

  for (const lead of leads) {
    if (shouldExcludeArchivedLead(lead)) {
      continue;
    }

    const classification = classifyLeadStatus(lead);

    if (classification.anomaly) {
      console.warn('[Event Operations][Addendum G] Lead status anomaly detected', {
        partnerId,
        leadId: lead?.id,
        won_status: lead?.won_status ?? null,
        active: lead?.active
      });
    }

    if (classification.bucket === 'OPEN') {
      openLeads.push({ lead, classification });
    } else if (classification.bucket === 'CLOSED_WON') {
      closedWonLeads.push({ lead, classification });
    } else if (classification.bucket === 'CLOSED_LOST') {
      closedLostLeads.push({ lead, classification });
    }
  }

  const pick = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return null;
    }

    const sorted = [...items].sort((left, right) => compareLeadRecencyDescending(left.lead, right.lead));
    const winner = sorted[0];
    return toLeadDto(winner.lead, winner.classification);
  };

  return (
    pick(openLeads) ||
    pick(closedWonLeads) ||
    pick(closedLostLeads) ||
    null
  );
}

/**
 * Resolve one deterministic lead state per partner in batched mode.
 *
 * @param {Object} env
 * @param {number[]} partnerIds
 * @returns {Promise<Map<number, Object|null>>}
 */
export async function resolveLeadStatesForPartners(env, partnerIds) {
  const sanitizedPartnerIds = (Array.isArray(partnerIds) ? partnerIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const uniquePartnerIds = [...new Set(sanitizedPartnerIds)];
  const result = new Map(uniquePartnerIds.map((partnerId) => [partnerId, null]));

  if (uniquePartnerIds.length === 0) {
    return result;
  }

  const leadChunks = chunkArray(uniquePartnerIds, LEAD_BATCH_SIZE);
  const allLeads = [];

  for (const chunk of leadChunks) {
    const leads = await getLeadsByPartnerIds(env, chunk);
    allLeads.push(...(Array.isArray(leads) ? leads : []));
  }

  if (allLeads.length === 0) {
    return result;
  }

  const leadsByPartner = new Map();
  for (const lead of allLeads) {
    const partnerId = parseMany2OneId(lead?.partner_id);
    if (!Number.isInteger(partnerId) || partnerId <= 0) {
      continue;
    }

    if (!leadsByPartner.has(partnerId)) {
      leadsByPartner.set(partnerId, []);
    }

    leadsByPartner.get(partnerId).push(lead);
  }

  for (const partnerId of uniquePartnerIds) {
    const partnerLeads = leadsByPartner.get(partnerId) || [];
    result.set(partnerId, resolveDisplayLead(partnerId, partnerLeads));
  }

  return result;
}
