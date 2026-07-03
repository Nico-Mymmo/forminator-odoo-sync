import { executeKw } from '../../lib/odoo.js';

const ALLOWED_MODELS = /^[a-z][a-z0-9_.]{1,63}$/;
const ALLOWED_VIEW_TYPES = new Set(['form', 'list', 'tree', 'kanban', 'search']);

export default {
  code: 'admin_helpers',
  name: 'Admin Helpers',
  route: '/xpath-converter',
  requiresAuth: true,
  routes: {
    'GET /': async (context) =>
      context.env.ASSETS.fetch(new Request(new URL('/xpath-converter.html', context.request.url))),

    'GET /api/arch': async ({ env, request }) => {
      const url = new URL(request.url);
      const model = url.searchParams.get('model') || '';
      const viewType = url.searchParams.get('view_type') || 'form';
      const studioViewId = parseInt(url.searchParams.get('view_id') || '0', 10);

      if (!ALLOWED_MODELS.test(model)) {
        return new Response(JSON.stringify({ error: 'Ongeldig model-naam' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!ALLOWED_VIEW_TYPES.has(viewType)) {
        return new Response(JSON.stringify({ error: 'Ongeldig view_type' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        // Combined arch (post-Studio) — used for named lookups
        const combinedResult = await executeKw(env, {
          model,
          method: 'get_views',
          args: [[[false, viewType]]],
          kwargs: {},
        });

        const arch = combinedResult?.views?.[viewType]?.arch;
        if (!arch) {
          return new Response(JSON.stringify({ error: 'Geen arch gevonden in Odoo-response' }), {
            status: 502, headers: { 'Content-Type': 'application/json' },
          });
        }

        // simArch = pre-Studio parent arch (exact simulation base)
        // Only available when view_id is provided
        let simArch = null;

        if (studioViewId > 0) {
          // Read the Studio view record to find its parent (inherit_id)
          const studioViews = await executeKw(env, {
            model: 'ir.ui.view',
            method: 'read',
            args: [[studioViewId]],
            kwargs: { fields: ['inherit_id', 'type'] },
          });
          const parentId = studioViews?.[0]?.inherit_id?.[0];

          if (parentId) {
            // Read the RAW arch of the parent (base) view — just its own XML,
            // no inherit views applied.
            const parentViewData = await executeKw(env, {
              model: 'ir.ui.view',
              method: 'read',
              args: [[parentId]],
              kwargs: { fields: ['arch', 'name'] },
            });
            const baseArch = parentViewData?.[0]?.arch || null;

            // Fetch ALL direct inherit views of the parent (= the list shown in
            // Odoo Technical → view → Overerfde weergaven), sorted by priority
            // (Reeks) then id, exactly as Odoo would apply them. Exclude the
            // Studio view itself so we end up with the pre-Studio DOM state.
            const inheritViews = baseArch ? await executeKw(env, {
              model: 'ir.ui.view',
              method: 'search_read',
              args: [[
                ['inherit_id', '=', parentId],
                ['id', '!=', studioViewId],
                ['active', '=', true],
              ]],
              kwargs: {
                fields: ['id', 'name', 'arch', 'priority'],
                order: 'priority ASC, id ASC',
              },
            }) : [];

            simArch = baseArch ? { baseArch, inheritViews } : null;
          }
        }

        return new Response(JSON.stringify({ arch, simArch }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
    },
  },
};
