(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
"use strict";
function createMap() {
    return Object.create(null);
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createMap;
},{}],3:[function(require,module,exports){
"use strict";
var uid = 0;
function nextUid() {
    return ++uid;
}
function hashKey(obj, nextUidFn) {
    var key = obj && obj.$$hashKey;
    if (key) {
        if (typeof key === 'function') {
            key = obj.$$hashKey();
        }
        return key;
    }
    var objType = typeof obj;
    if (objType == 'function' || (objType == 'object' && obj !== null)) {
        key = obj.$$hashKey = objType + ':' + (nextUidFn || nextUid)();
    }
    else {
        key = objType + ':' + obj;
    }
    return key;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = hashKey;
},{}],4:[function(require,module,exports){
"use strict";
const minErr_1 = require("./minErr");
const hashKey_1 = require("./hashKey");
const createMap_1 = require("./createMap");
const utils_1 = require("./utils");
const angular_d_1 = require("./angular.d");
var isArrayLike = utils_1.default.isArrayLike;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var isArray = utils_1.default.isArray;
var isFunction = utils_1.default.isFuntion;
var isBlankObject = utils_1.default.isBlankObject;
var slice = [].slice;
var forEach = utils_1.default.forEach;
var getBlockNodes = utils_1.default.getBlockNodes;
angular_d_1.angular.module('ng-repeat-n-directive', [])
    .directive('ngRepeatN', ['$parse', '$animate', '$compile', function ($parse, $animate, $compile) {
        var NG_REMOVED = '$$NG_REMOVED';
        var ngRepeatMinErr = minErr_1.default('ngRepeat');
        var updateScope = function (scope, index, valueIdentifier, value, keyIdentifier, key, arrayLength) {
            // TODO(perf): generate setters to shave off ~40ms or 1-1.5%
            scope[valueIdentifier] = value;
            if (keyIdentifier)
                scope[keyIdentifier] = key;
            scope.$index = index;
            scope.$first = (index === 0);
            scope.$last = (index === (arrayLength - 1));
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
                if (aliasAs && (!/^[$a-zA-Z_][$a-zA-Z0-9_]*$/.test(aliasAs) ||
                    /^(null|undefined|this|\$index|\$first|\$middle|\$last|\$even|\$odd|\$parent|\$root|\$id)$/.test(aliasAs))) {
                    throw ngRepeatMinErr('badident', "alias '{0}' is invalid --- must be a valid JS identifier which is not a reserved name.", aliasAs);
                }
                var trackByExpGetter, trackByIdExpFn, trackByIdArrayFn, trackByIdObjFn;
                var hashFnLocals = { $id: hashKey_1.default };
                if (trackByExp) {
                    trackByExpGetter = $parse(trackByExp);
                }
                else {
                    trackByIdArrayFn = function (key, value) {
                        return hashKey_1.default(value);
                    };
                    trackByIdObjFn = function (key) {
                        return key;
                    };
                }
                return function ngRepeatLink($scope, $element, $attr, ctrl, $transclude) {
                    if (trackByExpGetter) {
                        trackByIdExpFn = function (key, value, index) {
                            // assign key, value, and $index to the locals so that they can be used in hash functions
                            if (keyIdentifier)
                                hashFnLocals[keyIdentifier] = key;
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
                    var lastBlockMap = createMap_1.default();
                    //watch props
                    $scope.$watchCollection(rhs, function ngRepeatAction(collection) {
                        var index, length, previousNode = $element[0], // node that cloned nodes should be inserted after
                        // initialized to the comment node anchor
                        nextNode, 
                        // Same as lastBlockMap but it has the current state. It will become the
                        // lastBlockMap on the next iteration.
                        nextBlockMap = createMap_1.default(), collectionLength, key, value, // key/value of iteration
                        trackById, trackByIdFn, collectionKeys, block, // last object information {scope, element, id}
                        nextBlockOrder, elementsToRemove;
                        if (aliasAs) {
                            $scope[aliasAs] = collection;
                        }
                        if (isArrayLike(collection)) {
                            collectionKeys = collection;
                            trackByIdFn = trackByIdExpFn || trackByIdArrayFn;
                        }
                        else {
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
                            key = (collection === collectionKeys) ? index : collectionKeys[index];
                            value = collection[key];
                            trackById = trackByIdFn(key, value, index);
                            if (lastBlockMap[trackById]) {
                                // found previously seen block
                                block = lastBlockMap[trackById];
                                delete lastBlockMap[trackById];
                                nextBlockMap[trackById] = block;
                                nextBlockOrder[index] = block;
                            }
                            else if (nextBlockMap[trackById]) {
                                // if collision detected. restore lastBlockMap and throw an error
                                forEach(nextBlockOrder, function (block) {
                                    if (block && block.scope)
                                        lastBlockMap[block.id] = block;
                                });
                                throw ngRepeatMinErr('dupes', "Duplicates in a repeater are not allowed. Use 'track by' expression to specify unique keys. Repeater: {0}, Duplicate key: {1}, Duplicate value: {2}", expression, trackById, value);
                            }
                            else {
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
                            key = (collection === collectionKeys) ? index : collectionKeys[index];
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
                            }
                            else {
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
},{"./angular.d":1,"./createMap":2,"./hashKey":3,"./minErr":5,"./utils":6}],5:[function(require,module,exports){
"use strict";
const utils_1 = require("./utils");
var isArrayLike = utils_1.default.isArrayLike;
var isUndefined = utils_1.default.isUndefined;
var isWindow = utils_1.default.isWindow;
var isScope = utils_1.default.isScope;
var isObject = utils_1.default.isObject;
function toJsonReplacer(key, value) {
    var val = value;
    if (typeof key === 'string' && key.charAt(0) === '$' && key.charAt(1) === '$') {
        val = undefined;
    }
    else if (isWindow(value)) {
        val = '$WINDOW';
    }
    else if (value && window.document === value) {
        val = '$DOCUMENT';
    }
    else if (isScope(value)) {
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
            if (seen.indexOf(val) >= 0)
                return '...';
            seen.push(val);
        }
        return val;
    });
}
function toDebugString(obj) {
    if (typeof obj === 'function') {
        return obj.toString().replace(/ \{[\s\S]*$/, '');
    }
    else if (isUndefined(obj)) {
        return 'undefined';
    }
    else if (typeof obj !== 'string') {
        return serializeObject(obj);
    }
    return obj;
}
function default_1(module, ErrorConstructor) {
    ErrorConstructor = ErrorConstructor || Error;
    return function () {
        var SKIP_INDEXES = 2;
        var templateArgs = arguments, code = templateArgs[0], message = '[' + (module ? module + ':' : '') + code + '] ', template = templateArgs[1], paramPrefix, i;
        message += template.replace(/\{\d+\}/g, function (match) {
            var index = +match.slice(1, -1), shiftedIndex = index + SKIP_INDEXES;
            if (shiftedIndex < templateArgs.length) {
                return toDebugString(templateArgs[shiftedIndex]);
            }
            return match;
        });
        message += '\nhttp://errors.angularjs.org/1.5.8/' +
            (module ? module + '/' : '') + code;
        for (i = SKIP_INDEXES, paramPrefix = '?'; i < templateArgs.length; i++, paramPrefix = '&') {
            message += paramPrefix + 'p' + (i - SKIP_INDEXES) + '=' +
                encodeURIComponent(toDebugString(templateArgs[i]));
        }
        return new ErrorConstructor(message);
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
},{"./utils":6}],6:[function(require,module,exports){
"use strict";
const angular_d_1 = require("./angular.d");
function isArrayLike(obj) {
    // `null`, `undefined` and `window` are not array-like
    if (obj == null || isWindow(obj))
        return false;
    // arrays, strings and jQuery/jqLite objects are array like
    // * jqLite is either the jQuery or jqLite constructor function
    // * we have to check the existence of jqLite first as this method is called
    //   via the forEach method when constructing the jqLite object in the first place
    if (isArray(obj) || isString(obj))
        return true;
    // Support: iOS 8.2 (not reproducible in simulator)
    // "length" in obj used to prevent JIT error (gh-11508)
    var length = "length" in Object(obj) && obj.length;
    // NodeList objects (with `item` method) and
    // other objects with suitable length characteristics are array-like
    return isNumber(length) &&
        (length >= 0 && ((length - 1) in obj || obj instanceof Array) || typeof obj.item == 'function');
}
function isUndefined(value) { return typeof value === 'undefined'; }
function isWindow(obj) {
    return obj && obj.window === obj;
}
function isScope(obj) {
    return obj && obj.$evalAsync && obj.$watch;
}
var isArray = Array.isArray;
function isString(value) { return typeof value === 'string'; }
function isNumber(value) { return typeof value === 'number'; }
function isObject(value) { return value !== null && typeof value === 'object'; }
function isFunction(value) { return typeof value === 'function'; }
function isBlankObject(value) {
    return value !== null && typeof value === 'object' && !getPrototypeOf(value);
}
var getPrototypeOf = Object.getPrototypeOf;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var slice = [].slice;
function forEach(obj, iterator, context) {
    var key, length;
    if (obj) {
        if (isFunction(obj)) {
            for (key in obj) {
                // Need to check if hasOwnProperty exists,
                // as on IE8 the result of querySelectorAll is an object without a hasOwnProperty function
                if (key != 'prototype' && key != 'length' && key != 'name' && (!obj.hasOwnProperty || obj.hasOwnProperty(key))) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else if (isArray(obj) || isArrayLike(obj)) {
            var isPrimitive = typeof obj !== 'object';
            for (key = 0, length = obj.length; key < length; key++) {
                if (isPrimitive || key in obj) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else if (obj.forEach && obj.forEach !== forEach) {
            obj.forEach(iterator, context, obj);
        }
        else if (isBlankObject(obj)) {
            // createMap() fast path --- Safe to avoid hasOwnProperty check because prototype chain is empty
            for (key in obj) {
                iterator.call(context, obj[key], key, obj);
            }
        }
        else if (typeof obj.hasOwnProperty === 'function') {
            // Slow path for objects inheriting Object.prototype, hasOwnProperty check needed
            for (key in obj) {
                if (obj.hasOwnProperty(key)) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
        else {
            // Slow path for objects which do not have a method `hasOwnProperty`
            for (key in obj) {
                if (hasOwnProperty.call(obj, key)) {
                    iterator.call(context, obj[key], key, obj);
                }
            }
        }
    }
    return obj;
}
function getBlockNodes(nodes) {
    // TODO(perf): update `nodes` instead of creating a new object?
    var node = nodes[0];
    var endNode = nodes[nodes.length - 1];
    var blockNodes;
    for (var i = 1; node !== endNode && (node = node.nextSibling); i++) {
        if (blockNodes || nodes[i] !== node) {
            if (!blockNodes) {
                blockNodes = angular_d_1.jqLite(slice.call(nodes, 0, i));
            }
            blockNodes.push(node);
        }
    }
    return blockNodes || nodes;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    isArrayLike: isArrayLike,
    isUndefined: isUndefined,
    isWindow: isWindow,
    isScope: isScope,
    isArray: isArray,
    isString: isString,
    isObject: isObject,
    isFuntion: isFunction,
    isBlankObject: isBlankObject,
    forEach: forEach,
    getBlockNodes: getBlockNodes
};
},{"./angular.d":1}],7:[function(require,module,exports){
arguments[4][1][0].apply(exports,arguments)
},{"dup":1}]},{},[4,7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYW5ndWxhci5kLnRzIiwic3JjL2NyZWF0ZU1hcC50cyIsInNyYy9oYXNoS2V5LnRzIiwic3JjL2luZGV4LnRzIiwic3JjL21pbkVyci50cyIsInNyYy91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBOzs7QUNBQTtJQUNJLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQy9CLENBQUM7QUFGRDsyQkFFQyxDQUFBOzs7QUNERCxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFFWjtJQUNJLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQztBQUNqQixDQUFDO0FBRUQsaUJBQWdDLEdBQUcsRUFBRSxTQUFVO0lBQzNDLElBQUksR0FBRyxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDO0lBRS9CLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDTixFQUFFLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQzVCLEdBQUcsR0FBRyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDZixDQUFDO0lBRUQsSUFBSSxPQUFPLEdBQUcsT0FBTyxHQUFHLENBQUM7SUFDekIsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLFVBQVUsSUFBSSxDQUFDLE9BQU8sSUFBSSxRQUFRLElBQUksR0FBRyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqRSxHQUFHLEdBQUcsR0FBRyxDQUFDLFNBQVMsR0FBRyxPQUFPLEdBQUcsR0FBRyxHQUFHLENBQUMsU0FBUyxJQUFJLE9BQU8sQ0FBQyxFQUFFLENBQUM7SUFDbkUsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ0osR0FBRyxHQUFHLE9BQU8s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ZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNyZWF0ZU1hcCgpIHtcclxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpO1xyXG59IiwiXHJcbnZhciB1aWQgPSAwO1xyXG5cclxuZnVuY3Rpb24gbmV4dFVpZCgpIHtcclxuICAgIHJldHVybiArK3VpZDtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaGFzaEtleShvYmosIG5leHRVaWRGbj8pIHtcclxuICAgIHZhciBrZXkgPSBvYmogJiYgb2JqLiQkaGFzaEtleTtcclxuXHJcbiAgICBpZiAoa2V5KSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBrZXkgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAga2V5ID0gb2JqLiQkaGFzaEtleSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4ga2V5O1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBvYmpUeXBlID0gdHlwZW9mIG9iajtcclxuICAgIGlmIChvYmpUeXBlID09ICdmdW5jdGlvbicgfHwgKG9ialR5cGUgPT0gJ29iamVjdCcgJiYgb2JqICE9PSBudWxsKSkge1xyXG4gICAgICAgIGtleSA9IG9iai4kJGhhc2hLZXkgPSBvYmpUeXBlICsgJzonICsgKG5leHRVaWRGbiB8fCBuZXh0VWlkKSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBrZXkgPSBvYmpUeXBlICsgJzonICsgb2JqO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBrZXk7XHJcbn0iLCJcbmltcG9ydCBtaW5FcnIgZnJvbSBcIi4vbWluRXJyXCI7XG5pbXBvcnQgaGFzaEtleSBmcm9tIFwiLi9oYXNoS2V5XCI7XG5pbXBvcnQgY3JlYXRlTWFwIGZyb20gXCIuL2NyZWF0ZU1hcFwiO1xuaW1wb3J0IHV0aWxzIGZyb20gXCIuL3V0aWxzXCI7XG5pbXBvcnQgeyBhbmd1bGFyLCBqcUxpdGUgfSBmcm9tIFwiLi9hbmd1bGFyLmRcIjtcblxudmFyIGlzQXJyYXlMaWtlID0gdXRpbHMuaXNBcnJheUxpa2U7XG52YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xudmFyIGlzQXJyYXkgPSB1dGlscy5pc0FycmF5O1xudmFyIGlzRnVuY3Rpb24gPSB1dGlscy5pc0Z1bnRpb247XG52YXIgaXNCbGFua09iamVjdCA9IHV0aWxzLmlzQmxhbmtPYmplY3Q7XG52YXIgc2xpY2UgPSBbXS5zbGljZTtcbnZhciBmb3JFYWNoID0gdXRpbHMuZm9yRWFjaDtcbnZhciBnZXRCbG9ja05vZGVzID0gdXRpbHMuZ2V0QmxvY2tOb2RlcztcblxuaW50ZXJmYWNlIElIYXNoS2V5T2JqIHtcbiAgJGlkOiBhbnksXG4gICRpbmRleDogYW55XG59XG5cbmFuZ3VsYXIubW9kdWxlKCduZy1yZXBlYXQtbi1kaXJlY3RpdmUnLCBbXSlcblxuICAuZGlyZWN0aXZlKCduZ1JlcGVhdE4nLCBbJyRwYXJzZScsICckYW5pbWF0ZScsICckY29tcGlsZScsIGZ1bmN0aW9uICgkcGFyc2UsICRhbmltYXRlLCAkY29tcGlsZSkge1xuXG4gICAgdmFyIE5HX1JFTU9WRUQgPSAnJCROR19SRU1PVkVEJztcbiAgICB2YXIgbmdSZXBlYXRNaW5FcnIgPSBtaW5FcnIoJ25nUmVwZWF0Jyk7XG5cbiAgICB2YXIgdXBkYXRlU2NvcGUgPSBmdW5jdGlvbiAoc2NvcGUsIGluZGV4LCB2YWx1ZUlkZW50aWZpZXIsIHZhbHVlLCBrZXlJZGVudGlmaWVyLCBrZXksIGFycmF5TGVuZ3RoKSB7XG4gICAgICAvLyBUT0RPKHBlcmYpOiBnZW5lcmF0ZSBzZXR0ZXJzIHRvIHNoYXZlIG9mZiB+NDBtcyBvciAxLTEuNSVcbiAgICAgIHNjb3BlW3ZhbHVlSWRlbnRpZmllcl0gPSB2YWx1ZTtcbiAgICAgIGlmIChrZXlJZGVudGlmaWVyKSBzY29wZVtrZXlJZGVudGlmaWVyXSA9IGtleTtcbiAgICAgIHNjb3BlLiRpbmRleCA9IGluZGV4O1xuICAgICAgc2NvcGUuJGZpcnN0ID0gKGluZGV4ID09PSAwKTtcbiAgICAgIHNjb3BlLiRsYXN0ID0gKGluZGV4ID09PSAoYXJyYXlMZW5ndGggLSAxKSk7XG4gICAgICBzY29wZS4kbWlkZGxlID0gIShzY29wZS4kZmlyc3QgfHwgc2NvcGUuJGxhc3QpO1xuICAgICAgLy8ganNoaW50IGJpdHdpc2U6IGZhbHNlXG4gICAgICBzY29wZS4kb2RkID0gIShzY29wZS4kZXZlbiA9IChpbmRleCAmIDEpID09PSAwKTtcbiAgICAgIC8vIGpzaGludCBiaXR3aXNlOiB0cnVlXG4gICAgfTtcblxuICAgIHZhciBnZXRCbG9ja1N0YXJ0ID0gZnVuY3Rpb24gKGJsb2NrKSB7XG4gICAgICByZXR1cm4gYmxvY2suY2xvbmVbMF07XG4gICAgfTtcblxuICAgIHZhciBnZXRCbG9ja0VuZCA9IGZ1bmN0aW9uIChibG9jaykge1xuICAgICAgcmV0dXJuIGJsb2NrLmNsb25lW2Jsb2NrLmNsb25lLmxlbmd0aCAtIDFdO1xuICAgIH07XG5cblxuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgbXVsdGlFbGVtZW50OiB0cnVlLFxuICAgICAgdHJhbnNjbHVkZTogJ2VsZW1lbnQnLFxuICAgICAgcHJpb3JpdHk6IDEwMDAsXG4gICAgICB0ZXJtaW5hbDogdHJ1ZSxcbiAgICAgICQkdGxiOiB0cnVlLFxuICAgICAgY29tcGlsZTogZnVuY3Rpb24gbmdSZXBlYXRDb21waWxlKCRlbGVtZW50LCAkYXR0cikge1xuICAgICAgICB2YXIgbmdSZXBlYXROID0gcGFyc2VJbnQoJGF0dHIubmdSZXBlYXROKTtcbiAgICAgICAgdmFyIGFycmF5ID0gbmV3IEFycmF5KG5nUmVwZWF0Tik7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGFycmF5W2ldID0gaTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBleHByZXNzaW9uID0gJ2l0ZW0gaW4gWycgKyBhcnJheS50b1N0cmluZygpICsgJ10nO1xuXG4gICAgICAgIHZhciBuZ1JlcGVhdEVuZENvbW1lbnQgPSAkY29tcGlsZS4kJGNyZWF0ZUNvbW1lbnQoJ2VuZCBuZ1JlcGVhdCcsIGV4cHJlc3Npb24pO1xuXG4gICAgICAgIHZhciBtYXRjaCA9IGV4cHJlc3Npb24ubWF0Y2goL15cXHMqKFtcXHNcXFNdKz8pXFxzK2luXFxzKyhbXFxzXFxTXSs/KSg/Olxccythc1xccysoW1xcc1xcU10rPykpPyg/Olxccyt0cmFja1xccytieVxccysoW1xcc1xcU10rPykpP1xccyokLyk7XG5cbiAgICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHRocm93IG5nUmVwZWF0TWluRXJyKCdpZXhwJywgXCJFeHBlY3RlZCBleHByZXNzaW9uIGluIGZvcm0gb2YgJ19pdGVtXyBpbiBfY29sbGVjdGlvbl9bIHRyYWNrIGJ5IF9pZF9dJyBidXQgZ290ICd7MH0nLlwiLFxuICAgICAgICAgICAgZXhwcmVzc2lvbik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGhzID0gbWF0Y2hbMV07XG4gICAgICAgIHZhciByaHMgPSBtYXRjaFsyXTtcbiAgICAgICAgdmFyIGFsaWFzQXMgPSBtYXRjaFszXTtcbiAgICAgICAgdmFyIHRyYWNrQnlFeHAgPSBtYXRjaFs0XTtcblxuICAgICAgICBtYXRjaCA9IGxocy5tYXRjaCgvXig/OihcXHMqW1xcJFxcd10rKXxcXChcXHMqKFtcXCRcXHddKylcXHMqLFxccyooW1xcJFxcd10rKVxccypcXCkpJC8pO1xuXG4gICAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZ1JlcGVhdE1pbkVycignaWlkZXhwJywgXCInX2l0ZW1fJyBpbiAnX2l0ZW1fIGluIF9jb2xsZWN0aW9uXycgc2hvdWxkIGJlIGFuIGlkZW50aWZpZXIgb3IgJyhfa2V5XywgX3ZhbHVlXyknIGV4cHJlc3Npb24sIGJ1dCBnb3QgJ3swfScuXCIsXG4gICAgICAgICAgICBsaHMpO1xuICAgICAgICB9XG4gICAgICAgIHZhciB2YWx1ZUlkZW50aWZpZXIgPSBtYXRjaFszXSB8fCBtYXRjaFsxXTtcbiAgICAgICAgdmFyIGtleUlkZW50aWZpZXIgPSBtYXRjaFsyXTtcblxuICAgICAgICBpZiAoYWxpYXNBcyAmJiAoIS9eWyRhLXpBLVpfXVskYS16QS1aMC05X10qJC8udGVzdChhbGlhc0FzKSB8fFxuICAgICAgICAgIC9eKG51bGx8dW5kZWZpbmVkfHRoaXN8XFwkaW5kZXh8XFwkZmlyc3R8XFwkbWlkZGxlfFxcJGxhc3R8XFwkZXZlbnxcXCRvZGR8XFwkcGFyZW50fFxcJHJvb3R8XFwkaWQpJC8udGVzdChhbGlhc0FzKSkpIHtcbiAgICAgICAgICB0aHJvdyBuZ1JlcGVhdE1pbkVycignYmFkaWRlbnQnLCBcImFsaWFzICd7MH0nIGlzIGludmFsaWQgLS0tIG11c3QgYmUgYSB2YWxpZCBKUyBpZGVudGlmaWVyIHdoaWNoIGlzIG5vdCBhIHJlc2VydmVkIG5hbWUuXCIsXG4gICAgICAgICAgICBhbGlhc0FzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0cmFja0J5RXhwR2V0dGVyLCB0cmFja0J5SWRFeHBGbiwgdHJhY2tCeUlkQXJyYXlGbiwgdHJhY2tCeUlkT2JqRm47XG4gICAgICAgIHZhciBoYXNoRm5Mb2NhbHMgPSA8SUhhc2hLZXlPYmo+eyAkaWQ6IGhhc2hLZXkgfTtcblxuICAgICAgICBpZiAodHJhY2tCeUV4cCkge1xuICAgICAgICAgIHRyYWNrQnlFeHBHZXR0ZXIgPSAkcGFyc2UodHJhY2tCeUV4cCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJhY2tCeUlkQXJyYXlGbiA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gaGFzaEtleSh2YWx1ZSk7XG4gICAgICAgICAgfTtcbiAgICAgICAgICB0cmFja0J5SWRPYmpGbiA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgIHJldHVybiBrZXk7XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZ1JlcGVhdExpbmsoJHNjb3BlLCAkZWxlbWVudCwgJGF0dHIsIGN0cmwsICR0cmFuc2NsdWRlKSB7XG5cbiAgICAgICAgICBpZiAodHJhY2tCeUV4cEdldHRlcikge1xuICAgICAgICAgICAgdHJhY2tCeUlkRXhwRm4gPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgLy8gYXNzaWduIGtleSwgdmFsdWUsIGFuZCAkaW5kZXggdG8gdGhlIGxvY2FscyBzbyB0aGF0IHRoZXkgY2FuIGJlIHVzZWQgaW4gaGFzaCBmdW5jdGlvbnNcbiAgICAgICAgICAgICAgaWYgKGtleUlkZW50aWZpZXIpIGhhc2hGbkxvY2Fsc1trZXlJZGVudGlmaWVyXSA9IGtleTtcbiAgICAgICAgICAgICAgaGFzaEZuTG9jYWxzW3ZhbHVlSWRlbnRpZmllcl0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgaGFzaEZuTG9jYWxzLiRpbmRleCA9IGluZGV4O1xuICAgICAgICAgICAgICByZXR1cm4gdHJhY2tCeUV4cEdldHRlcigkc2NvcGUsIGhhc2hGbkxvY2Fscyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFN0b3JlIGEgbGlzdCBvZiBlbGVtZW50cyBmcm9tIHByZXZpb3VzIHJ1bi4gVGhpcyBpcyBhIGhhc2ggd2hlcmUga2V5IGlzIHRoZSBpdGVtIGZyb20gdGhlXG4gICAgICAgICAgLy8gaXRlcmF0b3IsIGFuZCB0aGUgdmFsdWUgaXMgb2JqZWN0cyB3aXRoIGZvbGxvd2luZyBwcm9wZXJ0aWVzLlxuICAgICAgICAgIC8vICAgLSBzY29wZTogYm91bmQgc2NvcGVcbiAgICAgICAgICAvLyAgIC0gZWxlbWVudDogcHJldmlvdXMgZWxlbWVudC5cbiAgICAgICAgICAvLyAgIC0gaW5kZXg6IHBvc2l0aW9uXG4gICAgICAgICAgLy9cbiAgICAgICAgICAvLyBXZSBhcmUgdXNpbmcgbm8tcHJvdG8gb2JqZWN0IHNvIHRoYXQgd2UgZG9uJ3QgbmVlZCB0byBndWFyZCBhZ2FpbnN0IGluaGVyaXRlZCBwcm9wcyB2aWFcbiAgICAgICAgICAvLyBoYXNPd25Qcm9wZXJ0eS5cbiAgICAgICAgICB2YXIgbGFzdEJsb2NrTWFwID0gY3JlYXRlTWFwKCk7XG5cbiAgICAgICAgICAvL3dhdGNoIHByb3BzXG4gICAgICAgICAgJHNjb3BlLiR3YXRjaENvbGxlY3Rpb24ocmhzLCBmdW5jdGlvbiBuZ1JlcGVhdEFjdGlvbihjb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICB2YXIgaW5kZXgsIGxlbmd0aCxcbiAgICAgICAgICAgICAgcHJldmlvdXNOb2RlID0gJGVsZW1lbnRbMF0sICAgICAvLyBub2RlIHRoYXQgY2xvbmVkIG5vZGVzIHNob3VsZCBiZSBpbnNlcnRlZCBhZnRlclxuICAgICAgICAgICAgICAvLyBpbml0aWFsaXplZCB0byB0aGUgY29tbWVudCBub2RlIGFuY2hvclxuICAgICAgICAgICAgICBuZXh0Tm9kZSxcbiAgICAgICAgICAgICAgLy8gU2FtZSBhcyBsYXN0QmxvY2tNYXAgYnV0IGl0IGhhcyB0aGUgY3VycmVudCBzdGF0ZS4gSXQgd2lsbCBiZWNvbWUgdGhlXG4gICAgICAgICAgICAgIC8vIGxhc3RCbG9ja01hcCBvbiB0aGUgbmV4dCBpdGVyYXRpb24uXG4gICAgICAgICAgICAgIG5leHRCbG9ja01hcCA9IGNyZWF0ZU1hcCgpLFxuICAgICAgICAgICAgICBjb2xsZWN0aW9uTGVuZ3RoLFxuICAgICAgICAgICAgICBrZXksIHZhbHVlLCAvLyBrZXkvdmFsdWUgb2YgaXRlcmF0aW9uXG4gICAgICAgICAgICAgIHRyYWNrQnlJZCxcbiAgICAgICAgICAgICAgdHJhY2tCeUlkRm4sXG4gICAgICAgICAgICAgIGNvbGxlY3Rpb25LZXlzLFxuICAgICAgICAgICAgICBibG9jaywgICAgICAgLy8gbGFzdCBvYmplY3QgaW5mb3JtYXRpb24ge3Njb3BlLCBlbGVtZW50LCBpZH1cbiAgICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXIsXG4gICAgICAgICAgICAgIGVsZW1lbnRzVG9SZW1vdmU7XG5cbiAgICAgICAgICAgIGlmIChhbGlhc0FzKSB7XG4gICAgICAgICAgICAgICRzY29wZVthbGlhc0FzXSA9IGNvbGxlY3Rpb247XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0FycmF5TGlrZShjb2xsZWN0aW9uKSkge1xuICAgICAgICAgICAgICBjb2xsZWN0aW9uS2V5cyA9IGNvbGxlY3Rpb247XG4gICAgICAgICAgICAgIHRyYWNrQnlJZEZuID0gdHJhY2tCeUlkRXhwRm4gfHwgdHJhY2tCeUlkQXJyYXlGbjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRyYWNrQnlJZEZuID0gdHJhY2tCeUlkRXhwRm4gfHwgdHJhY2tCeUlkT2JqRm47XG4gICAgICAgICAgICAgIC8vIGlmIG9iamVjdCwgZXh0cmFjdCBrZXlzLCBpbiBlbnVtZXJhdGlvbiBvcmRlciwgdW5zb3J0ZWRcbiAgICAgICAgICAgICAgY29sbGVjdGlvbktleXMgPSBbXTtcbiAgICAgICAgICAgICAgZm9yICh2YXIgaXRlbUtleSBpbiBjb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoY29sbGVjdGlvbiwgaXRlbUtleSkgJiYgaXRlbUtleS5jaGFyQXQoMCkgIT09ICckJykge1xuICAgICAgICAgICAgICAgICAgY29sbGVjdGlvbktleXMucHVzaChpdGVtS2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29sbGVjdGlvbkxlbmd0aCA9IGNvbGxlY3Rpb25LZXlzLmxlbmd0aDtcbiAgICAgICAgICAgIG5leHRCbG9ja09yZGVyID0gbmV3IEFycmF5KGNvbGxlY3Rpb25MZW5ndGgpO1xuXG4gICAgICAgICAgICAvLyBsb2NhdGUgZXhpc3RpbmcgaXRlbXNcbiAgICAgICAgICAgIGZvciAoaW5kZXggPSAwOyBpbmRleCA8IGNvbGxlY3Rpb25MZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgICAga2V5ID0gKGNvbGxlY3Rpb24gPT09IGNvbGxlY3Rpb25LZXlzKSA/IGluZGV4IDogY29sbGVjdGlvbktleXNbaW5kZXhdO1xuICAgICAgICAgICAgICB2YWx1ZSA9IGNvbGxlY3Rpb25ba2V5XTtcbiAgICAgICAgICAgICAgdHJhY2tCeUlkID0gdHJhY2tCeUlkRm4oa2V5LCB2YWx1ZSwgaW5kZXgpO1xuICAgICAgICAgICAgICBpZiAobGFzdEJsb2NrTWFwW3RyYWNrQnlJZF0pIHtcbiAgICAgICAgICAgICAgICAvLyBmb3VuZCBwcmV2aW91c2x5IHNlZW4gYmxvY2tcbiAgICAgICAgICAgICAgICBibG9jayA9IGxhc3RCbG9ja01hcFt0cmFja0J5SWRdO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBsYXN0QmxvY2tNYXBbdHJhY2tCeUlkXTtcbiAgICAgICAgICAgICAgICBuZXh0QmxvY2tNYXBbdHJhY2tCeUlkXSA9IGJsb2NrO1xuICAgICAgICAgICAgICAgIG5leHRCbG9ja09yZGVyW2luZGV4XSA9IGJsb2NrO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKG5leHRCbG9ja01hcFt0cmFja0J5SWRdKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgY29sbGlzaW9uIGRldGVjdGVkLiByZXN0b3JlIGxhc3RCbG9ja01hcCBhbmQgdGhyb3cgYW4gZXJyb3JcbiAgICAgICAgICAgICAgICBmb3JFYWNoKG5leHRCbG9ja09yZGVyLCBmdW5jdGlvbiAoYmxvY2spIHtcbiAgICAgICAgICAgICAgICAgIGlmIChibG9jayAmJiBibG9jay5zY29wZSkgbGFzdEJsb2NrTWFwW2Jsb2NrLmlkXSA9IGJsb2NrO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRocm93IG5nUmVwZWF0TWluRXJyKCdkdXBlcycsXG4gICAgICAgICAgICAgICAgICBcIkR1cGxpY2F0ZXMgaW4gYSByZXBlYXRlciBhcmUgbm90IGFsbG93ZWQuIFVzZSAndHJhY2sgYnknIGV4cHJlc3Npb24gdG8gc3BlY2lmeSB1bmlxdWUga2V5cy4gUmVwZWF0ZXI6IHswfSwgRHVwbGljYXRlIGtleTogezF9LCBEdXBsaWNhdGUgdmFsdWU6IHsyfVwiLFxuICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbiwgdHJhY2tCeUlkLCB2YWx1ZSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gbmV3IG5ldmVyIGJlZm9yZSBzZWVuIGJsb2NrXG4gICAgICAgICAgICAgICAgbmV4dEJsb2NrT3JkZXJbaW5kZXhdID0geyBpZDogdHJhY2tCeUlkLCBzY29wZTogdW5kZWZpbmVkLCBjbG9uZTogdW5kZWZpbmVkIH07XG4gICAgICAgICAgICAgICAgbmV4dEJsb2NrTWFwW3RyYWNrQnlJZF0gPSB0cnVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSBsZWZ0b3ZlciBpdGVtc1xuICAgICAgICAgICAgZm9yICh2YXIgYmxvY2tLZXkgaW4gbGFzdEJsb2NrTWFwKSB7XG4gICAgICAgICAgICAgIGJsb2NrID0gbGFzdEJsb2NrTWFwW2Jsb2NrS2V5XTtcbiAgICAgICAgICAgICAgZWxlbWVudHNUb1JlbW92ZSA9IGdldEJsb2NrTm9kZXMoYmxvY2suY2xvbmUpO1xuICAgICAgICAgICAgICAkYW5pbWF0ZS5sZWF2ZShlbGVtZW50c1RvUmVtb3ZlKTtcbiAgICAgICAgICAgICAgaWYgKGVsZW1lbnRzVG9SZW1vdmVbMF0ucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBlbGVtZW50IHdhcyBub3QgcmVtb3ZlZCB5ZXQgYmVjYXVzZSBvZiBwZW5kaW5nIGFuaW1hdGlvbiwgbWFyayBpdCBhcyBkZWxldGVkXG4gICAgICAgICAgICAgICAgLy8gc28gdGhhdCB3ZSBjYW4gaWdub3JlIGl0IGxhdGVyXG4gICAgICAgICAgICAgICAgZm9yIChpbmRleCA9IDAsIGxlbmd0aCA9IGVsZW1lbnRzVG9SZW1vdmUubGVuZ3RoOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICAgICAgZWxlbWVudHNUb1JlbW92ZVtpbmRleF1bTkdfUkVNT1ZFRF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBibG9jay5zY29wZS4kZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB3ZSBhcmUgbm90IHVzaW5nIGZvckVhY2ggZm9yIHBlcmYgcmVhc29ucyAodHJ5aW5nIHRvIGF2b2lkICNjYWxsKVxuICAgICAgICAgICAgZm9yIChpbmRleCA9IDA7IGluZGV4IDwgY29sbGVjdGlvbkxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgICBrZXkgPSAoY29sbGVjdGlvbiA9PT0gY29sbGVjdGlvbktleXMpID8gaW5kZXggOiBjb2xsZWN0aW9uS2V5c1tpbmRleF07XG4gICAgICAgICAgICAgIHZhbHVlID0gY29sbGVjdGlvbltrZXldO1xuICAgICAgICAgICAgICBibG9jayA9IG5leHRCbG9ja09yZGVyW2luZGV4XTtcblxuICAgICAgICAgICAgICBpZiAoYmxvY2suc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB3ZSBoYXZlIGFscmVhZHkgc2VlbiB0aGlzIG9iamVjdCwgdGhlbiB3ZSBuZWVkIHRvIHJldXNlIHRoZVxuICAgICAgICAgICAgICAgIC8vIGFzc29jaWF0ZWQgc2NvcGUvZWxlbWVudFxuXG4gICAgICAgICAgICAgICAgbmV4dE5vZGUgPSBwcmV2aW91c05vZGU7XG5cbiAgICAgICAgICAgICAgICAvLyBza2lwIG5vZGVzIHRoYXQgYXJlIGFscmVhZHkgcGVuZGluZyByZW1vdmFsIHZpYSBsZWF2ZSBhbmltYXRpb25cbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICBuZXh0Tm9kZSA9IG5leHROb2RlLm5leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgIH0gd2hpbGUgKG5leHROb2RlICYmIG5leHROb2RlW05HX1JFTU9WRURdKTtcblxuICAgICAgICAgICAgICAgIGlmIChnZXRCbG9ja1N0YXJ0KGJsb2NrKSAhPSBuZXh0Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgLy8gZXhpc3RpbmcgaXRlbSB3aGljaCBnb3QgbW92ZWRcbiAgICAgICAgICAgICAgICAgICRhbmltYXRlLm1vdmUoZ2V0QmxvY2tOb2RlcyhibG9jay5jbG9uZSksIG51bGwsIHByZXZpb3VzTm9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXZpb3VzTm9kZSA9IGdldEJsb2NrRW5kKGJsb2NrKTtcbiAgICAgICAgICAgICAgICB1cGRhdGVTY29wZShibG9jay5zY29wZSwgaW5kZXgsIHZhbHVlSWRlbnRpZmllciwgdmFsdWUsIGtleUlkZW50aWZpZXIsIGtleSwgY29sbGVjdGlvbkxlbmd0aCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gbmV3IGl0ZW0gd2hpY2ggd2UgZG9uJ3Qga25vdyBhYm91dFxuICAgICAgICAgICAgICAgICR0cmFuc2NsdWRlKGZ1bmN0aW9uIG5nUmVwZWF0VHJhbnNjbHVkZShjbG9uZSwgc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgIGJsb2NrLnNjb3BlID0gc2NvcGU7XG4gICAgICAgICAgICAgICAgICAvLyBodHRwOi8vanNwZXJmLmNvbS9jbG9uZS12cy1jcmVhdGVjb21tZW50XG4gICAgICAgICAgICAgICAgICB2YXIgZW5kTm9kZSA9IG5nUmVwZWF0RW5kQ29tbWVudC5jbG9uZU5vZGUoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgY2xvbmVbY2xvbmUubGVuZ3RoKytdID0gZW5kTm9kZTtcblxuICAgICAgICAgICAgICAgICAgJGFuaW1hdGUuZW50ZXIoY2xvbmUsIG51bGwsIHByZXZpb3VzTm9kZSk7XG4gICAgICAgICAgICAgICAgICBwcmV2aW91c05vZGUgPSBlbmROb2RlO1xuICAgICAgICAgICAgICAgICAgLy8gTm90ZTogV2Ugb25seSBuZWVkIHRoZSBmaXJzdC9sYXN0IG5vZGUgb2YgdGhlIGNsb25lZCBub2Rlcy5cbiAgICAgICAgICAgICAgICAgIC8vIEhvd2V2ZXIsIHdlIG5lZWQgdG8ga2VlcCB0aGUgcmVmZXJlbmNlIHRvIHRoZSBqcWxpdGUgd3JhcHBlciBhcyBpdCBtaWdodCBiZSBjaGFuZ2VkIGxhdGVyXG4gICAgICAgICAgICAgICAgICAvLyBieSBhIGRpcmVjdGl2ZSB3aXRoIHRlbXBsYXRlVXJsIHdoZW4gaXRzIHRlbXBsYXRlIGFycml2ZXMuXG4gICAgICAgICAgICAgICAgICBibG9jay5jbG9uZSA9IGNsb25lO1xuICAgICAgICAgICAgICAgICAgbmV4dEJsb2NrTWFwW2Jsb2NrLmlkXSA9IGJsb2NrO1xuICAgICAgICAgICAgICAgICAgdXBkYXRlU2NvcGUoYmxvY2suc2NvcGUsIGluZGV4LCB2YWx1ZUlkZW50aWZpZXIsIHZhbHVlLCBrZXlJZGVudGlmaWVyLCBrZXksIGNvbGxlY3Rpb25MZW5ndGgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsYXN0QmxvY2tNYXAgPSBuZXh0QmxvY2tNYXA7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfTtcbiAgfV0pOyIsIlxyXG5pbXBvcnQgdXRpbHMgZnJvbSBcIi4vdXRpbHNcIjtcclxudmFyIGlzQXJyYXlMaWtlID0gdXRpbHMuaXNBcnJheUxpa2U7XHJcbnZhciBpc1VuZGVmaW5lZCA9IHV0aWxzLmlzVW5kZWZpbmVkO1xyXG52YXIgaXNXaW5kb3cgPSB1dGlscy5pc1dpbmRvdztcclxudmFyIGlzU2NvcGUgPSB1dGlscy5pc1Njb3BlO1xyXG52YXIgaXNPYmplY3QgPSB1dGlscy5pc09iamVjdDtcclxuXHJcbmZ1bmN0aW9uIHRvSnNvblJlcGxhY2VyKGtleSwgdmFsdWUpIHtcclxuICAgIHZhciB2YWwgPSB2YWx1ZTtcclxuXHJcbiAgICBpZiAodHlwZW9mIGtleSA9PT0gJ3N0cmluZycgJiYga2V5LmNoYXJBdCgwKSA9PT0gJyQnICYmIGtleS5jaGFyQXQoMSkgPT09ICckJykge1xyXG4gICAgICAgIHZhbCA9IHVuZGVmaW5lZDtcclxuICAgIH0gZWxzZSBpZiAoaXNXaW5kb3codmFsdWUpKSB7XHJcbiAgICAgICAgdmFsID0gJyRXSU5ET1cnO1xyXG4gICAgfSBlbHNlIGlmICh2YWx1ZSAmJiB3aW5kb3cuZG9jdW1lbnQgPT09IHZhbHVlKSB7XHJcbiAgICAgICAgdmFsID0gJyRET0NVTUVOVCc7XHJcbiAgICB9IGVsc2UgaWYgKGlzU2NvcGUodmFsdWUpKSB7XHJcbiAgICAgICAgdmFsID0gJyRTQ09QRSc7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHZhbDtcclxufVxyXG5cclxuLyogZ2xvYmFsIHRvRGVidWdTdHJpbmc6IHRydWUgKi9cclxuXHJcbmZ1bmN0aW9uIHNlcmlhbGl6ZU9iamVjdChvYmopIHtcclxuICAgIHZhciBzZWVuID0gW107XHJcblxyXG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG9iaiwgZnVuY3Rpb24gKGtleSwgdmFsKSB7XHJcbiAgICAgICAgdmFsID0gdG9Kc29uUmVwbGFjZXIoa2V5LCB2YWwpO1xyXG4gICAgICAgIGlmIChpc09iamVjdCh2YWwpKSB7XHJcblxyXG4gICAgICAgICAgICBpZiAoc2Vlbi5pbmRleE9mKHZhbCkgPj0gMCkgcmV0dXJuICcuLi4nO1xyXG5cclxuICAgICAgICAgICAgc2Vlbi5wdXNoKHZhbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB2YWw7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gdG9EZWJ1Z1N0cmluZyhvYmopIHtcclxuICAgIGlmICh0eXBlb2Ygb2JqID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgcmV0dXJuIG9iai50b1N0cmluZygpLnJlcGxhY2UoLyBcXHtbXFxzXFxTXSokLywgJycpO1xyXG4gICAgfSBlbHNlIGlmIChpc1VuZGVmaW5lZChvYmopKSB7XHJcbiAgICAgICAgcmV0dXJuICd1bmRlZmluZWQnO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygb2JqICE9PSAnc3RyaW5nJykge1xyXG4gICAgICAgIHJldHVybiBzZXJpYWxpemVPYmplY3Qob2JqKTtcclxuICAgIH1cclxuICAgIHJldHVybiBvYmo7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChtb2R1bGUsIEVycm9yQ29uc3RydWN0b3I/KTphbnkge1xyXG4gICAgRXJyb3JDb25zdHJ1Y3RvciA9IEVycm9yQ29uc3RydWN0b3IgfHwgRXJyb3I7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHZhciBTS0lQX0lOREVYRVMgPSAyO1xyXG5cclxuICAgICAgICB2YXIgdGVtcGxhdGVBcmdzID0gYXJndW1lbnRzLFxyXG4gICAgICAgICAgICBjb2RlID0gdGVtcGxhdGVBcmdzWzBdLFxyXG4gICAgICAgICAgICBtZXNzYWdlID0gJ1snICsgKG1vZHVsZSA/IG1vZHVsZSArICc6JyA6ICcnKSArIGNvZGUgKyAnXSAnLFxyXG4gICAgICAgICAgICB0ZW1wbGF0ZSA9IHRlbXBsYXRlQXJnc1sxXSxcclxuICAgICAgICAgICAgcGFyYW1QcmVmaXgsIGk7XHJcblxyXG4gICAgICAgIG1lc3NhZ2UgKz0gdGVtcGxhdGUucmVwbGFjZSgvXFx7XFxkK1xcfS9nLCBmdW5jdGlvbiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgdmFyIGluZGV4ID0gK21hdGNoLnNsaWNlKDEsIC0xKSxcclxuICAgICAgICAgICAgICAgIHNoaWZ0ZWRJbmRleCA9IGluZGV4ICsgU0tJUF9JTkRFWEVTO1xyXG5cclxuICAgICAgICAgICAgaWYgKHNoaWZ0ZWRJbmRleCA8IHRlbXBsYXRlQXJncy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0b0RlYnVnU3RyaW5nKHRlbXBsYXRlQXJnc1tzaGlmdGVkSW5kZXhdKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBtZXNzYWdlICs9ICdcXG5odHRwOi8vZXJyb3JzLmFuZ3VsYXJqcy5vcmcvMS41LjgvJyArXHJcbiAgICAgICAgICAgIChtb2R1bGUgPyBtb2R1bGUgKyAnLycgOiAnJykgKyBjb2RlO1xyXG5cclxuICAgICAgICBmb3IgKGkgPSBTS0lQX0lOREVYRVMsIHBhcmFtUHJlZml4ID0gJz8nOyBpIDwgdGVtcGxhdGVBcmdzLmxlbmd0aDsgaSsrICwgcGFyYW1QcmVmaXggPSAnJicpIHtcclxuICAgICAgICAgICAgbWVzc2FnZSArPSBwYXJhbVByZWZpeCArICdwJyArIChpIC0gU0tJUF9JTkRFWEVTKSArICc9JyArXHJcbiAgICAgICAgICAgICAgICBlbmNvZGVVUklDb21wb25lbnQodG9EZWJ1Z1N0cmluZyh0ZW1wbGF0ZUFyZ3NbaV0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBuZXcgRXJyb3JDb25zdHJ1Y3RvcihtZXNzYWdlKTtcclxuICAgIH07XHJcbn0iLCJcclxuaW1wb3J0IHsganFMaXRlIH0gZnJvbSBcIi4vYW5ndWxhci5kXCI7XHJcblxyXG5mdW5jdGlvbiBpc0FycmF5TGlrZShvYmopIHtcclxuXHJcbiAgICAvLyBgbnVsbGAsIGB1bmRlZmluZWRgIGFuZCBgd2luZG93YCBhcmUgbm90IGFycmF5LWxpa2VcclxuICAgIGlmIChvYmogPT0gbnVsbCB8fCBpc1dpbmRvdyhvYmopKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgLy8gYXJyYXlzLCBzdHJpbmdzIGFuZCBqUXVlcnkvanFMaXRlIG9iamVjdHMgYXJlIGFycmF5IGxpa2VcclxuICAgIC8vICoganFMaXRlIGlzIGVpdGhlciB0aGUgalF1ZXJ5IG9yIGpxTGl0ZSBjb25zdHJ1Y3RvciBmdW5jdGlvblxyXG4gICAgLy8gKiB3ZSBoYXZlIHRvIGNoZWNrIHRoZSBleGlzdGVuY2Ugb2YganFMaXRlIGZpcnN0IGFzIHRoaXMgbWV0aG9kIGlzIGNhbGxlZFxyXG4gICAgLy8gICB2aWEgdGhlIGZvckVhY2ggbWV0aG9kIHdoZW4gY29uc3RydWN0aW5nIHRoZSBqcUxpdGUgb2JqZWN0IGluIHRoZSBmaXJzdCBwbGFjZVxyXG4gICAgaWYgKGlzQXJyYXkob2JqKSB8fCBpc1N0cmluZyhvYmopKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICAvLyBTdXBwb3J0OiBpT1MgOC4yIChub3QgcmVwcm9kdWNpYmxlIGluIHNpbXVsYXRvcilcclxuICAgIC8vIFwibGVuZ3RoXCIgaW4gb2JqIHVzZWQgdG8gcHJldmVudCBKSVQgZXJyb3IgKGdoLTExNTA4KVxyXG4gICAgdmFyIGxlbmd0aCA9IFwibGVuZ3RoXCIgaW4gT2JqZWN0KG9iaikgJiYgb2JqLmxlbmd0aDtcclxuXHJcbiAgICAvLyBOb2RlTGlzdCBvYmplY3RzICh3aXRoIGBpdGVtYCBtZXRob2QpIGFuZFxyXG4gICAgLy8gb3RoZXIgb2JqZWN0cyB3aXRoIHN1aXRhYmxlIGxlbmd0aCBjaGFyYWN0ZXJpc3RpY3MgYXJlIGFycmF5LWxpa2VcclxuICAgIHJldHVybiBpc051bWJlcihsZW5ndGgpICYmXHJcbiAgICAgICAgKGxlbmd0aCA+PSAwICYmICgobGVuZ3RoIC0gMSkgaW4gb2JqIHx8IG9iaiBpbnN0YW5jZW9mIEFycmF5KSB8fCB0eXBlb2Ygb2JqLml0ZW0gPT0gJ2Z1bmN0aW9uJyk7XHJcblxyXG59XHJcblxyXG5mdW5jdGlvbiBpc1VuZGVmaW5lZCh2YWx1ZSkgeyByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJzsgfVxyXG5cclxuZnVuY3Rpb24gaXNXaW5kb3cob2JqKSB7XHJcbiAgICByZXR1cm4gb2JqICYmIG9iai53aW5kb3cgPT09IG9iajtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNTY29wZShvYmopIHtcclxuICAgIHJldHVybiBvYmogJiYgb2JqLiRldmFsQXN5bmMgJiYgb2JqLiR3YXRjaDtcclxufVxyXG5cclxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xyXG5cclxuZnVuY3Rpb24gaXNTdHJpbmcodmFsdWUpIHsgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZyc7IH1cclxuXHJcbmZ1bmN0aW9uIGlzTnVtYmVyKHZhbHVlKSB7IHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInOyB9XHJcblxyXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkgeyByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JzsgfVxyXG5cclxuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkgeyByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nOyB9XHJcblxyXG5mdW5jdGlvbiBpc0JsYW5rT2JqZWN0KHZhbHVlKSB7XHJcbiAgICByZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAhZ2V0UHJvdG90eXBlT2YodmFsdWUpO1xyXG59XHJcblxyXG52YXIgZ2V0UHJvdG90eXBlT2YgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2Y7XHJcblxyXG52YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xyXG5cclxudmFyIHNsaWNlID0gW10uc2xpY2U7XHJcblxyXG5cclxuaW50ZXJmYWNlIElIYXNoS2V5T2JqIHtcclxuICAgICRpZDogYW55LFxyXG4gICAgJGluZGV4OiBhbnlcclxufVxyXG5cclxuZnVuY3Rpb24gZm9yRWFjaChvYmosIGl0ZXJhdG9yLCBjb250ZXh0Pykge1xyXG4gICAgdmFyIGtleSwgbGVuZ3RoO1xyXG4gICAgaWYgKG9iaikge1xyXG4gICAgICAgIGlmIChpc0Z1bmN0aW9uKG9iaikpIHtcclxuICAgICAgICAgICAgZm9yIChrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBOZWVkIHRvIGNoZWNrIGlmIGhhc093blByb3BlcnR5IGV4aXN0cyxcclxuICAgICAgICAgICAgICAgIC8vIGFzIG9uIElFOCB0aGUgcmVzdWx0IG9mIHF1ZXJ5U2VsZWN0b3JBbGwgaXMgYW4gb2JqZWN0IHdpdGhvdXQgYSBoYXNPd25Qcm9wZXJ0eSBmdW5jdGlvblxyXG4gICAgICAgICAgICAgICAgaWYgKGtleSAhPSAncHJvdG90eXBlJyAmJiBrZXkgIT0gJ2xlbmd0aCcgJiYga2V5ICE9ICduYW1lJyAmJiAoIW9iai5oYXNPd25Qcm9wZXJ0eSB8fCBvYmouaGFzT3duUHJvcGVydHkoa2V5KSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGlzQXJyYXkob2JqKSB8fCBpc0FycmF5TGlrZShvYmopKSB7XHJcbiAgICAgICAgICAgIHZhciBpc1ByaW1pdGl2ZSA9IHR5cGVvZiBvYmogIT09ICdvYmplY3QnO1xyXG4gICAgICAgICAgICBmb3IgKGtleSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGtleSA8IGxlbmd0aDsga2V5KyspIHtcclxuICAgICAgICAgICAgICAgIGlmIChpc1ByaW1pdGl2ZSB8fCBrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5XSwga2V5LCBvYmopO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChvYmouZm9yRWFjaCAmJiBvYmouZm9yRWFjaCAhPT0gZm9yRWFjaCkge1xyXG4gICAgICAgICAgICBvYmouZm9yRWFjaChpdGVyYXRvciwgY29udGV4dCwgb2JqKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzQmxhbmtPYmplY3Qob2JqKSkge1xyXG4gICAgICAgICAgICAvLyBjcmVhdGVNYXAoKSBmYXN0IHBhdGggLS0tIFNhZmUgdG8gYXZvaWQgaGFzT3duUHJvcGVydHkgY2hlY2sgYmVjYXVzZSBwcm90b3R5cGUgY2hhaW4gaXMgZW1wdHlcclxuICAgICAgICAgICAgZm9yIChrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvYmouaGFzT3duUHJvcGVydHkgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgLy8gU2xvdyBwYXRoIGZvciBvYmplY3RzIGluaGVyaXRpbmcgT2JqZWN0LnByb3RvdHlwZSwgaGFzT3duUHJvcGVydHkgY2hlY2sgbmVlZGVkXHJcbiAgICAgICAgICAgIGZvciAoa2V5IGluIG9iaikge1xyXG4gICAgICAgICAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5XSwga2V5LCBvYmopO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gU2xvdyBwYXRoIGZvciBvYmplY3RzIHdoaWNoIGRvIG5vdCBoYXZlIGEgbWV0aG9kIGBoYXNPd25Qcm9wZXJ0eWBcclxuICAgICAgICAgICAgZm9yIChrZXkgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gb2JqO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRCbG9ja05vZGVzKG5vZGVzKSB7XHJcbiAgICAvLyBUT0RPKHBlcmYpOiB1cGRhdGUgYG5vZGVzYCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IG9iamVjdD9cclxuICAgIHZhciBub2RlID0gbm9kZXNbMF07XHJcbiAgICB2YXIgZW5kTm9kZSA9IG5vZGVzW25vZGVzLmxlbmd0aCAtIDFdO1xyXG4gICAgdmFyIGJsb2NrTm9kZXM7XHJcblxyXG4gICAgZm9yICh2YXIgaSA9IDE7IG5vZGUgIT09IGVuZE5vZGUgJiYgKG5vZGUgPSBub2RlLm5leHRTaWJsaW5nKTsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGJsb2NrTm9kZXMgfHwgbm9kZXNbaV0gIT09IG5vZGUpIHtcclxuICAgICAgICAgICAgaWYgKCFibG9ja05vZGVzKSB7XHJcbiAgICAgICAgICAgICAgICBibG9ja05vZGVzID0ganFMaXRlKHNsaWNlLmNhbGwobm9kZXMsIDAsIGkpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBibG9ja05vZGVzLnB1c2gobm9kZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBibG9ja05vZGVzIHx8IG5vZGVzO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgICBpc0FycmF5TGlrZTogaXNBcnJheUxpa2UsXHJcbiAgICBpc1VuZGVmaW5lZDogaXNVbmRlZmluZWQsXHJcbiAgICBpc1dpbmRvdzogaXNXaW5kb3csXHJcbiAgICBpc1Njb3BlOiBpc1Njb3BlLFxyXG4gICAgaXNBcnJheTogaXNBcnJheSxcclxuICAgIGlzU3RyaW5nOiBpc1N0cmluZyxcclxuICAgIGlzT2JqZWN0OiBpc09iamVjdCxcclxuICAgIGlzRnVudGlvbjogaXNGdW5jdGlvbixcclxuICAgIGlzQmxhbmtPYmplY3Q6IGlzQmxhbmtPYmplY3QsXHJcbiAgICBmb3JFYWNoOiBmb3JFYWNoLFxyXG4gICAgZ2V0QmxvY2tOb2RlczogZ2V0QmxvY2tOb2Rlc1xyXG59OyJdfQ==
