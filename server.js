var express = require('express');
var fs = require('fs');
var https = require('https');
var bodyParser = require('body-parser');
var amqp = require('amqplib/callback_api');
var Promise = require('promise');

var FlakeId = require('flake-idgen');
var idGen = new FlakeId(); // FIXME: set unique generator ID

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
app.use(express.static('public'));
var ws = require('express-ws')(app, server);

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


var results = {};

amqp.connect('amqp://' + process.env.PATAVI_BROKER_HOST, function(err, conn) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  conn.createChannel(function(err, ch) {
    var ex = 'rpc_status';

    ch.assertExchange(ex, 'topic', { durable: false });

    app.ws('/task/:taskId/updates', function(ws, req) {
      // check that the task exists
      var taskId = req.params.taskId;
      if (!taskId || !results[taskId]) {
        ws.close();
      }

      // listen for events on the task
      ch.assertQueue('', {exclusive: true}, function(err, statusQ) {
        ch.bindQueue(statusQ.queue, ex, taskId + ".*");
        tag = ch.consume(statusQ.queue, function(msg) {
          ws.send(msg.content.toString());
        }, { noAck: true }, function(err, ok) {
          ws.on('close', function() { // stop listening when the client leaves
            if (ok && ok.consumerTag) {
              ch.cancel(ok.consumerTag);
            }
          });
        });
      });
      results[taskId].then(function(result) {
        ws.send(JSON.stringify({ taskId: taskId, eventType: "done" }));
        ws.close();
      }, function(failure) {
        ws.send(JSON.stringify({ taskId: taskId, eventType: "failed", eventData: failure }));
        ws.close();
      });
    });

    app.post('/task', function(req, res) {
      if (!req.client.authorized) { // client authorization required to submit jobs
        res.status(401);
        res.send("Not authorized!");
        return;
      }
      var taskId = idGen.next().toString('hex');
      results[taskId] = new Promise(function(resolve, reject) {
        console.log(' * Sending RPC request', taskId, req.query.method);

        ch.assertQueue('', {exclusive: true, autoDelete: true}, function(err, replyTo) {
          ch.consume(replyTo.queue, function(msg) {
            if (msg.properties.correlationId == taskId) {
              var result = JSON.parse(msg.content.toString());
              console.log(' * RPC request', taskId, 'terminated');
              if (result.status === "failed") {
                reject(result);
              } else {
                resolve(result);
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
    results[taskId].then(function(result) {
      res.header("Content-Type", "application/json");
      res.send(result);
    });
  } else {
    res.status(404);
    res.end();
  }
});

server.listen(3000, function() {
  console.log("Listening on https://localhost:3000/");
});
