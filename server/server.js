var express = require('express');
var fs = require('fs');
var https = require('https');
var bodyParser = require('body-parser');
var amqp = require('amqplib/callback_api');
var util = require('./util');
var pataviStore = require('./pataviStore')
var async = require('async');
var persistenceService = require('./persistenceService');

var FlakeId = require('flake-idgen');
var idGen = new FlakeId(); // FIXME: set unique generator ID

var pataviSelf = util.pataviSelf;

var isValidTaskId = function(id) { return /[0-9a-f]{16}/.test(id); };

var badRequestError = function() { var error = new Error("Bad request"); error.status = 400; return error; };

// Serve over HTTPS, ask for client certificate
var httpsOptions = {
  key: fs.readFileSync('ssl/server-key.pem'),
  cert: fs.readFileSync('ssl/server-crt.pem'),
  ca: fs.readFileSync('ssl/ca-crt.pem'),
  requestCert: true,
  rejectUnauthorized: false
}
var app = express();
var server = https.createServer(httpsOptions, app);

app.use(bodyParser.json());

// Allow CORS (Cross Origin Resource Sharing) requests
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Client certificate authentication handling
var clientCertificateAuth = require('client-certificate-auth');
var authRequired = clientCertificateAuth(function(cert) {
  return true; // we trust any cert signed by our own CA
});

// Patavi dashboard
app.get('/', authRequired);
app.get('/index.html', authRequired);
app.use(express.static('public'));

var ws = require('express-ws')(app, server);

var taskDescription = function(taskId, service, status) {
  var description = {
    'id': taskId,
    'service': service,
    'status': status,
    '_links': {
      self: { href: 'https:' + pataviSelf + '/task/' + taskId},
      updates: { href: 'wss:' + pataviSelf + '/task/' + taskId + '/updates' }
    }
  };
  if (status == "failed" || status == "done") {
    description._links.results = { href: 'https:' + pataviSelf + '/task/' + taskId + '/results' };
  }
  return description;
}

var updatesWebSocket = function(app, ch, statusExchange) {
  function makeEventQueue(taskId, callback) {
    ch.assertQueue('', { exclusive: true, autoDelete: true }, function(err, statusQ) {
      if (!err) {
        ch.bindQueue(statusQ.queue, statusExchange, taskId + ".*");
      }
      callback(err, statusQ);
    });
  }

  return function(ws, req) {
    function receiveMessage(msg) {
      var str = msg.content.toString();
      var json = JSON.parse(str);
      ws.send(str);
      if (json.eventType === "done" || json.eventType === "failed") {
        ws.close();
      }
    }

    function consumerStarted(taskId) {
      return function(err, ok) {
        ws.on('close', function() { // stop listening when the client leaves
          if (ok && ok.consumerTag) {
            ch.cancel(ok.consumerTag);
          }
        });
        pataviStore.getInfo(taskId, function(err, info) {
          if (err) {
            ws.close();
          } else if (info.status == "failed" || info.status == "done") {
            ws.send(JSON.stringify(util.resultMessage(taskId, info.status)));
            ws.close();
          }
        });
      };
    }

    var taskId = req.params.taskId;
    if (!isValidTaskId(taskId)) {
      return ws.close();
    }
    makeEventQueue(taskId, function(err, statusQ) {
      if (err) {
        console.log("Error creating websocket", err);
        return ws.close();
      }

      ch.consume(statusQ.queue, receiveMessage, { noAck: true }, consumerStarted(taskId));
    });
  };
}

var postTask = function(app, ch, statusExchange, replyTo) {
  return function(req, res, next) {
    var service = req.query.service;
    var ttl = req.query.ttl ? req.query.ttl : null;
    var taskId = idGen.next().toString('hex');

    var cert = req.connection.getPeerCertificate();

    function persistTask(callback) {
      pataviStore.persistTask(taskId, cert.subject.CN, cert.fingerprint, service, req.body, ttl, function(err) {
        callback(err);
      });
    }

    function assertServiceQueue(callback) {
      ch.assertQueue(service, {exclusive: false, durable: true}, callback);
    }

    function queueTask(q, callback) {
      ch.sendToQueue(service,
          new Buffer(JSON.stringify(req.body)),
          { correlationId: taskId, replyTo: replyTo });

      res.status(201);
      res.location('https:' + pataviSelf + '/task/' + taskId);
      var s = q.consumerCount === 0 ? "no-workers" : "unknown";
      res.send(taskDescription(taskId, service, s));
    }

    async.waterfall([
      persistTask,
      assertServiceQueue,
      queueTask
    ], function(err) {
      next(err);
    });
  }
}


