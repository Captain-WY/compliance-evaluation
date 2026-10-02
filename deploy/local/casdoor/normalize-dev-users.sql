-- Scoped exclusively to the fresh local Casdoor database.
-- Casdoor's init importer generates IDs; stable subjects match public seed data.
UPDATE "user" SET id = '11111111-1111-4111-8111-111111111111' WHERE owner = 'compliance' AND name = 'admin';
UPDATE "user" SET id = '22222222-2222-4222-8222-222222222222' WHERE owner = 'compliance' AND name = 'hq_user';
UPDATE "user" SET id = '33333333-3333-4333-8333-333333333333' WHERE owner = 'compliance' AND name = 'branch_user';
UPDATE "user" SET id = '44444444-4444-4444-8444-444444444444' WHERE owner = 'compliance' AND name = 'department_user';
UPDATE "user" SET id = '55555555-5555-4555-8555-555555555555' WHERE owner = 'compliance' AND name = 'lawyer';
-- Disable the upstream demo administrator; use the random local_operator account.
UPDATE "user" SET is_forbidden = true WHERE owner = 'built-in' AND name = 'admin';
