import { searchRead, create } from "../lib/odoo.js";

/**
 * Check if contact exists by email, if not create it
 * Returns contact object with id and whether it was created or existing
 * 
 * @param {Object} env - Environment variables
 * @param {string} email - Email address to search for
 * @param {Object} contactData - Additional contact data (name, phone, etc.)
 * @returns {Object} { id, email, name, isNew, contact }
 */
export async function checkCreateContact(env, { email, contactData = {} }) {
  if (!email) {
    throw new Error("Email is required");
  }

  const timestamp = new Date().toISOString().substring(11, 19);
  
  // Search for existing contact by email
  console.log(`🔍 [${timestamp}] Searching contact with email: ${email}`);
  
  const existingContacts = await searchRead(env, {
    model: "res.partner",
    domain: [["email", "=", email.toLowerCase().trim()]],
    fields: ["id", "name", "email", "phone", "mobile", "company_name"],
    limit: 1
  });

  // Contact exists - return it
  if (existingContacts && existingContacts.length > 0) {
    const contact = existingContacts[0];
    console.log(`✅ [${timestamp}] Contact found: ID ${contact.id} - ${contact.name}`);
    return {
      id: contact.id,
      email: contact.email,
      name: contact.name,
      isNew: false,
      contact: contact
    };
  }

  // Contact doesn't exist - create it
  console.log(`➕ [${timestamp}] Creating new contact for: ${email}`);
  console.log(`⚠️  [${timestamp}] Create contact activated, function needs to be implemented`);
  
  // TODO: Uncomment when ready to create contacts
  /*
  const newContactValues = {
    email: email.toLowerCase().trim(),
    name: contactData.name || email,
    phone: contactData.phone || false,
    mobile: contactData.mobile || false,
    company_name: contactData.company_name || false,
    ...contactData // Allow additional fields to be passed
  };

  const contactId = await create(env, {
    model: "res.partner",
    values: newContactValues
  });

  console.log(`✅ [${timestamp}] Contact created: ID ${contactId}`);
  */

  // Temporary: return mock data
  return {
    id: null,
    email: email,
    name: contactData.name || email,
    isNew: true,
    contact: { id: null, email: email, name: contactData.name || email }
  };
}
