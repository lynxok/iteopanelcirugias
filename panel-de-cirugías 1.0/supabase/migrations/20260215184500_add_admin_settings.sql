-- Create admin_settings table for global configurations
create table if not exists quirofano.admin_settings (
    key text primary key,
    value text, -- 'true' or 'false', or JSON string
    updated_at timestamp with time zone default now()
);

-- Insert default telegram_enabled setting (defaulting to false for safety)
insert into quirofano.admin_settings (key, value)
values ('telegram_enabled', 'false')
on conflict (key) do nothing;
