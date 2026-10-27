-- Resolve existing NULL, blank, duplicate, and non-Gmail user emails before applying.
-- This migration intentionally does not invent or rewrite users' email addresses.
ALTER TABLE users
    MODIFY email VARCHAR(255) NOT NULL,
    ADD CONSTRAINT uq_users_email UNIQUE (email);
