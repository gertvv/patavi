'use strict';
var pg = require('pg');
var async = require('async');

module.exports = function(url) {
  var dbUrl = url;

  function startTransaction(client, done, callback) {
    client.query('START TRANSACTION', function(err) {
      callback(err, client, done);
    });
  }

  function commit(client, done, results, callback) {
    client.query('COMMIT', function(err) {
      callback(err, client, done, results);
    });
  }

  function rollback(client, done) {
    client.query('ROLLBACK', function(err) {
      done(err);
    });
  }

  return {
    // Takes a function work(client, workCallback), where workCallback(error,
    // result). The work will be run in a transaction, and if workCallback is
    // called with an error, the transaction is aborted. Otherwise, the
    // transaction is committed.
    //
    // If the transaction completed, callback(error, result) will be called
    // with the result of work, otherwise with an error.
    runInTransaction: function(work, callback) {
      function doWork(client, done, callback) {
        work(client, function(err, result) {
          callback(err, client, done, result);
        });
      }

      pg.connect(dbUrl, function(err, client, done) {
        if (err) {
          return callback(err);
        }
        async.waterfall([
          async.apply(startTransaction, client, done),
          doWork,
          commit
        ], function(err, client, done, result) {
          if (err) {
            rollback(client, done);
            return callback(err);
          }
          done();
          callback(null, result);
        });
      });
    },
    query: function(text, values, callback) {
      pg.connect(dbUrl, function(err, client, done) {
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
  };
};
