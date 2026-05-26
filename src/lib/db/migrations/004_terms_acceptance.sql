-- Record when (and which version of) the Terms a user accepted.
-- Anonymous users can't sign anything server-side, so the gate for them is
-- enforced in the UI; this table is for authenticated users only.
ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME;
ALTER TABLE users ADD COLUMN terms_accepted_version TEXT;
