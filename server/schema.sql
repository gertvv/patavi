CREATE TYPE patavi_task_status AS ENUM ( 'unknown', 'accepted', 'failed', 'done');
CREATE TABLE patavi_task (
  id BIGINT PRIMARY KEY, -- flake ID
  creator_name VARCHAR(128) NOT NULL,
  creator_fingerprint VARCHAR(128) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  time_to_live INTERVAL,
  service VARCHAR(128) NOT NULL,
  task JSONB NOT NULL,
  status patavi_task_status NOT NULL DEFAULT 'unknown',
  result JSONB
);

CREATE FUNCTION patavi_task_timeout() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  DELETE FROM patavi_task WHERE updated_at < NOW() - time_to_live;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trigger_patavi_task_timeout
  AFTER INSERT ON patavi_task
  EXECUTE PROCEDURE patavi_task_timeout();
