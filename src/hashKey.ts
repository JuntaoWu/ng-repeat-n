
var uid = 0;

function nextUid() {
    return ++uid;
}

export default function hashKey(obj, nextUidFn?) {
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
    } else {
        key = objType + ':' + obj;
    }

    return key;
}