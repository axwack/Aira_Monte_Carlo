CREATE TABLE IF NOT EXISTS events (
  day   TEXT    NOT NULL,
  name  TEXT    NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);
