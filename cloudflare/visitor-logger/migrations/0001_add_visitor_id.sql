ALTER TABLE visits ADD COLUMN visitor_id TEXT NOT NULL DEFAULT '';
CREATE INDEX visits_visitor_id ON visits (visitor_id);
