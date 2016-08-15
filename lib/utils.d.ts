/// <reference path="../typings/index.d.ts" />
declare var _default: {
    isArrayLike: (obj: any) => boolean;
    isUndefined: (value: any) => boolean;
    isWindow: (obj: any) => boolean;
    isScope: (obj: any) => any;
    isArray: (arg: any) => arg is any[];
    isString: (value: any) => boolean;
    isObject: (value: any) => boolean;
    isFuntion: (value: any) => boolean;
    isBlankObject: (value: any) => boolean;
    forEach: (obj: any, iterator: any, context?: any) => any;
    getBlockNodes: (nodes: any) => any;
};
export default _default;
