var amqp = require('amqplib/callback_api');

var FlakeId = require('flake-idgen');
var idGen = new FlakeId(); // FIXME: set unique generator ID

var args = process.argv.slice(2);

if (args.length == 0) {
  console.log("Usage: client.js num");
  process.exit(1);
}

amqp.connect('amqp://' + process.env.PATAVI_BROKER_HOST, function(err, conn) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  conn.createChannel(function(err, ch) {
    var ex = 'rpc_status';

    ch.assertExchange(ex, 'topic', { durable: false });

    ch.assertQueue('', {exclusive: true}, function(err, q) {
      var taskId = idGen.next().toString('hex');
      var num = parseInt(args[0]);

      ch.assertQueue('', { exclusive: true }, function(err, statusQ) {
        ch.bindQueue(statusQ.queue, ex, taskId + ".*");
        ch.consume(statusQ.queue, function(msg) {
          console.log(JSON.parse(msg.content.toString()));
        }, {noAck: true});
      });

      console.log(' [x] Requesting fib(%d)', num);

      ch.consume(q.queue, function(msg) {
        if (msg.properties.correlationId == taskId) {
          console.log(' [.] Got %s', msg.content.toString());
          setTimeout(function() { conn.close(); process.exit(0) }, 500);
        }
      }, {noAck: true});

      ch.sendToQueue('slow',
      new Buffer(JSON.stringify({fib: num})),
      { correlationId: taskId, replyTo: q.queue });
    });
  });
});
