-- Grant service_role access to notification_state (the prior migration was already applied
-- to remote without the grant, so the admin service-role client got "permission denied").
grant all on public.notification_state to service_role;
