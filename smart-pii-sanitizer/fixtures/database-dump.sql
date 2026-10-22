-- Production Database Backup Snippet (PostgreSQL)
-- Dumped at 2026-10-22 03:00:00 UTC

SET statement_timeout = 0;
SET lock_timeout = 0;

-- Table: public.user_credentials
CREATE TABLE public.user_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) NOT NULL,
    email VARCHAR(255) NOT NULL,
    ip_last_seen INET,
    api_token VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.user_credentials (id, username, email, ip_last_seen, api_token) VALUES
('b1928374-1234-4567-890a-bcdef0123456', 'alex_dev', 'alex.miller@internal-ops.corp', '172.20.14.88', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
('c2938475-2345-5678-901b-cdef01234567', 'charlie_qa', 'charlie.davis@internal-ops.corp', '172.20.14.89', 'xoxb-998877665544-998877665544-AbCdEfGhIjKlMnOpQrStUvWx'),
('d3948576-3456-6789-012c-def012345678', 'samantha_admin', 'samantha.reed@enterprise.com', '192.168.1.100', 'AKIAIOSFODNN7EXAMPLE');

-- Remote connection string for backup sync:
-- DATABASE_URL="postgres://backup_runner:VeryStrongBackupP@ss123@replica.corp.internal:5432/finance_db"
