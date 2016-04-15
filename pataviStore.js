var pg = require('pg');

var config = {
  user: process.env.PATAVI_DB_USER, 
  database: process.env.PATAVI_DB_NAME,
  password: process.env.PATAVI_DB_PASSWORD,
  host: process.env.PATAVI_DB_HOST
}

var query = function(text, values, callback) {
  pg.connect(config, function(err, client, done) {
    if (err) {
      callback(err);
      return done();
    }

    client.query(text, values, function(err, result) {
      done();
      callback(err, result);
    });
  });
}

var flakeIdAsInt64 = function(flakeId) {
  return new Buffer(flakeId, 'hex');
}

var persistTask = function(id, creator_name, creator_fingerprint, method, task, callback) {
  query('INSERT INTO patavi_task(id, creator_name, creator_fingerprint, method, task) VALUES ($1, $2, $3, $4, $5)',
      [flakeIdAsInt64(id), creator_name, creator_fingerprint, method, task],
      callback);
}

var persistResult = function(id, status, result, callback) {
  query('UPDATE patavi_task SET status = $2, result = $3, updated_at = NOW() WHERE id = $1',
      [flakeIdAsInt64(id), status, result],
      callback);
}

var getResult = function(id, callback) {
  query('SELECT result FROM patavi_task WHERE id = $1', [flakeIdAsInt64(id)], function(err, result) {
    if (err) {
      callback(err);
    } else if (result.rows.length == 1 && result.rows[0].result) {
      callback(null, result.rows[0].result);
    } else {
      var error = new Error("Not found");
      error.status = 404;
      callback(error);
    }
  });
}

var getStatus = function(id, callback) {
  query('SELECT status FROM patavi_task WHERE id = $1', [flakeIdAsInt64(id)], function(err, result) {
    if (err) {
      callback(err);
    } else if (result.rows.length == 1) {
      callback(null, result.rows[0].status);
    } else {
      var error = new Error("Not found");
      error.status = 404;
      callback(error);
    }
  });
}

var getMethod = function(id, callback) {
  query('SELECT method FROM patavi_task WHERE id = $1', [flakeIdAsInt64(id)], function(err, result) {
    if (err) {
      callback(err);
    } else if (result.rows.length == 1) {
      callback(null, result.rows[0].method);
    } else {
      var error = new Error("Not found");
      error.status = 404;
      callback(error);
    }
  });
}

module.exports = {
  persistTask: persistTask,
  persistResult: persistResult,
  getResult: getResult,
  getStatus: getStatus,
  getMethod: getMethod
}
