"use strict";
import * as angular from "angular";
import repeatTimesModule from "./repeat-times.module";

export const repeatTimes = repeatTimesModule
  .directive("orzRepeat", repeatDirective)
  .directive("orzRepeatTransclude", repeatTranscludeDirective);

function repeatTranscludeDirective() {
  return {
    require: "^orzRepeat",
    link: linkFunc
  };

  function linkFunc(
    scope: angular.IScope,
    element: JQuery,
    attrs: angular.IAttributes,
    controller: RepeatTimesController,
    $transclude: angular.ITranscludeFunction
  ) {
    controller.$transclude(scope, function(clone: any) {
      element.empty();
      element.append(clone);
      element.on("$destroy", function() {
        scope.$destroy();
      });
    });
  }
}

repeatTranscludeDirective.$inject = [];

function repeatDirective() {
  const directive: angular.IDirective = {
    bindToController: true,
    controller: RepeatTimesController,
    controllerAs: "vm",
    link: linkFunc,
    //compile: compileFunc,
    restrict: "E",
    scope: {
      times: "@"
    },
    template: `<orz-repeat-item ng-repeat="item in vm.__inner__items" ng-transclude></orz-repeat-item>`,
    transclude: true
  };
  return directive;

  function linkFunc(
    scope: angular.IScope,
    element: JQuery,
    attrs: angular.IAttributes,
    controller: any,
    transclude: angular.ITranscludeFunction
  ) {}

  function compileFunc(
    templateElement: JQuery,
    templateAttributes: angular.IAttributes,
    /**
			 * @deprecated
			 * Note: The transclude function that is passed to the compile function is deprecated,
			 * as it e.g. does not know about the right outer scope. Please use the transclude function
			 * that is passed to the link function instead.
			 */
    transclude: angular.ITranscludeFunction
  ) {
    transclude(clone => {
      console.log("compile");
    });
    return function(s: any, e: any) {
      console.log("compiled");
    };
  }
}

repeatDirective.$inject = [];

class RepeatTimesController {
  private __inner__items: any[];
  private times: number;

  constructor(
    $scope: angular.IScope,
    $element: JQuery,
    $attrs: angular.IAttributes,
    public $transclude: angular.ITranscludeFunction
  ) {
    this.__inner__items = new Array(
      ...new Int32Array($attrs.times).map((zero, index) => {
        return index;
      })
    );
  }
}

RepeatTimesController.$inject = ["$scope", "$element", "$attrs", "$transclude"];
