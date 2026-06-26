-- Buckeye / wager.db sample rows (matches table schema from MATCHES_TABLE_DDL).
-- Loaded by test/helpers/wager-fixture.ts after schema init.

INSERT INTO matches (match_id, home_team, away_team, winner_idx, loser_idx, date, sport, league, y)
VALUES
  ('buckeye-001', 'ohio-state', 'michigan', 0, 1, '2025-11-29T20:00:00.000Z', 'fbs', 'ncaa', 1.0),
  ('buckeye-002', 'michigan', 'penn-state', 1, 0, '2025-11-15T20:00:00.000Z', 'fbs', 'ncaa', 1.0),
  ('buckeye-003', 'penn-state', 'ohio-state', 1, 0, '2025-11-08T20:00:00.000Z', 'fbs', 'ncaa', 1.0);
