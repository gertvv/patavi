var express = require('express');
var fs = require('fs');
var https = require('https');
var bodyParser = require('body-parser');
var amqp = require('amqplib/callback_api');
var util = require('./util');
var pataviStore = require('./pataviStore')
var async = require('async');

var FlakeId = require('flake-idgen');
var idGen = new FlakeId(); // FIXME: set unique generator ID

var pataviSelf = process.env.PATAVI_SELF;

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

var resultMessage = function(service, taskId, status) {
  return {
    service: service,
    taskId: taskId,
    eventType: status,
    eventData: { href: 'https:' + pataviSelf + '/task/' + taskId + '/results' }
  };
}

var taskDescription = function(taskId, status) {
  if (status == "failed" || status == "done") {
    return {
      'status': status,
      '_links': {
        results: { href: 'https:' + pataviSelf + '/task/' + taskId + '/results' },
        updates: { href: 'wss:' + pataviSelf + '/task/' + taskId + '/updates' }
      }
    };
  } else {
    return {
      'status': status,
      '_links': {
        updates: { href: 'wss:' + pataviSelf + '/task/' + taskId + '/updates' }
      }
    };
  }
}

var updatesWebSocket = function(app, ch, statusExchange) {
  function getService(taskId, callback) {
    pataviStore.getMethod(taskId, function(err, service) {
      callback(err, service, taskId);
    });
  }

  function makeEventQueue(service, taskId, callback) {
    ch.assertQueue('', { exclusive: true, autoDelete: true }, function(err, statusQ) {
      if (!err) {
        ch.bindQueue(statusQ.queue, statusExchange, taskId + ".*");
      }
      callback(err, service, statusQ);
    });
  }

  return function(ws, req) {
    function receiveMessage(msg) {
      var str = msg.content.toString();
      var json = JSON.parse(str);
      ws.send(str);
      if (str.eventType === "done" || str.eventType === "failed") {
        ws.close();
      }
    }

    function consumerStarted(service) {
      return function(err, ok) {
        ws.on('close', function() { // stop listening when the client leaves
          if (ok && ok.consumerTag) {
            ch.cancel(ok.consumerTag);
          }
        });
        pataviStore.getStatus(taskId, function(err, status) {
          if (err) {
            ws.close();
          } else if (status == "failed" || status == "done") {
            ws.send(JSON.stringify(resultMessage(service, taskId, status)));
            ws.close();
          }
        });
      }
    }

    var taskId = req.params.taskId;
    async.waterfall([
       async.apply(getService, taskId),
       makeEventQueue
    ], function(err, service, statusQ) {
      if (err) {
        console.log("Error creating websocket", err);
        return ws.close();
      }

      ch.consume(statusQ.queue, receiveMessage, { noAck: true }, consumerStarted(service));
    });
  };
}

var postTask = function(app, ch, statusExchange) {
  return function(req, res, next) {
    var service = req.query.method;
    var taskId = idGen.next().toString('hex');

    var cert = req.connection.getPeerCertificate();

    function persistTask(callback) {
      pataviStore.persistTask(taskId, cert.subject.CN, cert.fingerprint, service, req.body, function(err) {
        callback(err);
      });
    }

    function assertServiceQueue(callback) {
      ch.assertQueue(service, {exclusive: false, durable: true}, function(err, queue) {
        callback(err);
      });
    }

    function assertReplyQueue(callback) {
      ch.assertQueue('', {exclusive: true, autoDelete: true}, callback);
    }

    function registerReplyConsumer(replyTo, callback) {
      ch.consume(replyTo.queue, function(msg) {
        if (msg.properties.correlationId == taskId) {
          var result = JSON.parse(msg.content.toString());
          console.log(' * RPC request', taskId, 'terminated');
          pataviStore.persistResult(taskId, result.status === "failed" ? "failed" : "done", result, function(err) {
            if (err) {
              // TODO: handle DB errors
              return console.log(err);
            }

            var status = result.status == "failed" ? "failed" : "done";
            ch.publish(statusExchange, taskId + ".status", util.asBuffer(resultMessage(service, taskId, status)));
            ch.cancel(msg.fields.consumerTag);
          });
        }
      }, { noAck: true }, function(err, ok) {
        if (err) {
          callback(err);
        } else {
          callback(null, replyTo);
        }
      });
    }

    function queueTask(replyTo, callback) {
      ch.sendToQueue(req.query.method,
          new Buffer(JSON.stringify(req.body)),
          { correlationId: taskId, replyTo: replyTo.queue });

      res.status(201);
      res.location('https:' + pataviSelf + '/task/' + taskId);
      res.send(taskDescription(taskId, "unknown"));
    }

    async.waterfall([
      persistTask,
      assertServiceQueue,
      assertReplyQueue,
      registerReplyConsumer,
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

    app.ws('/task/:taskId/updates', updatesWebSocket(app, ch, statusExchange));

    app.post('/task', authRequired, postTask(app, ch, statusExchange)); 
  });
});

// API routes that do not depend on AMQP connection

app.get('/task/:taskId', function(req, res, next) {
  var taskId = req.params.taskId;
  pataviStore.getStatus(taskId, function(err, status) {
    if (err) next(err); 
    res.send(taskDescription(taskId, status));
  });
});

app.get('/task/:taskId/results', function(req, res) {
  var taskId = req.params.taskId;
  pataviStore.getResult(taskId, function(err, result) {
    if (err) {
      if (err.status == 404) {
        res.status(404);
        res.send("404 - Results not found");
      } else {
        res.send(500);
        res.send("500 - Internal server error");
      }
    } else {
      res.header("Content-Type", "application/json");
      res.send(result);
    }
  });
});

app.delete('/task/:taskId', authRequired, function(req, res, next) {
  pataviStore.deleteTask(req.params.taskId, function(err) {
    if (err) { // TODO: better error
      res.send(500);
      res.send("500 - Internal server error");
    }
    res.status(200);
    res.end();
  });
});

// Render 401 Not Authorized error
app.use(function(err, req, res, next) {
  console.log(err);

  if (err.status !== 401) {
    next();
  }

  res.status(401).sendFile('error401.html', { root: __dirname });
});

server.listen(process.env.PATAVI_PORT, function() {
  console.log("Listening on https:" + pataviSelf);
});
