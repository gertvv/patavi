'use strict';

!function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof define == 'function' && define.amd) define(definition);
  else context[name] = definition();
}('patavi', this, function () {
  var config = window.patavi || {};

  var Task = function(service, payload) {
    var resultsPromise = when.defer();

    function getResults(url, done) {
      console.log(url);
      var http = new XMLHttpRequest();
      http.open("GET", url, true);
      http.responseType = "json";
      http.send();
      http.onreadystatechange = function() {
        if (http.readyState === 4 && http.status === 200) {
          done(http.response);
        }
      }
    }

    var self = this;
    this.results = resultsPromise.promise;

    var http = new XMLHttpRequest();
    http.open("POST", "/task?service=" + service, true);
    http.responseType = "json";
    http.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    http.send(JSON.stringify(payload));
    http.onreadystatechange = function() {
      if (http.readyState === 4 && http.status === 201) {
        var loc = http.response._links.updates.href;
        var socket = new WebSocket(loc);
        socket.onmessage = function (event) {
          var data = JSON.parse(event.data);
          if (data.eventType === "done") {
            socket.close();
            getResults(data.eventData.href, resultsPromise.resolve);
          } else if (data.eventType === "failed") {
            socket.close();
            getResults(data.eventData.href, resultsPromise.reject);
          }
          resultsPromise.notify(data);
        }
      }
    }
  };

  var patavi = {
    submit: function (service, payload) {
      return new Task(service, payload);
    }
  };

  return patavi;
});
