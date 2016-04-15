var express = require('express');
var fs = require('fs');
var https = require('https');
var bodyParser = require('body-parser');
var amqp = require('amqplib/callback_api');
var util = require('./util');

var FlakeId = require('flake-idgen');
var idGen = new FlakeId(); // FIXME: set unique generator ID

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
  console.log("Request by", JSON.stringify(cert));
  return true; // we trust any cert signed by our own CA
});

// Patavi dashboard
app.get('/', authRequired);
app.get('/index.html', authRequired);
app.use(express.static('public'));

var ws = require('express-ws')(app, server);

var results = {};

var resultMessage = function(result) {
  if (result.status === "failed") {
    return {
      service: service,
      taskId: taskId,
      eventType: "failed",
      eventData: result
    };
  } else {
    return {
      service: service,
      taskId: taskId,
      eventType: "done",
      eventData: { href: '/task/' + taskId + '/results' }
    };
  }
}

amqp.connect('amqp://' + process.env.PATAVI_BROKER_HOST, function(err, conn) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  conn.createChannel(function(err, ch) {
    var ex = 'rpc_status';

    ch.assertExchange(ex, 'topic', { durable: false });

    app.ws('/task/:taskId/updates', function(ws, req) {
      // check that the task exists (TODO)
      var taskId = req.params.taskId;
      if (!taskId) {
        ws.close();
      }

      // listen for events on the task
      ch.assertQueue('', {exclusive: true}, function(err, statusQ) {
        ch.bindQueue(statusQ.queue, ex, taskId + ".*");
        tag = ch.consume(statusQ.queue, function(msg) {
          var str = msg.content.toString();
          var json = JSON.parse(str);
          ws.send(str);
          if (str.eventType === "done" || str.eventType === "failed") {
            ws.close();
          }
        }, { noAck: true }, function(err, ok) {
          ws.on('close', function() { // stop listening when the client leaves
            if (ok && ok.consumerTag) {
              ch.cancel(ok.consumerTag);
            }
          });
          if (results[taskId]) {
            ws.send(JSON.stringify(resultMessage(results[taskId])));
            ws.close();
          }
        });
      });
    });

    app.post('/task', authRequired, function(req, res) {
      var service = req.query.method;
      var taskId = idGen.next().toString('hex');

      console.log(' * Sending RPC request', taskId, service);

      ch.assertQueue('', {exclusive: true, autoDelete: true}, function(err, replyTo) {
        ch.consume(replyTo.queue, function(msg) {
          if (msg.properties.correlationId == taskId) {
            var result = JSON.parse(msg.content.toString());
            console.log(' * RPC request', taskId, 'terminated');
            results[taskId] = result;
            if (result.status === "failed") {
              ch.publish(ex, taskId + ".status", util.asBuffer({
                service: service,
                taskId: taskId,
                eventType: "failed",
                eventData: result}));
            } else {
              ch.publish(ex, taskId + ".status", util.asBuffer({
                service: service,
                taskId: taskId,
                eventType: "done",
                eventData: { href: '/task/' + taskId + '/results' } }));
            }
            ch.cancel(msg.fields.consumerTag);
          }
        }, { noAck: true });

        ch.sendToQueue(req.query.method,
            new Buffer(JSON.stringify(req.body)),
            { correlationId: taskId, replyTo: replyTo.queue });

        res.status(201);
        res.location('/task/' + taskId);
        res.end();
      });
    });
  });
});

app.get('/task/:taskId', function(req, res) {
  var taskId = req.params.taskId;
  if (results[taskId]) {
    res.send({ '_links': {
      results: { href: '/task/' + taskId + '/results' },
      updates: { href: '/task/' + taskId + '/updates' }
    }});
  } else {
    res.send({ '_links': {
      updates: { href: '/task/' + taskId + '/updates' }
    }});
  }
});

app.get('/task/:taskId/results', function(req, res) {
  var taskId = req.params.taskId;
  if (results[taskId]) {
    res.header("Content-Type", "application/json");
    res.send(results[taskId]);
  } else {
    res.status(404);
    res.send("404 - Results not found");
  }
});

app.use(function(err, req, res, next) { // Render 401 Not Authorized errors
  console.log(err);

  if (err.status !== 401) {
    next();
  }

  res.status(401).sendFile('error401.html', { root: __dirname });
});

server.listen(3000, function() {
  console.log("Listening on https://localhost:3000/");
});
