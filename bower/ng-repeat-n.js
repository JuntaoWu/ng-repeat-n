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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmNcXGNyZWF0ZU1hcC5qcyIsInNyY1xcaGFzaEtleS5qcyIsInNyY1xcaW5kZXguanMiLCJzcmNcXG1pbkVyci5qcyIsInNyY1xcdXRpbHMuanMiLCJ0eXBpbmdzL2Jyb3dzZXIuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBLE9BQUEsQUFBTyxVQUFVLFNBQUEsQUFBUyxZQUFZLEFBQ2xDO1dBQU8sT0FBQSxBQUFPLE9BQWQsQUFBTyxBQUFjLEFBQ3hCO0FBRkQ7Ozs7QUNDQSxJQUFJLE1BQUosQUFBVTs7QUFFVixTQUFBLEFBQVMsVUFBVSxBQUNmO1dBQU8sRUFBUCxBQUFTLEFBQ1o7OztBQUVELE9BQUEsQUFBTyxVQUFVLFNBQUEsQUFBUyxRQUFULEFBQWlCLEtBQWpCLEFBQXNCLFdBQVcsQUFDOUM7UUFBSSxNQUFNLE9BQU8sSUFBakIsQUFBcUIsQUFFckI7O1FBQUEsQUFBSSxLQUFLLEFBQ0w7WUFBSSxPQUFBLEFBQU8sUUFBWCxBQUFtQixZQUFZLEFBQzNCO2tCQUFNLElBQU4sQUFBTSxBQUFJLEFBQ2I7QUFDRDtlQUFBLEFBQU8sQUFDVjtBQUVEOztRQUFJLFVBQVUsT0FBZCxBQUFxQixBQUNyQjtRQUFJLFdBQUEsQUFBVyxjQUFlLFdBQUEsQUFBVyxZQUFZLFFBQXJELEFBQTZELE1BQU8sQUFDaEU7Y0FBTSxJQUFBLEFBQUksWUFBWSxVQUFBLEFBQVUsTUFBTSxDQUFDLGFBQXZDLEFBQXNDLEFBQWMsQUFDdkQ7QUFGRCxXQUVPLEFBQ0g7Y0FBTSxVQUFBLEFBQVUsTUFBaEIsQUFBc0IsQUFDekI7QUFFRDs7V0FBQSxBQUFPLEFBQ1Y7QUFsQkQ7Ozs7QUNOQSxJQUFJLFNBQVMsUUFBYixBQUFhLEFBQVE7QUFDckIsSUFBSSxVQUFVLFFBQWQsQUFBYyxBQUFRO0FBQ3RCLElBQUksWUFBWSxRQUFoQixBQUFnQixBQUFRO0FBQ3hCLElBQUksUUFBUSxR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ZCxBQUF3QixBQUFVOzs7QUFFNUQsT0FBQSxBQUFPO2VBQVUsQUFDQSxBQUNiO2VBRmEsQUFFQSxBQUNiO1lBSGEsQUFHSCxBQUNWO1dBSmEsQUFJSixBQUNUO1dBTGEsQUFLSixBQUNUO1lBTkosQUFBaUIsQUFNSDtBQU5HLEFBQ2I7OztBQ3JDSjtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZU1hcCgpIHtcclxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpO1xyXG59IiwiXHJcbnZhciB1aWQgPSAwO1xyXG5cclxuZnVuY3Rpb24gbmV4dFVpZCgpIHtcclxuICAgIHJldHVybiArK3VpZDtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBoYXNoS2V5KG9iaiwgbmV4dFVpZEZuKSB7XHJcbiAgICB2YXIga2V5ID0gb2JqICYmIG9iai4kJGhhc2hLZXk7XHJcblxyXG4gICAgaWYgKGtleSkge1xyXG4gICAgICAgIGlmICh0eXBlb2Yga2V5ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIGtleSA9IG9iai4kJGhhc2hLZXkoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGtleTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgb2JqVHlwZSA9IHR5cGVvZiBvYmo7XHJcbiAgICBpZiAob2JqVHlwZSA9PSAnZnVuY3Rpb24nIHx8IChvYmpUeXBlID09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkpIHtcclxuICAgICAgICBrZXkgPSBvYmouJCRoYXNoS2V5ID0gb2JqVHlwZSArICc6JyArIChuZXh0VWlkRm4gfHwgbmV4dFVpZCkoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAga2V5ID0gb2JqVHlwZSArICc6JyArIG9iajtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ga2V5O1xyXG59IiwiXG52YXIgbWluRXJyID0gcmVxdWlyZShcIi4vbWluRXJyLmpzXCIpO1xudmFyIGhhc2hLZXkgPSByZXF1aXJlKFwiLi9oYXNoS2V5LmpzXCIpO1xudmFyIGNyZWF0ZU1hcCA9IHJlcXVpcmUoXCIuL2NyZWF0ZU1hcC5qc1wiKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzLmpzXCIpO1xudmFyIGlzQXJyYXlMaWtlID0gdXRpbHMuaXNBcnJheUxpa2U7XG5cbmFuZ3VsYXIubW9kdWxlKCduZy1yZXBlYXQtbi1kaXJlY3RpdmUnLCBbXSlcblxuICAuZGlyZWN0aXZlKCduZ1JlcGVhdE4nLCBbJyRwYXJzZScsICckYW5pbWF0ZScsICckY29tcGlsZScsIGZ1bmN0aW9uICgkcGFyc2UsICRhbmltYXRlLCAkY29tcGlsZSkge1xuXG4gICAgdmFyIE5HX1JFTU9WRUQgPSAnJCROR19SRU1PVkVEJztcbiAgICB2YXIgbmdSZXBlYXRNaW5FcnIgPSBtaW5FcnIoJ25nUmVwZWF0Jyk7XG5cbiAgICB2YXIgdXBkYXRlU2NvcGUgPSBmdW5jdGlvbiAoc2NvcGUsIGluZGV4LCB2YWx1ZUlkZW50aWZpZXIsIHZhbHVlLCBrZXlJZGVudGlmaWVyLCBrZXksIGFycmF5TGVuZ3RoKSB7XG4gICAgICAvLyBUT0RPKHBlcmYpOiBnZW5lcmF0ZSBzZXR0ZXJzIHRvIHNoYXZlIG9mZiB+NDBtcyBvciAxLTEuNSVcbiAgICAgIHNjb3BlW3ZhbHVlSWRlbnRpZmllcl0gPSB2YWx1ZTtcbiAgICAgIGlmIChrZXlJZGVudGlmaWVyKSBzY29wZVtrZXlJZGVudGlmaWVyXSA9IGtleTtcbiAgICAgIHNjb3BlLiRpbmRleCA9IGluZGV4O1xuICAgICAgc2NvcGUuJGZpcnN0ID0gKGluZGV4ID09PSAwKTtcbiAgICAgIHNjb3BlLiRsYXN0ID0gKGluZGV4ID09PSAoYXJyYXlMZW5ndGggLSAxKSk7XG4gICAgICBzY29wZS4kbWlkZGxlID0gIShzY29wZS4kZmlyc3QgfHwgc2NvcGUuJGxhc3QpO1xuICAgICAgLy8ganNoaW50IGJpdHdpc2U6IGZhbHNlXG4gICAgICBzY29wZS4kb2RkID0gIShzY29wZS4kZXZlbiA9IChpbmRleCAmIDEpID09PSAwKTtcbiAgICAgIC8vIGpzaGludCBiaXR3aXNlOiB0cnVlXG4gICAgfTtcblxuICAgIHZhciBnZXRCbG9ja1N0YXJ0ID0gZnVuY3Rpb24gKGJsb2NrKSB7XG4gICAgICByZXR1cm4gYmxvY2suY2xvbmVbMF07XG4gICAgfTtcblxuICAgIHZhciBnZXRCbG9ja0VuZCA9IGZ1bmN0aW9uIChibG9jaykge1xuICAgICAgcmV0dXJuIGJsb2NrLmNsb25lW2Jsb2NrLmNsb25lLmxlbmd0aCAtIDFdO1xuICAgIH07XG5cblxuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgbXVsdGlFbGVtZW50OiB0cnVlLFxuICAgICAgdHJhbnNjbHVkZTogJ2VsZW1lbnQnLFxuICAgICAgcHJpb3JpdHk6IDEwMDAsXG4gICAgICB0ZXJtaW5hbDogdHJ1ZSxcbiAgICAgICQkdGxiOiB0cnVlLFxuICAgICAgY29tcGlsZTogZnVuY3Rpb24gbmdSZXBlYXRDb21waWxlKCRlbGVtZW50LCAkYXR0cikge1xuICAgICAgICB2YXIgbmdSZXBlYXROID0gcGFyc2VJbnQoJGF0dHIubmdSZXBlYXROKTtcbiAgICAgICAgdmFyIGFycmF5ID0gbmV3IEFycmF5KG5nUmVwZWF0Tik7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGFycmF5W2ldID0gaTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBleHByZXNzaW9uID0gJ2l0ZW0gaW4gWycgKyBhcnJheS50b1N0cmluZygpICsgJ10nO1xuXG4gICAgICAgIHZhciBuZ1JlcGVhdEVuZENvbW1lbnQgPSAkY29tcGlsZS4kJGNyZWF0ZUNvbW1lbnQoJ2VuZCBuZ1JlcGVhdCcsIGV4cHJlc3Npb24pO1xuXG4gICAgICAgIHZhciBtYXRjaCA9IGV4cHJlc3Npb24ubWF0Y2goL15cXHMqKFtcXHNcXFNdKz8pXFxzK2luXFxzKyhbXFxzXFxTXSs/KSg/Olxccythc1xccysoW1xcc1xcU10rPykpPyg/Olxccyt0cmFja1xccytieVxccysoW1xcc1xcU10rPykpP1xccyokLyk7XG5cbiAgICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHRocm93IG5nUmVwZWF0TWluRXJyKCdpZXhwJywgXCJFeHBlY3RlZCBleHByZXNzaW9uIGluIGZvcm0gb2YgJ19pdGVtXyBpbiBfY29sbGVjdGlvbl9bIHRyYWNrIGJ5IF9pZF9dJyBidXQgZ290ICd7MH0nLlwiLFxuICAgICAgICAgICAgZXhwcmVzc2lvbik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGhzID0gbWF0Y2hbMV07XG4gICAgICAgIHZhciByaHMgPSBtYXRjaFsyXTtcbiAgICAgICAgdmFyIGFsaWFzQXMgPSBtYXRjaFszXTtcbiAgICAgICAgdmFyIHRyYWNrQnlFeHAgPSBtYXRjaFs0XTtcblxuICAgICAgICBtYXRjaCA9IGxocy5tYXRjaCgvXig/OihcXHMqW1xcJFxcd10rKXxcXChcXHMqKFtcXCRcXHddKylcXHMqLFxccyooW1xcJFxcd10rKVxccypcXCkpJC8pO1xuXG4gICAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZ1JlcGVhdE1pbkVycignaWlkZXhwJywgXCInX2l0ZW1fJyBpbiAnX2l0ZW1fIGluIF9jb2xsZWN0aW9uXycgc2hvdWxkIGJlIGFuIGlkZW50aWZpZXIgb3IgJyhfa2V5XywgX3ZhbHVlXyknIGV4cHJlc3Npb24sIGJ1dCBnb3QgJ3swfScuXCIsXG4gICAgICAgICAgICBsaHMpO1xuICAgICAgICB9XG4gICAgICAgIHZhciB2YWx1ZUlkZW50aWZpZXIgPSBtYXRjaFszXSB8fCBtYXRjaFsxXTtcbiAgICAgICAgdmFyIGtleUlkZW50aWZpZXIgPSBtYXRjaFsyXTtcblxuICAgICAgICBpZiAoYWxpYXNBcyAmJiAoIS9eWyRhLXpBLVpfXVskYS16QS1aMC05X10qJC8udGVzdChhbGlhc0FzKSB8fFxuICAgICAgICAgIC9eKG51bGx8dW5kZWZpbmVkfHRoaXN8XFwkaW5kZXh8XFwkZmlyc3R8XFwkbWlkZGxlfFxcJGxhc3R8XFwkZXZlbnxcXCRvZGR8XFwkcGFyZW50fFxcJHJvb3R8XFwkaWQpJC8udGVzdChhbGlhc0FzKSkpIHtcbiAgICAgICAgICB0aHJvdyBuZ1JlcGVhdE1pbkVycignYmFkaWRlbnQnLCBcImFsaWFzICd7MH0nIGlzIGludmFsaWQgLS0tIG11c3QgYmUgYSB2YWxpZCBKUyBpZGVudGlmaWVyIHdoaWNoIGlzIG5vdCBhIHJlc2VydmVkIG5hbWUuXCIsXG4gICAgICAgICAgICBhbGlhc0FzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0cmFja0J5RXhwR2V0dGVyLCB0cmFja0J5SWRFeHBGbiwgdHJhY2tCeUlkQXJyYXlGbiwgdHJhY2tCeUlkT2JqRm47XG4gICAgICAgIHZhciBoYXNoRm5Mb2NhbHMgPSB7ICRpZDogaGFzaEtleSB9O1xuXG4gICAgICAgIGlmICh0cmFja0J5RXhwKSB7XG4gICAgICAgICAgdHJhY2tCeUV4cEdldHRlciA9ICRwYXJzZSh0cmFja0J5RXhwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cmFja0J5SWRBcnJheUZuID0gZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiBoYXNoS2V5KHZhbHVlKTtcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRyYWNrQnlJZE9iakZuID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5nUmVwZWF0TGluaygkc2NvcGUsICRlbGVtZW50LCAkYXR0ciwgY3RybCwgJHRyYW5zY2x1ZGUpIHtcblxuICAgICAgICAgIGlmICh0cmFja0J5RXhwR2V0dGVyKSB7XG4gICAgICAgICAgICB0cmFja0J5SWRFeHBGbiA9IGZ1bmN0aW9uIChrZXksIHZhbHVlLCBpbmRleCkge1xuICAgICAgICAgICAgICAvLyBhc3NpZ24ga2V5LCB2YWx1ZSwgYW5kICRpbmRleCB0byB0aGUgbG9jYWxzIHNvIHRoYXQgdGhleSBjYW4gYmUgdXNlZCBpbiBoYXNoIGZ1bmN0aW9uc1xuICAgICAgICAgICAgICBpZiAoa2V5SWRlbnRpZmllcikgaGFzaEZuTG9jYWxzW2tleUlkZW50aWZpZXJdID0ga2V5O1xuICAgICAgICAgICAgICBoYXNoRm5Mb2NhbHNbdmFsdWVJZGVudGlmaWVyXSA9IHZhbHVlO1xuICAgICAgICAgICAgICBoYXNoRm5Mb2NhbHMuJGluZGV4ID0gaW5kZXg7XG4gICAgICAgICAgICAgIHJldHVybiB0cmFja0J5RXhwR2V0dGVyKCRzY29wZSwgaGFzaEZuTG9jYWxzKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gU3RvcmUgYSBsaXN0IG9mIGVsZW1lbnRzIGZyb20gcHJldmlvdXMgcnVuLiBUaGlzIGlzIGEgaGFzaCB3aGVyZSBrZXkgaXMgdGhlIGl0ZW0gZnJvbSB0aGVcbiAgICAgICAgICAvLyBpdGVyYXRvciwgYW5kIHRoZSB2YWx1ZSBpcyBvYmplY3RzIHdpdGggZm9sbG93aW5nIHByb3BlcnRpZXMuXG4gICAgICAgICAgLy8gICAtIHNjb3BlOiBib3VuZCBzY29wZVxuICAgICAgICAgIC8vICAgLSBlbGVtZW50OiBwcmV2aW91cyBlbGVtZW50LlxuICAgICAgICAgIC8vICAgLSBpbmRleDogcG9zaXRpb25cbiAgICAgICAgICAvL1xuICAgICAgICAgIC8vIFdlIGFyZSB1c2luZyBuby1wcm90byBvYmplY3Qgc28gdGhhdCB3ZSBkb24ndCBuZWVkIHRvIGd1YXJkIGFnYWluc3QgaW5oZXJpdGVkIHByb3BzIHZpYVxuICAgICAgICAgIC8vIGhhc093blByb3BlcnR5LlxuICAgICAgICAgIHZhciBsYXN0QmxvY2tNYXAgPSBjcmVhdGVNYXAoKTtcblxuICAgICAgICAgIC8vd2F0Y2ggcHJvcHNcbiAgICAgICAgICAkc2NvcGUuJHdhdGNoQ29sbGVjdGlvbihyaHMsIGZ1bmN0aW9uIG5nUmVwZWF0QWN0aW9uKGNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgIHZhciBpbmRleCwgbGVuZ3RoLFxuICAgICAgICAgICAgICBwcmV2aW91c05vZGUgPSAkZWxlbWVudFswXSwgICAgIC8vIG5vZGUgdGhhdCBjbG9uZWQgbm9kZXMgc2hvdWxkIGJlIGluc2VydGVkIGFmdGVyXG4gICAgICAgICAgICAgIC8vIGluaXRpYWxpemVkIHRvIHRoZSBjb21tZW50IG5vZGUgYW5jaG9yXG4gICAgICAgICAgICAgIG5leHROb2RlLFxuICAgICAgICAgICAgICAvLyBTYW1lIGFzIGxhc3RCbG9ja01hcCBidXQgaXQgaGFzIHRoZSBjdXJyZW50IHN0YXRlLiBJdCB3aWxsIGJlY29tZSB0aGVcbiAgICAgICAgICAgICAgLy8gbGFzdEJsb2NrTWFwIG9uIHRoZSBuZXh0IGl0ZXJhdGlvbi5cbiAgICAgICAgICAgICAgbmV4dEJsb2NrTWFwID0gY3JlYXRlTWFwKCksXG4gICAgICAgICAgICAgIGNvbGxlY3Rpb25MZW5ndGgsXG4gICAgICAgICAgICAgIGtleSwgdmFsdWUsIC8vIGtleS92YWx1ZSBvZiBpdGVyYXRpb25cbiAgICAgICAgICAgICAgdHJhY2tCeUlkLFxuICAgICAgICAgICAgICB0cmFja0J5SWRGbixcbiAgICAgICAgICAgICAgY29sbGVjdGlvbktleXMsXG4gICAgICAgICAgICAgIGJsb2NrLCAgICAgICAvLyBsYXN0IG9iamVjdCBpbmZvcm1hdGlvbiB7c2NvcGUsIGVsZW1lbnQsIGlkfVxuICAgICAgICAgICAgICBuZXh0QmxvY2tPcmRlcixcbiAgICAgICAgICAgICAgZWxlbWVudHNUb1JlbW92ZTtcblxuICAgICAgICAgICAgaWYgKGFsaWFzQXMpIHtcbiAgICAgICAgICAgICAgJHNjb3BlW2FsaWFzQXNdID0gY29sbGVjdGlvbjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzQXJyYXlMaWtlKGNvbGxlY3Rpb24pKSB7XG4gICAgICAgICAgICAgIGNvbGxlY3Rpb25LZXlzID0gY29sbGVjdGlvbjtcbiAgICAgICAgICAgICAgdHJhY2tCeUlkRm4gPSB0cmFja0J5SWRFeHBGbiB8fCB0cmFja0J5SWRBcnJheUZuO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdHJhY2tCeUlkRm4gPSB0cmFja0J5SWRFeHBGbiB8fCB0cmFja0J5SWRPYmpGbjtcbiAgICAgICAgICAgICAgLy8gaWYgb2JqZWN0LCBleHRyYWN0IGtleXMsIGluIGVudW1lcmF0aW9uIG9yZGVyLCB1bnNvcnRlZFxuICAgICAgICAgICAgICBjb2xsZWN0aW9uS2V5cyA9IFtdO1xuICAgICAgICAgICAgICBmb3IgKHZhciBpdGVtS2V5IGluIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChjb2xsZWN0aW9uLCBpdGVtS2V5KSAmJiBpdGVtS2V5LmNoYXJBdCgwKSAhPT0gJyQnKSB7XG4gICAgICAgICAgICAgICAgICBjb2xsZWN0aW9uS2V5cy5wdXNoKGl0ZW1LZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb2xsZWN0aW9uTGVuZ3RoID0gY29sbGVjdGlvbktleXMubGVuZ3RoO1xuICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXIgPSBuZXcgQXJyYXkoY29sbGVjdGlvbkxlbmd0aCk7XG5cbiAgICAgICAgICAgIC8vIGxvY2F0ZSBleGlzdGluZyBpdGVtc1xuICAgICAgICAgICAgZm9yIChpbmRleCA9IDA7IGluZGV4IDwgY29sbGVjdGlvbkxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICBrZXkgPSAoY29sbGVjdGlvbiA9PT0gY29sbGVjdGlvbktleXMpID8gaW5kZXggOiBjb2xsZWN0aW9uS2V5c1tpbmRleF07XG4gICAgICAgICAgICAgIHZhbHVlID0gY29sbGVjdGlvbltrZXldO1xuICAgICAgICAgICAgICB0cmFja0J5SWQgPSB0cmFja0J5SWRGbihrZXksIHZhbHVlLCBpbmRleCk7XG4gICAgICAgICAgICAgIGlmIChsYXN0QmxvY2tNYXBbdHJhY2tCeUlkXSkge1xuICAgICAgICAgICAgICAgIC8vIGZvdW5kIHByZXZpb3VzbHkgc2VlbiBibG9ja1xuICAgICAgICAgICAgICAgIGJsb2NrID0gbGFzdEJsb2NrTWFwW3RyYWNrQnlJZF07XG4gICAgICAgICAgICAgICAgZGVsZXRlIGxhc3RCbG9ja01hcFt0cmFja0J5SWRdO1xuICAgICAgICAgICAgICAgIG5leHRCbG9ja01hcFt0cmFja0J5SWRdID0gYmxvY2s7XG4gICAgICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXJbaW5kZXhdID0gYmxvY2s7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAobmV4dEJsb2NrTWFwW3RyYWNrQnlJZF0pIHtcbiAgICAgICAgICAgICAgICAvLyBpZiBjb2xsaXNpb24gZGV0ZWN0ZWQuIHJlc3RvcmUgbGFzdEJsb2NrTWFwIGFuZCB0aHJvdyBhbiBlcnJvclxuICAgICAgICAgICAgICAgIGZvckVhY2gobmV4dEJsb2NrT3JkZXIsIGZ1bmN0aW9uIChibG9jaykge1xuICAgICAgICAgICAgICAgICAgaWYgKGJsb2NrICYmIGJsb2NrLnNjb3BlKSBsYXN0QmxvY2tNYXBbYmxvY2suaWRdID0gYmxvY2s7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmdSZXBlYXRNaW5FcnIoJ2R1cGVzJyxcbiAgICAgICAgICAgICAgICAgIFwiRHVwbGljYXRlcyBpbiBhIHJlcGVhdGVyIGFyZSBub3QgYWxsb3dlZC4gVXNlICd0cmFjayBieScgZXhwcmVzc2lvbiB0byBzcGVjaWZ5IHVuaXF1ZSBrZXlzLiBSZXBlYXRlcjogezB9LCBEdXBsaWNhdGUga2V5OiB7MX0sIER1cGxpY2F0ZSB2YWx1ZTogezJ9XCIsXG4gICAgICAgICAgICAgICAgICBleHByZXNzaW9uLCB0cmFja0J5SWQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBuZXcgbmV2ZXIgYmVmb3JlIHNlZW4gYmxvY2tcbiAgICAgICAgICAgICAgICBuZXh0QmxvY2tPcmRlcltpbmRleF0gPSB7IGlkOiB0cmFja0J5SWQsIHNjb3BlOiB1bmRlZmluZWQsIGNsb25lOiB1bmRlZmluZWQgfTtcbiAgICAgICAgICAgICAgICBuZXh0QmxvY2tNYXBbdHJhY2tCeUlkXSA9IHRydWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcmVtb3ZlIGxlZnRvdmVyIGl0ZW1zXG4gICAgICAgICAgICBmb3IgKHZhciBibG9ja0tleSBpbiBsYXN0QmxvY2tNYXApIHtcbiAgICAgICAgICAgICAgYmxvY2sgPSBsYXN0QmxvY2tNYXBbYmxvY2tLZXldO1xuICAgICAgICAgICAgICBlbGVtZW50c1RvUmVtb3ZlID0gZ2V0QmxvY2tOb2RlcyhibG9jay5jbG9uZSk7XG4gICAgICAgICAgICAgICRhbmltYXRlLmxlYXZlKGVsZW1lbnRzVG9SZW1vdmUpO1xuICAgICAgICAgICAgICBpZiAoZWxlbWVudHNUb1JlbW92ZVswXS5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgdGhlIGVsZW1lbnQgd2FzIG5vdCByZW1vdmVkIHlldCBiZWNhdXNlIG9mIHBlbmRpbmcgYW5pbWF0aW9uLCBtYXJrIGl0IGFzIGRlbGV0ZWRcbiAgICAgICAgICAgICAgICAvLyBzbyB0aGF0IHdlIGNhbiBpZ25vcmUgaXQgbGF0ZXJcbiAgICAgICAgICAgICAgICBmb3IgKGluZGV4ID0gMCwgbGVuZ3RoID0gZWxlbWVudHNUb1JlbW92ZS5sZW5ndGg7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgICBlbGVtZW50c1RvUmVtb3ZlW2luZGV4XVtOR19SRU1PVkVEXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGJsb2NrLnNjb3BlLiRkZXN0cm95KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHdlIGFyZSBub3QgdXNpbmcgZm9yRWFjaCBmb3IgcGVyZiByZWFzb25zICh0cnlpbmcgdG8gYXZvaWQgI2NhbGwpXG4gICAgICAgICAgICBmb3IgKGluZGV4ID0gMDsgaW5kZXggPCBjb2xsZWN0aW9uTGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICAgIGtleSA9IChjb2xsZWN0aW9uID09PSBjb2xsZWN0aW9uS2V5cykgPyBpbmRleCA6IGNvbGxlY3Rpb25LZXlzW2luZGV4XTtcbiAgICAgICAgICAgICAgdmFsdWUgPSBjb2xsZWN0aW9uW2tleV07XG4gICAgICAgICAgICAgIGJsb2NrID0gbmV4dEJsb2NrT3JkZXJbaW5kZXhdO1xuXG4gICAgICAgICAgICAgIGlmIChibG9jay5zY29wZSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHdlIGhhdmUgYWxyZWFkeSBzZWVuIHRoaXMgb2JqZWN0LCB0aGVuIHdlIG5lZWQgdG8gcmV1c2UgdGhlXG4gICAgICAgICAgICAgICAgLy8gYXNzb2NpYXRlZCBzY29wZS9lbGVtZW50XG5cbiAgICAgICAgICAgICAgICBuZXh0Tm9kZSA9IHByZXZpb3VzTm9kZTtcblxuICAgICAgICAgICAgICAgIC8vIHNraXAgbm9kZXMgdGhhdCBhcmUgYWxyZWFkeSBwZW5kaW5nIHJlbW92YWwgdmlhIGxlYXZlIGFuaW1hdGlvblxuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgIG5leHROb2RlID0gbmV4dE5vZGUubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAobmV4dE5vZGUgJiYgbmV4dE5vZGVbTkdfUkVNT1ZFRF0pO1xuXG4gICAgICAgICAgICAgICAgaWYgKGdldEJsb2NrU3RhcnQoYmxvY2spICE9IG5leHROb2RlKSB7XG4gICAgICAgICAgICAgICAgICAvLyBleGlzdGluZyBpdGVtIHdoaWNoIGdvdCBtb3ZlZFxuICAgICAgICAgICAgICAgICAgJGFuaW1hdGUubW92ZShnZXRCbG9ja05vZGVzKGJsb2NrLmNsb25lKSwgbnVsbCwgcHJldmlvdXNOb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gZ2V0QmxvY2tFbmQoYmxvY2spO1xuICAgICAgICAgICAgICAgIHVwZGF0ZVNjb3BlKGJsb2NrLnNjb3BlLCBpbmRleCwgdmFsdWVJZGVudGlmaWVyLCB2YWx1ZSwga2V5SWRlbnRpZmllciwga2V5LCBjb2xsZWN0aW9uTGVuZ3RoKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBuZXcgaXRlbSB3aGljaCB3ZSBkb24ndCBrbm93IGFib3V0XG4gICAgICAgICAgICAgICAgJHRyYW5zY2x1ZGUoZnVuY3Rpb24gbmdSZXBlYXRUcmFuc2NsdWRlKGNsb25lLCBzY29wZSkge1xuICAgICAgICAgICAgICAgICAgYmxvY2suc2NvcGUgPSBzY29wZTtcbiAgICAgICAgICAgICAgICAgIC8vIGh0dHA6Ly9qc3BlcmYuY29tL2Nsb25lLXZzLWNyZWF0ZWNvbW1lbnRcbiAgICAgICAgICAgICAgICAgIHZhciBlbmROb2RlID0gbmdSZXBlYXRFbmRDb21tZW50LmNsb25lTm9kZShmYWxzZSk7XG4gICAgICAgICAgICAgICAgICBjbG9uZVtjbG9uZS5sZW5ndGgrK10gPSBlbmROb2RlO1xuXG4gICAgICAgICAgICAgICAgICAkYW5pbWF0ZS5lbnRlcihjbG9uZSwgbnVsbCwgcHJldmlvdXNOb2RlKTtcbiAgICAgICAgICAgICAgICAgIHByZXZpb3VzTm9kZSA9IGVuZE5vZGU7XG4gICAgICAgICAgICAgICAgICAvLyBOb3RlOiBXZSBvbmx5IG5lZWQgdGhlIGZpcnN0L2xhc3Qgbm9kZSBvZiB0aGUgY2xvbmVkIG5vZGVzLlxuICAgICAgICAgICAgICAgICAgLy8gSG93ZXZlciwgd2UgbmVlZCB0byBrZWVwIHRoZSByZWZlcmVuY2UgdG8gdGhlIGpxbGl0ZSB3cmFwcGVyIGFzIGl0IG1pZ2h0IGJlIGNoYW5nZWQgbGF0ZXJcbiAgICAgICAgICAgICAgICAgIC8vIGJ5IGEgZGlyZWN0aXZlIHdpdGggdGVtcGxhdGVVcmwgd2hlbiBpdHMgdGVtcGxhdGUgYXJyaXZlcy5cbiAgICAgICAgICAgICAgICAgIGJsb2NrLmNsb25lID0gY2xvbmU7XG4gICAgICAgICAgICAgICAgICBuZXh0QmxvY2tNYXBbYmxvY2suaWRdID0gYmxvY2s7XG4gICAgICAgICAgICAgICAgICB1cGRhdGVTY29wZShibG9jay5zY29wZSwgaW5kZXgsIHZhbHVlSWRlbnRpZmllciwgdmFsdWUsIGtleUlkZW50aWZpZXIsIGtleSwgY29sbGVjdGlvbkxlbmd0aCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxhc3RCbG9ja01hcCA9IG5leHRCbG9ja01hcDtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7IiwiXHJcbnZhciB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzLmpzXCIpO1xyXG52YXIgaXNBcnJheUxpa2UgPSB1dGlscy5pc0FycmF5TGlrZTtcclxudmFyIGlzVW5kZWZpbmVkID0gdXRpbHMuaXNVbmRlZmluZWQ7XHJcbnZhciBpc1dpbmRvdyA9IHV0aWxzLmlzV2luZG93O1xyXG52YXIgaXNTY29wZSA9IHV0aWxzLmlzU2NvcGU7XHJcblxyXG5mdW5jdGlvbiB0b0pzb25SZXBsYWNlcihrZXksIHZhbHVlKSB7XHJcbiAgICB2YXIgdmFsID0gdmFsdWU7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnICYmIGtleS5jaGFyQXQoMCkgPT09ICckJyAmJiBrZXkuY2hhckF0KDEpID09PSAnJCcpIHtcclxuICAgICAgICB2YWwgPSB1bmRlZmluZWQ7XHJcbiAgICB9IGVsc2UgaWYgKGlzV2luZG93KHZhbHVlKSkge1xyXG4gICAgICAgIHZhbCA9ICckV0lORE9XJztcclxuICAgIH0gZWxzZSBpZiAodmFsdWUgJiYgd2luZG93LmRvY3VtZW50ID09PSB2YWx1ZSkge1xyXG4gICAgICAgIHZhbCA9ICckRE9DVU1FTlQnO1xyXG4gICAgfSBlbHNlIGlmIChpc1Njb3BlKHZhbHVlKSkge1xyXG4gICAgICAgIHZhbCA9ICckU0NPUEUnO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB2YWw7XHJcbn1cclxuXHJcbi8qIGdsb2JhbCB0b0RlYnVnU3RyaW5nOiB0cnVlICovXHJcblxyXG5mdW5jdGlvbiBzZXJpYWxpemVPYmplY3Qob2JqKSB7XHJcbiAgICB2YXIgc2VlbiA9IFtdO1xyXG5cclxuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShvYmosIGZ1bmN0aW9uIChrZXksIHZhbCkge1xyXG4gICAgICAgIHZhbCA9IHRvSnNvblJlcGxhY2VyKGtleSwgdmFsKTtcclxuICAgICAgICBpZiAoaXNPYmplY3QodmFsKSkge1xyXG5cclxuICAgICAgICAgICAgaWYgKHNlZW4uaW5kZXhPZih2YWwpID49IDApIHJldHVybiAnLi4uJztcclxuXHJcbiAgICAgICAgICAgIHNlZW4ucHVzaCh2YWwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdmFsO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRvRGVidWdTdHJpbmcob2JqKSB7XHJcbiAgICBpZiAodHlwZW9mIG9iaiA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHJldHVybiBvYmoudG9TdHJpbmcoKS5yZXBsYWNlKC8gXFx7W1xcc1xcU10qJC8sICcnKTtcclxuICAgIH0gZWxzZSBpZiAoaXNVbmRlZmluZWQob2JqKSkge1xyXG4gICAgICAgIHJldHVybiAndW5kZWZpbmVkJztcclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIG9iaiAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgICByZXR1cm4gc2VyaWFsaXplT2JqZWN0KG9iaik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gb2JqO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG1pbkVycihtb2R1bGUsIEVycm9yQ29uc3RydWN0b3IpIHtcclxuICAgIEVycm9yQ29uc3RydWN0b3IgPSBFcnJvckNvbnN0cnVjdG9yIHx8IEVycm9yO1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICB2YXIgU0tJUF9JTkRFWEVTID0gMjtcclxuXHJcbiAgICAgICAgdmFyIHRlbXBsYXRlQXJncyA9IGFyZ3VtZW50cyxcclxuICAgICAgICAgICAgY29kZSA9IHRlbXBsYXRlQXJnc1swXSxcclxuICAgICAgICAgICAgbWVzc2FnZSA9ICdbJyArIChtb2R1bGUgPyBtb2R1bGUgKyAnOicgOiAnJykgKyBjb2RlICsgJ10gJyxcclxuICAgICAgICAgICAgdGVtcGxhdGUgPSB0ZW1wbGF0ZUFyZ3NbMV0sXHJcbiAgICAgICAgICAgIHBhcmFtUHJlZml4LCBpO1xyXG5cclxuICAgICAgICBtZXNzYWdlICs9IHRlbXBsYXRlLnJlcGxhY2UoL1xce1xcZCtcXH0vZywgZnVuY3Rpb24gKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIHZhciBpbmRleCA9ICttYXRjaC5zbGljZSgxLCAtMSksXHJcbiAgICAgICAgICAgICAgICBzaGlmdGVkSW5kZXggPSBpbmRleCArIFNLSVBfSU5ERVhFUztcclxuXHJcbiAgICAgICAgICAgIGlmIChzaGlmdGVkSW5kZXggPCB0ZW1wbGF0ZUFyZ3MubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdG9EZWJ1Z1N0cmluZyh0ZW1wbGF0ZUFyZ3Nbc2hpZnRlZEluZGV4XSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbWVzc2FnZSArPSAnXFxuaHR0cDovL2Vycm9ycy5hbmd1bGFyanMub3JnLzEuNS44LycgK1xyXG4gICAgICAgICAgICAobW9kdWxlID8gbW9kdWxlICsgJy8nIDogJycpICsgY29kZTtcclxuXHJcbiAgICAgICAgZm9yIChpID0gU0tJUF9JTkRFWEVTLCBwYXJhbVByZWZpeCA9ICc/JzsgaSA8IHRlbXBsYXRlQXJncy5sZW5ndGg7IGkrKyAsIHBhcmFtUHJlZml4ID0gJyYnKSB7XHJcbiAgICAgICAgICAgIG1lc3NhZ2UgKz0gcGFyYW1QcmVmaXggKyAncCcgKyAoaSAtIFNLSVBfSU5ERVhFUykgKyAnPScgK1xyXG4gICAgICAgICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHRvRGVidWdTdHJpbmcodGVtcGxhdGVBcmdzW2ldKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gbmV3IEVycm9yQ29uc3RydWN0b3IobWVzc2FnZSk7XHJcbiAgICB9O1xyXG59IiwiZnVuY3Rpb24gaXNBcnJheUxpa2Uob2JqKSB7XHJcblxyXG4gIC8vIGBudWxsYCwgYHVuZGVmaW5lZGAgYW5kIGB3aW5kb3dgIGFyZSBub3QgYXJyYXktbGlrZVxyXG4gIGlmIChvYmogPT0gbnVsbCB8fCBpc1dpbmRvdyhvYmopKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gIC8vIGFycmF5cywgc3RyaW5ncyBhbmQgalF1ZXJ5L2pxTGl0ZSBvYmplY3RzIGFyZSBhcnJheSBsaWtlXHJcbiAgLy8gKiBqcUxpdGUgaXMgZWl0aGVyIHRoZSBqUXVlcnkgb3IganFMaXRlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uXHJcbiAgLy8gKiB3ZSBoYXZlIHRvIGNoZWNrIHRoZSBleGlzdGVuY2Ugb2YganFMaXRlIGZpcnN0IGFzIHRoaXMgbWV0aG9kIGlzIGNhbGxlZFxyXG4gIC8vICAgdmlhIHRoZSBmb3JFYWNoIG1ldGhvZCB3aGVuIGNvbnN0cnVjdGluZyB0aGUganFMaXRlIG9iamVjdCBpbiB0aGUgZmlyc3QgcGxhY2VcclxuICBpZiAoaXNBcnJheShvYmopIHx8IGlzU3RyaW5nKG9iaikgfHwgKGpxTGl0ZSAmJiBvYmogaW5zdGFuY2VvZiBqcUxpdGUpKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgLy8gU3VwcG9ydDogaU9TIDguMiAobm90IHJlcHJvZHVjaWJsZSBpbiBzaW11bGF0b3IpXHJcbiAgLy8gXCJsZW5ndGhcIiBpbiBvYmogdXNlZCB0byBwcmV2ZW50IEpJVCBlcnJvciAoZ2gtMTE1MDgpXHJcbiAgdmFyIGxlbmd0aCA9IFwibGVuZ3RoXCIgaW4gT2JqZWN0KG9iaikgJiYgb2JqLmxlbmd0aDtcclxuXHJcbiAgLy8gTm9kZUxpc3Qgb2JqZWN0cyAod2l0aCBgaXRlbWAgbWV0aG9kKSBhbmRcclxuICAvLyBvdGhlciBvYmplY3RzIHdpdGggc3VpdGFibGUgbGVuZ3RoIGNoYXJhY3RlcmlzdGljcyBhcmUgYXJyYXktbGlrZVxyXG4gIHJldHVybiBpc051bWJlcihsZW5ndGgpICYmXHJcbiAgICAobGVuZ3RoID49IDAgJiYgKChsZW5ndGggLSAxKSBpbiBvYmogfHwgb2JqIGluc3RhbmNlb2YgQXJyYXkpIHx8IHR5cGVvZiBvYmouaXRlbSA9PSAnZnVuY3Rpb24nKTtcclxuXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKHZhbHVlKSB7cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCc7fVxyXG5cclxuZnVuY3Rpb24gaXNXaW5kb3cob2JqKSB7XHJcbiAgICByZXR1cm4gb2JqICYmIG9iai53aW5kb3cgPT09IG9iajtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNTY29wZShvYmopIHtcclxuICAgIHJldHVybiBvYmogJiYgb2JqLiRldmFsQXN5bmMgJiYgb2JqLiR3YXRjaDtcclxufVxyXG5cclxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xyXG5cclxuZnVuY3Rpb24gaXNTdHJpbmcodmFsdWUpIHtyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJzt9XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIGlzQXJyYXlMaWtlOiBpc0FycmF5TGlrZSxcclxuICAgIGlzVW5kZWZpbmVkOiBpc1VuZGVmaW5lZCxcclxuICAgIGlzV2luZG93OiBpc1dpbmRvdyxcclxuICAgIGlzU2NvcGU6IGlzU2NvcGUsXHJcbiAgICBpc0FycmF5OiBpc0FycmF5LFxyXG4gICAgaXNTdHJpbmc6IGlzU3RyaW5nXHJcbn07IiwiLy8vIDxyZWZlcmVuY2UgcGF0aD1cImJyb3dzZXIvYW1iaWVudC9qYXNtaW5lL2luZGV4LmQudHNcIiAvPlxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cImJyb3dzZXIvYW1iaWVudC9sb2Rhc2gvaW5kZXguZC50c1wiIC8+XG4vLy8gPHJlZmVyZW5jZSBwYXRoPVwiYnJvd3Nlci9hbWJpZW50L25vZGUvaW5kZXguZC50c1wiIC8+XG4iXX0=
