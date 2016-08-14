(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = function createMap() {
    return Object.create(null);
};

},{}],2:[function(require,module,exports){

var uid = 0;

function nextUid() {
    return ++uid;
}

module.exports = function hashKey(obj, nextUidFn) {
    var key = obj && obj.$$hashKey;

    if (key) {
        if (typeof key === 'function') {
            key = obj.$$hashKey();
        }
        return key;
    }

    var objType = typeof obj;
    if (objType == 'function' || objType == 'object' && obj !== null) {
        key = obj.$$hashKey = objType + ':' + (nextUidFn || nextUid)();
    } else {
        key = objType + ':' + obj;
    }

    return key;
};

},{}],3:[function(require,module,exports){

var minErr = require("./minErr.js");
var hashKey = require("./hashKey.js");
var createMap = require("./createMap.js");
var utils = require("./utils.js");
var isArrayLike = utils.isArrayLike;

angular.module('ng-repeat-n-directive', []).directive('ngRepeatN', ['$parse', '$animate', '$compile', function ($parse, $animate, $compile) {

  var NG_REMOVED = '$$NG_REMOVED';
  var ngRepeatMinErr = minErr('ngRepeat');

  var updateScope = function (scope, index, valueIdentifier, value, keyIdentifier, key, arrayLength) {
    // TODO(perf): generate setters to shave off ~40ms or 1-1.5%
    scope[valueIdentifier] = value;
    if (keyIdentifier) scope[keyIdentifier] = key;
    scope.$index = index;
    scope.$first = index === 0;
    scope.$last = index === arrayLength - 1;
    scope.$middle = !(scope.$first || scope.$last);
    // jshint bitwise: false
    scope.$odd = !(scope.$even = (index & 1) === 0);
    // jshint bitwise: true
  };

  var getBlockStart = function (block) {
    return block.clone[0];
  };

  var getBlockEnd = function (block) {
    return block.clone[block.clone.length - 1];
  };

  return {
    restrict: 'A',
    multiElement: true,
    transclude: 'element',
    priority: 1000,
    terminal: true,
    $$tlb: true,
    compile: function ngRepeatCompile($element, $attr) {
      var ngRepeatN = parseInt($attr.ngRepeatN);
      var array = new Array(ngRepeatN);

      for (var i = 0; i < array.length; ++i) {
        array[i] = i;
      }

      var expression = 'item in [' + array.toString() + ']';

      var ngRepeatEndComment = $compile.$$createComment('end ngRepeat', expression);

      var match = expression.match(/^\s*([\s\S]+?)\s+in\s+([\s\S]+?)(?:\s+as\s+([\s\S]+?))?(?:\s+track\s+by\s+([\s\S]+?))?\s*$/);

      if (!match) {
        throw ngRepeatMinErr('iexp', "Expected expression in form of '_item_ in _collection_[ track by _id_]' but got '{0}'.", expression);
      }

      var lhs = match[1];
      var rhs = match[2];
      var aliasAs = match[3];
      var trackByExp = match[4];

      match = lhs.match(/^(?:(\s*[\$\w]+)|\(\s*([\$\w]+)\s*,\s*([\$\w]+)\s*\))$/);

      if (!match) {
        throw ngRepeatMinErr('iidexp', "'_item_' in '_item_ in _collection_' should be an identifier or '(_key_, _value_)' expression, but got '{0}'.", lhs);
      }
      var valueIdentifier = match[3] || match[1];
      var keyIdentifier = match[2];

      if (aliasAs && (!/^[$a-zA-Z_][$a-zA-Z0-9_]*$/.test(aliasAs) || /^(null|undefined|this|\$index|\$first|\$middle|\$last|\$even|\$odd|\$parent|\$root|\$id)$/.test(aliasAs))) {
        throw ngRepeatMinErr('badident', "alias '{0}' is invalid --- must be a valid JS identifier which is not a reserved name.", aliasAs);
      }

      var trackByExpGetter, trackByIdExpFn, trackByIdArrayFn, trackByIdObjFn;
      var hashFnLocals = { $id: hashKey };

      if (trackByExp) {
        trackByExpGetter = $parse(trackByExp);
      } else {
        trackByIdArrayFn = function (key, value) {
          return hashKey(value);
        };
        trackByIdObjFn = function (key) {
          return key;
        };
      }

      return function ngRepeatLink($scope, $element, $attr, ctrl, $transclude) {

        if (trackByExpGetter) {
          trackByIdExpFn = function (key, value, index) {
            // assign key, value, and $index to the locals so that they can be used in hash functions
            if (keyIdentifier) hashFnLocals[keyIdentifier] = key;
            hashFnLocals[valueIdentifier] = value;
            hashFnLocals.$index = index;
            return trackByExpGetter($scope, hashFnLocals);
          };
        }

        // Store a list of elements from previous run. This is a hash where key is the item from the
        // iterator, and the value is objects with following properties.
        //   - scope: bound scope
        //   - element: previous element.
        //   - index: position
        //
        // We are using no-proto object so that we don't need to guard against inherited props via
        // hasOwnProperty.
        var lastBlockMap = createMap();

        //watch props
        $scope.$watchCollection(rhs, function ngRepeatAction(collection) {
          var index,
              length,
              previousNode = $element[0],

          // node that cloned nodes should be inserted after
          // initialized to the comment node anchor
          nextNode,


          // Same as lastBlockMap but it has the current state. It will become the
          // lastBlockMap on the next iteration.
          nextBlockMap = createMap(),
              collectionLength,
              key,
              value,

          // key/value of iteration
          trackById,
              trackByIdFn,
              collectionKeys,
              block,

          // last object information {scope, element, id}
          nextBlockOrder,
              elementsToRemove;

          if (aliasAs) {
            $scope[aliasAs] = collection;
          }

          if (isArrayLike(collection)) {
            collectionKeys = collection;
            trackByIdFn = trackByIdExpFn || trackByIdArrayFn;
          } else {
            trackByIdFn = trackByIdExpFn || trackByIdObjFn;
            // if object, extract keys, in enumeration order, unsorted
            collectionKeys = [];
            for (var itemKey in collection) {
              if (hasOwnProperty.call(collection, itemKey) && itemKey.charAt(0) !== '$') {
                collectionKeys.push(itemKey);
              }
            }
          }

          collectionLength = collectionKeys.length;
          nextBlockOrder = new Array(collectionLength);

          // locate existing items
          for (index = 0; index < collectionLength; index++) {
            key = collection === collectionKeys ? index : collectionKeys[index];
            value = collection[key];
            trackById = trackByIdFn(key, value, index);
            if (lastBlockMap[trackById]) {
              // found previously seen block
              block = lastBlockMap[trackById];
              delete lastBlockMap[trackById];
              nextBlockMap[trackById] = block;
              nextBlockOrder[index] = block;
            } else if (nextBlockMap[trackById]) {
              // if collision detected. restore lastBlockMap and throw an error
              forEach(nextBlockOrder, function (block) {
                if (block && block.scope) lastBlockMap[block.id] = block;
              });
              throw ngRepeatMinErr('dupes', "Duplicates in a repeater are not allowed. Use 'track by' expression to specify unique keys. Repeater: {0}, Duplicate key: {1}, Duplicate value: {2}", expression, trackById, value);
            } else {
              // new never before seen block
              nextBlockOrder[index] = { id: trackById, scope: undefined, clone: undefined };
              nextBlockMap[trackById] = true;
            }
          }

          // remove leftover items
          for (var blockKey in lastBlockMap) {
            block = lastBlockMap[blockKey];
            elementsToRemove = getBlockNodes(block.clone);
            $animate.leave(elementsToRemove);
            if (elementsToRemove[0].parentNode) {
              // if the element was not removed yet because of pending animation, mark it as deleted
              // so that we can ignore it later
              for (index = 0, length = elementsToRemove.length; index < length; index++) {
                elementsToRemove[index][NG_REMOVED] = true;
              }
            }
            block.scope.$destroy();
          }

          // we are not using forEach for perf reasons (trying to avoid #call)
          for (index = 0; index < collectionLength; index++) {
            key = collection === collectionKeys ? index : collectionKeys[index];
            value = collection[key];
            block = nextBlockOrder[index];

            if (block.scope) {
              // if we have already seen this object, then we need to reuse the
              // associated scope/element

              nextNode = previousNode;

              // skip nodes that are already pending removal via leave animation
              do {
                nextNode = nextNode.nextSibling;
              } while (nextNode && nextNode[NG_REMOVED]);

              if (getBlockStart(block) != nextNode) {
                // existing item which got moved
                $animate.move(getBlockNodes(block.clone), null, previousNode);
              }
              previousNode = getBlockEnd(block);
              updateScope(block.scope, index, valueIdentifier, value, keyIdentifier, key, collectionLength);
            } else {
              // new item which we don't know about
              $transclude(function ngRepeatTransclude(clone, scope) {
                block.scope = scope;
                // http://jsperf.com/clone-vs-createcomment
                var endNode = ngRepeatEndComment.cloneNode(false);
                clone[clone.length++] = endNode;

                $animate.enter(clone, null, previousNode);
                previousNode = endNode;
                // Note: We only need the first/last node of the cloned nodes.
                // However, we need to keep the reference to the jqlite wrapper as it might be changed later
                // by a directive with templateUrl when its template arrives.
                block.clone = clone;
                nextBlockMap[block.id] = block;
                updateScope(block.scope, index, valueIdentifier, value, keyIdentifier, key, collectionLength);
              });
            }
          }
          lastBlockMap = nextBlockMap;
        });
      };
    }
  };
}]).directive('ngRating', ['$parse', '$animate', '$compile', function ($parse, $animate, $compile) {
  return {
    restrict: 'E',
    template: '<div><span ng-repeat-n="5" ng-click="changeRating($index)"><i class="fa fa-star" ng-show="($index + 1) <= bindRating"></i><i class="fa fa-star-half" ng-show="($index + 0.5) == bindRating"></i><i class="fa fa-star-o" ng-show="$index >= bindRating"></i></span></div>',
    link: function ($scope, $element, $attributes, controller) {
      $scope.$watch($attributes.ngModel, function () {
        $scope.bindRating = $scope[$attributes.ngModel];
      });

      $scope.changeRating = function ($index) {
        console.log($index);
        if ($index + 1 != $scope.ss) {
          $scope.ss = $index + 1;
        } else {
          $scope.ss = $index + 0.5;
        }
      };
    }
  };
}]);

},{"./createMap.js":1,"./hashKey.js":2,"./minErr.js":4,"./utils.js":5}],4:[function(require,module,exports){

var utils = require("./utils.js");
var isArrayLike = utils.isArrayLike;
var isUndefined = utils.isUndefined;
var isWindow = utils.isWindow;
var isScope = utils.isScope;

function toJsonReplacer(key, value) {
    var val = value;

    if (typeof key === 'string' && key.charAt(0) === '$' && key.charAt(1) === '$') {
        val = undefined;
    } else if (isWindow(value)) {
        val = '$WINDOW';
    } else if (value && window.document === value) {
        val = '$DOCUMENT';
    } else if (isScope(value)) {
        val = '$SCOPE';
    }

    return val;
}

/* global toDebugString: true */

function serializeObject(obj) {
    var seen = [];

    return JSON.stringify(obj, function (key, val) {
        val = toJsonReplacer(key, val);
        if (isObject(val)) {

            if (seen.indexOf(val) >= 0) return '...';

            seen.push(val);
        }
        return val;
    });
}

function toDebugString(obj) {
    if (typeof obj === 'function') {
        return obj.toString().replace(/ \{[\s\S]*$/, '');
    } else if (isUndefined(obj)) {
        return 'undefined';
    } else if (typeof obj !== 'string') {
        return serializeObject(obj);
    }
    return obj;
}

module.exports = function minErr(module, ErrorConstructor) {
    ErrorConstructor = ErrorConstructor || Error;
    return function () {
        var SKIP_INDEXES = 2;

        var templateArgs = arguments,
            code = templateArgs[0],
            message = '[' + (module ? module + ':' : '') + code + '] ',
            template = templateArgs[1],
            paramPrefix,
            i;

        message += template.replace(/\{\d+\}/g, function (match) {
            var index = +match.slice(1, -1),
                shiftedIndex = index + SKIP_INDEXES;

            if (shiftedIndex < templateArgs.length) {
                return toDebugString(templateArgs[shiftedIndex]);
            }

            return match;
        });

        message += '\nhttp://errors.angularjs.org/1.5.8/' + (module ? module + '/' : '') + code;

        for (i = SKIP_INDEXES, paramPrefix = '?'; i < templateArgs.length; i++, paramPrefix = '&') {
            message += paramPrefix + 'p' + (i - SKIP_INDEXES) + '=' + encodeURIComponent(toDebugString(templateArgs[i]));
        }

        return new ErrorConstructor(message);
    };
};

},{"./utils.js":5}],5:[function(require,module,exports){
function isArrayLike(obj) {

  // `null`, `undefined` and `window` are not array-like
  if (obj == null || isWindow(obj)) return false;

  // arrays, strings and jQuery/jqLite objects are array like
  // * jqLite is either the jQuery or jqLite constructor function
  // * we have to check the existence of jqLite first as this method is called
  //   via the forEach method when constructing the jqLite object in the first place
  if (isArray(obj) || isString(obj) || jqLite && obj instanceof jqLite) return true;

  // Support: iOS 8.2 (not reproducible in simulator)
  // "length" in obj used to prevent JIT error (gh-11508)
  var length = "length" in Object(obj) && obj.length;

  // NodeList objects (with `item` method) and
  // other objects with suitable length characteristics are array-like
  return isNumber(length) && (length >= 0 && (length - 1 in obj || obj instanceof Array) || typeof obj.item == 'function');
}

function isUndefined(value) {
  return typeof value === 'undefined';
}

function isWindow(obj) {
  return obj && obj.window === obj;
}

function isScope(obj) {
  return obj && obj.$evalAsync && obj.$watch;
}

var isArray = Array.isArray;

function isString(value) {
  return typeof value === 'string';
}

module.exports = {
  isArrayLike: isArrayLike,
  isUndefined: isUndefined,
  isWindow: isWindow,
  isScope: isScope,
  isArray: isArray,
  isString: isString
};

},{}],6:[function(require,module,exports){
/// <reference path="browser/ambient/jasmine/index.d.ts" />
/// <reference path="browser/ambient/lodash/index.d.ts" />
/// <reference path="browser/ambient/node/index.d.ts" />

},{}]},{},[3,6])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmNcXGNyZWF0ZU1hcC5qcyIsInNyY1xcaGFzaEtleS5qcyIsInNyY1xcaW5kZXguanMiLCJzcmNcXG1pbkVyci5qcyIsInNyY1xcdXRpbHMuanMiLCJ0eXBpbmdzL2Jyb3dzZXIuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBLE9BQUEsQUFBTyxVQUFVLFNBQUEsQUFBUyxZQUFZLEFBQ2xDO1dBQU8sT0FBQSxBQUFPLE9BQWQsQUFBTyxBQUFjLEFBQ3hCO0FBRkQ7Ozs7QUNDQSxJQUFJLE1BQUosQUFBVTs7QUFFVixTQUFBLEFBQVMsVUFBVSxBQUNmO1dBQU8sRUFBUCxBQUFTLEFBQ1o7OztBQUVELE9BQUEsQUFBTyxVQUFVLFNBQUEsQUFBUyxRQUFULEFBQWlCLEtBQWpCLEFBQXNCLFdBQVcsQUFDOUM7UUFBSSxNQUFNLE9BQU8sSUFBakIsQUFBcUIsQUFFckI7O1FBQUEsQUFBSSxLQUFLLEFBQ0w7WUFBSSxPQUFBLEFBQU8sUUFBWCxBQUFtQixZQUFZLEFBQzNCO2tCQUFNLElBQU4sQUFBTSxBQUFJLEFBQ2I7QUFDRDtlQUFBLEFBQU8sQUFDVjtBQUVEOztRQUFJLFVBQVUsT0FBZCxBQUFxQixBQUNyQjtRQUFJLFdBQUEsQUFBVyxjQUFlLFdBQUEsQUFBVyxZQUFZLFFBQXJELEFBQTZELE1BQU8sQUFDaEU7Y0FBTSxJQUFBLEFBQUksWUFBWSxVQUFBLEFBQVUsTUFBTSxDQUFDLGFBQXZDLEFBQXNDLEFBQWMsQUFDdkQ7QUFGRCxXQUVPLEFBQ0g7Y0FBTSxVQUFBLEFBQVUsTUFBaEIsQUFBc0IsQUFDekI7QUFFRDs7V0FBQSxBQUFPLEFBQ1Y7QUFsQkQ7Ozs7QUNOQSxJQUFJLFNBQVMsUUFBYixBQUFhLEFBQVE7QUFDckIsSUFBSSxVQUFVLFFBQWQsQUFBYyxBQUFRO0FBQ3RCLElBQUksWUFBWSxRQUFoQixBQUFnQixBQUFRO0FBQ3hCLElBQUksUUFBUSxR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QUFVLGVBQWhELEFBQStELFFBQVMsT0FBQSxBQUFPLEFBRS9FOztBQUNBO0FBQ0E7TUFBSSxTQUFTLFlBQVksT0FBWixBQUFZLEFBQU8sUUFBUSxJQUF4QyxBQUE0QyxBQUU1Qzs7QUFDQTtBQUNBO1NBQU8sU0FBQSxBQUFTLFlBQ2IsVUFBQSxBQUFVLE1BQU8sU0FBRCxBQUFVLEtBQVYsQUFBZ0IsT0FBTyxlQUF2QyxBQUFzRCxVQUFVLE9BQU8sSUFBUCxBQUFXLFFBRDlFLEFBQU8sQUFDK0UsQUFFdkY7OztBQUVELFNBQUEsQUFBUyxZQUFULEFBQXFCLE9BQU8sQUFBQztTQUFPLE9BQUEsQUFBTyxVQUFkLEFBQXdCLEFBQWE7OztBQUVsRSxTQUFBLEFBQVMsU0FBVCxBQUFrQixLQUFLLEFBQ25CO1NBQU8sT0FBTyxJQUFBLEFBQUksV0FBbEIsQUFBNkIsQUFDaEM7OztBQUVELFNBQUEsQUFBUyxRQUFULEFBQWlCLEtBQUssQUFDbEI7U0FBTyxPQUFPLElBQVAsQUFBVyxjQUFjLElBQWhDLEFBQW9DLEFBQ3ZDOzs7QUFFRCxJQUFJLFVBQVUsTUFBZCxBQUFvQjs7QUFFcEIsU0FBQSxBQUFTLFNBQVQsQUFBa0IsT0FBTyxBQUFDO1NBQU8sT0FBQSxBQUFPLFVBQWQsQUFBd0IsQUFBVTs7O0FBRTVELE9BQUEsQUFBTztlQUFVLEFBQ0EsQUFDYjtlQUZhLEFBRUEsQUFDYjtZQUhhLEFBR0gsQUFDVjtXQUphLEFBSUosQUFDVDtXQUxhLEFBS0osQUFDVDtZQU5KLEFBQWlCLEFBTUg7QUFORyxBQUNiOzs7QUNyQ0o7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVNYXAoKSB7XHJcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZShudWxsKTtcclxufSIsIlxyXG52YXIgdWlkID0gMDtcclxuXHJcbmZ1bmN0aW9uIG5leHRVaWQoKSB7XHJcbiAgICByZXR1cm4gKyt1aWQ7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaGFzaEtleShvYmosIG5leHRVaWRGbikge1xyXG4gICAgdmFyIGtleSA9IG9iaiAmJiBvYmouJCRoYXNoS2V5O1xyXG5cclxuICAgIGlmIChrZXkpIHtcclxuICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICBrZXkgPSBvYmouJCRoYXNoS2V5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBrZXk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG9ialR5cGUgPSB0eXBlb2Ygb2JqO1xyXG4gICAgaWYgKG9ialR5cGUgPT0gJ2Z1bmN0aW9uJyB8fCAob2JqVHlwZSA9PSAnb2JqZWN0JyAmJiBvYmogIT09IG51bGwpKSB7XHJcbiAgICAgICAga2V5ID0gb2JqLiQkaGFzaEtleSA9IG9ialR5cGUgKyAnOicgKyAobmV4dFVpZEZuIHx8IG5leHRVaWQpKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGtleSA9IG9ialR5cGUgKyAnOicgKyBvYmo7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGtleTtcclxufSIsIlxudmFyIG1pbkVyciA9IHJlcXVpcmUoXCIuL21pbkVyci5qc1wiKTtcbnZhciBoYXNoS2V5ID0gcmVxdWlyZShcIi4vaGFzaEtleS5qc1wiKTtcbnZhciBjcmVhdGVNYXAgPSByZXF1aXJlKFwiLi9jcmVhdGVNYXAuanNcIik7XG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlscy5qc1wiKTtcbnZhciBpc0FycmF5TGlrZSA9IHV0aWxzLmlzQXJyYXlMaWtlO1xuXG5hbmd1bGFyLm1vZHVsZSgnbmctcmVwZWF0LW4tZGlyZWN0aXZlJywgW10pXG5cbiAgLmRpcmVjdGl2ZSgnbmdSZXBlYXROJywgWyckcGFyc2UnLCAnJGFuaW1hdGUnLCAnJGNvbXBpbGUnLCBmdW5jdGlvbiAoJHBhcnNlLCAkYW5pbWF0ZSwgJGNvbXBpbGUpIHtcblxuICAgIHZhciBOR19SRU1PVkVEID0gJyQkTkdfUkVNT1ZFRCc7XG4gICAgdmFyIG5nUmVwZWF0TWluRXJyID0gbWluRXJyKCduZ1JlcGVhdCcpO1xuXG4gICAgdmFyIHVwZGF0ZVNjb3BlID0gZnVuY3Rpb24gKHNjb3BlLCBpbmRleCwgdmFsdWVJZGVudGlmaWVyLCB2YWx1ZSwga2V5SWRlbnRpZmllciwga2V5LCBhcnJheUxlbmd0aCkge1xuICAgICAgLy8gVE9ETyhwZXJmKTogZ2VuZXJhdGUgc2V0dGVycyB0byBzaGF2ZSBvZmYgfjQwbXMgb3IgMS0xLjUlXG4gICAgICBzY29wZVt2YWx1ZUlkZW50aWZpZXJdID0gdmFsdWU7XG4gICAgICBpZiAoa2V5SWRlbnRpZmllcikgc2NvcGVba2V5SWRlbnRpZmllcl0gPSBrZXk7XG4gICAgICBzY29wZS4kaW5kZXggPSBpbmRleDtcbiAgICAgIHNjb3BlLiRmaXJzdCA9IChpbmRleCA9PT0gMCk7XG4gICAgICBzY29wZS4kbGFzdCA9IChpbmRleCA9PT0gKGFycmF5TGVuZ3RoIC0gMSkpO1xuICAgICAgc2NvcGUuJG1pZGRsZSA9ICEoc2NvcGUuJGZpcnN0IHx8IHNjb3BlLiRsYXN0KTtcbiAgICAgIC8vIGpzaGludCBiaXR3aXNlOiBmYWxzZVxuICAgICAgc2NvcGUuJG9kZCA9ICEoc2NvcGUuJGV2ZW4gPSAoaW5kZXggJiAxKSA9PT0gMCk7XG4gICAgICAvLyBqc2hpbnQgYml0d2lzZTogdHJ1ZVxuICAgIH07XG5cbiAgICB2YXIgZ2V0QmxvY2tTdGFydCA9IGZ1bmN0aW9uIChibG9jaykge1xuICAgICAgcmV0dXJuIGJsb2NrLmNsb25lWzBdO1xuICAgIH07XG5cbiAgICB2YXIgZ2V0QmxvY2tFbmQgPSBmdW5jdGlvbiAoYmxvY2spIHtcbiAgICAgIHJldHVybiBibG9jay5jbG9uZVtibG9jay5jbG9uZS5sZW5ndGggLSAxXTtcbiAgICB9O1xuXG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgIG11bHRpRWxlbWVudDogdHJ1ZSxcbiAgICAgIHRyYW5zY2x1ZGU6ICdlbGVtZW50JyxcbiAgICAgIHByaW9yaXR5OiAxMDAwLFxuICAgICAgdGVybWluYWw6IHRydWUsXG4gICAgICAkJHRsYjogdHJ1ZSxcbiAgICAgIGNvbXBpbGU6IGZ1bmN0aW9uIG5nUmVwZWF0Q29tcGlsZSgkZWxlbWVudCwgJGF0dHIpIHtcbiAgICAgICAgdmFyIG5nUmVwZWF0TiA9IHBhcnNlSW50KCRhdHRyLm5nUmVwZWF0Tik7XG4gICAgICAgIHZhciBhcnJheSA9IG5ldyBBcnJheShuZ1JlcGVhdE4pO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICBhcnJheVtpXSA9IGk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZXhwcmVzc2lvbiA9ICdpdGVtIGluIFsnICsgYXJyYXkudG9TdHJpbmcoKSArICddJztcblxuICAgICAgICB2YXIgbmdSZXBlYXRFbmRDb21tZW50ID0gJGNvbXBpbGUuJCRjcmVhdGVDb21tZW50KCdlbmQgbmdSZXBlYXQnLCBleHByZXNzaW9uKTtcblxuICAgICAgICB2YXIgbWF0Y2ggPSBleHByZXNzaW9uLm1hdGNoKC9eXFxzKihbXFxzXFxTXSs/KVxccytpblxccysoW1xcc1xcU10rPykoPzpcXHMrYXNcXHMrKFtcXHNcXFNdKz8pKT8oPzpcXHMrdHJhY2tcXHMrYnlcXHMrKFtcXHNcXFNdKz8pKT9cXHMqJC8pO1xuXG4gICAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZ1JlcGVhdE1pbkVycignaWV4cCcsIFwiRXhwZWN0ZWQgZXhwcmVzc2lvbiBpbiBmb3JtIG9mICdfaXRlbV8gaW4gX2NvbGxlY3Rpb25fWyB0cmFjayBieSBfaWRfXScgYnV0IGdvdCAnezB9Jy5cIixcbiAgICAgICAgICAgIGV4cHJlc3Npb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxocyA9IG1hdGNoWzFdO1xuICAgICAgICB2YXIgcmhzID0gbWF0Y2hbMl07XG4gICAgICAgIHZhciBhbGlhc0FzID0gbWF0Y2hbM107XG4gICAgICAgIHZhciB0cmFja0J5RXhwID0gbWF0Y2hbNF07XG5cbiAgICAgICAgbWF0Y2ggPSBsaHMubWF0Y2goL14oPzooXFxzKltcXCRcXHddKyl8XFwoXFxzKihbXFwkXFx3XSspXFxzKixcXHMqKFtcXCRcXHddKylcXHMqXFwpKSQvKTtcblxuICAgICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmdSZXBlYXRNaW5FcnIoJ2lpZGV4cCcsIFwiJ19pdGVtXycgaW4gJ19pdGVtXyBpbiBfY29sbGVjdGlvbl8nIHNob3VsZCBiZSBhbiBpZGVudGlmaWVyIG9yICcoX2tleV8sIF92YWx1ZV8pJyBleHByZXNzaW9uLCBidXQgZ290ICd7MH0nLlwiLFxuICAgICAgICAgICAgbGhzKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdmFsdWVJZGVudGlmaWVyID0gbWF0Y2hbM10gfHwgbWF0Y2hbMV07XG4gICAgICAgIHZhciBrZXlJZGVudGlmaWVyID0gbWF0Y2hbMl07XG5cbiAgICAgICAgaWYgKGFsaWFzQXMgJiYgKCEvXlskYS16QS1aX11bJGEtekEtWjAtOV9dKiQvLnRlc3QoYWxpYXNBcykgfHxcbiAgICAgICAgICAvXihudWxsfHVuZGVmaW5lZHx0aGlzfFxcJGluZGV4fFxcJGZpcnN0fFxcJG1pZGRsZXxcXCRsYXN0fFxcJGV2ZW58XFwkb2RkfFxcJHBhcmVudHxcXCRyb290fFxcJGlkKSQvLnRlc3QoYWxpYXNBcykpKSB7XG4gICAgICAgICAgdGhyb3cgbmdSZXBlYXRNaW5FcnIoJ2JhZGlkZW50JywgXCJhbGlhcyAnezB9JyBpcyBpbnZhbGlkIC0tLSBtdXN0IGJlIGEgdmFsaWQgSlMgaWRlbnRpZmllciB3aGljaCBpcyBub3QgYSByZXNlcnZlZCBuYW1lLlwiLFxuICAgICAgICAgICAgYWxpYXNBcyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdHJhY2tCeUV4cEdldHRlciwgdHJhY2tCeUlkRXhwRm4sIHRyYWNrQnlJZEFycmF5Rm4sIHRyYWNrQnlJZE9iakZuO1xuICAgICAgICB2YXIgaGFzaEZuTG9jYWxzID0geyAkaWQ6IGhhc2hLZXkgfTtcblxuICAgICAgICBpZiAodHJhY2tCeUV4cCkge1xuICAgICAgICAgIHRyYWNrQnlFeHBHZXR0ZXIgPSAkcGFyc2UodHJhY2tCeUV4cCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJhY2tCeUlkQXJyYXlGbiA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gaGFzaEtleSh2YWx1ZSk7XG4gICAgICAgICAgfTtcbiAgICAgICAgICB0cmFja0J5SWRPYmpGbiA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZ1JlcGVhdExpbmsoJHNjb3BlLCAkZWxlbWVudCwgJGF0dHIsIGN0cmwsICR0cmFuc2NsdWRlKSB7XG5cbiAgICAgICAgICBpZiAodHJhY2tCeUV4cEdldHRlcikge1xuICAgICAgICAgICAgdHJhY2tCeUlkRXhwRm4gPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgLy8gYXNzaWduIGtleSwgdmFsdWUsIGFuZCAkaW5kZXggdG8gdGhlIGxvY2FscyBzbyB0aGF0IHRoZXkgY2FuIGJlIHVzZWQgaW4gaGFzaCBmdW5jdGlvbnNcbiAgICAgICAgICAgICAgaWYgKGtleUlkZW50aWZpZXIpIGhhc2hGbkxvY2Fsc1trZXlJZGVudGlmaWVyXSA9IGtleTtcbiAgICAgICAgICAgICAgaGFzaEZuTG9jYWxzW3ZhbHVlSWRlbnRpZmllcl0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgaGFzaEZuTG9jYWxzLiRpbmRleCA9IGluZGV4O1xuICAgICAgICAgICAgICByZXR1cm4gdHJhY2tCeUV4cEdldHRlcigkc2NvcGUsIGhhc2hGbkxvY2Fscyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFN0b3JlIGEgbGlzdCBvZiBlbGVtZW50cyBmcm9tIHByZXZpb3VzIHJ1bi4gVGhpcyBpcyBhIGhhc2ggd2hlcmUga2V5IGlzIHRoZSBpdGVtIGZyb20gdGhlXG4gICAgICAgICAgLy8gaXRlcmF0b3IsIGFuZCB0aGUgdmFsdWUgaXMgb2JqZWN0cyB3aXRoIGZvbGxvd2luZyBwcm9wZXJ0aWVzLlxuICAgICAgICAgIC8vICAgLSBzY29wZTogYm91bmQgc2NvcGVcbiAgICAgICAgICAvLyAgIC0gZWxlbWVudDogcHJldmlvdXMgZWxlbWVudC5cbiAgICAgICAgICAvLyAgIC0gaW5kZXg6IHBvc2l0aW9uXG4gICAgICAgICAgLy9cbiAgICAgICAgICAvLyBXZSBhcmUgdXNpbmcgbm8tcHJvdG8gb2JqZWN0IHNvIHRoYXQgd2UgZG9uJ3QgbmVlZCB0byBndWFyZCBhZ2FpbnN0IGluaGVyaXRlZCBwcm9wcyB2aWFcbiAgICAgICAgICAvLyBoYXNPd25Qcm9wZXJ0eS5cbiAgICAgICAgICB2YXIgbGFzdEJsb2NrTWFwID0gY3JlYXRlTWFwKCk7XG5cbiAgICAgICAgICAvL3dhdGNoIHByb3BzXG4gICAgICAgICAgJHNjb3BlLiR3YXRjaENvbGxlY3Rpb24ocmhzLCBmdW5jdGlvbiBuZ1JlcGVhdEFjdGlvbihjb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICB2YXIgaW5kZXgsIGxlbmd0aCxcbiAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gJGVsZW1lbnRbMF0sICAgICAvLyBub2RlIHRoYXQgY2xvbmVkIG5vZGVzIHNob3VsZCBiZSBpbnNlcnRlZCBhZnRlclxuICAgICAgICAgICAgICAvLyBpbml0aWFsaXplZCB0byB0aGUgY29tbWVudCBub2RlIGFuY2hvclxuICAgICAgICAgICAgICBuZXh0Tm9kZSxcbiAgICAgICAgICAgICAgLy8gU2FtZSBhcyBsYXN0QmxvY2tNYXAgYnV0IGl0IGhhcyB0aGUgY3VycmVudCBzdGF0ZS4gSXQgd2lsbCBiZWNvbWUgdGhlXG4gICAgICAgICAgICAgIC8vIGxhc3RCbG9ja01hcCBvbiB0aGUgbmV4dCBpdGVyYXRpb24uXG4gICAgICAgICAgICAgIG5leHRCbG9ja01hcCA9IGNyZWF0ZU1hcCgpLFxuICAgICAgICAgICAgICBjb2xsZWN0aW9uTGVuZ3RoLFxuICAgICAgICAgICAgICBrZXksIHZhbHVlLCAvLyBrZXkvdmFsdWUgb2YgaXRlcmF0aW9uXG4gICAgICAgICAgICAgIHRyYWNrQnlJZCxcbiAgICAgICAgICAgICAgdHJhY2tCeUlkRm4sXG4gICAgICAgICAgICAgIGNvbGxlY3Rpb25LZXlzLFxuICAgICAgICAgICAgICBibG9jaywgICAgICAgLy8gbGFzdCBvYmplY3QgaW5mb3JtYXRpb24ge3Njb3BlLCBlbGVtZW50LCBpZH1cbiAgICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXIsXG4gICAgICAgICAgICAgIGVsZW1lbnRzVG9SZW1vdmU7XG5cbiAgICAgICAgICAgIGlmIChhbGlhc0FzKSB7XG4gICAgICAgICAgICAgICRzY29wZVthbGlhc0FzXSA9IGNvbGxlY3Rpb247XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0FycmF5TGlrZShjb2xsZWN0aW9uKSkge1xuICAgICAgICAgICAgICBjb2xsZWN0aW9uS2V5cyA9IGNvbGxlY3Rpb247XG4gICAgICAgICAgICAgIHRyYWNrQnlJZEZuID0gdHJhY2tCeUlkRXhwRm4gfHwgdHJhY2tCeUlkQXJyYXlGbjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRyYWNrQnlJZEZuID0gdHJhY2tCeUlkRXhwRm4gfHwgdHJhY2tCeUlkT2JqRm47XG4gICAgICAgICAgICAgIC8vIGlmIG9iamVjdCwgZXh0cmFjdCBrZXlzLCBpbiBlbnVtZXJhdGlvbiBvcmRlciwgdW5zb3J0ZWRcbiAgICAgICAgICAgICAgY29sbGVjdGlvbktleXMgPSBbXTtcbiAgICAgICAgICAgICAgZm9yICh2YXIgaXRlbUtleSBpbiBjb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoY29sbGVjdGlvbiwgaXRlbUtleSkgJiYgaXRlbUtleS5jaGFyQXQoMCkgIT09ICckJykge1xuICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbktleXMucHVzaChpdGVtS2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29sbGVjdGlvbkxlbmd0aCA9IGNvbGxlY3Rpb25LZXlzLmxlbmd0aDtcbiAgICAgICAgICAgIG5leHRCbG9ja09yZGVyID0gbmV3IEFycmF5KGNvbGxlY3Rpb25MZW5ndGgpO1xuXG4gICAgICAgICAgICAvLyBsb2NhdGUgZXhpc3RpbmcgaXRlbXNcbiAgICAgICAgICAgIGZvciAoaW5kZXggPSAwOyBpbmRleCA8IGNvbGxlY3Rpb25MZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgICAga2V5ID0gKGNvbGxlY3Rpb24gPT09IGNvbGxlY3Rpb25LZXlzKSA/IGluZGV4IDogY29sbGVjdGlvbktleXNbaW5kZXhdO1xuICAgICAgICAgICAgICB2YWx1ZSA9IGNvbGxlY3Rpb25ba2V5XTtcbiAgICAgICAgICAgICAgdHJhY2tCeUlkID0gdHJhY2tCeUlkRm4oa2V5LCB2YWx1ZSwgaW5kZXgpO1xuICAgICAgICAgICAgICBpZiAobGFzdEJsb2NrTWFwW3RyYWNrQnlJZF0pIHtcbiAgICAgICAgICAgICAgICAvLyBmb3VuZCBwcmV2aW91c2x5IHNlZW4gYmxvY2tcbiAgICAgICAgICAgICAgICBibG9jayA9IGxhc3RCbG9ja01hcFt0cmFja0J5SWRdO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBsYXN0QmxvY2tNYXBbdHJhY2tCeUlkXTtcbiAgICAgICAgICAgICAgICBuZXh0QmxvY2tNYXBbdHJhY2tCeUlkXSA9IGJsb2NrO1xuICAgICAgICAgICAgICAgIG5leHRCbG9ja09yZGVyW2luZGV4XSA9IGJsb2NrO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKG5leHRCbG9ja01hcFt0cmFja0J5SWRdKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgY29sbGlzaW9uIGRldGVjdGVkLiByZXN0b3JlIGxhc3RCbG9ja01hcCBhbmQgdGhyb3cgYW4gZXJyb3JcbiAgICAgICAgICAgICAgICBmb3JFYWNoKG5leHRCbG9ja09yZGVyLCBmdW5jdGlvbiAoYmxvY2spIHtcbiAgICAgICAgICAgICAgICAgIGlmIChibG9jayAmJiBibG9jay5zY29wZSkgbGFzdEJsb2NrTWFwW2Jsb2NrLmlkXSA9IGJsb2NrO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRocm93IG5nUmVwZWF0TWluRXJyKCdkdXBlcycsXG4gICAgICAgICAgICAgICAgICBcIkR1cGxpY2F0ZXMgaW4gYSByZXBlYXRlciBhcmUgbm90IGFsbG93ZWQuIFVzZSAndHJhY2sgYnknIGV4cHJlc3Npb24gdG8gc3BlY2lmeSB1bmlxdWUga2V5cy4gUmVwZWF0ZXI6IHswfSwgRHVwbGljYXRlIGtleTogezF9LCBEdXBsaWNhdGUgdmFsdWU6IHsyfVwiLFxuICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbiwgdHJhY2tCeUlkLCB2YWx1ZSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gbmV3IG5ldmVyIGJlZm9yZSBzZWVuIGJsb2NrXG4gICAgICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXJbaW5kZXhdID0geyBpZDogdHJhY2tCeUlkLCBzY29wZTogdW5kZWZpbmVkLCBjbG9uZTogdW5kZWZpbmVkIH07XG4gICAgICAgICAgICAgICAgbmV4dEJsb2NrTWFwW3RyYWNrQnlJZF0gPSB0cnVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSBsZWZ0b3ZlciBpdGVtc1xuICAgICAgICAgICAgZm9yICh2YXIgYmxvY2tLZXkgaW4gbGFzdEJsb2NrTWFwKSB7XG4gICAgICAgICAgICAgIGJsb2NrID0gbGFzdEJsb2NrTWFwW2Jsb2NrS2V5XTtcbiAgICAgICAgICAgICAgZWxlbWVudHNUb1JlbW92ZSA9IGdldEJsb2NrTm9kZXMoYmxvY2suY2xvbmUpO1xuICAgICAgICAgICAgICAkYW5pbWF0ZS5sZWF2ZShlbGVtZW50c1RvUmVtb3ZlKTtcbiAgICAgICAgICAgICAgaWYgKGVsZW1lbnRzVG9SZW1vdmVbMF0ucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBlbGVtZW50IHdhcyBub3QgcmVtb3ZlZCB5ZXQgYmVjYXVzZSBvZiBwZW5kaW5nIGFuaW1hdGlvbiwgbWFyayBpdCBhcyBkZWxldGVkXG4gICAgICAgICAgICAgICAgLy8gc28gdGhhdCB3ZSBjYW4gaWdub3JlIGl0IGxhdGVyXG4gICAgICAgICAgICAgICAgZm9yIChpbmRleCA9IDAsIGxlbmd0aCA9IGVsZW1lbnRzVG9SZW1vdmUubGVuZ3RoOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICAgICAgZWxlbWVudHNUb1JlbW92ZVtpbmRleF1bTkdfUkVNT1ZFRF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBibG9jay5zY29wZS4kZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB3ZSBhcmUgbm90IHVzaW5nIGZvckVhY2ggZm9yIHBlcmYgcmVhc29ucyAodHJ5aW5nIHRvIGF2b2lkICNjYWxsKVxuICAgICAgICAgICAgZm9yIChpbmRleCA9IDA7IGluZGV4IDwgY29sbGVjdGlvbkxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICBrZXkgPSAoY29sbGVjdGlvbiA9PT0gY29sbGVjdGlvbktleXMpID8gaW5kZXggOiBjb2xsZWN0aW9uS2V5c1tpbmRleF07XG4gICAgICAgICAgICAgIHZhbHVlID0gY29sbGVjdGlvbltrZXldO1xuICAgICAgICAgICAgICBibG9jayA9IG5leHRCbG9ja09yZGVyW2luZGV4XTtcblxuICAgICAgICAgICAgICBpZiAoYmxvY2suc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGFscmVhZHkgc2VlbiB0aGlzIG9iamVjdCwgdGhlbiB3ZSBuZWVkIHRvIHJldXNlIHRoZVxuICAgICAgICAgICAgICAgIC8vIGFzc29jaWF0ZWQgc2NvcGUvZWxlbWVudFxuXG4gICAgICAgICAgICAgICAgbmV4dE5vZGUgPSBwcmV2aW91c05vZGU7XG5cbiAgICAgICAgICAgICAgICAvLyBza2lwIG5vZGVzIHRoYXQgYXJlIGFscmVhZHkgcGVuZGluZyByZW1vdmFsIHZpYSBsZWF2ZSBhbmltYXRpb25cbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICBuZXh0Tm9kZSA9IG5leHROb2RlLm5leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgIH0gd2hpbGUgKG5leHROb2RlICYmIG5leHROb2RlW05HX1JFTU9WRURdKTtcblxuICAgICAgICAgICAgICAgIGlmIChnZXRCbG9ja1N0YXJ0KGJsb2NrKSAhPSBuZXh0Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgLy8gZXhpc3RpbmcgaXRlbSB3aGljaCBnb3QgbW92ZWRcbiAgICAgICAgICAgICAgICAgICRhbmltYXRlLm1vdmUoZ2V0QmxvY2tOb2RlcyhibG9jay5jbG9uZSksIG51bGwsIHByZXZpb3VzTm9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXZpb3VzTm9kZSA9IGdldEJsb2NrRW5kKGJsb2NrKTtcbiAgICAgICAgICAgICAgICB1cGRhdGVTY29wZShibG9jay5zY29wZSwgaW5kZXgsIHZhbHVlSWRlbnRpZmllciwgdmFsdWUsIGtleUlkZW50aWZpZXIsIGtleSwgY29sbGVjdGlvbkxlbmd0aCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gbmV3IGl0ZW0gd2hpY2ggd2UgZG9uJ3Qga25vdyBhYm91dFxuICAgICAgICAgICAgICAgICR0cmFuc2NsdWRlKGZ1bmN0aW9uIG5nUmVwZWF0VHJhbnNjbHVkZShjbG9uZSwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgIGJsb2NrLnNjb3BlID0gc2NvcGU7XG4gICAgICAgICAgICAgICAgICAvLyBodHRwOi8vanNwZXJmLmNvbS9jbG9uZS12cy1jcmVhdGVjb21tZW50XG4gICAgICAgICAgICAgICAgICB2YXIgZW5kTm9kZSA9IG5nUmVwZWF0RW5kQ29tbWVudC5jbG9uZU5vZGUoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgY2xvbmVbY2xvbmUubGVuZ3RoKytdID0gZW5kTm9kZTtcblxuICAgICAgICAgICAgICAgICAgJGFuaW1hdGUuZW50ZXIoY2xvbmUsIG51bGwsIHByZXZpb3VzTm9kZSk7XG4gICAgICAgICAgICAgICAgICBwcmV2aW91c05vZGUgPSBlbmROb2RlO1xuICAgICAgICAgICAgICAgICAgLy8gTm90ZTogV2Ugb25seSBuZWVkIHRoZSBmaXJzdC9sYXN0IG5vZGUgb2YgdGhlIGNsb25lZCBub2Rlcy5cbiAgICAgICAgICAgICAgICAgIC8vIEhvd2V2ZXIsIHdlIG5lZWQgdG8ga2VlcCB0aGUgcmVmZXJlbmNlIHRvIHRoZSBqcWxpdGUgd3JhcHBlciBhcyBpdCBtaWdodCBiZSBjaGFuZ2VkIGxhdGVyXG4gICAgICAgICAgICAgICAgICAvLyBieSBhIGRpcmVjdGl2ZSB3aXRoIHRlbXBsYXRlVXJsIHdoZW4gaXRzIHRlbXBsYXRlIGFycml2ZXMuXG4gICAgICAgICAgICAgICAgICBibG9jay5jbG9uZSA9IGNsb25lO1xuICAgICAgICAgICAgICAgICAgbmV4dEJsb2NrTWFwW2Jsb2NrLmlkXSA9IGJsb2NrO1xuICAgICAgICAgICAgICAgICAgdXBkYXRlU2NvcGUoYmxvY2suc2NvcGUsIGluZGV4LCB2YWx1ZUlkZW50aWZpZXIsIHZhbHVlLCBrZXlJZGVudGlmaWVyLCBrZXksIGNvbGxlY3Rpb25MZW5ndGgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsYXN0QmxvY2tNYXAgPSBuZXh0QmxvY2tNYXA7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfTtcbiAgfV0pXG4gIC5kaXJlY3RpdmUoJ25nUmF0aW5nJywgWyckcGFyc2UnLCAnJGFuaW1hdGUnLCAnJGNvbXBpbGUnLCBmdW5jdGlvbiAoJHBhcnNlLCAkYW5pbWF0ZSwgJGNvbXBpbGUpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgIHRlbXBsYXRlOiAnPGRpdj48c3BhbiBuZy1yZXBlYXQtbj1cIjVcIiBuZy1jbGljaz1cImNoYW5nZVJhdGluZygkaW5kZXgpXCI+PGkgY2xhc3M9XCJmYSBmYS1zdGFyXCIgbmctc2hvdz1cIigkaW5kZXggKyAxKSA8PSBiaW5kUmF0aW5nXCI+PC9pPjxpIGNsYXNzPVwiZmEgZmEtc3Rhci1oYWxmXCIgbmctc2hvdz1cIigkaW5kZXggKyAwLjUpID09IGJpbmRSYXRpbmdcIj48L2k+PGkgY2xhc3M9XCJmYSBmYS1zdGFyLW9cIiBuZy1zaG93PVwiJGluZGV4ID49IGJpbmRSYXRpbmdcIj48L2k+PC9zcGFuPjwvZGl2PicsXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoJHNjb3BlLCAkZWxlbWVudCwgJGF0dHJpYnV0ZXMsIGNvbnRyb2xsZXIpIHtcbiAgICAgICAgJHNjb3BlLiR3YXRjaCgkYXR0cmlidXRlcy5uZ01vZGVsLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgJHNjb3BlLmJpbmRSYXRpbmcgPSAkc2NvcGVbJGF0dHJpYnV0ZXMubmdNb2RlbF07XG4gICAgICAgIH0pO1xuXG4gICAgICAgICRzY29wZS5jaGFuZ2VSYXRpbmcgPSBmdW5jdGlvbiAoJGluZGV4KSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJGluZGV4KTtcbiAgICAgICAgICBpZiAoKCRpbmRleCArIDEpICE9ICRzY29wZS5zcykge1xuICAgICAgICAgICAgJHNjb3BlLnNzID0gJGluZGV4ICsgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAkc2NvcGUuc3MgPSAkaW5kZXggKyAwLjU7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH07XG4gIH1dKTsiLCJcclxudmFyIHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHMuanNcIik7XHJcbnZhciBpc0FycmF5TGlrZSA9IHV0aWxzLmlzQXJyYXlMaWtlO1xyXG52YXIgaXNVbmRlZmluZWQgPSB1dGlscy5pc1VuZGVmaW5lZDtcclxudmFyIGlzV2luZG93ID0gdXRpbHMuaXNXaW5kb3c7XHJcbnZhciBpc1Njb3BlID0gdXRpbHMuaXNTY29wZTtcclxuXHJcbmZ1bmN0aW9uIHRvSnNvblJlcGxhY2VyKGtleSwgdmFsdWUpIHtcclxuICAgIHZhciB2YWwgPSB2YWx1ZTtcclxuXHJcbiAgICBpZiAodHlwZW9mIGtleSA9PT0gJ3N0cmluZycgJiYga2V5LmNoYXJBdCgwKSA9PT0gJyQnICYmIGtleS5jaGFyQXQoMSkgPT09ICckJykge1xyXG4gICAgICAgIHZhbCA9IHVuZGVmaW5lZDtcclxuICAgIH0gZWxzZSBpZiAoaXNXaW5kb3codmFsdWUpKSB7XHJcbiAgICAgICAgdmFsID0gJyRXSU5ET1cnO1xyXG4gICAgfSBlbHNlIGlmICh2YWx1ZSAmJiB3aW5kb3cuZG9jdW1lbnQgPT09IHZhbHVlKSB7XHJcbiAgICAgICAgdmFsID0gJyRET0NVTUVOVCc7XHJcbiAgICB9IGVsc2UgaWYgKGlzU2NvcGUodmFsdWUpKSB7XHJcbiAgICAgICAgdmFsID0gJyRTQ09QRSc7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHZhbDtcclxufVxyXG5cclxuLyogZ2xvYmFsIHRvRGVidWdTdHJpbmc6IHRydWUgKi9cclxuXHJcbmZ1bmN0aW9uIHNlcmlhbGl6ZU9iamVjdChvYmopIHtcclxuICAgIHZhciBzZWVuID0gW107XHJcblxyXG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG9iaiwgZnVuY3Rpb24gKGtleSwgdmFsKSB7XHJcbiAgICAgICAgdmFsID0gdG9Kc29uUmVwbGFjZXIoa2V5LCB2YWwpO1xyXG4gICAgICAgIGlmIChpc09iamVjdCh2YWwpKSB7XHJcblxyXG4gICAgICAgICAgICBpZiAoc2Vlbi5pbmRleE9mKHZhbCkgPj0gMCkgcmV0dXJuICcuLi4nO1xyXG5cclxuICAgICAgICAgICAgc2Vlbi5wdXNoKHZhbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB2YWw7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gdG9EZWJ1Z1N0cmluZyhvYmopIHtcclxuICAgIGlmICh0eXBlb2Ygb2JqID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgcmV0dXJuIG9iai50b1N0cmluZygpLnJlcGxhY2UoLyBcXHtbXFxzXFxTXSokLywgJycpO1xyXG4gICAgfSBlbHNlIGlmIChpc1VuZGVmaW5lZChvYmopKSB7XHJcbiAgICAgICAgcmV0dXJuICd1bmRlZmluZWQnO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygb2JqICE9PSAnc3RyaW5nJykge1xyXG4gICAgICAgIHJldHVybiBzZXJpYWxpemVPYmplY3Qob2JqKTtcclxuICAgIH1cclxuICAgIHJldHVybiBvYmo7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbWluRXJyKG1vZHVsZSwgRXJyb3JDb25zdHJ1Y3Rvcikge1xyXG4gICAgRXJyb3JDb25zdHJ1Y3RvciA9IEVycm9yQ29uc3RydWN0b3IgfHwgRXJyb3I7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHZhciBTS0lQX0lOREVYRVMgPSAyO1xyXG5cclxuICAgICAgICB2YXIgdGVtcGxhdGVBcmdzID0gYXJndW1lbnRzLFxyXG4gICAgICAgICAgICBjb2RlID0gdGVtcGxhdGVBcmdzWzBdLFxyXG4gICAgICAgICAgICBtZXNzYWdlID0gJ1snICsgKG1vZHVsZSA/IG1vZHVsZSArICc6JyA6ICcnKSArIGNvZGUgKyAnXSAnLFxyXG4gICAgICAgICAgICB0ZW1wbGF0ZSA9IHRlbXBsYXRlQXJnc1sxXSxcclxuICAgICAgICAgICAgcGFyYW1QcmVmaXgsIGk7XHJcblxyXG4gICAgICAgIG1lc3NhZ2UgKz0gdGVtcGxhdGUucmVwbGFjZSgvXFx7XFxkK1xcfS9nLCBmdW5jdGlvbiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgdmFyIGluZGV4ID0gK21hdGNoLnNsaWNlKDEsIC0xKSxcclxuICAgICAgICAgICAgICAgIHNoaWZ0ZWRJbmRleCA9IGluZGV4ICsgU0tJUF9JTkRFWEVTO1xyXG5cclxuICAgICAgICAgICAgaWYgKHNoaWZ0ZWRJbmRleCA8IHRlbXBsYXRlQXJncy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0b0RlYnVnU3RyaW5nKHRlbXBsYXRlQXJnc1tzaGlmdGVkSW5kZXhdKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBtZXNzYWdlICs9ICdcXG5odHRwOi8vZXJyb3JzLmFuZ3VsYXJqcy5vcmcvMS41LjgvJyArXHJcbiAgICAgICAgICAgIChtb2R1bGUgPyBtb2R1bGUgKyAnLycgOiAnJykgKyBjb2RlO1xyXG5cclxuICAgICAgICBmb3IgKGkgPSBTS0lQX0lOREVYRVMsIHBhcmFtUHJlZml4ID0gJz8nOyBpIDwgdGVtcGxhdGVBcmdzLmxlbmd0aDsgaSsrICwgcGFyYW1QcmVmaXggPSAnJicpIHtcclxuICAgICAgICAgICAgbWVzc2FnZSArPSBwYXJhbVByZWZpeCArICdwJyArIChpIC0gU0tJUF9JTkRFWEVTKSArICc9JyArXHJcbiAgICAgICAgICAgICAgICBlbmNvZGVVUklDb21wb25lbnQodG9EZWJ1Z1N0cmluZyh0ZW1wbGF0ZUFyZ3NbaV0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBuZXcgRXJyb3JDb25zdHJ1Y3RvcihtZXNzYWdlKTtcclxuICAgIH07XHJcbn0iLCJmdW5jdGlvbiBpc0FycmF5TGlrZShvYmopIHtcclxuXHJcbiAgLy8gYG51bGxgLCBgdW5kZWZpbmVkYCBhbmQgYHdpbmRvd2AgYXJlIG5vdCBhcnJheS1saWtlXHJcbiAgaWYgKG9iaiA9PSBudWxsIHx8IGlzV2luZG93KG9iaikpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgLy8gYXJyYXlzLCBzdHJpbmdzIGFuZCBqUXVlcnkvanFMaXRlIG9iamVjdHMgYXJlIGFycmF5IGxpa2VcclxuICAvLyAqIGpxTGl0ZSBpcyBlaXRoZXIgdGhlIGpRdWVyeSBvciBqcUxpdGUgY29uc3RydWN0b3IgZnVuY3Rpb25cclxuICAvLyAqIHdlIGhhdmUgdG8gY2hlY2sgdGhlIGV4aXN0ZW5jZSBvZiBqcUxpdGUgZmlyc3QgYXMgdGhpcyBtZXRob2QgaXMgY2FsbGVkXHJcbiAgLy8gICB2aWEgdGhlIGZvckVhY2ggbWV0aG9kIHdoZW4gY29uc3RydWN0aW5nIHRoZSBqcUxpdGUgb2JqZWN0IGluIHRoZSBmaXJzdCBwbGFjZVxyXG4gIGlmIChpc0FycmF5KG9iaikgfHwgaXNTdHJpbmcob2JqKSB8fCAoanFMaXRlICYmIG9iaiBpbnN0YW5jZW9mIGpxTGl0ZSkpIHJldHVybiB0cnVlO1xyXG5cclxuICAvLyBTdXBwb3J0OiBpT1MgOC4yIChub3QgcmVwcm9kdWNpYmxlIGluIHNpbXVsYXRvcilcclxuICAvLyBcImxlbmd0aFwiIGluIG9iaiB1c2VkIHRvIHByZXZlbnQgSklUIGVycm9yIChnaC0xMTUwOClcclxuICB2YXIgbGVuZ3RoID0gXCJsZW5ndGhcIiBpbiBPYmplY3Qob2JqKSAmJiBvYmoubGVuZ3RoO1xyXG5cclxuICAvLyBOb2RlTGlzdCBvYmplY3RzICh3aXRoIGBpdGVtYCBtZXRob2QpIGFuZFxyXG4gIC8vIG90aGVyIG9iamVjdHMgd2l0aCBzdWl0YWJsZSBsZW5ndGggY2hhcmFjdGVyaXN0aWNzIGFyZSBhcnJheS1saWtlXHJcbiAgcmV0dXJuIGlzTnVtYmVyKGxlbmd0aCkgJiZcclxuICAgIChsZW5ndGggPj0gMCAmJiAoKGxlbmd0aCAtIDEpIGluIG9iaiB8fCBvYmogaW5zdGFuY2VvZiBBcnJheSkgfHwgdHlwZW9mIG9iai5pdGVtID09ICdmdW5jdGlvbicpO1xyXG5cclxufVxyXG5cclxuZnVuY3Rpb24gaXNVbmRlZmluZWQodmFsdWUpIHtyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJzt9XHJcblxyXG5mdW5jdGlvbiBpc1dpbmRvdyhvYmopIHtcclxuICAgIHJldHVybiBvYmogJiYgb2JqLndpbmRvdyA9PT0gb2JqO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1Njb3BlKG9iaikge1xyXG4gICAgcmV0dXJuIG9iaiAmJiBvYmouJGV2YWxBc3luYyAmJiBvYmouJHdhdGNoO1xyXG59XHJcblxyXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XHJcblxyXG5mdW5jdGlvbiBpc1N0cmluZyh2YWx1ZSkge3JldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnO31cclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgaXNBcnJheUxpa2U6IGlzQXJyYXlMaWtlLFxyXG4gICAgaXNVbmRlZmluZWQ6IGlzVW5kZWZpbmVkLFxyXG4gICAgaXNXaW5kb3c6IGlzV2luZG93LFxyXG4gICAgaXNTY29wZTogaXNTY29wZSxcclxuICAgIGlzQXJyYXk6IGlzQXJyYXksXHJcbiAgICBpc1N0cmluZzogaXNTdHJpbmdcclxufTsiLCIvLy8gPHJlZmVyZW5jZSBwYXRoPVwiYnJvd3Nlci9hbWJpZW50L2phc21pbmUvaW5kZXguZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiYnJvd3Nlci9hbWJpZW50L2xvZGFzaC9pbmRleC5kLnRzXCIgLz5cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJicm93c2VyL2FtYmllbnQvbm9kZS9pbmRleC5kLnRzXCIgLz5cbiJdfQ==
