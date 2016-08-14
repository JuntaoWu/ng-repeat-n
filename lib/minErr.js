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
