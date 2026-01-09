-- Add password field to users table
ALTER TABLE users ADD COLUMN password TEXT;

-- Add status field for account verification
ALTER TABLE users ADD COLUMN status TEXT CHECK(status IN ('pending', 'active', 'suspended')) DEFAULT 'active';

-- Add address field
ALTER TABLE users ADD COLUMN address TEXT;
