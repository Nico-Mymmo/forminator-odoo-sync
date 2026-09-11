-- FSV2: persist the chosen tracker domain (link.openvme.be / link.syndicoach.be /
-- operations.openvme.be) so it survives a reload/reopen of the detail view.
--
-- Before this migration the choice made via the domain <select> in the detail
-- view (data-action="tracker-domain-change") only lived in the in-memory
-- client state (S()._trackerUrl.domain) for the current page session. Every
-- fresh openDetail() call re-fetched GET /integrations/:id/tracker-url WITHOUT
-- a ?domain= query param, and that route always falls back to 'link' when no
-- explicit ?domain= is given -- so the picker silently reset to
-- link.openvme.be on every reload/reopen, even after picking
-- link.syndicoach.be.
ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS tracker_domain TEXT NULL
  CHECK (tracker_domain IS NULL OR tracker_domain IN ('link', 'syndicoach', 'operations'));
