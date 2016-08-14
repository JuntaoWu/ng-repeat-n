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
