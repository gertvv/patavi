'use strict';

angular.module('example', []);

function TaskCtrl($scope) {
  $scope.taskId = 0;
  $scope.method = "echo";
  $scope.input = JSON.stringify({ "Hello": "World!" });

  function handlePataviTask(task) {
    $scope.error = null;
    $scope.status = null;
    $scope.results = null;

    var handlerFactory = function(type) {
      return function(x) {
        $scope[type] = x;
        $scope.$apply();
      };
    };

    var progressHandler = handlerFactory("status");
    var errorHandler = handlerFactory("error");
    var successHandler = handlerFactory("results");

    task.results.then(successHandler, errorHandler, progressHandler);
  };

  $scope.submitStagedTask = function(taskId) {
    handlePataviTask(patavi.submitStagedTask(taskId));
  };

  $scope.submit = function(method, payload) {
    handlePataviTask(patavi.submit(method, JSON.parse(payload)));
  };
}
TaskCtrl.$inject = ['$scope'];
