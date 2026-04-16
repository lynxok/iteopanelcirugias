-- Add telegram_enabled column to users table
alter table quirofano.users add column if not exists telegram_enabled boolean default true;
