CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visited_at TEXT NOT NULL,
  page TEXT NOT NULL,
  ip TEXT NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  visitor_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'page_view'
);

CREATE INDEX IF NOT EXISTS visits_visited_at ON visits (visited_at);
CREATE INDEX IF NOT EXISTS visits_visitor_id ON visits (visitor_id);