// API routes that depend on AMQP connection
amqp.connect('amqp://' + process.env.PATAVI_BROKER_HOST, function(err, conn) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  conn.createChannel(function(err, ch) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    var statusExchange = 'rpc_status';
    ch.assertExchange(statusExchange, 'topic', { durable: false });

    var replyTo = 'rpc_result';
    ch.assertQueue(replyTo, {exclusive: false, durable: true}, function(err) {
      if (err) {
        console.log(err);
        process.exit(1);
      }

      persistenceService(conn, replyTo, statusExchange, pataviStore);

      app.ws('/task/:taskId/updates', updatesWebSocket(app, ch, statusExchange));

      app.post('/task', authRequired, postTask(app, ch, statusExchange, replyTo));
    });
  });
});

// API routes that do not depend on AMQP connection

app.get('/task/:taskId', function(req, res, next) {
  var taskId = req.params.taskId;
  if (!isValidTaskId(taskId)) {
    return next(badRequestError());
  }
  pataviStore.getInfo(taskId, function(err, info) {
    if (err) return next(err);
    if (info.status === "done" || info.status === "failed") {
      res.header("Cache-Control", "public, max-age=31557600"); // completed tasks never change
    }
    res.send(taskDescription(taskId, info.service, info.status));
  });
});

app.get('/status', function(req, res, next) {
  var tasks = req.query.task;
  if (typeof tasks === 'string') {
    tasks = [ tasks ];
  }
  if (!tasks.every(isValidTaskId)) {
    return next(badRequestError());
  }
  pataviStore.getMultiInfo(tasks, function(err, info) {
    if (err) return next(err);
    res.send(info.map(function(item) { return taskDescription(item.id, item.service, item.status); }));
  });
});

app.get('/task/:taskId/results', function(req, res, next) {
  var taskId = req.params.taskId;
  if (!isValidTaskId(taskId)) {
    return next(badRequestError());
  }
  if (req.headers["if-modified-since"] || req.headers["if-none-match"]) { // results never change
    res.status(304);
    res.end();
    return;
  }
  pataviStore.getResult(taskId, function(err, result) {
    if (err) return next(err);
    res.header("Content-Type", "application/json");
    res.header("Cache-Control", "public, max-age=31557600"); // results never change
    res.send(result);
  });
});

app.get('/task/:taskId/results/:file', function(req, res, next) {
  var taskId = req.params.taskId;
  var fileName = req.params.file;
  if (!isValidTaskId(taskId)) {
    return next(badRequestError());
  }
  if (req.headers["if-modified-since"] || req.headers["if-none-match"]) { // results never change
    res.status(304);
    res.end();
    return;
  }
  pataviStore.getFile(taskId, fileName, function(err, file) {
    if (err) return next(err);
    res.header("Content-Type", file.content_type);
    res.header("Cache-Control", "public, max-age=31557600"); // results never change
    res.send(file.content);
  });
});

app.delete('/task/:taskId', authRequired, function(req, res, next) {
  var taskId = req.params.taskId;
  if (!isValidTaskId(taskId)) {
    return next(badRequestError());
  }
  pataviStore.deleteTask(taskId, function(err) {
    if (err) return next(err);
    res.status(200);
    res.end();
  });
});

// Render 401 Not Authorized error
app.use(function(err, req, res, next) {
  if (err.status !== 401) {
    return next(err);
  }

  res.status(401).sendFile('error401.html', { root: __dirname });
});

server.listen(process.env.PATAVI_PORT, function() {
  console.log("Listening on https:" + pataviSelf);
});
