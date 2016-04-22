'use strict';

requirejs.config({
  baseUrl: 'js',
  paths: {
    'angular': 'https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.5.5/angular.min'
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
    $scope.input = "{}";

    $scope.submit = function(service, input) {
      $scope.error = null;
      $scope.status = null;
      $scope.results = null;

      var taskUriPromise = $q.defer();
      var task = Patavi.listen(taskUriPromise.promise);

      $http.post('/task?service=' + service, input).then(function(response) {
        if (response.status != 201) {
          $scope.error = { 'message': 'Error queueing task: expected response status 201', 'status': response.status };
        } else if (response.data && response.data._links && response.data._links.updates && response.data._links.updates.href) {
          taskUriPromise.resolve(response.data._links.updates.href);
        } else {
          $scope.error = { 'message': 'Malformed response, expected _links.updates.href to be defined', 'data': response.data };
        }
      }, function(error) {
        $scope.error = { 'message': 'Error queueing task', 'error': error };
      });

      var handlerFactory = function(type) {
        return function(x) {
          $scope[type] = x;
        };
      };

      var progressHandler = handlerFactory("status");
      var errorHandler = handlerFactory("error");
      var successHandler = handlerFactory("results");

      task.then(successHandler, errorHandler, progressHandler);
    };
  }]);
});
