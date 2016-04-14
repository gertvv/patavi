'use strict';

!function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof define == 'function' && define.amd) define(definition);
  else context[name] = definition();
}('patavi', this, function () {
  var config = window.patavi || {};
  var WS_URI = typeof config['WS_URI'] !== 'undefined' ? config['WS_URI'] : "ws://localhost:3000/ws";
  var BASE_URI = typeof config['BASE_URI'] !== 'undefined' ? config['BASE_URI'] : "http://api.patavi.com/";

  var Task = function(method, payload) {
    var resultsPromise = when.defer();

    function getResults(url) {
      var http = new XMLHttpRequest();
      http.open("GET", url, true);
      http.responseType = "json";
      http.send();
      http.onreadystatechange = function() {
        if (http.readyState === 4 && http.status === 200) {
          resultsPromise.resolve(http.response);
        }
      }
    }

    var self = this;
    this.results = resultsPromise.promise;

    var urlBase = "https://localhost:3000";
    var wsBase = "wss://localhost:3000";

    var http = new XMLHttpRequest();
    http.open("POST", urlBase + "/task?method=" + method, true);
    http.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    http.send(JSON.stringify(payload));
    http.onreadystatechange = function() {
      if (http.readyState === 2 && http.status === 201) {
        var loc = wsBase + http.getResponseHeader("Location") + "/updates";
        var socket = new WebSocket(loc);
        socket.onmessage = function (event) {
          var data = JSON.parse(event.data);
          if (data.eventType === "done") {
            console.log("done");
            socket.close();
            getResults(urlBase + http.getResponseHeader("Location") + "/results");
          } else if (data.evenType === "failed") {
            console.log("error", data.eventData);
            resultsPromise.reject(data.eventData);
            socket.close();
          } else {
            resultsPromise.notify(data);
          }
        }
      }
    }
  };

  var patavi = {
    submit: function (method, payload) {
      return new Task(method, payload);
    }
  };

  return patavi;
});
