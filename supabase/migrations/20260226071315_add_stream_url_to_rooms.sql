-- Add stream_url column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS stream_url TEXT;
