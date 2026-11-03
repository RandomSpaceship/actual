BEGIN TRANSACTION;

CREATE TABLE formula_library
  (id TEXT PRIMARY KEY,
   type TEXT,
   name TEXT,
   data TEXT,
   created_at INTEGER,
   tombstone INTEGER DEFAULT 0);

COMMIT;
