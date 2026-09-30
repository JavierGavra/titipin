-- Additive P4 migration. Existing P3 tables/data are preserved.
CREATE TABLE IF NOT EXISTS public.auth_identities (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES public.accounts(account_id),
  PRIMARY KEY (issuer, subject),
  UNIQUE (issuer, account_id)
);

-- Explicit operational responsibility. Admin/MCP has no global read bypass.
CREATE TABLE IF NOT EXISTS public.request_access (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES public.requests(request_id) ON DELETE CASCADE,
  PRIMARY KEY (issuer, subject, request_id)
);

-- Provisioned by a trusted operator, never from a request body.
CREATE TABLE IF NOT EXISTS public.tracker_deliveries (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  client_id TEXT NOT NULL CHECK (client_id = 'titipin-tracker'),
  delivery_id TEXT NOT NULL REFERENCES public.deliveries(delivery_id) ON DELETE CASCADE,
  PRIMARY KEY (issuer, subject, client_id, delivery_id)
);
