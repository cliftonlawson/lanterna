/*
# Welcome upload allowance

Adds a distinct entitlement source for the one-time 10 GB allowance granted to
new accounts. Keeping it separate prevents free accounts from unlocking paid
block top-ups or white-label add-ons.
*/

ALTER TYPE public.entitlement_source ADD VALUE IF NOT EXISTS 'welcome';
