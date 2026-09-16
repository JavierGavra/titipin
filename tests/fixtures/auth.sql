-- Only loaded by the isolated test harness, never into the user's database.
INSERT INTO public.accounts (account_id, display_name, role, verification_status) VALUES
 ('acc_requester_a', 'Requester A', 'requester', 'verified'),
 ('acc_requester_b', 'Requester B', 'requester', 'verified'),
 ('acc_jastiper_a', 'Jastiper A', 'jastiper', 'verified'),
 ('acc_jastiper_b', 'Jastiper B', 'jastiper', 'verified'),
 ('acc_admin_a', 'Admin A', 'admin', 'verified'),
 ('acc_admin_b', 'Admin B', 'admin', 'verified');

INSERT INTO public.requests (request_id, requester_id, item_description, quantity,
 target_store_or_area, budget_amount, delivery_address, deadline, status, created_at) VALUES
 ('req_assigned_a', 'acc_requester_a', 'Notebook A', 1, 'Store A', 150000, 'Private address A', CURRENT_TIMESTAMP + INTERVAL '2 days', 'assigned', CURRENT_TIMESTAMP - INTERVAL '1 hour'),
 ('req_assigned_b', 'acc_requester_b', 'Notebook B', 1, 'Store B', 150000, 'Private address B', CURRENT_TIMESTAMP + INTERVAL '2 days', 'assigned', CURRENT_TIMESTAMP),
 ('req_open_a', 'acc_requester_a', 'Open A', 1, 'Store A', 150000, 'Private open A', CURRENT_TIMESTAMP + INTERVAL '2 days', 'open', CURRENT_TIMESTAMP - INTERVAL '2 hours'),
 ('req_open_b', 'acc_requester_b', 'Open B', 1, 'Store B', 150000, 'Private open B', CURRENT_TIMESTAMP + INTERVAL '2 days', 'open', CURRENT_TIMESTAMP - INTERVAL '3 hours');

INSERT INTO public.offers (offer_id, request_id, jastiper_id, status,
 item_price_amount, service_fee_amount, delivery_fee_amount, estimated_arrival_at,
 stock_checked_at, expires_at) VALUES
 ('off_assigned_a', 'req_assigned_a', 'acc_jastiper_a', 'selected', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_assigned_b', 'req_assigned_b', 'acc_jastiper_b', 'selected', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_open_a', 'req_open_a', 'acc_jastiper_a', 'active', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_open_b', 'req_open_b', 'acc_jastiper_b', 'active', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day');

INSERT INTO public.assignments (assignment_id, request_id, offer_id, assigned_jastiper_id, status) VALUES
 ('asg_assigned_a', 'req_assigned_a', 'off_assigned_a', 'acc_jastiper_a', 'purchased'),
 ('asg_assigned_b', 'req_assigned_b', 'off_assigned_b', 'acc_jastiper_b', 'purchased');
INSERT INTO public.deliveries (delivery_id, assignment_id, delivery_address) VALUES
 ('dlv_assigned_a', 'asg_assigned_a', 'Private address A'),
 ('dlv_assigned_b', 'asg_assigned_b', 'Private address B');
