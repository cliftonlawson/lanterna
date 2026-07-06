alter table public.gallery_design
  add column if not exists headline_font text not null default 'Cormorant Garamond',
  add column if not exists headline_font_weight integer not null default 500,
  add column if not exists body_font text not null default 'DM Sans',
  add column if not exists body_font_weight integer not null default 400;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gallery_design_headline_font_weight_check'
  ) then
    alter table public.gallery_design
      add constraint gallery_design_headline_font_weight_check
        check (headline_font_weight between 100 and 1000) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'gallery_design_body_font_weight_check'
  ) then
    alter table public.gallery_design
      add constraint gallery_design_body_font_weight_check
        check (body_font_weight between 100 and 1000) not valid;
  end if;
end $$;
