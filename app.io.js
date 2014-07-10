/**
* js2app通讯模块，提供js与app的通讯机制
* @author ouxingzhi
* @time 2014/6/23
*/

define([], function () {
    var global = window;
    function createIframe() {
        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'overflow:hidden;height:0px;width:0px;position:absolute;left:-999px;top:-999px';
        document.body.appendChild(iframe);
        return iframe;
    }
    var createSessionId = function () {
        var id = 0, session = 'handler_' + String(Math.random()).replace('.', '');
        return function () {
            return session + '_' + id++;
        };
    } ();
    var AppIo = function () {
        this.exposeName = 'app';
        this.exposeMethod = 'callback';
        this.protocol = 'ctrip';
        //通讯用的iframe
        this.sessionIframes = {};
        //内部的callback
        this.sessionCallbacks = {};
        //外部的callback
        this.sessionOutCallbacks = {};
        //超时的错误回调
        this.sessionErrors = {};
        //记录设置回调的时间
        this.sessionTimeouts = {};
    };
    AppIo.prototype = {
        buildUrl: function (moduleName, methodName, params) {
            var paramStr = $.param(params);
            return this.protocol + '://' + moduleName + '/' + methodName + (paramStr ? '?' + $.param(params) : '');
        },

        buildCallback: function (fn, sessionId) {
            var self = this;
            this.sessionOutCallbacks[sessionId] = fn;
            return function () {
                self.sessionOutCallbacks[sessionId] && self.sessionOutCallbacks[sessionId].apply(global, arguments);
                self.removeSession(sessionId);
            }
        },
        expose: function () {
            global[this.exposeName] = {
                callback: $.proxy(this.callback, this)
            };
        },
        buildCallbackName: function () {
            return this.exposeName + '.' + this.exposeMethod;
        },
        /**
        * 删除请求
        */
        removeSession: function (sessionId) {
            if (this.sessionIframes[sessionId]) {
                if (this.sessionIframes[sessionId].parentNode) this.sessionIframes[sessionId].parentNode.removeChild(this.sessionIframes[sessionId]);
                this.sessionIframes[sessionId] = null;
            }
            if (this.sessionCallbacks[sessionId]) {
                delete this.sessionCallbacks[sessionId];
            }
            if (this.sessionOutCallbacks[sessionId]) {
                delete this.sessionOutCallbacks[sessionId];
            }
            if (this.sessionTimeouts[sessionId]) {
                delete this.sessionTimeouts[sessionId];
            }
            if (this.sessionErrors[sessionId]) {
                delete this.sessionErrors[sessionId];
            }
        },
        clearSessionLoop: function () {
            var self = this;

            var curTime = +new Date();
            var dels = [];
            _.each(this.sessionTimeouts, function (time, sessionId) {
                if (curTime - time > 30000) {
                    dels.push(sessionId);
                }
            });
            _.each(dels, function (sessionId) {
                if (typeof self.sessionErrors[sessionId] === 'function') {
                    self.sessionErrors[sessionId]();
                }
                self.removeSession(sessionId);
            });
            if (_.isEmpty(this.sessionTimeouts)) return;
            this.clearSessiontimer = setTimeout(function () {
                self.clearSessionLoop();
            }, 1000);
        },
        startClearSession: function () {
            if (!this.clearSessiontimer) {
                this.clearSessionLoop();
            }
        },
        /**
        * 在web环境调用app的服务
        * @param moduleName {String} 模块名称
        * @param methodName {String} 方法名称
        * @param callback {Function} 
        * @return {String} sessionId
        */
        call: function (moduleName, methodName, params, callback, timeoutFn, space) {
            var sessionId = createSessionId();
            params = params || {};
            callback = callback || function () { };
            timeoutFn = timeoutFn || function () { };
            this.sessionIframes[sessionId] = createIframe();
            this.sessionCallbacks[sessionId] = this.buildCallback($.proxy(callback, space), sessionId);
            params.callback = this.buildCallbackName();
            params.receipt = sessionId;
            this.sessionIframes[sessionId].src = this.buildUrl(moduleName, methodName, params || {});
            this.sessionTimeouts[sessionId] = +new Date();
            if (typeof timeoutFn === 'function') this.sessionErrors[sessionId] = $.proxy(timeoutFn, space);
            this.startClearSession();
            return sessionId;
        },
        //暴露给app的用于回调
        callback: function (data, sessionId) {
            if (typeof this.sessionCallbacks[sessionId] === 'function') {
                this.sessionCallbacks[sessionId](data);
                if (_.isEmpty(this.sessionTimeouts)) {
                    clearTimeout(this.clearSessiontimer);
                }
            }
        },
        /**
        * 注册给app的回调
        * @param sessionId {String} 可选 指定要传的sessionId
        * @param fn {Function} 传入回调函数
        * @param space {Object} 可选 回调函数执行的上下文
        * @param 
        * @return {String} 被注册回调的句柄
        */
        register: function (sessionId, fn, space, lasting) {
            if (_.isFunction(sessionId)) {
                lasting = space;
                space = fn;
                fn = sessionId;
                sessionId = null;
            }
            var sessionId = sessionId || createSessionId();
            var self = this;
            this.sessionCallbacks[sessionId] = function () {
                fn && fn.apply(space, arguments);
                if (!lasting) {
                    delete self.sessionCallbacks[sessionId];
                    fn = null;
                    space = null;
                }
            };
            return sessionId;
        },
        /**
        * 取消注册
        * @param sessionId {String} 要取消的事件句柄
        */
        unRegister: function (sessionId) {
            if (sessionId instanceof Array) {
                var self = this;
                _.each(sessionId, function (v) {
                    self.unRegister(v);
                });
                return;
            }
            this.removeSession(sessionId)
        },
        //判断sessionid是否注册过
        isRegister: function (sessionId) {
            return !!this.sessionCallbacks[sessionId];
        }
    };

    AppIo.getInstance = function () {
        if (this.instance) {
            return this.instance;
        }
        return this.instance = new this();
    };
    var appio = AppIo.getInstance();
    appio.expose();

    return appio;
});
