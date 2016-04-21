CREATE TYPE patavi_task_status AS ENUM ( 'unknown', 'accepted', 'failed', 'done');
CREATE TABLE patavi_task (
	id BIGINT PRIMARY KEY, -- flake ID
	creator_name VARCHAR(128) NOT NULL,
	creator_fingerprint VARCHAR(128) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	service VARCHAR(128) NOT NULL,
	task JSONB NOT NULL,
	status patavi_task_status NOT NULL DEFAULT 'unknown',
	result JSONB );

