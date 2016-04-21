var util = require('./util');

module.exports = function(conn, q, statusExchange, pataviStore) {

  conn.createChannel(function(err, ch) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    function persist(msg) {
      var taskId = msg.properties.correlationId;
      var result = JSON.parse(msg.content.toString());

      var status = result.status == "failed" ? "failed" : "done";
      pataviStore.persistResult(taskId, result.status === "failed" ? "failed" : "done", result, function(err) {
        if (err) {
          // TODO: handle DB errors
          return console.log(err);
        }
        ch.publish(statusExchange, taskId + ".end", util.asBuffer(util.resultMessage(taskId, status)));
        ch.ack(msg);
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
