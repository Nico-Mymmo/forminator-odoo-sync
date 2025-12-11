import { validateAuth, parseJsonBody, successResponse, errorResponse } from "./lib/utils.js";
import { handleContactForm } from "./actions/contactForm.js";
import { handleNewsletterForm } from "./actions/newsletterForm.js";

/**
 * Form type to handler mapping
 */
const FORM_HANDLERS = {
  contact: handleContactForm,
  newsletter: handleNewsletterForm,
  // Add more form handlers here as needed
};

export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Validate authentication
      if (!validateAuth(request, env)) {
        return errorResponse("Unauthorized", 401);
      }

      const url = new URL(request.url);

      // Health check endpoint
      if (url.pathname === "/health" || url.pathname === "/") {
        return successResponse({
          status: "healthy",
          service: "forminator-odoo-sync",
          timestamp: new Date().toISOString()
        });
      }

      // Webhook endpoint
      if (request.method === "POST" && url.pathname === "/webhook") {
        const data = await parseJsonBody(request);

        // Determine form type
        const formType = data.form_type || url.searchParams.get("form_type") || "contact";

        // Get handler for form type
        const handler = FORM_HANDLERS[formType];
        if (!handler) {
          return errorResponse(`Unknown form type: ${formType}`, 400);
        }

        // Process form submission
        const result = await handler({ env, data, request, ctx });

        return successResponse(result);
      }

      return errorResponse("Not found", 404);

    } catch (error) {
      return errorResponse(error.message, 500);
    }
  }
};
