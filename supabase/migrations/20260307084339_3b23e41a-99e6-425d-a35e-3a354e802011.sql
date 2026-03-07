-- Add device_serial column and last_push_count to hr_biometric_devices
ALTER TABLE hr_biometric_devices 
  ADD COLUMN IF NOT EXISTS device_serial TEXT,
  ADD COLUMN IF NOT EXISTS last_push_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_stamp TEXT DEFAULT '0';

-- Create unique index on device_serial for lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_biometric_devices_serial 
  ON hr_biometric_devices(device_serial) WHERE device_serial IS NOT NULL;