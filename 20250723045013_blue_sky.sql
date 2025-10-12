/*
  # Make Emergency Contact Optional

  1. Changes
    - Make emergency_contact_name and emergency_contact_phone nullable
    - Update existing constraints to allow null values

  2. Security
    - Maintain existing RLS policies
*/

DO $$
BEGIN
  -- Make emergency contact fields nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'emergency_contact_name'
  ) THEN
    ALTER TABLE user_profiles ALTER COLUMN emergency_contact_name DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'emergency_contact_phone'
  ) THEN
    ALTER TABLE user_profiles ALTER COLUMN emergency_contact_phone DROP NOT NULL;
  END IF;
END $$;