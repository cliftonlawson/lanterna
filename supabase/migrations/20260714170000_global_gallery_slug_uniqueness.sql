/*
# Globally unique gallery slugs

Public gallery lookup resolves by slug without account context. Keep deleted
slugs reserved so an old delivery URL can never be reassigned to a new gallery.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT slug
    FROM public.galleries
    GROUP BY slug
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce global gallery slugs while duplicate slugs exist.';
  END IF;
END;
$$;

ALTER TABLE public.galleries
  DROP CONSTRAINT IF EXISTS galleries_slug_unique;

ALTER TABLE public.galleries
  DROP CONSTRAINT IF EXISTS galleries_slug_global_unique;

ALTER TABLE public.galleries
  ADD CONSTRAINT galleries_slug_global_unique UNIQUE (slug);
