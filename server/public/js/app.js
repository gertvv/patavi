'use strict';

requirejs.config({
  baseUrl: 'js',
  paths: {
    'angular': '/bower_components/angular/angular.min',
    'patavi': '/bower_components/angular-patavi-client/patavi'
  },
  shim: {
    angular: {
      exports: 'angular'
    }
  }
});

requirejs(['angular', 'patavi'], function(angular, patavi) {
  angular.module('example', ['patavi'])
  .controller('TaskCtrl', ['$scope', '$http', '$q', 'PataviService', function($scope, $http, $q, Patavi) {
    $scope.service = "slow";
    $scope.ttl = "PT5M";
    $scope.input = "{}";
    $scope.tasks = [];

    $scope.submit = function(service, ttl, input) {
      var info = {
        id: "<unknown>",
        error: null,
        status: null,
        results: null,
        warning: null
      };
      $scope.tasks.unshift(info);

      var taskUriPromise = $q.defer();
      var task = Patavi.listen(taskUriPromise.promise);

      $http.post('/task', input, { 'params': { 'service': service, 'ttl': ttl ? ttl : undefined } }).then(function(response) {
        if (response.status != 201) {
          info.error = { 'message': 'Error queueing task: expected response status 201', 'status': response.status };
        } else if (response.data && response.data._links && response.data._links.updates && response.data._links.updates.href) {
          if (response.data.status === "no-workers") {
            info.warning = "No workers available";
          }
          info.id = response.data.id;
          taskUriPromise.resolve(response.data._links.updates.href);
        } else {
          info.error = { 'message': 'Malformed response, expected _links.updates.href to be defined', 'data': response.data };
        }
      }, function(error) {
        info.error = { 'message': 'Error queueing task', 'error': error };
      });

      var handlerFactory = function(type) {
        return function(x) {
          info[type] = x;
        };
      };

      var progressHandler = handlerFactory("status");
      var errorHandler = handlerFactory("error");
      var successHandler = handlerFactory("results");

      task.then(successHandler, errorHandler, progressHandler);
    };
  }]);
});
