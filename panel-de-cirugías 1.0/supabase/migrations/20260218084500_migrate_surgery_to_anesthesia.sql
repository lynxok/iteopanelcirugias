-- Update all items from 'surgery' category to 'anesthesia'
-- Run this once to migrate items as requested.

UPDATE quirofano.catalog_items
SET category = 'anesthesia'
WHERE category = 'surgery';
