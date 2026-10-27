UPDATE users
SET phone_number = NULL
WHERE phone_number IS NOT NULL
  AND TRIM(phone_number) = '';

ALTER TABLE users
    ADD CONSTRAINT uq_users_phone_number UNIQUE (phone_number);
