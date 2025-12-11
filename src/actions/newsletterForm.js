import { create } from "../lib/odoo.js";

/**
 * Handle newsletter subscription
 * Adds contact to mailing list in Odoo
 */
export async function handleNewsletterForm({ env, data }) {
  const { email, name, consent } = data;

  if (!email) {
    throw new Error("Email is required for newsletter subscription");
  }

  // Create contact with newsletter subscription
  const contactValues = {
    name: name || email,
    email: email,
    x_studio_newsletter_consent: consent === true,
    x_studio_newsletter_source: "website_form",
    x_studio_newsletter_date: new Date().toISOString().split('T')[0]
  };

  const contactId = await create(env, {
    model: "res.partner",
    values: contactValues
  });

  return {
    success: true,
    contact_id: contactId,
    message: "Newsletter subscription processed successfully"
  };
}
