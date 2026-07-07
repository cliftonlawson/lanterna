/*
# Usage events are server-only

Upload allowance is enforced and recorded by Lanterna API service-role routes.
Authenticated clients may read usage events, but cannot insert them directly.
*/

DROP POLICY IF EXISTS "members can insert usage events" ON public.usage_events;
