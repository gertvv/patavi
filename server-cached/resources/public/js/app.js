'use strict';

angular.module('example', []);

function TaskCtrl($scope) {
  $scope.taskId = 0;

  $scope.submit = function(taskId) {
    var task = patavi.submit(taskId);
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
}
TaskCtrl.$inject = ['$scope'];
