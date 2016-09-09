'use strict';
var util = require('./util');
var stream = require('stream');
var Busboy = require('busboy');

function parseMultipart(content, contentType, callback) {
  try {
    var busboy = new Busboy({ headers: { "content-type": contentType } });

    var index = {};
    var files = [];

    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      var content = new Buffer(0);
      file.on('data', function(data) {
        content = Buffer.concat([content, data]);
      });
      file.on('end', function() {
        if (fieldname === "index") {
          index = JSON.parse(content.toString());
        } else {
          files.push({'path': filename, 'content_type': mimetype, 'content': content});
        }
      });
    });

    busboy.on('finish', function() {
      callback(null, { index: index, files: files });
    });

    var bufferStream = new stream.PassThrough();
    bufferStream.end(content);
    bufferStream.pipe(busboy);
  } catch(err) {
    console.log("Ignoring error", err);
  }
}

function parseMessage(content, contentType, callback) {
  var mp = "multipart/form-data";
  if (contentType && contentType == "application/json") {
    callback(null, { index: JSON.parse(content.toString()), files: [] });
  } else if (contentType && contentType.substr(0, mp.length) === mp) {
    parseMultipart(content, contentType, callback);
  } else {
    callback("Unrecognized content-type: " + contentType);
  }
}

module.exports = function(conn, q, statusExchange, pataviStore) {
  conn.createChannel(function(err, ch) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    function persist(msg) {
      var taskId = msg.properties.correlationId;
      parseMessage(msg.content, msg.properties.contentType, function(err, result) {
        if (err) {
          console.log(err);
          ch.ack(msg); // FIXME
          return;
        }

        var taskStatus = result.index.status == "failed" ? "failed" : "done";
        pataviStore.persistResult(taskId, taskStatus, result, function(err) {
          if (err) {
            // TODO: handle DB errors
            return console.log(err);
          }
          ch.publish(statusExchange, taskId + ".end", util.asBuffer(util.resultMessage(taskId, taskStatus)));
          ch.ack(msg);
        });
      });
    }

    ch.prefetch(1);

    ch.assertExchange(statusExchange, 'topic', { durable: false });

    ch.assertQueue(q, {exclusive: false, durable: true}, function(err) {
      if (err) {
        console.log(err);
        process.exit(1);
      }

      ch.consume(q, persist, { noAck: false }, function(err, ok) {
        if (err) {
          console.log(err);
          process.exit(1);
        }
      });
    });
  });
}
