import { create, searchRead } from "../lib/odoo.js";

/**
 * Handle contact form submission
 * Creates or updates a contact/lead in Odoo
 */
export async function handleContactForm({ env, data }) {
  const { name, email, phone, company, message, form_id, entry_id } = data;

  // Search for existing contact by email
  let contactId = null;
  if (email) {
    const existingContacts = await searchRead(env, {
      model: "res.partner",
      domain: [["email", "=", email]],
      fields: ["id", "name"],
      limit: 1
    });

    if (existingContacts && existingContacts.length > 0) {
      contactId = existingContacts[0].id;
    }
  }

  // Create lead in CRM
  const leadValues = {
    name: message ? message.substring(0, 100) : `Contact form - ${name || email}`,
    contact_name: name || null,
    email_from: email || null,
    phone: phone || null,
    partner_name: company || null,
    description: message || null,
    type: "opportunity",
    ...(contactId ? { partner_id: contactId } : {}),
    // Custom fields for tracking
    x_studio_form_id: form_id || null,
    x_studio_entry_id: entry_id ? String(entry_id) : null,
    x_studio_source: "website_form"
  };

  const leadId = await create(env, {
    model: "crm.lead",
    values: leadValues
  });

  return {
    success: true,
    lead_id: leadId,
    contact_id: contactId,
    message: "Contact form processed successfully"
  };
}
