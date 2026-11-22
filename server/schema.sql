-- Cellar Book shared journals. Only journals someone chose to share are stored here.
CREATE TABLE IF NOT EXISTS journals (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Shared cellar',
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wines (
  journal_id TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (journal_id, id)
);
CREATE INDEX IF NOT EXISTS wines_by_update ON wines (journal_id, updated);
