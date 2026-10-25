(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // ../../opt/files/node_modules/react/cjs/react.production.min.js
  var require_react_production_min = __commonJS({
    "../../opt/files/node_modules/react/cjs/react.production.min.js"(exports) {
      "use strict";
      var l2 = /* @__PURE__ */ Symbol.for("react.element");
      var n = /* @__PURE__ */ Symbol.for("react.portal");
      var p = /* @__PURE__ */ Symbol.for("react.fragment");
      var q2 = /* @__PURE__ */ Symbol.for("react.strict_mode");
      var r = /* @__PURE__ */ Symbol.for("react.profiler");
      var t = /* @__PURE__ */ Symbol.for("react.provider");
      var u = /* @__PURE__ */ Symbol.for("react.context");
      var v2 = /* @__PURE__ */ Symbol.for("react.forward_ref");
      var w = /* @__PURE__ */ Symbol.for("react.suspense");
      var x = /* @__PURE__ */ Symbol.for("react.memo");
      var y2 = /* @__PURE__ */ Symbol.for("react.lazy");
      var z3 = Symbol.iterator;
      function A3(a) {
        if (null === a || "object" !== typeof a) return null;
        a = z3 && a[z3] || a["@@iterator"];
        return "function" === typeof a ? a : null;
      }
      var B3 = { isMounted: function() {
        return false;
      }, enqueueForceUpdate: function() {
      }, enqueueReplaceState: function() {
      }, enqueueSetState: function() {
      } };
      var C = Object.assign;
      var D2 = {};
      function E3(a, b, e2) {
        this.props = a;
        this.context = b;
        this.refs = D2;
        this.updater = e2 || B3;
      }
      E3.prototype.isReactComponent = {};
      E3.prototype.setState = function(a, b) {
        if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
        this.updater.enqueueSetState(this, a, b, "setState");
      };
      E3.prototype.forceUpdate = function(a) {
        this.updater.enqueueForceUpdate(this, a, "forceUpdate");
      };
      function F2() {
      }
      F2.prototype = E3.prototype;
      function G2(a, b, e2) {
        this.props = a;
        this.context = b;
        this.refs = D2;
        this.updater = e2 || B3;
      }
      var H = G2.prototype = new F2();
      H.constructor = G2;
      C(H, E3.prototype);
      H.isPureReactComponent = true;
      var I3 = Array.isArray;
      var J2 = Object.prototype.hasOwnProperty;
      var K2 = { current: null };
      var L = { key: true, ref: true, __self: true, __source: true };
      function M2(a, b, e2) {
        var d, c = {}, k2 = null, h = null;
        if (null != b) for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k2 = "" + b.key), b) J2.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
        var g = arguments.length - 2;
        if (1 === g) c.children = e2;
        else if (1 < g) {
          for (var f2 = Array(g), m = 0; m < g; m++) f2[m] = arguments[m + 2];
          c.children = f2;
        }
        if (a && a.defaultProps) for (d in g = a.defaultProps, g) void 0 === c[d] && (c[d] = g[d]);
        return { $$typeof: l2, type: a, key: k2, ref: h, props: c, _owner: K2.current };
      }
      function N2(a, b) {
        return { $$typeof: l2, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
      }
      function O3(a) {
        return "object" === typeof a && null !== a && a.$$typeof === l2;
      }
      function escape(a) {
        var b = { "=": "=0", ":": "=2" };
        return "$" + a.replace(/[=:]/g, function(a2) {
          return b[a2];
        });
      }
      var P = /\/+/g;
      function Q2(a, b) {
        return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
      }
      function R3(a, b, e2, d, c) {
        var k2 = typeof a;
        if ("undefined" === k2 || "boolean" === k2) a = null;
        var h = false;
        if (null === a) h = true;
        else switch (k2) {
          case "string":
          case "number":
            h = true;
            break;
          case "object":
            switch (a.$$typeof) {
              case l2:
              case n:
                h = true;
            }
        }
        if (h) return h = a, c = c(h), a = "" === d ? "." + Q2(h, 0) : d, I3(c) ? (e2 = "", null != a && (e2 = a.replace(P, "$&/") + "/"), R3(c, b, e2, "", function(a2) {
          return a2;
        })) : null != c && (O3(c) && (c = N2(c, e2 + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
        h = 0;
        d = "" === d ? "." : d + ":";
        if (I3(a)) for (var g = 0; g < a.length; g++) {
          k2 = a[g];
          var f2 = d + Q2(k2, g);
          h += R3(k2, b, e2, f2, c);
        }
        else if (f2 = A3(a), "function" === typeof f2) for (a = f2.call(a), g = 0; !(k2 = a.next()).done; ) k2 = k2.value, f2 = d + Q2(k2, g++), h += R3(k2, b, e2, f2, c);
        else if ("object" === k2) throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
        return h;
      }
      function S3(a, b, e2) {
        if (null == a) return a;
        var d = [], c = 0;
        R3(a, d, "", "", function(a2) {
          return b.call(e2, a2, c++);
        });
        return d;
      }
      function T2(a) {
        if (-1 === a._status) {
          var b = a._result;
          b = b();
          b.then(function(b2) {
            if (0 === a._status || -1 === a._status) a._status = 1, a._result = b2;
          }, function(b2) {
            if (0 === a._status || -1 === a._status) a._status = 2, a._result = b2;
          });
          -1 === a._status && (a._status = 0, a._result = b);
        }
        if (1 === a._status) return a._result.default;
        throw a._result;
      }
      var U2 = { current: null };
      var V = { transition: null };
      var W = { ReactCurrentDispatcher: U2, ReactCurrentBatchConfig: V, ReactCurrentOwner: K2 };
      function X2() {
        throw Error("act(...) is not supported in production builds of React.");
      }
      exports.Children = { map: S3, forEach: function(a, b, e2) {
        S3(a, function() {
          b.apply(this, arguments);
        }, e2);
      }, count: function(a) {
        var b = 0;
        S3(a, function() {
          b++;
        });
        return b;
      }, toArray: function(a) {
        return S3(a, function(a2) {
          return a2;
        }) || [];
      }, only: function(a) {
        if (!O3(a)) throw Error("React.Children.only expected to receive a single React element child.");
        return a;
      } };
      exports.Component = E3;
      exports.Fragment = p;
      exports.Profiler = r;
      exports.PureComponent = G2;
      exports.StrictMode = q2;
      exports.Suspense = w;
      exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
      exports.act = X2;
      exports.cloneElement = function(a, b, e2) {
        if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
        var d = C({}, a.props), c = a.key, k2 = a.ref, h = a._owner;
        if (null != b) {
          void 0 !== b.ref && (k2 = b.ref, h = K2.current);
          void 0 !== b.key && (c = "" + b.key);
          if (a.type && a.type.defaultProps) var g = a.type.defaultProps;
          for (f2 in b) J2.call(b, f2) && !L.hasOwnProperty(f2) && (d[f2] = void 0 === b[f2] && void 0 !== g ? g[f2] : b[f2]);
        }
        var f2 = arguments.length - 2;
        if (1 === f2) d.children = e2;
        else if (1 < f2) {
          g = Array(f2);
          for (var m = 0; m < f2; m++) g[m] = arguments[m + 2];
          d.children = g;
        }
        return { $$typeof: l2, type: a.type, key: c, ref: k2, props: d, _owner: h };
      };
      exports.createContext = function(a) {
        a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
        a.Provider = { $$typeof: t, _context: a };
        return a.Consumer = a;
      };
      exports.createElement = M2;
      exports.createFactory = function(a) {
        var b = M2.bind(null, a);
        b.type = a;
        return b;
      };
      exports.createRef = function() {
        return { current: null };
      };
      exports.forwardRef = function(a) {
        return { $$typeof: v2, render: a };
      };
      exports.isValidElement = O3;
      exports.lazy = function(a) {
        return { $$typeof: y2, _payload: { _status: -1, _result: a }, _init: T2 };
      };
      exports.memo = function(a, b) {
        return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
      };
      exports.startTransition = function(a) {
        var b = V.transition;
        V.transition = {};
        try {
          a();
        } finally {
          V.transition = b;
        }
      };
      exports.unstable_act = X2;
      exports.useCallback = function(a, b) {
        return U2.current.useCallback(a, b);
      };
      exports.useContext = function(a) {
        return U2.current.useContext(a);
      };
      exports.useDebugValue = function() {
      };
      exports.useDeferredValue = function(a) {
        return U2.current.useDeferredValue(a);
      };
      exports.useEffect = function(a, b) {
        return U2.current.useEffect(a, b);
      };
      exports.useId = function() {
        return U2.current.useId();
      };
      exports.useImperativeHandle = function(a, b, e2) {
        return U2.current.useImperativeHandle(a, b, e2);
      };
      exports.useInsertionEffect = function(a, b) {
        return U2.current.useInsertionEffect(a, b);
      };
      exports.useLayoutEffect = function(a, b) {
        return U2.current.useLayoutEffect(a, b);
      };
      exports.useMemo = function(a, b) {
        return U2.current.useMemo(a, b);
      };
      exports.useReducer = function(a, b, e2) {
        return U2.current.useReducer(a, b, e2);
      };
      exports.useRef = function(a) {
        return U2.current.useRef(a);
      };
      exports.useState = function(a) {
        return U2.current.useState(a);
      };
      exports.useSyncExternalStore = function(a, b, e2) {
        return U2.current.useSyncExternalStore(a, b, e2);
      };
      exports.useTransition = function() {
        return U2.current.useTransition();
      };
      exports.version = "18.3.1";
    }
  });

  // ../../opt/files/node_modules/react/index.js
  var require_react = __commonJS({
    "../../opt/files/node_modules/react/index.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_react_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // ../../opt/files/node_modules/scheduler/cjs/scheduler.production.min.js
  var require_scheduler_production_min = __commonJS({
    "../../opt/files/node_modules/scheduler/cjs/scheduler.production.min.js"(exports) {
      "use strict";
      function f2(a, b) {
        var c = a.length;
        a.push(b);
        a: for (; 0 < c; ) {
          var d = c - 1 >>> 1, e2 = a[d];
          if (0 < g(e2, b)) a[d] = b, a[c] = e2, c = d;
          else break a;
        }
      }
      function h(a) {
        return 0 === a.length ? null : a[0];
      }
      function k2(a) {
        if (0 === a.length) return null;
        var b = a[0], c = a.pop();
        if (c !== b) {
          a[0] = c;
          a: for (var d = 0, e2 = a.length, w = e2 >>> 1; d < w; ) {
            var m = 2 * (d + 1) - 1, C = a[m], n = m + 1, x = a[n];
            if (0 > g(C, c)) n < e2 && 0 > g(x, C) ? (a[d] = x, a[n] = c, d = n) : (a[d] = C, a[m] = c, d = m);
            else if (n < e2 && 0 > g(x, c)) a[d] = x, a[n] = c, d = n;
            else break a;
          }
        }
        return b;
      }
      function g(a, b) {
        var c = a.sortIndex - b.sortIndex;
        return 0 !== c ? c : a.id - b.id;
      }
      if ("object" === typeof performance && "function" === typeof performance.now) {
        l2 = performance;
        exports.unstable_now = function() {
          return l2.now();
        };
      } else {
        p = Date, q2 = p.now();
        exports.unstable_now = function() {
          return p.now() - q2;
        };
      }
      var l2;
      var p;
      var q2;
      var r = [];
      var t = [];
      var u = 1;
      var v2 = null;
      var y2 = 3;
      var z3 = false;
      var A3 = false;
      var B3 = false;
      var D2 = "function" === typeof setTimeout ? setTimeout : null;
      var E3 = "function" === typeof clearTimeout ? clearTimeout : null;
      var F2 = "undefined" !== typeof setImmediate ? setImmediate : null;
      "undefined" !== typeof navigator && void 0 !== navigator.scheduling && void 0 !== navigator.scheduling.isInputPending && navigator.scheduling.isInputPending.bind(navigator.scheduling);
      function G2(a) {
        for (var b = h(t); null !== b; ) {
          if (null === b.callback) k2(t);
          else if (b.startTime <= a) k2(t), b.sortIndex = b.expirationTime, f2(r, b);
          else break;
          b = h(t);
        }
      }
      function H(a) {
        B3 = false;
        G2(a);
        if (!A3) if (null !== h(r)) A3 = true, I3(J2);
        else {
          var b = h(t);
          null !== b && K2(H, b.startTime - a);
        }
      }
      function J2(a, b) {
        A3 = false;
        B3 && (B3 = false, E3(L), L = -1);
        z3 = true;
        var c = y2;
        try {
          G2(b);
          for (v2 = h(r); null !== v2 && (!(v2.expirationTime > b) || a && !M2()); ) {
            var d = v2.callback;
            if ("function" === typeof d) {
              v2.callback = null;
              y2 = v2.priorityLevel;
              var e2 = d(v2.expirationTime <= b);
              b = exports.unstable_now();
              "function" === typeof e2 ? v2.callback = e2 : v2 === h(r) && k2(r);
              G2(b);
            } else k2(r);
            v2 = h(r);
          }
          if (null !== v2) var w = true;
          else {
            var m = h(t);
            null !== m && K2(H, m.startTime - b);
            w = false;
          }
          return w;
        } finally {
          v2 = null, y2 = c, z3 = false;
        }
      }
      var N2 = false;
      var O3 = null;
      var L = -1;
      var P = 5;
      var Q2 = -1;
      function M2() {
        return exports.unstable_now() - Q2 < P ? false : true;
      }
      function R3() {
        if (null !== O3) {
          var a = exports.unstable_now();
          Q2 = a;
          var b = true;
          try {
            b = O3(true, a);
          } finally {
            b ? S3() : (N2 = false, O3 = null);
          }
        } else N2 = false;
      }
      var S3;
      if ("function" === typeof F2) S3 = function() {
        F2(R3);
      };
      else if ("undefined" !== typeof MessageChannel) {
        T2 = new MessageChannel(), U2 = T2.port2;
        T2.port1.onmessage = R3;
        S3 = function() {
          U2.postMessage(null);
        };
      } else S3 = function() {
        D2(R3, 0);
      };
      var T2;
      var U2;
      function I3(a) {
        O3 = a;
        N2 || (N2 = true, S3());
      }
      function K2(a, b) {
        L = D2(function() {
          a(exports.unstable_now());
        }, b);
      }
      exports.unstable_IdlePriority = 5;
      exports.unstable_ImmediatePriority = 1;
      exports.unstable_LowPriority = 4;
      exports.unstable_NormalPriority = 3;
      exports.unstable_Profiling = null;
      exports.unstable_UserBlockingPriority = 2;
      exports.unstable_cancelCallback = function(a) {
        a.callback = null;
      };
      exports.unstable_continueExecution = function() {
        A3 || z3 || (A3 = true, I3(J2));
      };
      exports.unstable_forceFrameRate = function(a) {
        0 > a || 125 < a ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : P = 0 < a ? Math.floor(1e3 / a) : 5;
      };
      exports.unstable_getCurrentPriorityLevel = function() {
        return y2;
      };
      exports.unstable_getFirstCallbackNode = function() {
        return h(r);
      };
      exports.unstable_next = function(a) {
        switch (y2) {
          case 1:
          case 2:
          case 3:
            var b = 3;
            break;
          default:
            b = y2;
        }
        var c = y2;
        y2 = b;
        try {
          return a();
        } finally {
          y2 = c;
        }
      };
      exports.unstable_pauseExecution = function() {
      };
      exports.unstable_requestPaint = function() {
      };
      exports.unstable_runWithPriority = function(a, b) {
        switch (a) {
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
            break;
          default:
            a = 3;
        }
        var c = y2;
        y2 = a;
        try {
          return b();
        } finally {
          y2 = c;
        }
      };
      exports.unstable_scheduleCallback = function(a, b, c) {
        var d = exports.unstable_now();
        "object" === typeof c && null !== c ? (c = c.delay, c = "number" === typeof c && 0 < c ? d + c : d) : c = d;
        switch (a) {
          case 1:
            var e2 = -1;
            break;
          case 2:
            e2 = 250;
            break;
          case 5:
            e2 = 1073741823;
            break;
          case 4:
            e2 = 1e4;
            break;
          default:
            e2 = 5e3;
        }
        e2 = c + e2;
        a = { id: u++, callback: b, priorityLevel: a, startTime: c, expirationTime: e2, sortIndex: -1 };
        c > d ? (a.sortIndex = c, f2(t, a), null === h(r) && a === h(t) && (B3 ? (E3(L), L = -1) : B3 = true, K2(H, c - d))) : (a.sortIndex = e2, f2(r, a), A3 || z3 || (A3 = true, I3(J2)));
        return a;
      };
      exports.unstable_shouldYield = M2;
      exports.unstable_wrapCallback = function(a) {
        var b = y2;
        return function() {
          var c = y2;
          y2 = b;
          try {
            return a.apply(this, arguments);
          } finally {
            y2 = c;
          }
        };
      };
    }
  });

  // ../../opt/files/node_modules/scheduler/index.js
  var require_scheduler = __commonJS({
    "../../opt/files/node_modules/scheduler/index.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_scheduler_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // ../../opt/files/node_modules/react-dom/cjs/react-dom.production.min.js
  var require_react_dom_production_min = __commonJS({
    "../../opt/files/node_modules/react-dom/cjs/react-dom.production.min.js"(exports) {
      "use strict";
      var aa = require_react();
      var ca2 = require_scheduler();
      function p(a) {
        for (var b = "https://reactjs.org/docs/error-decoder.html?invariant=" + a, c = 1; c < arguments.length; c++) b += "&args[]=" + encodeURIComponent(arguments[c]);
        return "Minified React error #" + a + "; visit " + b + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
      }
      var da2 = /* @__PURE__ */ new Set();
      var ea2 = {};
      function fa2(a, b) {
        ha(a, b);
        ha(a + "Capture", b);
      }
      function ha(a, b) {
        ea2[a] = b;
        for (a = 0; a < b.length; a++) da2.add(b[a]);
      }
      var ia = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement);
      var ja2 = Object.prototype.hasOwnProperty;
      var ka2 = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/;
      var la2 = {};
      var ma2 = {};
      function oa(a) {
        if (ja2.call(ma2, a)) return true;
        if (ja2.call(la2, a)) return false;
        if (ka2.test(a)) return ma2[a] = true;
        la2[a] = true;
        return false;
      }
      function pa2(a, b, c, d) {
        if (null !== c && 0 === c.type) return false;
        switch (typeof b) {
          case "function":
          case "symbol":
            return true;
          case "boolean":
            if (d) return false;
            if (null !== c) return !c.acceptsBooleans;
            a = a.toLowerCase().slice(0, 5);
            return "data-" !== a && "aria-" !== a;
          default:
            return false;
        }
      }
      function qa2(a, b, c, d) {
        if (null === b || "undefined" === typeof b || pa2(a, b, c, d)) return true;
        if (d) return false;
        if (null !== c) switch (c.type) {
          case 3:
            return !b;
          case 4:
            return false === b;
          case 5:
            return isNaN(b);
          case 6:
            return isNaN(b) || 1 > b;
        }
        return false;
      }
      function v2(a, b, c, d, e2, f2, g) {
        this.acceptsBooleans = 2 === b || 3 === b || 4 === b;
        this.attributeName = d;
        this.attributeNamespace = e2;
        this.mustUseProperty = c;
        this.propertyName = a;
        this.type = b;
        this.sanitizeURL = f2;
        this.removeEmptyString = g;
      }
      var z3 = {};
      "children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a) {
        z3[a] = new v2(a, 0, false, a, null, false, false);
      });
      [["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(a) {
        var b = a[0];
        z3[b] = new v2(b, 1, false, a[1], null, false, false);
      });
      ["contentEditable", "draggable", "spellCheck", "value"].forEach(function(a) {
        z3[a] = new v2(a, 2, false, a.toLowerCase(), null, false, false);
      });
      ["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(a) {
        z3[a] = new v2(a, 2, false, a, null, false, false);
      });
      "allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a) {
        z3[a] = new v2(a, 3, false, a.toLowerCase(), null, false, false);
      });
      ["checked", "multiple", "muted", "selected"].forEach(function(a) {
        z3[a] = new v2(a, 3, true, a, null, false, false);
      });
      ["capture", "download"].forEach(function(a) {
        z3[a] = new v2(a, 4, false, a, null, false, false);
      });
      ["cols", "rows", "size", "span"].forEach(function(a) {
        z3[a] = new v2(a, 6, false, a, null, false, false);
      });
      ["rowSpan", "start"].forEach(function(a) {
        z3[a] = new v2(a, 5, false, a.toLowerCase(), null, false, false);
      });
      var ra = /[\-:]([a-z])/g;
      function sa2(a) {
        return a[1].toUpperCase();
      }
      "accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a) {
        var b = a.replace(
          ra,
          sa2
        );
        z3[b] = new v2(b, 1, false, a, null, false, false);
      });
      "xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a) {
        var b = a.replace(ra, sa2);
        z3[b] = new v2(b, 1, false, a, "http://www.w3.org/1999/xlink", false, false);
      });
      ["xml:base", "xml:lang", "xml:space"].forEach(function(a) {
        var b = a.replace(ra, sa2);
        z3[b] = new v2(b, 1, false, a, "http://www.w3.org/XML/1998/namespace", false, false);
      });
      ["tabIndex", "crossOrigin"].forEach(function(a) {
        z3[a] = new v2(a, 1, false, a.toLowerCase(), null, false, false);
      });
      z3.xlinkHref = new v2("xlinkHref", 1, false, "xlink:href", "http://www.w3.org/1999/xlink", true, false);
      ["src", "href", "action", "formAction"].forEach(function(a) {
        z3[a] = new v2(a, 1, false, a.toLowerCase(), null, true, true);
      });
      function ta(a, b, c, d) {
        var e2 = z3.hasOwnProperty(b) ? z3[b] : null;
        if (null !== e2 ? 0 !== e2.type : d || !(2 < b.length) || "o" !== b[0] && "O" !== b[0] || "n" !== b[1] && "N" !== b[1]) qa2(b, c, e2, d) && (c = null), d || null === e2 ? oa(b) && (null === c ? a.removeAttribute(b) : a.setAttribute(b, "" + c)) : e2.mustUseProperty ? a[e2.propertyName] = null === c ? 3 === e2.type ? false : "" : c : (b = e2.attributeName, d = e2.attributeNamespace, null === c ? a.removeAttribute(b) : (e2 = e2.type, c = 3 === e2 || 4 === e2 && true === c ? "" : "" + c, d ? a.setAttributeNS(d, b, c) : a.setAttribute(b, c)));
      }
      var ua2 = aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
      var va = /* @__PURE__ */ Symbol.for("react.element");
      var wa = /* @__PURE__ */ Symbol.for("react.portal");
      var ya = /* @__PURE__ */ Symbol.for("react.fragment");
      var za = /* @__PURE__ */ Symbol.for("react.strict_mode");
      var Aa = /* @__PURE__ */ Symbol.for("react.profiler");
      var Ba = /* @__PURE__ */ Symbol.for("react.provider");
      var Ca = /* @__PURE__ */ Symbol.for("react.context");
      var Da2 = /* @__PURE__ */ Symbol.for("react.forward_ref");
      var Ea = /* @__PURE__ */ Symbol.for("react.suspense");
      var Fa2 = /* @__PURE__ */ Symbol.for("react.suspense_list");
      var Ga = /* @__PURE__ */ Symbol.for("react.memo");
      var Ha2 = /* @__PURE__ */ Symbol.for("react.lazy");
      var Ia = /* @__PURE__ */ Symbol.for("react.offscreen");
      var Ja2 = Symbol.iterator;
      function Ka2(a) {
        if (null === a || "object" !== typeof a) return null;
        a = Ja2 && a[Ja2] || a["@@iterator"];
        return "function" === typeof a ? a : null;
      }
      var A3 = Object.assign;
      var La2;
      function Ma(a) {
        if (void 0 === La2) try {
          throw Error();
        } catch (c) {
          var b = c.stack.trim().match(/\n( *(at )?)/);
          La2 = b && b[1] || "";
        }
        return "\n" + La2 + a;
      }
      var Na = false;
      function Oa2(a, b) {
        if (!a || Na) return "";
        Na = true;
        var c = Error.prepareStackTrace;
        Error.prepareStackTrace = void 0;
        try {
          if (b) if (b = function() {
            throw Error();
          }, Object.defineProperty(b.prototype, "props", { set: function() {
            throw Error();
          } }), "object" === typeof Reflect && Reflect.construct) {
            try {
              Reflect.construct(b, []);
            } catch (l2) {
              var d = l2;
            }
            Reflect.construct(a, [], b);
          } else {
            try {
              b.call();
            } catch (l2) {
              d = l2;
            }
            a.call(b.prototype);
          }
          else {
            try {
              throw Error();
            } catch (l2) {
              d = l2;
            }
            a();
          }
        } catch (l2) {
          if (l2 && d && "string" === typeof l2.stack) {
            for (var e2 = l2.stack.split("\n"), f2 = d.stack.split("\n"), g = e2.length - 1, h = f2.length - 1; 1 <= g && 0 <= h && e2[g] !== f2[h]; ) h--;
            for (; 1 <= g && 0 <= h; g--, h--) if (e2[g] !== f2[h]) {
              if (1 !== g || 1 !== h) {
                do
                  if (g--, h--, 0 > h || e2[g] !== f2[h]) {
                    var k2 = "\n" + e2[g].replace(" at new ", " at ");
                    a.displayName && k2.includes("<anonymous>") && (k2 = k2.replace("<anonymous>", a.displayName));
                    return k2;
                  }
                while (1 <= g && 0 <= h);
              }
              break;
            }
          }
        } finally {
          Na = false, Error.prepareStackTrace = c;
        }
        return (a = a ? a.displayName || a.name : "") ? Ma(a) : "";
      }
      function Pa2(a) {
        switch (a.tag) {
          case 5:
            return Ma(a.type);
          case 16:
            return Ma("Lazy");
          case 13:
            return Ma("Suspense");
          case 19:
            return Ma("SuspenseList");
          case 0:
          case 2:
          case 15:
            return a = Oa2(a.type, false), a;
          case 11:
            return a = Oa2(a.type.render, false), a;
          case 1:
            return a = Oa2(a.type, true), a;
          default:
            return "";
        }
      }
      function Qa2(a) {
        if (null == a) return null;
        if ("function" === typeof a) return a.displayName || a.name || null;
        if ("string" === typeof a) return a;
        switch (a) {
          case ya:
            return "Fragment";
          case wa:
            return "Portal";
          case Aa:
            return "Profiler";
          case za:
            return "StrictMode";
          case Ea:
            return "Suspense";
          case Fa2:
            return "SuspenseList";
        }
        if ("object" === typeof a) switch (a.$$typeof) {
          case Ca:
            return (a.displayName || "Context") + ".Consumer";
          case Ba:
            return (a._context.displayName || "Context") + ".Provider";
          case Da2:
            var b = a.render;
            a = a.displayName;
            a || (a = b.displayName || b.name || "", a = "" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
            return a;
          case Ga:
            return b = a.displayName || null, null !== b ? b : Qa2(a.type) || "Memo";
          case Ha2:
            b = a._payload;
            a = a._init;
            try {
              return Qa2(a(b));
            } catch (c) {
            }
        }
        return null;
      }
      function Ra2(a) {
        var b = a.type;
        switch (a.tag) {
          case 24:
            return "Cache";
          case 9:
            return (b.displayName || "Context") + ".Consumer";
          case 10:
            return (b._context.displayName || "Context") + ".Provider";
          case 18:
            return "DehydratedFragment";
          case 11:
            return a = b.render, a = a.displayName || a.name || "", b.displayName || ("" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
          case 7:
            return "Fragment";
          case 5:
            return b;
          case 4:
            return "Portal";
          case 3:
            return "Root";
          case 6:
            return "Text";
          case 16:
            return Qa2(b);
          case 8:
            return b === za ? "StrictMode" : "Mode";
          case 22:
            return "Offscreen";
          case 12:
            return "Profiler";
          case 21:
            return "Scope";
          case 13:
            return "Suspense";
          case 19:
            return "SuspenseList";
          case 25:
            return "TracingMarker";
          case 1:
          case 0:
          case 17:
          case 2:
          case 14:
          case 15:
            if ("function" === typeof b) return b.displayName || b.name || null;
            if ("string" === typeof b) return b;
        }
        return null;
      }
      function Sa(a) {
        switch (typeof a) {
          case "boolean":
          case "number":
          case "string":
          case "undefined":
            return a;
          case "object":
            return a;
          default:
            return "";
        }
      }
      function Ta2(a) {
        var b = a.type;
        return (a = a.nodeName) && "input" === a.toLowerCase() && ("checkbox" === b || "radio" === b);
      }
      function Ua(a) {
        var b = Ta2(a) ? "checked" : "value", c = Object.getOwnPropertyDescriptor(a.constructor.prototype, b), d = "" + a[b];
        if (!a.hasOwnProperty(b) && "undefined" !== typeof c && "function" === typeof c.get && "function" === typeof c.set) {
          var e2 = c.get, f2 = c.set;
          Object.defineProperty(a, b, { configurable: true, get: function() {
            return e2.call(this);
          }, set: function(a2) {
            d = "" + a2;
            f2.call(this, a2);
          } });
          Object.defineProperty(a, b, { enumerable: c.enumerable });
          return { getValue: function() {
            return d;
          }, setValue: function(a2) {
            d = "" + a2;
          }, stopTracking: function() {
            a._valueTracker = null;
            delete a[b];
          } };
        }
      }
      function Va2(a) {
        a._valueTracker || (a._valueTracker = Ua(a));
      }
      function Wa(a) {
        if (!a) return false;
        var b = a._valueTracker;
        if (!b) return true;
        var c = b.getValue();
        var d = "";
        a && (d = Ta2(a) ? a.checked ? "true" : "false" : a.value);
        a = d;
        return a !== c ? (b.setValue(a), true) : false;
      }
      function Xa2(a) {
        a = a || ("undefined" !== typeof document ? document : void 0);
        if ("undefined" === typeof a) return null;
        try {
          return a.activeElement || a.body;
        } catch (b) {
          return a.body;
        }
      }
      function Ya2(a, b) {
        var c = b.checked;
        return A3({}, b, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: null != c ? c : a._wrapperState.initialChecked });
      }
      function Za2(a, b) {
        var c = null == b.defaultValue ? "" : b.defaultValue, d = null != b.checked ? b.checked : b.defaultChecked;
        c = Sa(null != b.value ? b.value : c);
        a._wrapperState = { initialChecked: d, initialValue: c, controlled: "checkbox" === b.type || "radio" === b.type ? null != b.checked : null != b.value };
      }
      function ab(a, b) {
        b = b.checked;
        null != b && ta(a, "checked", b, false);
      }
      function bb(a, b) {
        ab(a, b);
        var c = Sa(b.value), d = b.type;
        if (null != c) if ("number" === d) {
          if (0 === c && "" === a.value || a.value != c) a.value = "" + c;
        } else a.value !== "" + c && (a.value = "" + c);
        else if ("submit" === d || "reset" === d) {
          a.removeAttribute("value");
          return;
        }
        b.hasOwnProperty("value") ? cb(a, b.type, c) : b.hasOwnProperty("defaultValue") && cb(a, b.type, Sa(b.defaultValue));
        null == b.checked && null != b.defaultChecked && (a.defaultChecked = !!b.defaultChecked);
      }
      function db(a, b, c) {
        if (b.hasOwnProperty("value") || b.hasOwnProperty("defaultValue")) {
          var d = b.type;
          if (!("submit" !== d && "reset" !== d || void 0 !== b.value && null !== b.value)) return;
          b = "" + a._wrapperState.initialValue;
          c || b === a.value || (a.value = b);
          a.defaultValue = b;
        }
        c = a.name;
        "" !== c && (a.name = "");
        a.defaultChecked = !!a._wrapperState.initialChecked;
        "" !== c && (a.name = c);
      }
      function cb(a, b, c) {
        if ("number" !== b || Xa2(a.ownerDocument) !== a) null == c ? a.defaultValue = "" + a._wrapperState.initialValue : a.defaultValue !== "" + c && (a.defaultValue = "" + c);
      }
      var eb = Array.isArray;
      function fb(a, b, c, d) {
        a = a.options;
        if (b) {
          b = {};
          for (var e2 = 0; e2 < c.length; e2++) b["$" + c[e2]] = true;
          for (c = 0; c < a.length; c++) e2 = b.hasOwnProperty("$" + a[c].value), a[c].selected !== e2 && (a[c].selected = e2), e2 && d && (a[c].defaultSelected = true);
        } else {
          c = "" + Sa(c);
          b = null;
          for (e2 = 0; e2 < a.length; e2++) {
            if (a[e2].value === c) {
              a[e2].selected = true;
              d && (a[e2].defaultSelected = true);
              return;
            }
            null !== b || a[e2].disabled || (b = a[e2]);
          }
          null !== b && (b.selected = true);
        }
      }
      function gb(a, b) {
        if (null != b.dangerouslySetInnerHTML) throw Error(p(91));
        return A3({}, b, { value: void 0, defaultValue: void 0, children: "" + a._wrapperState.initialValue });
      }
      function hb(a, b) {
        var c = b.value;
        if (null == c) {
          c = b.children;
          b = b.defaultValue;
          if (null != c) {
            if (null != b) throw Error(p(92));
            if (eb(c)) {
              if (1 < c.length) throw Error(p(93));
              c = c[0];
            }
            b = c;
          }
          null == b && (b = "");
          c = b;
        }
        a._wrapperState = { initialValue: Sa(c) };
      }
      function ib(a, b) {
        var c = Sa(b.value), d = Sa(b.defaultValue);
        null != c && (c = "" + c, c !== a.value && (a.value = c), null == b.defaultValue && a.defaultValue !== c && (a.defaultValue = c));
        null != d && (a.defaultValue = "" + d);
      }
      function jb(a) {
        var b = a.textContent;
        b === a._wrapperState.initialValue && "" !== b && null !== b && (a.value = b);
      }
      function kb(a) {
        switch (a) {
          case "svg":
            return "http://www.w3.org/2000/svg";
          case "math":
            return "http://www.w3.org/1998/Math/MathML";
          default:
            return "http://www.w3.org/1999/xhtml";
        }
      }
      function lb(a, b) {
        return null == a || "http://www.w3.org/1999/xhtml" === a ? kb(b) : "http://www.w3.org/2000/svg" === a && "foreignObject" === b ? "http://www.w3.org/1999/xhtml" : a;
      }
      var mb;
      var nb = (function(a) {
        return "undefined" !== typeof MSApp && MSApp.execUnsafeLocalFunction ? function(b, c, d, e2) {
          MSApp.execUnsafeLocalFunction(function() {
            return a(b, c, d, e2);
          });
        } : a;
      })(function(a, b) {
        if ("http://www.w3.org/2000/svg" !== a.namespaceURI || "innerHTML" in a) a.innerHTML = b;
        else {
          mb = mb || document.createElement("div");
          mb.innerHTML = "<svg>" + b.valueOf().toString() + "</svg>";
          for (b = mb.firstChild; a.firstChild; ) a.removeChild(a.firstChild);
          for (; b.firstChild; ) a.appendChild(b.firstChild);
        }
      });
      function ob(a, b) {
        if (b) {
          var c = a.firstChild;
          if (c && c === a.lastChild && 3 === c.nodeType) {
            c.nodeValue = b;
            return;
          }
        }
        a.textContent = b;
      }
      var pb = {
        animationIterationCount: true,
        aspectRatio: true,
        borderImageOutset: true,
        borderImageSlice: true,
        borderImageWidth: true,
        boxFlex: true,
        boxFlexGroup: true,
        boxOrdinalGroup: true,
        columnCount: true,
        columns: true,
        flex: true,
        flexGrow: true,
        flexPositive: true,
        flexShrink: true,
        flexNegative: true,
        flexOrder: true,
        gridArea: true,
        gridRow: true,
        gridRowEnd: true,
        gridRowSpan: true,
        gridRowStart: true,
        gridColumn: true,
        gridColumnEnd: true,
        gridColumnSpan: true,
        gridColumnStart: true,
        fontWeight: true,
        lineClamp: true,
        lineHeight: true,
        opacity: true,
        order: true,
        orphans: true,
        tabSize: true,
        widows: true,
        zIndex: true,
        zoom: true,
        fillOpacity: true,
        floodOpacity: true,
        stopOpacity: true,
        strokeDasharray: true,
        strokeDashoffset: true,
        strokeMiterlimit: true,
        strokeOpacity: true,
        strokeWidth: true
      };
      var qb = ["Webkit", "ms", "Moz", "O"];
      Object.keys(pb).forEach(function(a) {
        qb.forEach(function(b) {
          b = b + a.charAt(0).toUpperCase() + a.substring(1);
          pb[b] = pb[a];
        });
      });
      function rb(a, b, c) {
        return null == b || "boolean" === typeof b || "" === b ? "" : c || "number" !== typeof b || 0 === b || pb.hasOwnProperty(a) && pb[a] ? ("" + b).trim() : b + "px";
      }
      function sb(a, b) {
        a = a.style;
        for (var c in b) if (b.hasOwnProperty(c)) {
          var d = 0 === c.indexOf("--"), e2 = rb(c, b[c], d);
          "float" === c && (c = "cssFloat");
          d ? a.setProperty(c, e2) : a[c] = e2;
        }
      }
      var tb = A3({ menuitem: true }, { area: true, base: true, br: true, col: true, embed: true, hr: true, img: true, input: true, keygen: true, link: true, meta: true, param: true, source: true, track: true, wbr: true });
      function ub(a, b) {
        if (b) {
          if (tb[a] && (null != b.children || null != b.dangerouslySetInnerHTML)) throw Error(p(137, a));
          if (null != b.dangerouslySetInnerHTML) {
            if (null != b.children) throw Error(p(60));
            if ("object" !== typeof b.dangerouslySetInnerHTML || !("__html" in b.dangerouslySetInnerHTML)) throw Error(p(61));
          }
          if (null != b.style && "object" !== typeof b.style) throw Error(p(62));
        }
      }
      function vb(a, b) {
        if (-1 === a.indexOf("-")) return "string" === typeof b.is;
        switch (a) {
          case "annotation-xml":
          case "color-profile":
          case "font-face":
          case "font-face-src":
          case "font-face-uri":
          case "font-face-format":
          case "font-face-name":
          case "missing-glyph":
            return false;
          default:
            return true;
        }
      }
      var wb = null;
      function xb(a) {
        a = a.target || a.srcElement || window;
        a.correspondingUseElement && (a = a.correspondingUseElement);
        return 3 === a.nodeType ? a.parentNode : a;
      }
      var yb = null;
      var zb = null;
      var Ab = null;
      function Bb(a) {
        if (a = Cb(a)) {
          if ("function" !== typeof yb) throw Error(p(280));
          var b = a.stateNode;
          b && (b = Db(b), yb(a.stateNode, a.type, b));
        }
      }
      function Eb(a) {
        zb ? Ab ? Ab.push(a) : Ab = [a] : zb = a;
      }
      function Fb() {
        if (zb) {
          var a = zb, b = Ab;
          Ab = zb = null;
          Bb(a);
          if (b) for (a = 0; a < b.length; a++) Bb(b[a]);
        }
      }
      function Gb(a, b) {
        return a(b);
      }
      function Hb() {
      }
      var Ib = false;
      function Jb(a, b, c) {
        if (Ib) return a(b, c);
        Ib = true;
        try {
          return Gb(a, b, c);
        } finally {
          if (Ib = false, null !== zb || null !== Ab) Hb(), Fb();
        }
      }
      function Kb(a, b) {
        var c = a.stateNode;
        if (null === c) return null;
        var d = Db(c);
        if (null === d) return null;
        c = d[b];
        a: switch (b) {
          case "onClick":
          case "onClickCapture":
          case "onDoubleClick":
          case "onDoubleClickCapture":
          case "onMouseDown":
          case "onMouseDownCapture":
          case "onMouseMove":
          case "onMouseMoveCapture":
          case "onMouseUp":
          case "onMouseUpCapture":
          case "onMouseEnter":
            (d = !d.disabled) || (a = a.type, d = !("button" === a || "input" === a || "select" === a || "textarea" === a));
            a = !d;
            break a;
          default:
            a = false;
        }
        if (a) return null;
        if (c && "function" !== typeof c) throw Error(p(231, b, typeof c));
        return c;
      }
      var Lb = false;
      if (ia) try {
        Mb = {};
        Object.defineProperty(Mb, "passive", { get: function() {
          Lb = true;
        } });
        window.addEventListener("test", Mb, Mb);
        window.removeEventListener("test", Mb, Mb);
      } catch (a) {
        Lb = false;
      }
      var Mb;
      function Nb(a, b, c, d, e2, f2, g, h, k2) {
        var l2 = Array.prototype.slice.call(arguments, 3);
        try {
          b.apply(c, l2);
        } catch (m) {
          this.onError(m);
        }
      }
      var Ob = false;
      var Pb = null;
      var Qb = false;
      var Rb = null;
      var Sb = { onError: function(a) {
        Ob = true;
        Pb = a;
      } };
      function Tb(a, b, c, d, e2, f2, g, h, k2) {
        Ob = false;
        Pb = null;
        Nb.apply(Sb, arguments);
      }
      function Ub(a, b, c, d, e2, f2, g, h, k2) {
        Tb.apply(this, arguments);
        if (Ob) {
          if (Ob) {
            var l2 = Pb;
            Ob = false;
            Pb = null;
          } else throw Error(p(198));
          Qb || (Qb = true, Rb = l2);
        }
      }
      function Vb(a) {
        var b = a, c = a;
        if (a.alternate) for (; b.return; ) b = b.return;
        else {
          a = b;
          do
            b = a, 0 !== (b.flags & 4098) && (c = b.return), a = b.return;
          while (a);
        }
        return 3 === b.tag ? c : null;
      }
      function Wb(a) {
        if (13 === a.tag) {
          var b = a.memoizedState;
          null === b && (a = a.alternate, null !== a && (b = a.memoizedState));
          if (null !== b) return b.dehydrated;
        }
        return null;
      }
      function Xb(a) {
        if (Vb(a) !== a) throw Error(p(188));
      }
      function Yb(a) {
        var b = a.alternate;
        if (!b) {
          b = Vb(a);
          if (null === b) throw Error(p(188));
          return b !== a ? null : a;
        }
        for (var c = a, d = b; ; ) {
          var e2 = c.return;
          if (null === e2) break;
          var f2 = e2.alternate;
          if (null === f2) {
            d = e2.return;
            if (null !== d) {
              c = d;
              continue;
            }
            break;
          }
          if (e2.child === f2.child) {
            for (f2 = e2.child; f2; ) {
              if (f2 === c) return Xb(e2), a;
              if (f2 === d) return Xb(e2), b;
              f2 = f2.sibling;
            }
            throw Error(p(188));
          }
          if (c.return !== d.return) c = e2, d = f2;
          else {
            for (var g = false, h = e2.child; h; ) {
              if (h === c) {
                g = true;
                c = e2;
                d = f2;
                break;
              }
              if (h === d) {
                g = true;
                d = e2;
                c = f2;
                break;
              }
              h = h.sibling;
            }
            if (!g) {
              for (h = f2.child; h; ) {
                if (h === c) {
                  g = true;
                  c = f2;
                  d = e2;
                  break;
                }
                if (h === d) {
                  g = true;
                  d = f2;
                  c = e2;
                  break;
                }
                h = h.sibling;
              }
              if (!g) throw Error(p(189));
            }
          }
          if (c.alternate !== d) throw Error(p(190));
        }
        if (3 !== c.tag) throw Error(p(188));
        return c.stateNode.current === c ? a : b;
      }
      function Zb(a) {
        a = Yb(a);
        return null !== a ? $b(a) : null;
      }
      function $b(a) {
        if (5 === a.tag || 6 === a.tag) return a;
        for (a = a.child; null !== a; ) {
          var b = $b(a);
          if (null !== b) return b;
          a = a.sibling;
        }
        return null;
      }
      var ac = ca2.unstable_scheduleCallback;
      var bc = ca2.unstable_cancelCallback;
      var cc = ca2.unstable_shouldYield;
      var dc = ca2.unstable_requestPaint;
      var B3 = ca2.unstable_now;
      var ec = ca2.unstable_getCurrentPriorityLevel;
      var fc = ca2.unstable_ImmediatePriority;
      var gc = ca2.unstable_UserBlockingPriority;
      var hc = ca2.unstable_NormalPriority;
      var ic = ca2.unstable_LowPriority;
      var jc = ca2.unstable_IdlePriority;
      var kc = null;
      var lc = null;
      function mc(a) {
        if (lc && "function" === typeof lc.onCommitFiberRoot) try {
          lc.onCommitFiberRoot(kc, a, void 0, 128 === (a.current.flags & 128));
        } catch (b) {
        }
      }
      var oc = Math.clz32 ? Math.clz32 : nc;
      var pc = Math.log;
      var qc = Math.LN2;
      function nc(a) {
        a >>>= 0;
        return 0 === a ? 32 : 31 - (pc(a) / qc | 0) | 0;
      }
      var rc = 64;
      var sc = 4194304;
      function tc(a) {
        switch (a & -a) {
          case 1:
            return 1;
          case 2:
            return 2;
          case 4:
            return 4;
          case 8:
            return 8;
          case 16:
            return 16;
          case 32:
            return 32;
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return a & 4194240;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            return a & 130023424;
          case 134217728:
            return 134217728;
          case 268435456:
            return 268435456;
          case 536870912:
            return 536870912;
          case 1073741824:
            return 1073741824;
          default:
            return a;
        }
      }
      function uc(a, b) {
        var c = a.pendingLanes;
        if (0 === c) return 0;
        var d = 0, e2 = a.suspendedLanes, f2 = a.pingedLanes, g = c & 268435455;
        if (0 !== g) {
          var h = g & ~e2;
          0 !== h ? d = tc(h) : (f2 &= g, 0 !== f2 && (d = tc(f2)));
        } else g = c & ~e2, 0 !== g ? d = tc(g) : 0 !== f2 && (d = tc(f2));
        if (0 === d) return 0;
        if (0 !== b && b !== d && 0 === (b & e2) && (e2 = d & -d, f2 = b & -b, e2 >= f2 || 16 === e2 && 0 !== (f2 & 4194240))) return b;
        0 !== (d & 4) && (d |= c & 16);
        b = a.entangledLanes;
        if (0 !== b) for (a = a.entanglements, b &= d; 0 < b; ) c = 31 - oc(b), e2 = 1 << c, d |= a[c], b &= ~e2;
        return d;
      }
      function vc(a, b) {
        switch (a) {
          case 1:
          case 2:
          case 4:
            return b + 250;
          case 8:
          case 16:
          case 32:
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return b + 5e3;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            return -1;
          case 134217728:
          case 268435456:
          case 536870912:
          case 1073741824:
            return -1;
          default:
            return -1;
        }
      }
      function wc(a, b) {
        for (var c = a.suspendedLanes, d = a.pingedLanes, e2 = a.expirationTimes, f2 = a.pendingLanes; 0 < f2; ) {
          var g = 31 - oc(f2), h = 1 << g, k2 = e2[g];
          if (-1 === k2) {
            if (0 === (h & c) || 0 !== (h & d)) e2[g] = vc(h, b);
          } else k2 <= b && (a.expiredLanes |= h);
          f2 &= ~h;
        }
      }
      function xc(a) {
        a = a.pendingLanes & -1073741825;
        return 0 !== a ? a : a & 1073741824 ? 1073741824 : 0;
      }
      function yc() {
        var a = rc;
        rc <<= 1;
        0 === (rc & 4194240) && (rc = 64);
        return a;
      }
      function zc(a) {
        for (var b = [], c = 0; 31 > c; c++) b.push(a);
        return b;
      }
      function Ac(a, b, c) {
        a.pendingLanes |= b;
        536870912 !== b && (a.suspendedLanes = 0, a.pingedLanes = 0);
        a = a.eventTimes;
        b = 31 - oc(b);
        a[b] = c;
      }
      function Bc(a, b) {
        var c = a.pendingLanes & ~b;
        a.pendingLanes = b;
        a.suspendedLanes = 0;
        a.pingedLanes = 0;
        a.expiredLanes &= b;
        a.mutableReadLanes &= b;
        a.entangledLanes &= b;
        b = a.entanglements;
        var d = a.eventTimes;
        for (a = a.expirationTimes; 0 < c; ) {
          var e2 = 31 - oc(c), f2 = 1 << e2;
          b[e2] = 0;
          d[e2] = -1;
          a[e2] = -1;
          c &= ~f2;
        }
      }
      function Cc(a, b) {
        var c = a.entangledLanes |= b;
        for (a = a.entanglements; c; ) {
          var d = 31 - oc(c), e2 = 1 << d;
          e2 & b | a[d] & b && (a[d] |= b);
          c &= ~e2;
        }
      }
      var C = 0;
      function Dc(a) {
        a &= -a;
        return 1 < a ? 4 < a ? 0 !== (a & 268435455) ? 16 : 536870912 : 4 : 1;
      }
      var Ec;
      var Fc;
      var Gc;
      var Hc;
      var Ic;
      var Jc = false;
      var Kc = [];
      var Lc = null;
      var Mc = null;
      var Nc = null;
      var Oc = /* @__PURE__ */ new Map();
      var Pc = /* @__PURE__ */ new Map();
      var Qc = [];
      var Rc = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
      function Sc(a, b) {
        switch (a) {
          case "focusin":
          case "focusout":
            Lc = null;
            break;
          case "dragenter":
          case "dragleave":
            Mc = null;
            break;
          case "mouseover":
          case "mouseout":
            Nc = null;
            break;
          case "pointerover":
          case "pointerout":
            Oc.delete(b.pointerId);
            break;
          case "gotpointercapture":
          case "lostpointercapture":
            Pc.delete(b.pointerId);
        }
      }
      function Tc(a, b, c, d, e2, f2) {
        if (null === a || a.nativeEvent !== f2) return a = { blockedOn: b, domEventName: c, eventSystemFlags: d, nativeEvent: f2, targetContainers: [e2] }, null !== b && (b = Cb(b), null !== b && Fc(b)), a;
        a.eventSystemFlags |= d;
        b = a.targetContainers;
        null !== e2 && -1 === b.indexOf(e2) && b.push(e2);
        return a;
      }
      function Uc(a, b, c, d, e2) {
        switch (b) {
          case "focusin":
            return Lc = Tc(Lc, a, b, c, d, e2), true;
          case "dragenter":
            return Mc = Tc(Mc, a, b, c, d, e2), true;
          case "mouseover":
            return Nc = Tc(Nc, a, b, c, d, e2), true;
          case "pointerover":
            var f2 = e2.pointerId;
            Oc.set(f2, Tc(Oc.get(f2) || null, a, b, c, d, e2));
            return true;
          case "gotpointercapture":
            return f2 = e2.pointerId, Pc.set(f2, Tc(Pc.get(f2) || null, a, b, c, d, e2)), true;
        }
        return false;
      }
      function Vc(a) {
        var b = Wc(a.target);
        if (null !== b) {
          var c = Vb(b);
          if (null !== c) {
            if (b = c.tag, 13 === b) {
              if (b = Wb(c), null !== b) {
                a.blockedOn = b;
                Ic(a.priority, function() {
                  Gc(c);
                });
                return;
              }
            } else if (3 === b && c.stateNode.current.memoizedState.isDehydrated) {
              a.blockedOn = 3 === c.tag ? c.stateNode.containerInfo : null;
              return;
            }
          }
        }
        a.blockedOn = null;
      }
      function Xc(a) {
        if (null !== a.blockedOn) return false;
        for (var b = a.targetContainers; 0 < b.length; ) {
          var c = Yc(a.domEventName, a.eventSystemFlags, b[0], a.nativeEvent);
          if (null === c) {
            c = a.nativeEvent;
            var d = new c.constructor(c.type, c);
            wb = d;
            c.target.dispatchEvent(d);
            wb = null;
          } else return b = Cb(c), null !== b && Fc(b), a.blockedOn = c, false;
          b.shift();
        }
        return true;
      }
      function Zc(a, b, c) {
        Xc(a) && c.delete(b);
      }
      function $c() {
        Jc = false;
        null !== Lc && Xc(Lc) && (Lc = null);
        null !== Mc && Xc(Mc) && (Mc = null);
        null !== Nc && Xc(Nc) && (Nc = null);
        Oc.forEach(Zc);
        Pc.forEach(Zc);
      }
      function ad2(a, b) {
        a.blockedOn === b && (a.blockedOn = null, Jc || (Jc = true, ca2.unstable_scheduleCallback(ca2.unstable_NormalPriority, $c)));
      }
      function bd(a) {
        function b(b2) {
          return ad2(b2, a);
        }
        if (0 < Kc.length) {
          ad2(Kc[0], a);
          for (var c = 1; c < Kc.length; c++) {
            var d = Kc[c];
            d.blockedOn === a && (d.blockedOn = null);
          }
        }
        null !== Lc && ad2(Lc, a);
        null !== Mc && ad2(Mc, a);
        null !== Nc && ad2(Nc, a);
        Oc.forEach(b);
        Pc.forEach(b);
        for (c = 0; c < Qc.length; c++) d = Qc[c], d.blockedOn === a && (d.blockedOn = null);
        for (; 0 < Qc.length && (c = Qc[0], null === c.blockedOn); ) Vc(c), null === c.blockedOn && Qc.shift();
      }
      var cd = ua2.ReactCurrentBatchConfig;
      var dd2 = true;
      function ed2(a, b, c, d) {
        var e2 = C, f2 = cd.transition;
        cd.transition = null;
        try {
          C = 1, fd(a, b, c, d);
        } finally {
          C = e2, cd.transition = f2;
        }
      }
      function gd2(a, b, c, d) {
        var e2 = C, f2 = cd.transition;
        cd.transition = null;
        try {
          C = 4, fd(a, b, c, d);
        } finally {
          C = e2, cd.transition = f2;
        }
      }
      function fd(a, b, c, d) {
        if (dd2) {
          var e2 = Yc(a, b, c, d);
          if (null === e2) hd(a, b, d, id, c), Sc(a, d);
          else if (Uc(e2, a, b, c, d)) d.stopPropagation();
          else if (Sc(a, d), b & 4 && -1 < Rc.indexOf(a)) {
            for (; null !== e2; ) {
              var f2 = Cb(e2);
              null !== f2 && Ec(f2);
              f2 = Yc(a, b, c, d);
              null === f2 && hd(a, b, d, id, c);
              if (f2 === e2) break;
              e2 = f2;
            }
            null !== e2 && d.stopPropagation();
          } else hd(a, b, d, null, c);
        }
      }
      var id = null;
      function Yc(a, b, c, d) {
        id = null;
        a = xb(d);
        a = Wc(a);
        if (null !== a) if (b = Vb(a), null === b) a = null;
        else if (c = b.tag, 13 === c) {
          a = Wb(b);
          if (null !== a) return a;
          a = null;
        } else if (3 === c) {
          if (b.stateNode.current.memoizedState.isDehydrated) return 3 === b.tag ? b.stateNode.containerInfo : null;
          a = null;
        } else b !== a && (a = null);
        id = a;
        return null;
      }
      function jd(a) {
        switch (a) {
          case "cancel":
          case "click":
          case "close":
          case "contextmenu":
          case "copy":
          case "cut":
          case "auxclick":
          case "dblclick":
          case "dragend":
          case "dragstart":
          case "drop":
          case "focusin":
          case "focusout":
          case "input":
          case "invalid":
          case "keydown":
          case "keypress":
          case "keyup":
          case "mousedown":
          case "mouseup":
          case "paste":
          case "pause":
          case "play":
          case "pointercancel":
          case "pointerdown":
          case "pointerup":
          case "ratechange":
          case "reset":
          case "resize":
          case "seeked":
          case "submit":
          case "touchcancel":
          case "touchend":
          case "touchstart":
          case "volumechange":
          case "change":
          case "selectionchange":
          case "textInput":
          case "compositionstart":
          case "compositionend":
          case "compositionupdate":
          case "beforeblur":
          case "afterblur":
          case "beforeinput":
          case "blur":
          case "fullscreenchange":
          case "focus":
          case "hashchange":
          case "popstate":
          case "select":
          case "selectstart":
            return 1;
          case "drag":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "mousemove":
          case "mouseout":
          case "mouseover":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "scroll":
          case "toggle":
          case "touchmove":
          case "wheel":
          case "mouseenter":
          case "mouseleave":
          case "pointerenter":
          case "pointerleave":
            return 4;
          case "message":
            switch (ec()) {
              case fc:
                return 1;
              case gc:
                return 4;
              case hc:
              case ic:
                return 16;
              case jc:
                return 536870912;
              default:
                return 16;
            }
          default:
            return 16;
        }
      }
      var kd = null;
      var ld2 = null;
      var md2 = null;
      function nd() {
        if (md2) return md2;
        var a, b = ld2, c = b.length, d, e2 = "value" in kd ? kd.value : kd.textContent, f2 = e2.length;
        for (a = 0; a < c && b[a] === e2[a]; a++) ;
        var g = c - a;
        for (d = 1; d <= g && b[c - d] === e2[f2 - d]; d++) ;
        return md2 = e2.slice(a, 1 < d ? 1 - d : void 0);
      }
      function od2(a) {
        var b = a.keyCode;
        "charCode" in a ? (a = a.charCode, 0 === a && 13 === b && (a = 13)) : a = b;
        10 === a && (a = 13);
        return 32 <= a || 13 === a ? a : 0;
      }
      function pd2() {
        return true;
      }
      function qd() {
        return false;
      }
      function rd2(a) {
        function b(b2, d, e2, f2, g) {
          this._reactName = b2;
          this._targetInst = e2;
          this.type = d;
          this.nativeEvent = f2;
          this.target = g;
          this.currentTarget = null;
          for (var c in a) a.hasOwnProperty(c) && (b2 = a[c], this[c] = b2 ? b2(f2) : f2[c]);
          this.isDefaultPrevented = (null != f2.defaultPrevented ? f2.defaultPrevented : false === f2.returnValue) ? pd2 : qd;
          this.isPropagationStopped = qd;
          return this;
        }
        A3(b.prototype, { preventDefault: function() {
          this.defaultPrevented = true;
          var a2 = this.nativeEvent;
          a2 && (a2.preventDefault ? a2.preventDefault() : "unknown" !== typeof a2.returnValue && (a2.returnValue = false), this.isDefaultPrevented = pd2);
        }, stopPropagation: function() {
          var a2 = this.nativeEvent;
          a2 && (a2.stopPropagation ? a2.stopPropagation() : "unknown" !== typeof a2.cancelBubble && (a2.cancelBubble = true), this.isPropagationStopped = pd2);
        }, persist: function() {
        }, isPersistent: pd2 });
        return b;
      }
      var sd2 = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(a) {
        return a.timeStamp || Date.now();
      }, defaultPrevented: 0, isTrusted: 0 };
      var td2 = rd2(sd2);
      var ud2 = A3({}, sd2, { view: 0, detail: 0 });
      var vd = rd2(ud2);
      var wd;
      var xd2;
      var yd;
      var Ad2 = A3({}, ud2, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: zd, button: 0, buttons: 0, relatedTarget: function(a) {
        return void 0 === a.relatedTarget ? a.fromElement === a.srcElement ? a.toElement : a.fromElement : a.relatedTarget;
      }, movementX: function(a) {
        if ("movementX" in a) return a.movementX;
        a !== yd && (yd && "mousemove" === a.type ? (wd = a.screenX - yd.screenX, xd2 = a.screenY - yd.screenY) : xd2 = wd = 0, yd = a);
        return wd;
      }, movementY: function(a) {
        return "movementY" in a ? a.movementY : xd2;
      } });
      var Bd2 = rd2(Ad2);
      var Cd = A3({}, Ad2, { dataTransfer: 0 });
      var Dd2 = rd2(Cd);
      var Ed2 = A3({}, ud2, { relatedTarget: 0 });
      var Fd2 = rd2(Ed2);
      var Gd = A3({}, sd2, { animationName: 0, elapsedTime: 0, pseudoElement: 0 });
      var Hd = rd2(Gd);
      var Id2 = A3({}, sd2, { clipboardData: function(a) {
        return "clipboardData" in a ? a.clipboardData : window.clipboardData;
      } });
      var Jd2 = rd2(Id2);
      var Kd = A3({}, sd2, { data: 0 });
      var Ld2 = rd2(Kd);
      var Md = {
        Esc: "Escape",
        Spacebar: " ",
        Left: "ArrowLeft",
        Up: "ArrowUp",
        Right: "ArrowRight",
        Down: "ArrowDown",
        Del: "Delete",
        Win: "OS",
        Menu: "ContextMenu",
        Apps: "ContextMenu",
        Scroll: "ScrollLock",
        MozPrintableKey: "Unidentified"
      };
      var Nd2 = {
        8: "Backspace",
        9: "Tab",
        12: "Clear",
        13: "Enter",
        16: "Shift",
        17: "Control",
        18: "Alt",
        19: "Pause",
        20: "CapsLock",
        27: "Escape",
        32: " ",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "ArrowLeft",
        38: "ArrowUp",
        39: "ArrowRight",
        40: "ArrowDown",
        45: "Insert",
        46: "Delete",
        112: "F1",
        113: "F2",
        114: "F3",
        115: "F4",
        116: "F5",
        117: "F6",
        118: "F7",
        119: "F8",
        120: "F9",
        121: "F10",
        122: "F11",
        123: "F12",
        144: "NumLock",
        145: "ScrollLock",
        224: "Meta"
      };
      var Od = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
      function Pd(a) {
        var b = this.nativeEvent;
        return b.getModifierState ? b.getModifierState(a) : (a = Od[a]) ? !!b[a] : false;
      }
      function zd() {
        return Pd;
      }
      var Qd = A3({}, ud2, { key: function(a) {
        if (a.key) {
          var b = Md[a.key] || a.key;
          if ("Unidentified" !== b) return b;
        }
        return "keypress" === a.type ? (a = od2(a), 13 === a ? "Enter" : String.fromCharCode(a)) : "keydown" === a.type || "keyup" === a.type ? Nd2[a.keyCode] || "Unidentified" : "";
      }, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: zd, charCode: function(a) {
        return "keypress" === a.type ? od2(a) : 0;
      }, keyCode: function(a) {
        return "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
      }, which: function(a) {
        return "keypress" === a.type ? od2(a) : "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
      } });
      var Rd2 = rd2(Qd);
      var Sd = A3({}, Ad2, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 });
      var Td2 = rd2(Sd);
      var Ud = A3({}, ud2, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: zd });
      var Vd = rd2(Ud);
      var Wd = A3({}, sd2, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 });
      var Xd = rd2(Wd);
      var Yd2 = A3({}, Ad2, {
        deltaX: function(a) {
          return "deltaX" in a ? a.deltaX : "wheelDeltaX" in a ? -a.wheelDeltaX : 0;
        },
        deltaY: function(a) {
          return "deltaY" in a ? a.deltaY : "wheelDeltaY" in a ? -a.wheelDeltaY : "wheelDelta" in a ? -a.wheelDelta : 0;
        },
        deltaZ: 0,
        deltaMode: 0
      });
      var Zd2 = rd2(Yd2);
      var $d = [9, 13, 27, 32];
      var ae3 = ia && "CompositionEvent" in window;
      var be3 = null;
      ia && "documentMode" in document && (be3 = document.documentMode);
      var ce2 = ia && "TextEvent" in window && !be3;
      var de2 = ia && (!ae3 || be3 && 8 < be3 && 11 >= be3);
      var ee3 = String.fromCharCode(32);
      var fe3 = false;
      function ge3(a, b) {
        switch (a) {
          case "keyup":
            return -1 !== $d.indexOf(b.keyCode);
          case "keydown":
            return 229 !== b.keyCode;
          case "keypress":
          case "mousedown":
          case "focusout":
            return true;
          default:
            return false;
        }
      }
      function he3(a) {
        a = a.detail;
        return "object" === typeof a && "data" in a ? a.data : null;
      }
      var ie3 = false;
      function je3(a, b) {
        switch (a) {
          case "compositionend":
            return he3(b);
          case "keypress":
            if (32 !== b.which) return null;
            fe3 = true;
            return ee3;
          case "textInput":
            return a = b.data, a === ee3 && fe3 ? null : a;
          default:
            return null;
        }
      }
      function ke3(a, b) {
        if (ie3) return "compositionend" === a || !ae3 && ge3(a, b) ? (a = nd(), md2 = ld2 = kd = null, ie3 = false, a) : null;
        switch (a) {
          case "paste":
            return null;
          case "keypress":
            if (!(b.ctrlKey || b.altKey || b.metaKey) || b.ctrlKey && b.altKey) {
              if (b.char && 1 < b.char.length) return b.char;
              if (b.which) return String.fromCharCode(b.which);
            }
            return null;
          case "compositionend":
            return de2 && "ko" !== b.locale ? null : b.data;
          default:
            return null;
        }
      }
      var le3 = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
      function me3(a) {
        var b = a && a.nodeName && a.nodeName.toLowerCase();
        return "input" === b ? !!le3[a.type] : "textarea" === b ? true : false;
      }
      function ne2(a, b, c, d) {
        Eb(d);
        b = oe3(b, "onChange");
        0 < b.length && (c = new td2("onChange", "change", null, c, d), a.push({ event: c, listeners: b }));
      }
      var pe3 = null;
      var qe3 = null;
      function re2(a) {
        se3(a, 0);
      }
      function te2(a) {
        var b = ue3(a);
        if (Wa(b)) return a;
      }
      function ve3(a, b) {
        if ("change" === a) return b;
      }
      var we3 = false;
      if (ia) {
        if (ia) {
          ye3 = "oninput" in document;
          if (!ye3) {
            ze2 = document.createElement("div");
            ze2.setAttribute("oninput", "return;");
            ye3 = "function" === typeof ze2.oninput;
          }
          xe2 = ye3;
        } else xe2 = false;
        we3 = xe2 && (!document.documentMode || 9 < document.documentMode);
      }
      var xe2;
      var ye3;
      var ze2;
      function Ae2() {
        pe3 && (pe3.detachEvent("onpropertychange", Be3), qe3 = pe3 = null);
      }
      function Be3(a) {
        if ("value" === a.propertyName && te2(qe3)) {
          var b = [];
          ne2(b, qe3, a, xb(a));
          Jb(re2, b);
        }
      }
      function Ce3(a, b, c) {
        "focusin" === a ? (Ae2(), pe3 = b, qe3 = c, pe3.attachEvent("onpropertychange", Be3)) : "focusout" === a && Ae2();
      }
      function De3(a) {
        if ("selectionchange" === a || "keyup" === a || "keydown" === a) return te2(qe3);
      }
      function Ee3(a, b) {
        if ("click" === a) return te2(b);
      }
      function Fe2(a, b) {
        if ("input" === a || "change" === a) return te2(b);
      }
      function Ge2(a, b) {
        return a === b && (0 !== a || 1 / a === 1 / b) || a !== a && b !== b;
      }
      var He3 = "function" === typeof Object.is ? Object.is : Ge2;
      function Ie3(a, b) {
        if (He3(a, b)) return true;
        if ("object" !== typeof a || null === a || "object" !== typeof b || null === b) return false;
        var c = Object.keys(a), d = Object.keys(b);
        if (c.length !== d.length) return false;
        for (d = 0; d < c.length; d++) {
          var e2 = c[d];
          if (!ja2.call(b, e2) || !He3(a[e2], b[e2])) return false;
        }
        return true;
      }
      function Je2(a) {
        for (; a && a.firstChild; ) a = a.firstChild;
        return a;
      }
      function Ke2(a, b) {
        var c = Je2(a);
        a = 0;
        for (var d; c; ) {
          if (3 === c.nodeType) {
            d = a + c.textContent.length;
            if (a <= b && d >= b) return { node: c, offset: b - a };
            a = d;
          }
          a: {
            for (; c; ) {
              if (c.nextSibling) {
                c = c.nextSibling;
                break a;
              }
              c = c.parentNode;
            }
            c = void 0;
          }
          c = Je2(c);
        }
      }
      function Le3(a, b) {
        return a && b ? a === b ? true : a && 3 === a.nodeType ? false : b && 3 === b.nodeType ? Le3(a, b.parentNode) : "contains" in a ? a.contains(b) : a.compareDocumentPosition ? !!(a.compareDocumentPosition(b) & 16) : false : false;
      }
      function Me3() {
        for (var a = window, b = Xa2(); b instanceof a.HTMLIFrameElement; ) {
          try {
            var c = "string" === typeof b.contentWindow.location.href;
          } catch (d) {
            c = false;
          }
          if (c) a = b.contentWindow;
          else break;
          b = Xa2(a.document);
        }
        return b;
      }
      function Ne3(a) {
        var b = a && a.nodeName && a.nodeName.toLowerCase();
        return b && ("input" === b && ("text" === a.type || "search" === a.type || "tel" === a.type || "url" === a.type || "password" === a.type) || "textarea" === b || "true" === a.contentEditable);
      }
      function Oe3(a) {
        var b = Me3(), c = a.focusedElem, d = a.selectionRange;
        if (b !== c && c && c.ownerDocument && Le3(c.ownerDocument.documentElement, c)) {
          if (null !== d && Ne3(c)) {
            if (b = d.start, a = d.end, void 0 === a && (a = b), "selectionStart" in c) c.selectionStart = b, c.selectionEnd = Math.min(a, c.value.length);
            else if (a = (b = c.ownerDocument || document) && b.defaultView || window, a.getSelection) {
              a = a.getSelection();
              var e2 = c.textContent.length, f2 = Math.min(d.start, e2);
              d = void 0 === d.end ? f2 : Math.min(d.end, e2);
              !a.extend && f2 > d && (e2 = d, d = f2, f2 = e2);
              e2 = Ke2(c, f2);
              var g = Ke2(
                c,
                d
              );
              e2 && g && (1 !== a.rangeCount || a.anchorNode !== e2.node || a.anchorOffset !== e2.offset || a.focusNode !== g.node || a.focusOffset !== g.offset) && (b = b.createRange(), b.setStart(e2.node, e2.offset), a.removeAllRanges(), f2 > d ? (a.addRange(b), a.extend(g.node, g.offset)) : (b.setEnd(g.node, g.offset), a.addRange(b)));
            }
          }
          b = [];
          for (a = c; a = a.parentNode; ) 1 === a.nodeType && b.push({ element: a, left: a.scrollLeft, top: a.scrollTop });
          "function" === typeof c.focus && c.focus();
          for (c = 0; c < b.length; c++) a = b[c], a.element.scrollLeft = a.left, a.element.scrollTop = a.top;
        }
      }
      var Pe2 = ia && "documentMode" in document && 11 >= document.documentMode;
      var Qe3 = null;
      var Re3 = null;
      var Se2 = null;
      var Te2 = false;
      function Ue3(a, b, c) {
        var d = c.window === c ? c.document : 9 === c.nodeType ? c : c.ownerDocument;
        Te2 || null == Qe3 || Qe3 !== Xa2(d) || (d = Qe3, "selectionStart" in d && Ne3(d) ? d = { start: d.selectionStart, end: d.selectionEnd } : (d = (d.ownerDocument && d.ownerDocument.defaultView || window).getSelection(), d = { anchorNode: d.anchorNode, anchorOffset: d.anchorOffset, focusNode: d.focusNode, focusOffset: d.focusOffset }), Se2 && Ie3(Se2, d) || (Se2 = d, d = oe3(Re3, "onSelect"), 0 < d.length && (b = new td2("onSelect", "select", null, b, c), a.push({ event: b, listeners: d }), b.target = Qe3)));
      }
      function Ve3(a, b) {
        var c = {};
        c[a.toLowerCase()] = b.toLowerCase();
        c["Webkit" + a] = "webkit" + b;
        c["Moz" + a] = "moz" + b;
        return c;
      }
      var We3 = { animationend: Ve3("Animation", "AnimationEnd"), animationiteration: Ve3("Animation", "AnimationIteration"), animationstart: Ve3("Animation", "AnimationStart"), transitionend: Ve3("Transition", "TransitionEnd") };
      var Xe2 = {};
      var Ye3 = {};
      ia && (Ye3 = document.createElement("div").style, "AnimationEvent" in window || (delete We3.animationend.animation, delete We3.animationiteration.animation, delete We3.animationstart.animation), "TransitionEvent" in window || delete We3.transitionend.transition);
      function Ze2(a) {
        if (Xe2[a]) return Xe2[a];
        if (!We3[a]) return a;
        var b = We3[a], c;
        for (c in b) if (b.hasOwnProperty(c) && c in Ye3) return Xe2[a] = b[c];
        return a;
      }
      var $e2 = Ze2("animationend");
      var af = Ze2("animationiteration");
      var bf = Ze2("animationstart");
      var cf = Ze2("transitionend");
      var df = /* @__PURE__ */ new Map();
      var ef2 = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
      function ff(a, b) {
        df.set(a, b);
        fa2(b, [a]);
      }
      for (gf = 0; gf < ef2.length; gf++) {
        hf = ef2[gf], jf = hf.toLowerCase(), kf = hf[0].toUpperCase() + hf.slice(1);
        ff(jf, "on" + kf);
      }
      var hf;
      var jf;
      var kf;
      var gf;
      ff($e2, "onAnimationEnd");
      ff(af, "onAnimationIteration");
      ff(bf, "onAnimationStart");
      ff("dblclick", "onDoubleClick");
      ff("focusin", "onFocus");
      ff("focusout", "onBlur");
      ff(cf, "onTransitionEnd");
      ha("onMouseEnter", ["mouseout", "mouseover"]);
      ha("onMouseLeave", ["mouseout", "mouseover"]);
      ha("onPointerEnter", ["pointerout", "pointerover"]);
      ha("onPointerLeave", ["pointerout", "pointerover"]);
      fa2("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
      fa2("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
      fa2("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
      fa2("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
      fa2("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
      fa2("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
      var lf = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" ");
      var mf = new Set("cancel close invalid load scroll toggle".split(" ").concat(lf));
      function nf(a, b, c) {
        var d = a.type || "unknown-event";
        a.currentTarget = c;
        Ub(d, b, void 0, a);
        a.currentTarget = null;
      }
      function se3(a, b) {
        b = 0 !== (b & 4);
        for (var c = 0; c < a.length; c++) {
          var d = a[c], e2 = d.event;
          d = d.listeners;
          a: {
            var f2 = void 0;
            if (b) for (var g = d.length - 1; 0 <= g; g--) {
              var h = d[g], k2 = h.instance, l2 = h.currentTarget;
              h = h.listener;
              if (k2 !== f2 && e2.isPropagationStopped()) break a;
              nf(e2, h, l2);
              f2 = k2;
            }
            else for (g = 0; g < d.length; g++) {
              h = d[g];
              k2 = h.instance;
              l2 = h.currentTarget;
              h = h.listener;
              if (k2 !== f2 && e2.isPropagationStopped()) break a;
              nf(e2, h, l2);
              f2 = k2;
            }
          }
        }
        if (Qb) throw a = Rb, Qb = false, Rb = null, a;
      }
      function D2(a, b) {
        var c = b[of];
        void 0 === c && (c = b[of] = /* @__PURE__ */ new Set());
        var d = a + "__bubble";
        c.has(d) || (pf(b, a, 2, false), c.add(d));
      }
      function qf(a, b, c) {
        var d = 0;
        b && (d |= 4);
        pf(c, a, d, b);
      }
      var rf = "_reactListening" + Math.random().toString(36).slice(2);
      function sf(a) {
        if (!a[rf]) {
          a[rf] = true;
          da2.forEach(function(b2) {
            "selectionchange" !== b2 && (mf.has(b2) || qf(b2, false, a), qf(b2, true, a));
          });
          var b = 9 === a.nodeType ? a : a.ownerDocument;
          null === b || b[rf] || (b[rf] = true, qf("selectionchange", false, b));
        }
      }
      function pf(a, b, c, d) {
        switch (jd(b)) {
          case 1:
            var e2 = ed2;
            break;
          case 4:
            e2 = gd2;
            break;
          default:
            e2 = fd;
        }
        c = e2.bind(null, b, c, a);
        e2 = void 0;
        !Lb || "touchstart" !== b && "touchmove" !== b && "wheel" !== b || (e2 = true);
        d ? void 0 !== e2 ? a.addEventListener(b, c, { capture: true, passive: e2 }) : a.addEventListener(b, c, true) : void 0 !== e2 ? a.addEventListener(b, c, { passive: e2 }) : a.addEventListener(b, c, false);
      }
      function hd(a, b, c, d, e2) {
        var f2 = d;
        if (0 === (b & 1) && 0 === (b & 2) && null !== d) a: for (; ; ) {
          if (null === d) return;
          var g = d.tag;
          if (3 === g || 4 === g) {
            var h = d.stateNode.containerInfo;
            if (h === e2 || 8 === h.nodeType && h.parentNode === e2) break;
            if (4 === g) for (g = d.return; null !== g; ) {
              var k2 = g.tag;
              if (3 === k2 || 4 === k2) {
                if (k2 = g.stateNode.containerInfo, k2 === e2 || 8 === k2.nodeType && k2.parentNode === e2) return;
              }
              g = g.return;
            }
            for (; null !== h; ) {
              g = Wc(h);
              if (null === g) return;
              k2 = g.tag;
              if (5 === k2 || 6 === k2) {
                d = f2 = g;
                continue a;
              }
              h = h.parentNode;
            }
          }
          d = d.return;
        }
        Jb(function() {
          var d2 = f2, e3 = xb(c), g2 = [];
          a: {
            var h2 = df.get(a);
            if (void 0 !== h2) {
              var k3 = td2, n = a;
              switch (a) {
                case "keypress":
                  if (0 === od2(c)) break a;
                case "keydown":
                case "keyup":
                  k3 = Rd2;
                  break;
                case "focusin":
                  n = "focus";
                  k3 = Fd2;
                  break;
                case "focusout":
                  n = "blur";
                  k3 = Fd2;
                  break;
                case "beforeblur":
                case "afterblur":
                  k3 = Fd2;
                  break;
                case "click":
                  if (2 === c.button) break a;
                case "auxclick":
                case "dblclick":
                case "mousedown":
                case "mousemove":
                case "mouseup":
                case "mouseout":
                case "mouseover":
                case "contextmenu":
                  k3 = Bd2;
                  break;
                case "drag":
                case "dragend":
                case "dragenter":
                case "dragexit":
                case "dragleave":
                case "dragover":
                case "dragstart":
                case "drop":
                  k3 = Dd2;
                  break;
                case "touchcancel":
                case "touchend":
                case "touchmove":
                case "touchstart":
                  k3 = Vd;
                  break;
                case $e2:
                case af:
                case bf:
                  k3 = Hd;
                  break;
                case cf:
                  k3 = Xd;
                  break;
                case "scroll":
                  k3 = vd;
                  break;
                case "wheel":
                  k3 = Zd2;
                  break;
                case "copy":
                case "cut":
                case "paste":
                  k3 = Jd2;
                  break;
                case "gotpointercapture":
                case "lostpointercapture":
                case "pointercancel":
                case "pointerdown":
                case "pointermove":
                case "pointerout":
                case "pointerover":
                case "pointerup":
                  k3 = Td2;
              }
              var t = 0 !== (b & 4), J2 = !t && "scroll" === a, x = t ? null !== h2 ? h2 + "Capture" : null : h2;
              t = [];
              for (var w = d2, u; null !== w; ) {
                u = w;
                var F2 = u.stateNode;
                5 === u.tag && null !== F2 && (u = F2, null !== x && (F2 = Kb(w, x), null != F2 && t.push(tf(w, F2, u))));
                if (J2) break;
                w = w.return;
              }
              0 < t.length && (h2 = new k3(h2, n, null, c, e3), g2.push({ event: h2, listeners: t }));
            }
          }
          if (0 === (b & 7)) {
            a: {
              h2 = "mouseover" === a || "pointerover" === a;
              k3 = "mouseout" === a || "pointerout" === a;
              if (h2 && c !== wb && (n = c.relatedTarget || c.fromElement) && (Wc(n) || n[uf])) break a;
              if (k3 || h2) {
                h2 = e3.window === e3 ? e3 : (h2 = e3.ownerDocument) ? h2.defaultView || h2.parentWindow : window;
                if (k3) {
                  if (n = c.relatedTarget || c.toElement, k3 = d2, n = n ? Wc(n) : null, null !== n && (J2 = Vb(n), n !== J2 || 5 !== n.tag && 6 !== n.tag)) n = null;
                } else k3 = null, n = d2;
                if (k3 !== n) {
                  t = Bd2;
                  F2 = "onMouseLeave";
                  x = "onMouseEnter";
                  w = "mouse";
                  if ("pointerout" === a || "pointerover" === a) t = Td2, F2 = "onPointerLeave", x = "onPointerEnter", w = "pointer";
                  J2 = null == k3 ? h2 : ue3(k3);
                  u = null == n ? h2 : ue3(n);
                  h2 = new t(F2, w + "leave", k3, c, e3);
                  h2.target = J2;
                  h2.relatedTarget = u;
                  F2 = null;
                  Wc(e3) === d2 && (t = new t(x, w + "enter", n, c, e3), t.target = u, t.relatedTarget = J2, F2 = t);
                  J2 = F2;
                  if (k3 && n) b: {
                    t = k3;
                    x = n;
                    w = 0;
                    for (u = t; u; u = vf(u)) w++;
                    u = 0;
                    for (F2 = x; F2; F2 = vf(F2)) u++;
                    for (; 0 < w - u; ) t = vf(t), w--;
                    for (; 0 < u - w; ) x = vf(x), u--;
                    for (; w--; ) {
                      if (t === x || null !== x && t === x.alternate) break b;
                      t = vf(t);
                      x = vf(x);
                    }
                    t = null;
                  }
                  else t = null;
                  null !== k3 && wf(g2, h2, k3, t, false);
                  null !== n && null !== J2 && wf(g2, J2, n, t, true);
                }
              }
            }
            a: {
              h2 = d2 ? ue3(d2) : window;
              k3 = h2.nodeName && h2.nodeName.toLowerCase();
              if ("select" === k3 || "input" === k3 && "file" === h2.type) var na2 = ve3;
              else if (me3(h2)) if (we3) na2 = Fe2;
              else {
                na2 = De3;
                var xa2 = Ce3;
              }
              else (k3 = h2.nodeName) && "input" === k3.toLowerCase() && ("checkbox" === h2.type || "radio" === h2.type) && (na2 = Ee3);
              if (na2 && (na2 = na2(a, d2))) {
                ne2(g2, na2, c, e3);
                break a;
              }
              xa2 && xa2(a, h2, d2);
              "focusout" === a && (xa2 = h2._wrapperState) && xa2.controlled && "number" === h2.type && cb(h2, "number", h2.value);
            }
            xa2 = d2 ? ue3(d2) : window;
            switch (a) {
              case "focusin":
                if (me3(xa2) || "true" === xa2.contentEditable) Qe3 = xa2, Re3 = d2, Se2 = null;
                break;
              case "focusout":
                Se2 = Re3 = Qe3 = null;
                break;
              case "mousedown":
                Te2 = true;
                break;
              case "contextmenu":
              case "mouseup":
              case "dragend":
                Te2 = false;
                Ue3(g2, c, e3);
                break;
              case "selectionchange":
                if (Pe2) break;
              case "keydown":
              case "keyup":
                Ue3(g2, c, e3);
            }
            var $a2;
            if (ae3) b: {
              switch (a) {
                case "compositionstart":
                  var ba2 = "onCompositionStart";
                  break b;
                case "compositionend":
                  ba2 = "onCompositionEnd";
                  break b;
                case "compositionupdate":
                  ba2 = "onCompositionUpdate";
                  break b;
              }
              ba2 = void 0;
            }
            else ie3 ? ge3(a, c) && (ba2 = "onCompositionEnd") : "keydown" === a && 229 === c.keyCode && (ba2 = "onCompositionStart");
            ba2 && (de2 && "ko" !== c.locale && (ie3 || "onCompositionStart" !== ba2 ? "onCompositionEnd" === ba2 && ie3 && ($a2 = nd()) : (kd = e3, ld2 = "value" in kd ? kd.value : kd.textContent, ie3 = true)), xa2 = oe3(d2, ba2), 0 < xa2.length && (ba2 = new Ld2(ba2, a, null, c, e3), g2.push({ event: ba2, listeners: xa2 }), $a2 ? ba2.data = $a2 : ($a2 = he3(c), null !== $a2 && (ba2.data = $a2))));
            if ($a2 = ce2 ? je3(a, c) : ke3(a, c)) d2 = oe3(d2, "onBeforeInput"), 0 < d2.length && (e3 = new Ld2("onBeforeInput", "beforeinput", null, c, e3), g2.push({ event: e3, listeners: d2 }), e3.data = $a2);
          }
          se3(g2, b);
        });
      }
      function tf(a, b, c) {
        return { instance: a, listener: b, currentTarget: c };
      }
      function oe3(a, b) {
        for (var c = b + "Capture", d = []; null !== a; ) {
          var e2 = a, f2 = e2.stateNode;
          5 === e2.tag && null !== f2 && (e2 = f2, f2 = Kb(a, c), null != f2 && d.unshift(tf(a, f2, e2)), f2 = Kb(a, b), null != f2 && d.push(tf(a, f2, e2)));
          a = a.return;
        }
        return d;
      }
      function vf(a) {
        if (null === a) return null;
        do
          a = a.return;
        while (a && 5 !== a.tag);
        return a ? a : null;
      }
      function wf(a, b, c, d, e2) {
        for (var f2 = b._reactName, g = []; null !== c && c !== d; ) {
          var h = c, k2 = h.alternate, l2 = h.stateNode;
          if (null !== k2 && k2 === d) break;
          5 === h.tag && null !== l2 && (h = l2, e2 ? (k2 = Kb(c, f2), null != k2 && g.unshift(tf(c, k2, h))) : e2 || (k2 = Kb(c, f2), null != k2 && g.push(tf(c, k2, h))));
          c = c.return;
        }
        0 !== g.length && a.push({ event: b, listeners: g });
      }
      var xf = /\r\n?/g;
      var yf = /\u0000|\uFFFD/g;
      function zf(a) {
        return ("string" === typeof a ? a : "" + a).replace(xf, "\n").replace(yf, "");
      }
      function Af(a, b, c) {
        b = zf(b);
        if (zf(a) !== b && c) throw Error(p(425));
      }
      function Bf() {
      }
      var Cf = null;
      var Df = null;
      function Ef(a, b) {
        return "textarea" === a || "noscript" === a || "string" === typeof b.children || "number" === typeof b.children || "object" === typeof b.dangerouslySetInnerHTML && null !== b.dangerouslySetInnerHTML && null != b.dangerouslySetInnerHTML.__html;
      }
      var Ff = "function" === typeof setTimeout ? setTimeout : void 0;
      var Gf = "function" === typeof clearTimeout ? clearTimeout : void 0;
      var Hf = "function" === typeof Promise ? Promise : void 0;
      var Jf = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof Hf ? function(a) {
        return Hf.resolve(null).then(a).catch(If);
      } : Ff;
      function If(a) {
        setTimeout(function() {
          throw a;
        });
      }
      function Kf(a, b) {
        var c = b, d = 0;
        do {
          var e2 = c.nextSibling;
          a.removeChild(c);
          if (e2 && 8 === e2.nodeType) if (c = e2.data, "/$" === c) {
            if (0 === d) {
              a.removeChild(e2);
              bd(b);
              return;
            }
            d--;
          } else "$" !== c && "$?" !== c && "$!" !== c || d++;
          c = e2;
        } while (c);
        bd(b);
      }
      function Lf(a) {
        for (; null != a; a = a.nextSibling) {
          var b = a.nodeType;
          if (1 === b || 3 === b) break;
          if (8 === b) {
            b = a.data;
            if ("$" === b || "$!" === b || "$?" === b) break;
            if ("/$" === b) return null;
          }
        }
        return a;
      }
      function Mf(a) {
        a = a.previousSibling;
        for (var b = 0; a; ) {
          if (8 === a.nodeType) {
            var c = a.data;
            if ("$" === c || "$!" === c || "$?" === c) {
              if (0 === b) return a;
              b--;
            } else "/$" === c && b++;
          }
          a = a.previousSibling;
        }
        return null;
      }
      var Nf = Math.random().toString(36).slice(2);
      var Of = "__reactFiber$" + Nf;
      var Pf = "__reactProps$" + Nf;
      var uf = "__reactContainer$" + Nf;
      var of = "__reactEvents$" + Nf;
      var Qf = "__reactListeners$" + Nf;
      var Rf = "__reactHandles$" + Nf;
      function Wc(a) {
        var b = a[Of];
        if (b) return b;
        for (var c = a.parentNode; c; ) {
          if (b = c[uf] || c[Of]) {
            c = b.alternate;
            if (null !== b.child || null !== c && null !== c.child) for (a = Mf(a); null !== a; ) {
              if (c = a[Of]) return c;
              a = Mf(a);
            }
            return b;
          }
          a = c;
          c = a.parentNode;
        }
        return null;
      }
      function Cb(a) {
        a = a[Of] || a[uf];
        return !a || 5 !== a.tag && 6 !== a.tag && 13 !== a.tag && 3 !== a.tag ? null : a;
      }
      function ue3(a) {
        if (5 === a.tag || 6 === a.tag) return a.stateNode;
        throw Error(p(33));
      }
      function Db(a) {
        return a[Pf] || null;
      }
      var Sf = [];
      var Tf = -1;
      function Uf(a) {
        return { current: a };
      }
      function E3(a) {
        0 > Tf || (a.current = Sf[Tf], Sf[Tf] = null, Tf--);
      }
      function G2(a, b) {
        Tf++;
        Sf[Tf] = a.current;
        a.current = b;
      }
      var Vf = {};
      var H = Uf(Vf);
      var Wf = Uf(false);
      var Xf = Vf;
      function Yf(a, b) {
        var c = a.type.contextTypes;
        if (!c) return Vf;
        var d = a.stateNode;
        if (d && d.__reactInternalMemoizedUnmaskedChildContext === b) return d.__reactInternalMemoizedMaskedChildContext;
        var e2 = {}, f2;
        for (f2 in c) e2[f2] = b[f2];
        d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = b, a.__reactInternalMemoizedMaskedChildContext = e2);
        return e2;
      }
      function Zf(a) {
        a = a.childContextTypes;
        return null !== a && void 0 !== a;
      }
      function $f() {
        E3(Wf);
        E3(H);
      }
      function ag(a, b, c) {
        if (H.current !== Vf) throw Error(p(168));
        G2(H, b);
        G2(Wf, c);
      }
      function bg(a, b, c) {
        var d = a.stateNode;
        b = b.childContextTypes;
        if ("function" !== typeof d.getChildContext) return c;
        d = d.getChildContext();
        for (var e2 in d) if (!(e2 in b)) throw Error(p(108, Ra2(a) || "Unknown", e2));
        return A3({}, c, d);
      }
      function cg(a) {
        a = (a = a.stateNode) && a.__reactInternalMemoizedMergedChildContext || Vf;
        Xf = H.current;
        G2(H, a);
        G2(Wf, Wf.current);
        return true;
      }
      function dg(a, b, c) {
        var d = a.stateNode;
        if (!d) throw Error(p(169));
        c ? (a = bg(a, b, Xf), d.__reactInternalMemoizedMergedChildContext = a, E3(Wf), E3(H), G2(H, a)) : E3(Wf);
        G2(Wf, c);
      }
      var eg = null;
      var fg = false;
      var gg = false;
      function hg(a) {
        null === eg ? eg = [a] : eg.push(a);
      }
      function ig(a) {
        fg = true;
        hg(a);
      }
      function jg() {
        if (!gg && null !== eg) {
          gg = true;
          var a = 0, b = C;
          try {
            var c = eg;
            for (C = 1; a < c.length; a++) {
              var d = c[a];
              do
                d = d(true);
              while (null !== d);
            }
            eg = null;
            fg = false;
          } catch (e2) {
            throw null !== eg && (eg = eg.slice(a + 1)), ac(fc, jg), e2;
          } finally {
            C = b, gg = false;
          }
        }
        return null;
      }
      var kg = [];
      var lg = 0;
      var mg = null;
      var ng = 0;
      var og = [];
      var pg = 0;
      var qg = null;
      var rg = 1;
      var sg = "";
      function tg(a, b) {
        kg[lg++] = ng;
        kg[lg++] = mg;
        mg = a;
        ng = b;
      }
      function ug(a, b, c) {
        og[pg++] = rg;
        og[pg++] = sg;
        og[pg++] = qg;
        qg = a;
        var d = rg;
        a = sg;
        var e2 = 32 - oc(d) - 1;
        d &= ~(1 << e2);
        c += 1;
        var f2 = 32 - oc(b) + e2;
        if (30 < f2) {
          var g = e2 - e2 % 5;
          f2 = (d & (1 << g) - 1).toString(32);
          d >>= g;
          e2 -= g;
          rg = 1 << 32 - oc(b) + e2 | c << e2 | d;
          sg = f2 + a;
        } else rg = 1 << f2 | c << e2 | d, sg = a;
      }
      function vg(a) {
        null !== a.return && (tg(a, 1), ug(a, 1, 0));
      }
      function wg(a) {
        for (; a === mg; ) mg = kg[--lg], kg[lg] = null, ng = kg[--lg], kg[lg] = null;
        for (; a === qg; ) qg = og[--pg], og[pg] = null, sg = og[--pg], og[pg] = null, rg = og[--pg], og[pg] = null;
      }
      var xg = null;
      var yg = null;
      var I3 = false;
      var zg = null;
      function Ag(a, b) {
        var c = Bg(5, null, null, 0);
        c.elementType = "DELETED";
        c.stateNode = b;
        c.return = a;
        b = a.deletions;
        null === b ? (a.deletions = [c], a.flags |= 16) : b.push(c);
      }
      function Cg(a, b) {
        switch (a.tag) {
          case 5:
            var c = a.type;
            b = 1 !== b.nodeType || c.toLowerCase() !== b.nodeName.toLowerCase() ? null : b;
            return null !== b ? (a.stateNode = b, xg = a, yg = Lf(b.firstChild), true) : false;
          case 6:
            return b = "" === a.pendingProps || 3 !== b.nodeType ? null : b, null !== b ? (a.stateNode = b, xg = a, yg = null, true) : false;
          case 13:
            return b = 8 !== b.nodeType ? null : b, null !== b ? (c = null !== qg ? { id: rg, overflow: sg } : null, a.memoizedState = { dehydrated: b, treeContext: c, retryLane: 1073741824 }, c = Bg(18, null, null, 0), c.stateNode = b, c.return = a, a.child = c, xg = a, yg = null, true) : false;
          default:
            return false;
        }
      }
      function Dg(a) {
        return 0 !== (a.mode & 1) && 0 === (a.flags & 128);
      }
      function Eg(a) {
        if (I3) {
          var b = yg;
          if (b) {
            var c = b;
            if (!Cg(a, b)) {
              if (Dg(a)) throw Error(p(418));
              b = Lf(c.nextSibling);
              var d = xg;
              b && Cg(a, b) ? Ag(d, c) : (a.flags = a.flags & -4097 | 2, I3 = false, xg = a);
            }
          } else {
            if (Dg(a)) throw Error(p(418));
            a.flags = a.flags & -4097 | 2;
            I3 = false;
            xg = a;
          }
        }
      }
      function Fg(a) {
        for (a = a.return; null !== a && 5 !== a.tag && 3 !== a.tag && 13 !== a.tag; ) a = a.return;
        xg = a;
      }
      function Gg(a) {
        if (a !== xg) return false;
        if (!I3) return Fg(a), I3 = true, false;
        var b;
        (b = 3 !== a.tag) && !(b = 5 !== a.tag) && (b = a.type, b = "head" !== b && "body" !== b && !Ef(a.type, a.memoizedProps));
        if (b && (b = yg)) {
          if (Dg(a)) throw Hg(), Error(p(418));
          for (; b; ) Ag(a, b), b = Lf(b.nextSibling);
        }
        Fg(a);
        if (13 === a.tag) {
          a = a.memoizedState;
          a = null !== a ? a.dehydrated : null;
          if (!a) throw Error(p(317));
          a: {
            a = a.nextSibling;
            for (b = 0; a; ) {
              if (8 === a.nodeType) {
                var c = a.data;
                if ("/$" === c) {
                  if (0 === b) {
                    yg = Lf(a.nextSibling);
                    break a;
                  }
                  b--;
                } else "$" !== c && "$!" !== c && "$?" !== c || b++;
              }
              a = a.nextSibling;
            }
            yg = null;
          }
        } else yg = xg ? Lf(a.stateNode.nextSibling) : null;
        return true;
      }
      function Hg() {
        for (var a = yg; a; ) a = Lf(a.nextSibling);
      }
      function Ig() {
        yg = xg = null;
        I3 = false;
      }
      function Jg(a) {
        null === zg ? zg = [a] : zg.push(a);
      }
      var Kg = ua2.ReactCurrentBatchConfig;
      function Lg(a, b, c) {
        a = c.ref;
        if (null !== a && "function" !== typeof a && "object" !== typeof a) {
          if (c._owner) {
            c = c._owner;
            if (c) {
              if (1 !== c.tag) throw Error(p(309));
              var d = c.stateNode;
            }
            if (!d) throw Error(p(147, a));
            var e2 = d, f2 = "" + a;
            if (null !== b && null !== b.ref && "function" === typeof b.ref && b.ref._stringRef === f2) return b.ref;
            b = function(a2) {
              var b2 = e2.refs;
              null === a2 ? delete b2[f2] : b2[f2] = a2;
            };
            b._stringRef = f2;
            return b;
          }
          if ("string" !== typeof a) throw Error(p(284));
          if (!c._owner) throw Error(p(290, a));
        }
        return a;
      }
      function Mg(a, b) {
        a = Object.prototype.toString.call(b);
        throw Error(p(31, "[object Object]" === a ? "object with keys {" + Object.keys(b).join(", ") + "}" : a));
      }
      function Ng(a) {
        var b = a._init;
        return b(a._payload);
      }
      function Og(a) {
        function b(b2, c2) {
          if (a) {
            var d2 = b2.deletions;
            null === d2 ? (b2.deletions = [c2], b2.flags |= 16) : d2.push(c2);
          }
        }
        function c(c2, d2) {
          if (!a) return null;
          for (; null !== d2; ) b(c2, d2), d2 = d2.sibling;
          return null;
        }
        function d(a2, b2) {
          for (a2 = /* @__PURE__ */ new Map(); null !== b2; ) null !== b2.key ? a2.set(b2.key, b2) : a2.set(b2.index, b2), b2 = b2.sibling;
          return a2;
        }
        function e2(a2, b2) {
          a2 = Pg(a2, b2);
          a2.index = 0;
          a2.sibling = null;
          return a2;
        }
        function f2(b2, c2, d2) {
          b2.index = d2;
          if (!a) return b2.flags |= 1048576, c2;
          d2 = b2.alternate;
          if (null !== d2) return d2 = d2.index, d2 < c2 ? (b2.flags |= 2, c2) : d2;
          b2.flags |= 2;
          return c2;
        }
        function g(b2) {
          a && null === b2.alternate && (b2.flags |= 2);
          return b2;
        }
        function h(a2, b2, c2, d2) {
          if (null === b2 || 6 !== b2.tag) return b2 = Qg(c2, a2.mode, d2), b2.return = a2, b2;
          b2 = e2(b2, c2);
          b2.return = a2;
          return b2;
        }
        function k2(a2, b2, c2, d2) {
          var f3 = c2.type;
          if (f3 === ya) return m(a2, b2, c2.props.children, d2, c2.key);
          if (null !== b2 && (b2.elementType === f3 || "object" === typeof f3 && null !== f3 && f3.$$typeof === Ha2 && Ng(f3) === b2.type)) return d2 = e2(b2, c2.props), d2.ref = Lg(a2, b2, c2), d2.return = a2, d2;
          d2 = Rg(c2.type, c2.key, c2.props, null, a2.mode, d2);
          d2.ref = Lg(a2, b2, c2);
          d2.return = a2;
          return d2;
        }
        function l2(a2, b2, c2, d2) {
          if (null === b2 || 4 !== b2.tag || b2.stateNode.containerInfo !== c2.containerInfo || b2.stateNode.implementation !== c2.implementation) return b2 = Sg(c2, a2.mode, d2), b2.return = a2, b2;
          b2 = e2(b2, c2.children || []);
          b2.return = a2;
          return b2;
        }
        function m(a2, b2, c2, d2, f3) {
          if (null === b2 || 7 !== b2.tag) return b2 = Tg(c2, a2.mode, d2, f3), b2.return = a2, b2;
          b2 = e2(b2, c2);
          b2.return = a2;
          return b2;
        }
        function q2(a2, b2, c2) {
          if ("string" === typeof b2 && "" !== b2 || "number" === typeof b2) return b2 = Qg("" + b2, a2.mode, c2), b2.return = a2, b2;
          if ("object" === typeof b2 && null !== b2) {
            switch (b2.$$typeof) {
              case va:
                return c2 = Rg(b2.type, b2.key, b2.props, null, a2.mode, c2), c2.ref = Lg(a2, null, b2), c2.return = a2, c2;
              case wa:
                return b2 = Sg(b2, a2.mode, c2), b2.return = a2, b2;
              case Ha2:
                var d2 = b2._init;
                return q2(a2, d2(b2._payload), c2);
            }
            if (eb(b2) || Ka2(b2)) return b2 = Tg(b2, a2.mode, c2, null), b2.return = a2, b2;
            Mg(a2, b2);
          }
          return null;
        }
        function r(a2, b2, c2, d2) {
          var e3 = null !== b2 ? b2.key : null;
          if ("string" === typeof c2 && "" !== c2 || "number" === typeof c2) return null !== e3 ? null : h(a2, b2, "" + c2, d2);
          if ("object" === typeof c2 && null !== c2) {
            switch (c2.$$typeof) {
              case va:
                return c2.key === e3 ? k2(a2, b2, c2, d2) : null;
              case wa:
                return c2.key === e3 ? l2(a2, b2, c2, d2) : null;
              case Ha2:
                return e3 = c2._init, r(
                  a2,
                  b2,
                  e3(c2._payload),
                  d2
                );
            }
            if (eb(c2) || Ka2(c2)) return null !== e3 ? null : m(a2, b2, c2, d2, null);
            Mg(a2, c2);
          }
          return null;
        }
        function y2(a2, b2, c2, d2, e3) {
          if ("string" === typeof d2 && "" !== d2 || "number" === typeof d2) return a2 = a2.get(c2) || null, h(b2, a2, "" + d2, e3);
          if ("object" === typeof d2 && null !== d2) {
            switch (d2.$$typeof) {
              case va:
                return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, k2(b2, a2, d2, e3);
              case wa:
                return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, l2(b2, a2, d2, e3);
              case Ha2:
                var f3 = d2._init;
                return y2(a2, b2, c2, f3(d2._payload), e3);
            }
            if (eb(d2) || Ka2(d2)) return a2 = a2.get(c2) || null, m(b2, a2, d2, e3, null);
            Mg(b2, d2);
          }
          return null;
        }
        function n(e3, g2, h2, k3) {
          for (var l3 = null, m2 = null, u = g2, w = g2 = 0, x = null; null !== u && w < h2.length; w++) {
            u.index > w ? (x = u, u = null) : x = u.sibling;
            var n2 = r(e3, u, h2[w], k3);
            if (null === n2) {
              null === u && (u = x);
              break;
            }
            a && u && null === n2.alternate && b(e3, u);
            g2 = f2(n2, g2, w);
            null === m2 ? l3 = n2 : m2.sibling = n2;
            m2 = n2;
            u = x;
          }
          if (w === h2.length) return c(e3, u), I3 && tg(e3, w), l3;
          if (null === u) {
            for (; w < h2.length; w++) u = q2(e3, h2[w], k3), null !== u && (g2 = f2(u, g2, w), null === m2 ? l3 = u : m2.sibling = u, m2 = u);
            I3 && tg(e3, w);
            return l3;
          }
          for (u = d(e3, u); w < h2.length; w++) x = y2(u, e3, w, h2[w], k3), null !== x && (a && null !== x.alternate && u.delete(null === x.key ? w : x.key), g2 = f2(x, g2, w), null === m2 ? l3 = x : m2.sibling = x, m2 = x);
          a && u.forEach(function(a2) {
            return b(e3, a2);
          });
          I3 && tg(e3, w);
          return l3;
        }
        function t(e3, g2, h2, k3) {
          var l3 = Ka2(h2);
          if ("function" !== typeof l3) throw Error(p(150));
          h2 = l3.call(h2);
          if (null == h2) throw Error(p(151));
          for (var u = l3 = null, m2 = g2, w = g2 = 0, x = null, n2 = h2.next(); null !== m2 && !n2.done; w++, n2 = h2.next()) {
            m2.index > w ? (x = m2, m2 = null) : x = m2.sibling;
            var t2 = r(e3, m2, n2.value, k3);
            if (null === t2) {
              null === m2 && (m2 = x);
              break;
            }
            a && m2 && null === t2.alternate && b(e3, m2);
            g2 = f2(t2, g2, w);
            null === u ? l3 = t2 : u.sibling = t2;
            u = t2;
            m2 = x;
          }
          if (n2.done) return c(
            e3,
            m2
          ), I3 && tg(e3, w), l3;
          if (null === m2) {
            for (; !n2.done; w++, n2 = h2.next()) n2 = q2(e3, n2.value, k3), null !== n2 && (g2 = f2(n2, g2, w), null === u ? l3 = n2 : u.sibling = n2, u = n2);
            I3 && tg(e3, w);
            return l3;
          }
          for (m2 = d(e3, m2); !n2.done; w++, n2 = h2.next()) n2 = y2(m2, e3, w, n2.value, k3), null !== n2 && (a && null !== n2.alternate && m2.delete(null === n2.key ? w : n2.key), g2 = f2(n2, g2, w), null === u ? l3 = n2 : u.sibling = n2, u = n2);
          a && m2.forEach(function(a2) {
            return b(e3, a2);
          });
          I3 && tg(e3, w);
          return l3;
        }
        function J2(a2, d2, f3, h2) {
          "object" === typeof f3 && null !== f3 && f3.type === ya && null === f3.key && (f3 = f3.props.children);
          if ("object" === typeof f3 && null !== f3) {
            switch (f3.$$typeof) {
              case va:
                a: {
                  for (var k3 = f3.key, l3 = d2; null !== l3; ) {
                    if (l3.key === k3) {
                      k3 = f3.type;
                      if (k3 === ya) {
                        if (7 === l3.tag) {
                          c(a2, l3.sibling);
                          d2 = e2(l3, f3.props.children);
                          d2.return = a2;
                          a2 = d2;
                          break a;
                        }
                      } else if (l3.elementType === k3 || "object" === typeof k3 && null !== k3 && k3.$$typeof === Ha2 && Ng(k3) === l3.type) {
                        c(a2, l3.sibling);
                        d2 = e2(l3, f3.props);
                        d2.ref = Lg(a2, l3, f3);
                        d2.return = a2;
                        a2 = d2;
                        break a;
                      }
                      c(a2, l3);
                      break;
                    } else b(a2, l3);
                    l3 = l3.sibling;
                  }
                  f3.type === ya ? (d2 = Tg(f3.props.children, a2.mode, h2, f3.key), d2.return = a2, a2 = d2) : (h2 = Rg(f3.type, f3.key, f3.props, null, a2.mode, h2), h2.ref = Lg(a2, d2, f3), h2.return = a2, a2 = h2);
                }
                return g(a2);
              case wa:
                a: {
                  for (l3 = f3.key; null !== d2; ) {
                    if (d2.key === l3) if (4 === d2.tag && d2.stateNode.containerInfo === f3.containerInfo && d2.stateNode.implementation === f3.implementation) {
                      c(a2, d2.sibling);
                      d2 = e2(d2, f3.children || []);
                      d2.return = a2;
                      a2 = d2;
                      break a;
                    } else {
                      c(a2, d2);
                      break;
                    }
                    else b(a2, d2);
                    d2 = d2.sibling;
                  }
                  d2 = Sg(f3, a2.mode, h2);
                  d2.return = a2;
                  a2 = d2;
                }
                return g(a2);
              case Ha2:
                return l3 = f3._init, J2(a2, d2, l3(f3._payload), h2);
            }
            if (eb(f3)) return n(a2, d2, f3, h2);
            if (Ka2(f3)) return t(a2, d2, f3, h2);
            Mg(a2, f3);
          }
          return "string" === typeof f3 && "" !== f3 || "number" === typeof f3 ? (f3 = "" + f3, null !== d2 && 6 === d2.tag ? (c(a2, d2.sibling), d2 = e2(d2, f3), d2.return = a2, a2 = d2) : (c(a2, d2), d2 = Qg(f3, a2.mode, h2), d2.return = a2, a2 = d2), g(a2)) : c(a2, d2);
        }
        return J2;
      }
      var Ug = Og(true);
      var Vg = Og(false);
      var Wg = Uf(null);
      var Xg = null;
      var Yg = null;
      var Zg = null;
      function $g() {
        Zg = Yg = Xg = null;
      }
      function ah(a) {
        var b = Wg.current;
        E3(Wg);
        a._currentValue = b;
      }
      function bh(a, b, c) {
        for (; null !== a; ) {
          var d = a.alternate;
          (a.childLanes & b) !== b ? (a.childLanes |= b, null !== d && (d.childLanes |= b)) : null !== d && (d.childLanes & b) !== b && (d.childLanes |= b);
          if (a === c) break;
          a = a.return;
        }
      }
      function ch(a, b) {
        Xg = a;
        Zg = Yg = null;
        a = a.dependencies;
        null !== a && null !== a.firstContext && (0 !== (a.lanes & b) && (dh = true), a.firstContext = null);
      }
      function eh(a) {
        var b = a._currentValue;
        if (Zg !== a) if (a = { context: a, memoizedValue: b, next: null }, null === Yg) {
          if (null === Xg) throw Error(p(308));
          Yg = a;
          Xg.dependencies = { lanes: 0, firstContext: a };
        } else Yg = Yg.next = a;
        return b;
      }
      var fh = null;
      function gh(a) {
        null === fh ? fh = [a] : fh.push(a);
      }
      function hh(a, b, c, d) {
        var e2 = b.interleaved;
        null === e2 ? (c.next = c, gh(b)) : (c.next = e2.next, e2.next = c);
        b.interleaved = c;
        return ih(a, d);
      }
      function ih(a, b) {
        a.lanes |= b;
        var c = a.alternate;
        null !== c && (c.lanes |= b);
        c = a;
        for (a = a.return; null !== a; ) a.childLanes |= b, c = a.alternate, null !== c && (c.childLanes |= b), c = a, a = a.return;
        return 3 === c.tag ? c.stateNode : null;
      }
      var jh = false;
      function kh(a) {
        a.updateQueue = { baseState: a.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
      }
      function lh(a, b) {
        a = a.updateQueue;
        b.updateQueue === a && (b.updateQueue = { baseState: a.baseState, firstBaseUpdate: a.firstBaseUpdate, lastBaseUpdate: a.lastBaseUpdate, shared: a.shared, effects: a.effects });
      }
      function mh(a, b) {
        return { eventTime: a, lane: b, tag: 0, payload: null, callback: null, next: null };
      }
      function nh(a, b, c) {
        var d = a.updateQueue;
        if (null === d) return null;
        d = d.shared;
        if (0 !== (K2 & 2)) {
          var e2 = d.pending;
          null === e2 ? b.next = b : (b.next = e2.next, e2.next = b);
          d.pending = b;
          return ih(a, c);
        }
        e2 = d.interleaved;
        null === e2 ? (b.next = b, gh(d)) : (b.next = e2.next, e2.next = b);
        d.interleaved = b;
        return ih(a, c);
      }
      function oh(a, b, c) {
        b = b.updateQueue;
        if (null !== b && (b = b.shared, 0 !== (c & 4194240))) {
          var d = b.lanes;
          d &= a.pendingLanes;
          c |= d;
          b.lanes = c;
          Cc(a, c);
        }
      }
      function ph(a, b) {
        var c = a.updateQueue, d = a.alternate;
        if (null !== d && (d = d.updateQueue, c === d)) {
          var e2 = null, f2 = null;
          c = c.firstBaseUpdate;
          if (null !== c) {
            do {
              var g = { eventTime: c.eventTime, lane: c.lane, tag: c.tag, payload: c.payload, callback: c.callback, next: null };
              null === f2 ? e2 = f2 = g : f2 = f2.next = g;
              c = c.next;
            } while (null !== c);
            null === f2 ? e2 = f2 = b : f2 = f2.next = b;
          } else e2 = f2 = b;
          c = { baseState: d.baseState, firstBaseUpdate: e2, lastBaseUpdate: f2, shared: d.shared, effects: d.effects };
          a.updateQueue = c;
          return;
        }
        a = c.lastBaseUpdate;
        null === a ? c.firstBaseUpdate = b : a.next = b;
        c.lastBaseUpdate = b;
      }
      function qh(a, b, c, d) {
        var e2 = a.updateQueue;
        jh = false;
        var f2 = e2.firstBaseUpdate, g = e2.lastBaseUpdate, h = e2.shared.pending;
        if (null !== h) {
          e2.shared.pending = null;
          var k2 = h, l2 = k2.next;
          k2.next = null;
          null === g ? f2 = l2 : g.next = l2;
          g = k2;
          var m = a.alternate;
          null !== m && (m = m.updateQueue, h = m.lastBaseUpdate, h !== g && (null === h ? m.firstBaseUpdate = l2 : h.next = l2, m.lastBaseUpdate = k2));
        }
        if (null !== f2) {
          var q2 = e2.baseState;
          g = 0;
          m = l2 = k2 = null;
          h = f2;
          do {
            var r = h.lane, y2 = h.eventTime;
            if ((d & r) === r) {
              null !== m && (m = m.next = {
                eventTime: y2,
                lane: 0,
                tag: h.tag,
                payload: h.payload,
                callback: h.callback,
                next: null
              });
              a: {
                var n = a, t = h;
                r = b;
                y2 = c;
                switch (t.tag) {
                  case 1:
                    n = t.payload;
                    if ("function" === typeof n) {
                      q2 = n.call(y2, q2, r);
                      break a;
                    }
                    q2 = n;
                    break a;
                  case 3:
                    n.flags = n.flags & -65537 | 128;
                  case 0:
                    n = t.payload;
                    r = "function" === typeof n ? n.call(y2, q2, r) : n;
                    if (null === r || void 0 === r) break a;
                    q2 = A3({}, q2, r);
                    break a;
                  case 2:
                    jh = true;
                }
              }
              null !== h.callback && 0 !== h.lane && (a.flags |= 64, r = e2.effects, null === r ? e2.effects = [h] : r.push(h));
            } else y2 = { eventTime: y2, lane: r, tag: h.tag, payload: h.payload, callback: h.callback, next: null }, null === m ? (l2 = m = y2, k2 = q2) : m = m.next = y2, g |= r;
            h = h.next;
            if (null === h) if (h = e2.shared.pending, null === h) break;
            else r = h, h = r.next, r.next = null, e2.lastBaseUpdate = r, e2.shared.pending = null;
          } while (1);
          null === m && (k2 = q2);
          e2.baseState = k2;
          e2.firstBaseUpdate = l2;
          e2.lastBaseUpdate = m;
          b = e2.shared.interleaved;
          if (null !== b) {
            e2 = b;
            do
              g |= e2.lane, e2 = e2.next;
            while (e2 !== b);
          } else null === f2 && (e2.shared.lanes = 0);
          rh |= g;
          a.lanes = g;
          a.memoizedState = q2;
        }
      }
      function sh(a, b, c) {
        a = b.effects;
        b.effects = null;
        if (null !== a) for (b = 0; b < a.length; b++) {
          var d = a[b], e2 = d.callback;
          if (null !== e2) {
            d.callback = null;
            d = c;
            if ("function" !== typeof e2) throw Error(p(191, e2));
            e2.call(d);
          }
        }
      }
      var th = {};
      var uh = Uf(th);
      var vh = Uf(th);
      var wh = Uf(th);
      function xh(a) {
        if (a === th) throw Error(p(174));
        return a;
      }
      function yh(a, b) {
        G2(wh, b);
        G2(vh, a);
        G2(uh, th);
        a = b.nodeType;
        switch (a) {
          case 9:
          case 11:
            b = (b = b.documentElement) ? b.namespaceURI : lb(null, "");
            break;
          default:
            a = 8 === a ? b.parentNode : b, b = a.namespaceURI || null, a = a.tagName, b = lb(b, a);
        }
        E3(uh);
        G2(uh, b);
      }
      function zh() {
        E3(uh);
        E3(vh);
        E3(wh);
      }
      function Ah(a) {
        xh(wh.current);
        var b = xh(uh.current);
        var c = lb(b, a.type);
        b !== c && (G2(vh, a), G2(uh, c));
      }
      function Bh(a) {
        vh.current === a && (E3(uh), E3(vh));
      }
      var L = Uf(0);
      function Ch(a) {
        for (var b = a; null !== b; ) {
          if (13 === b.tag) {
            var c = b.memoizedState;
            if (null !== c && (c = c.dehydrated, null === c || "$?" === c.data || "$!" === c.data)) return b;
          } else if (19 === b.tag && void 0 !== b.memoizedProps.revealOrder) {
            if (0 !== (b.flags & 128)) return b;
          } else if (null !== b.child) {
            b.child.return = b;
            b = b.child;
            continue;
          }
          if (b === a) break;
          for (; null === b.sibling; ) {
            if (null === b.return || b.return === a) return null;
            b = b.return;
          }
          b.sibling.return = b.return;
          b = b.sibling;
        }
        return null;
      }
      var Dh = [];
      function Eh() {
        for (var a = 0; a < Dh.length; a++) Dh[a]._workInProgressVersionPrimary = null;
        Dh.length = 0;
      }
      var Fh = ua2.ReactCurrentDispatcher;
      var Gh = ua2.ReactCurrentBatchConfig;
      var Hh = 0;
      var M2 = null;
      var N2 = null;
      var O3 = null;
      var Ih = false;
      var Jh = false;
      var Kh = 0;
      var Lh = 0;
      function P() {
        throw Error(p(321));
      }
      function Mh(a, b) {
        if (null === b) return false;
        for (var c = 0; c < b.length && c < a.length; c++) if (!He3(a[c], b[c])) return false;
        return true;
      }
      function Nh(a, b, c, d, e2, f2) {
        Hh = f2;
        M2 = b;
        b.memoizedState = null;
        b.updateQueue = null;
        b.lanes = 0;
        Fh.current = null === a || null === a.memoizedState ? Oh : Ph;
        a = c(d, e2);
        if (Jh) {
          f2 = 0;
          do {
            Jh = false;
            Kh = 0;
            if (25 <= f2) throw Error(p(301));
            f2 += 1;
            O3 = N2 = null;
            b.updateQueue = null;
            Fh.current = Qh;
            a = c(d, e2);
          } while (Jh);
        }
        Fh.current = Rh;
        b = null !== N2 && null !== N2.next;
        Hh = 0;
        O3 = N2 = M2 = null;
        Ih = false;
        if (b) throw Error(p(300));
        return a;
      }
      function Sh() {
        var a = 0 !== Kh;
        Kh = 0;
        return a;
      }
      function Th() {
        var a = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
        null === O3 ? M2.memoizedState = O3 = a : O3 = O3.next = a;
        return O3;
      }
      function Uh() {
        if (null === N2) {
          var a = M2.alternate;
          a = null !== a ? a.memoizedState : null;
        } else a = N2.next;
        var b = null === O3 ? M2.memoizedState : O3.next;
        if (null !== b) O3 = b, N2 = a;
        else {
          if (null === a) throw Error(p(310));
          N2 = a;
          a = { memoizedState: N2.memoizedState, baseState: N2.baseState, baseQueue: N2.baseQueue, queue: N2.queue, next: null };
          null === O3 ? M2.memoizedState = O3 = a : O3 = O3.next = a;
        }
        return O3;
      }
      function Vh(a, b) {
        return "function" === typeof b ? b(a) : b;
      }
      function Wh(a) {
        var b = Uh(), c = b.queue;
        if (null === c) throw Error(p(311));
        c.lastRenderedReducer = a;
        var d = N2, e2 = d.baseQueue, f2 = c.pending;
        if (null !== f2) {
          if (null !== e2) {
            var g = e2.next;
            e2.next = f2.next;
            f2.next = g;
          }
          d.baseQueue = e2 = f2;
          c.pending = null;
        }
        if (null !== e2) {
          f2 = e2.next;
          d = d.baseState;
          var h = g = null, k2 = null, l2 = f2;
          do {
            var m = l2.lane;
            if ((Hh & m) === m) null !== k2 && (k2 = k2.next = { lane: 0, action: l2.action, hasEagerState: l2.hasEagerState, eagerState: l2.eagerState, next: null }), d = l2.hasEagerState ? l2.eagerState : a(d, l2.action);
            else {
              var q2 = {
                lane: m,
                action: l2.action,
                hasEagerState: l2.hasEagerState,
                eagerState: l2.eagerState,
                next: null
              };
              null === k2 ? (h = k2 = q2, g = d) : k2 = k2.next = q2;
              M2.lanes |= m;
              rh |= m;
            }
            l2 = l2.next;
          } while (null !== l2 && l2 !== f2);
          null === k2 ? g = d : k2.next = h;
          He3(d, b.memoizedState) || (dh = true);
          b.memoizedState = d;
          b.baseState = g;
          b.baseQueue = k2;
          c.lastRenderedState = d;
        }
        a = c.interleaved;
        if (null !== a) {
          e2 = a;
          do
            f2 = e2.lane, M2.lanes |= f2, rh |= f2, e2 = e2.next;
          while (e2 !== a);
        } else null === e2 && (c.lanes = 0);
        return [b.memoizedState, c.dispatch];
      }
      function Xh(a) {
        var b = Uh(), c = b.queue;
        if (null === c) throw Error(p(311));
        c.lastRenderedReducer = a;
        var d = c.dispatch, e2 = c.pending, f2 = b.memoizedState;
        if (null !== e2) {
          c.pending = null;
          var g = e2 = e2.next;
          do
            f2 = a(f2, g.action), g = g.next;
          while (g !== e2);
          He3(f2, b.memoizedState) || (dh = true);
          b.memoizedState = f2;
          null === b.baseQueue && (b.baseState = f2);
          c.lastRenderedState = f2;
        }
        return [f2, d];
      }
      function Yh() {
      }
      function Zh(a, b) {
        var c = M2, d = Uh(), e2 = b(), f2 = !He3(d.memoizedState, e2);
        f2 && (d.memoizedState = e2, dh = true);
        d = d.queue;
        $h(ai.bind(null, c, d, a), [a]);
        if (d.getSnapshot !== b || f2 || null !== O3 && O3.memoizedState.tag & 1) {
          c.flags |= 2048;
          bi(9, ci.bind(null, c, d, e2, b), void 0, null);
          if (null === Q2) throw Error(p(349));
          0 !== (Hh & 30) || di(c, b, e2);
        }
        return e2;
      }
      function di(a, b, c) {
        a.flags |= 16384;
        a = { getSnapshot: b, value: c };
        b = M2.updateQueue;
        null === b ? (b = { lastEffect: null, stores: null }, M2.updateQueue = b, b.stores = [a]) : (c = b.stores, null === c ? b.stores = [a] : c.push(a));
      }
      function ci(a, b, c, d) {
        b.value = c;
        b.getSnapshot = d;
        ei(b) && fi(a);
      }
      function ai(a, b, c) {
        return c(function() {
          ei(b) && fi(a);
        });
      }
      function ei(a) {
        var b = a.getSnapshot;
        a = a.value;
        try {
          var c = b();
          return !He3(a, c);
        } catch (d) {
          return true;
        }
      }
      function fi(a) {
        var b = ih(a, 1);
        null !== b && gi(b, a, 1, -1);
      }
      function hi(a) {
        var b = Th();
        "function" === typeof a && (a = a());
        b.memoizedState = b.baseState = a;
        a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Vh, lastRenderedState: a };
        b.queue = a;
        a = a.dispatch = ii.bind(null, M2, a);
        return [b.memoizedState, a];
      }
      function bi(a, b, c, d) {
        a = { tag: a, create: b, destroy: c, deps: d, next: null };
        b = M2.updateQueue;
        null === b ? (b = { lastEffect: null, stores: null }, M2.updateQueue = b, b.lastEffect = a.next = a) : (c = b.lastEffect, null === c ? b.lastEffect = a.next = a : (d = c.next, c.next = a, a.next = d, b.lastEffect = a));
        return a;
      }
      function ji() {
        return Uh().memoizedState;
      }
      function ki(a, b, c, d) {
        var e2 = Th();
        M2.flags |= a;
        e2.memoizedState = bi(1 | b, c, void 0, void 0 === d ? null : d);
      }
      function li(a, b, c, d) {
        var e2 = Uh();
        d = void 0 === d ? null : d;
        var f2 = void 0;
        if (null !== N2) {
          var g = N2.memoizedState;
          f2 = g.destroy;
          if (null !== d && Mh(d, g.deps)) {
            e2.memoizedState = bi(b, c, f2, d);
            return;
          }
        }
        M2.flags |= a;
        e2.memoizedState = bi(1 | b, c, f2, d);
      }
      function mi(a, b) {
        return ki(8390656, 8, a, b);
      }
      function $h(a, b) {
        return li(2048, 8, a, b);
      }
      function ni(a, b) {
        return li(4, 2, a, b);
      }
      function oi(a, b) {
        return li(4, 4, a, b);
      }
      function pi(a, b) {
        if ("function" === typeof b) return a = a(), b(a), function() {
          b(null);
        };
        if (null !== b && void 0 !== b) return a = a(), b.current = a, function() {
          b.current = null;
        };
      }
      function qi(a, b, c) {
        c = null !== c && void 0 !== c ? c.concat([a]) : null;
        return li(4, 4, pi.bind(null, b, a), c);
      }
      function ri() {
      }
      function si(a, b) {
        var c = Uh();
        b = void 0 === b ? null : b;
        var d = c.memoizedState;
        if (null !== d && null !== b && Mh(b, d[1])) return d[0];
        c.memoizedState = [a, b];
        return a;
      }
      function ti(a, b) {
        var c = Uh();
        b = void 0 === b ? null : b;
        var d = c.memoizedState;
        if (null !== d && null !== b && Mh(b, d[1])) return d[0];
        a = a();
        c.memoizedState = [a, b];
        return a;
      }
      function ui(a, b, c) {
        if (0 === (Hh & 21)) return a.baseState && (a.baseState = false, dh = true), a.memoizedState = c;
        He3(c, b) || (c = yc(), M2.lanes |= c, rh |= c, a.baseState = true);
        return b;
      }
      function vi(a, b) {
        var c = C;
        C = 0 !== c && 4 > c ? c : 4;
        a(true);
        var d = Gh.transition;
        Gh.transition = {};
        try {
          a(false), b();
        } finally {
          C = c, Gh.transition = d;
        }
      }
      function wi() {
        return Uh().memoizedState;
      }
      function xi(a, b, c) {
        var d = yi(a);
        c = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
        if (zi(a)) Ai(b, c);
        else if (c = hh(a, b, c, d), null !== c) {
          var e2 = R3();
          gi(c, a, d, e2);
          Bi(c, b, d);
        }
      }
      function ii(a, b, c) {
        var d = yi(a), e2 = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
        if (zi(a)) Ai(b, e2);
        else {
          var f2 = a.alternate;
          if (0 === a.lanes && (null === f2 || 0 === f2.lanes) && (f2 = b.lastRenderedReducer, null !== f2)) try {
            var g = b.lastRenderedState, h = f2(g, c);
            e2.hasEagerState = true;
            e2.eagerState = h;
            if (He3(h, g)) {
              var k2 = b.interleaved;
              null === k2 ? (e2.next = e2, gh(b)) : (e2.next = k2.next, k2.next = e2);
              b.interleaved = e2;
              return;
            }
          } catch (l2) {
          } finally {
          }
          c = hh(a, b, e2, d);
          null !== c && (e2 = R3(), gi(c, a, d, e2), Bi(c, b, d));
        }
      }
      function zi(a) {
        var b = a.alternate;
        return a === M2 || null !== b && b === M2;
      }
      function Ai(a, b) {
        Jh = Ih = true;
        var c = a.pending;
        null === c ? b.next = b : (b.next = c.next, c.next = b);
        a.pending = b;
      }
      function Bi(a, b, c) {
        if (0 !== (c & 4194240)) {
          var d = b.lanes;
          d &= a.pendingLanes;
          c |= d;
          b.lanes = c;
          Cc(a, c);
        }
      }
      var Rh = { readContext: eh, useCallback: P, useContext: P, useEffect: P, useImperativeHandle: P, useInsertionEffect: P, useLayoutEffect: P, useMemo: P, useReducer: P, useRef: P, useState: P, useDebugValue: P, useDeferredValue: P, useTransition: P, useMutableSource: P, useSyncExternalStore: P, useId: P, unstable_isNewReconciler: false };
      var Oh = { readContext: eh, useCallback: function(a, b) {
        Th().memoizedState = [a, void 0 === b ? null : b];
        return a;
      }, useContext: eh, useEffect: mi, useImperativeHandle: function(a, b, c) {
        c = null !== c && void 0 !== c ? c.concat([a]) : null;
        return ki(
          4194308,
          4,
          pi.bind(null, b, a),
          c
        );
      }, useLayoutEffect: function(a, b) {
        return ki(4194308, 4, a, b);
      }, useInsertionEffect: function(a, b) {
        return ki(4, 2, a, b);
      }, useMemo: function(a, b) {
        var c = Th();
        b = void 0 === b ? null : b;
        a = a();
        c.memoizedState = [a, b];
        return a;
      }, useReducer: function(a, b, c) {
        var d = Th();
        b = void 0 !== c ? c(b) : b;
        d.memoizedState = d.baseState = b;
        a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: a, lastRenderedState: b };
        d.queue = a;
        a = a.dispatch = xi.bind(null, M2, a);
        return [d.memoizedState, a];
      }, useRef: function(a) {
        var b = Th();
        a = { current: a };
        return b.memoizedState = a;
      }, useState: hi, useDebugValue: ri, useDeferredValue: function(a) {
        return Th().memoizedState = a;
      }, useTransition: function() {
        var a = hi(false), b = a[0];
        a = vi.bind(null, a[1]);
        Th().memoizedState = a;
        return [b, a];
      }, useMutableSource: function() {
      }, useSyncExternalStore: function(a, b, c) {
        var d = M2, e2 = Th();
        if (I3) {
          if (void 0 === c) throw Error(p(407));
          c = c();
        } else {
          c = b();
          if (null === Q2) throw Error(p(349));
          0 !== (Hh & 30) || di(d, b, c);
        }
        e2.memoizedState = c;
        var f2 = { value: c, getSnapshot: b };
        e2.queue = f2;
        mi(ai.bind(
          null,
          d,
          f2,
          a
        ), [a]);
        d.flags |= 2048;
        bi(9, ci.bind(null, d, f2, c, b), void 0, null);
        return c;
      }, useId: function() {
        var a = Th(), b = Q2.identifierPrefix;
        if (I3) {
          var c = sg;
          var d = rg;
          c = (d & ~(1 << 32 - oc(d) - 1)).toString(32) + c;
          b = ":" + b + "R" + c;
          c = Kh++;
          0 < c && (b += "H" + c.toString(32));
          b += ":";
        } else c = Lh++, b = ":" + b + "r" + c.toString(32) + ":";
        return a.memoizedState = b;
      }, unstable_isNewReconciler: false };
      var Ph = {
        readContext: eh,
        useCallback: si,
        useContext: eh,
        useEffect: $h,
        useImperativeHandle: qi,
        useInsertionEffect: ni,
        useLayoutEffect: oi,
        useMemo: ti,
        useReducer: Wh,
        useRef: ji,
        useState: function() {
          return Wh(Vh);
        },
        useDebugValue: ri,
        useDeferredValue: function(a) {
          var b = Uh();
          return ui(b, N2.memoizedState, a);
        },
        useTransition: function() {
          var a = Wh(Vh)[0], b = Uh().memoizedState;
          return [a, b];
        },
        useMutableSource: Yh,
        useSyncExternalStore: Zh,
        useId: wi,
        unstable_isNewReconciler: false
      };
      var Qh = { readContext: eh, useCallback: si, useContext: eh, useEffect: $h, useImperativeHandle: qi, useInsertionEffect: ni, useLayoutEffect: oi, useMemo: ti, useReducer: Xh, useRef: ji, useState: function() {
        return Xh(Vh);
      }, useDebugValue: ri, useDeferredValue: function(a) {
        var b = Uh();
        return null === N2 ? b.memoizedState = a : ui(b, N2.memoizedState, a);
      }, useTransition: function() {
        var a = Xh(Vh)[0], b = Uh().memoizedState;
        return [a, b];
      }, useMutableSource: Yh, useSyncExternalStore: Zh, useId: wi, unstable_isNewReconciler: false };
      function Ci(a, b) {
        if (a && a.defaultProps) {
          b = A3({}, b);
          a = a.defaultProps;
          for (var c in a) void 0 === b[c] && (b[c] = a[c]);
          return b;
        }
        return b;
      }
      function Di(a, b, c, d) {
        b = a.memoizedState;
        c = c(d, b);
        c = null === c || void 0 === c ? b : A3({}, b, c);
        a.memoizedState = c;
        0 === a.lanes && (a.updateQueue.baseState = c);
      }
      var Ei = { isMounted: function(a) {
        return (a = a._reactInternals) ? Vb(a) === a : false;
      }, enqueueSetState: function(a, b, c) {
        a = a._reactInternals;
        var d = R3(), e2 = yi(a), f2 = mh(d, e2);
        f2.payload = b;
        void 0 !== c && null !== c && (f2.callback = c);
        b = nh(a, f2, e2);
        null !== b && (gi(b, a, e2, d), oh(b, a, e2));
      }, enqueueReplaceState: function(a, b, c) {
        a = a._reactInternals;
        var d = R3(), e2 = yi(a), f2 = mh(d, e2);
        f2.tag = 1;
        f2.payload = b;
        void 0 !== c && null !== c && (f2.callback = c);
        b = nh(a, f2, e2);
        null !== b && (gi(b, a, e2, d), oh(b, a, e2));
      }, enqueueForceUpdate: function(a, b) {
        a = a._reactInternals;
        var c = R3(), d = yi(a), e2 = mh(c, d);
        e2.tag = 2;
        void 0 !== b && null !== b && (e2.callback = b);
        b = nh(a, e2, d);
        null !== b && (gi(b, a, d, c), oh(b, a, d));
      } };
      function Fi(a, b, c, d, e2, f2, g) {
        a = a.stateNode;
        return "function" === typeof a.shouldComponentUpdate ? a.shouldComponentUpdate(d, f2, g) : b.prototype && b.prototype.isPureReactComponent ? !Ie3(c, d) || !Ie3(e2, f2) : true;
      }
      function Gi(a, b, c) {
        var d = false, e2 = Vf;
        var f2 = b.contextType;
        "object" === typeof f2 && null !== f2 ? f2 = eh(f2) : (e2 = Zf(b) ? Xf : H.current, d = b.contextTypes, f2 = (d = null !== d && void 0 !== d) ? Yf(a, e2) : Vf);
        b = new b(c, f2);
        a.memoizedState = null !== b.state && void 0 !== b.state ? b.state : null;
        b.updater = Ei;
        a.stateNode = b;
        b._reactInternals = a;
        d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = e2, a.__reactInternalMemoizedMaskedChildContext = f2);
        return b;
      }
      function Hi(a, b, c, d) {
        a = b.state;
        "function" === typeof b.componentWillReceiveProps && b.componentWillReceiveProps(c, d);
        "function" === typeof b.UNSAFE_componentWillReceiveProps && b.UNSAFE_componentWillReceiveProps(c, d);
        b.state !== a && Ei.enqueueReplaceState(b, b.state, null);
      }
      function Ii(a, b, c, d) {
        var e2 = a.stateNode;
        e2.props = c;
        e2.state = a.memoizedState;
        e2.refs = {};
        kh(a);
        var f2 = b.contextType;
        "object" === typeof f2 && null !== f2 ? e2.context = eh(f2) : (f2 = Zf(b) ? Xf : H.current, e2.context = Yf(a, f2));
        e2.state = a.memoizedState;
        f2 = b.getDerivedStateFromProps;
        "function" === typeof f2 && (Di(a, b, f2, c), e2.state = a.memoizedState);
        "function" === typeof b.getDerivedStateFromProps || "function" === typeof e2.getSnapshotBeforeUpdate || "function" !== typeof e2.UNSAFE_componentWillMount && "function" !== typeof e2.componentWillMount || (b = e2.state, "function" === typeof e2.componentWillMount && e2.componentWillMount(), "function" === typeof e2.UNSAFE_componentWillMount && e2.UNSAFE_componentWillMount(), b !== e2.state && Ei.enqueueReplaceState(e2, e2.state, null), qh(a, c, e2, d), e2.state = a.memoizedState);
        "function" === typeof e2.componentDidMount && (a.flags |= 4194308);
      }
      function Ji(a, b) {
        try {
          var c = "", d = b;
          do
            c += Pa2(d), d = d.return;
          while (d);
          var e2 = c;
        } catch (f2) {
          e2 = "\nError generating stack: " + f2.message + "\n" + f2.stack;
        }
        return { value: a, source: b, stack: e2, digest: null };
      }
      function Ki(a, b, c) {
        return { value: a, source: null, stack: null != c ? c : null, digest: null != b ? b : null };
      }
      function Li(a, b) {
        try {
          console.error(b.value);
        } catch (c) {
          setTimeout(function() {
            throw c;
          });
        }
      }
      var Mi = "function" === typeof WeakMap ? WeakMap : Map;
      function Ni(a, b, c) {
        c = mh(-1, c);
        c.tag = 3;
        c.payload = { element: null };
        var d = b.value;
        c.callback = function() {
          Oi || (Oi = true, Pi = d);
          Li(a, b);
        };
        return c;
      }
      function Qi(a, b, c) {
        c = mh(-1, c);
        c.tag = 3;
        var d = a.type.getDerivedStateFromError;
        if ("function" === typeof d) {
          var e2 = b.value;
          c.payload = function() {
            return d(e2);
          };
          c.callback = function() {
            Li(a, b);
          };
        }
        var f2 = a.stateNode;
        null !== f2 && "function" === typeof f2.componentDidCatch && (c.callback = function() {
          Li(a, b);
          "function" !== typeof d && (null === Ri ? Ri = /* @__PURE__ */ new Set([this]) : Ri.add(this));
          var c2 = b.stack;
          this.componentDidCatch(b.value, { componentStack: null !== c2 ? c2 : "" });
        });
        return c;
      }
      function Si(a, b, c) {
        var d = a.pingCache;
        if (null === d) {
          d = a.pingCache = new Mi();
          var e2 = /* @__PURE__ */ new Set();
          d.set(b, e2);
        } else e2 = d.get(b), void 0 === e2 && (e2 = /* @__PURE__ */ new Set(), d.set(b, e2));
        e2.has(c) || (e2.add(c), a = Ti.bind(null, a, b, c), b.then(a, a));
      }
      function Ui(a) {
        do {
          var b;
          if (b = 13 === a.tag) b = a.memoizedState, b = null !== b ? null !== b.dehydrated ? true : false : true;
          if (b) return a;
          a = a.return;
        } while (null !== a);
        return null;
      }
      function Vi(a, b, c, d, e2) {
        if (0 === (a.mode & 1)) return a === b ? a.flags |= 65536 : (a.flags |= 128, c.flags |= 131072, c.flags &= -52805, 1 === c.tag && (null === c.alternate ? c.tag = 17 : (b = mh(-1, 1), b.tag = 2, nh(c, b, 1))), c.lanes |= 1), a;
        a.flags |= 65536;
        a.lanes = e2;
        return a;
      }
      var Wi = ua2.ReactCurrentOwner;
      var dh = false;
      function Xi(a, b, c, d) {
        b.child = null === a ? Vg(b, null, c, d) : Ug(b, a.child, c, d);
      }
      function Yi(a, b, c, d, e2) {
        c = c.render;
        var f2 = b.ref;
        ch(b, e2);
        d = Nh(a, b, c, d, f2, e2);
        c = Sh();
        if (null !== a && !dh) return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e2, Zi(a, b, e2);
        I3 && c && vg(b);
        b.flags |= 1;
        Xi(a, b, d, e2);
        return b.child;
      }
      function $i(a, b, c, d, e2) {
        if (null === a) {
          var f2 = c.type;
          if ("function" === typeof f2 && !aj(f2) && void 0 === f2.defaultProps && null === c.compare && void 0 === c.defaultProps) return b.tag = 15, b.type = f2, bj(a, b, f2, d, e2);
          a = Rg(c.type, null, d, b, b.mode, e2);
          a.ref = b.ref;
          a.return = b;
          return b.child = a;
        }
        f2 = a.child;
        if (0 === (a.lanes & e2)) {
          var g = f2.memoizedProps;
          c = c.compare;
          c = null !== c ? c : Ie3;
          if (c(g, d) && a.ref === b.ref) return Zi(a, b, e2);
        }
        b.flags |= 1;
        a = Pg(f2, d);
        a.ref = b.ref;
        a.return = b;
        return b.child = a;
      }
      function bj(a, b, c, d, e2) {
        if (null !== a) {
          var f2 = a.memoizedProps;
          if (Ie3(f2, d) && a.ref === b.ref) if (dh = false, b.pendingProps = d = f2, 0 !== (a.lanes & e2)) 0 !== (a.flags & 131072) && (dh = true);
          else return b.lanes = a.lanes, Zi(a, b, e2);
        }
        return cj(a, b, c, d, e2);
      }
      function dj(a, b, c) {
        var d = b.pendingProps, e2 = d.children, f2 = null !== a ? a.memoizedState : null;
        if ("hidden" === d.mode) if (0 === (b.mode & 1)) b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, G2(ej, fj), fj |= c;
        else {
          if (0 === (c & 1073741824)) return a = null !== f2 ? f2.baseLanes | c : c, b.lanes = b.childLanes = 1073741824, b.memoizedState = { baseLanes: a, cachePool: null, transitions: null }, b.updateQueue = null, G2(ej, fj), fj |= a, null;
          b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null };
          d = null !== f2 ? f2.baseLanes : c;
          G2(ej, fj);
          fj |= d;
        }
        else null !== f2 ? (d = f2.baseLanes | c, b.memoizedState = null) : d = c, G2(ej, fj), fj |= d;
        Xi(a, b, e2, c);
        return b.child;
      }
      function gj(a, b) {
        var c = b.ref;
        if (null === a && null !== c || null !== a && a.ref !== c) b.flags |= 512, b.flags |= 2097152;
      }
      function cj(a, b, c, d, e2) {
        var f2 = Zf(c) ? Xf : H.current;
        f2 = Yf(b, f2);
        ch(b, e2);
        c = Nh(a, b, c, d, f2, e2);
        d = Sh();
        if (null !== a && !dh) return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e2, Zi(a, b, e2);
        I3 && d && vg(b);
        b.flags |= 1;
        Xi(a, b, c, e2);
        return b.child;
      }
      function hj(a, b, c, d, e2) {
        if (Zf(c)) {
          var f2 = true;
          cg(b);
        } else f2 = false;
        ch(b, e2);
        if (null === b.stateNode) ij(a, b), Gi(b, c, d), Ii(b, c, d, e2), d = true;
        else if (null === a) {
          var g = b.stateNode, h = b.memoizedProps;
          g.props = h;
          var k2 = g.context, l2 = c.contextType;
          "object" === typeof l2 && null !== l2 ? l2 = eh(l2) : (l2 = Zf(c) ? Xf : H.current, l2 = Yf(b, l2));
          var m = c.getDerivedStateFromProps, q2 = "function" === typeof m || "function" === typeof g.getSnapshotBeforeUpdate;
          q2 || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== d || k2 !== l2) && Hi(b, g, d, l2);
          jh = false;
          var r = b.memoizedState;
          g.state = r;
          qh(b, d, g, e2);
          k2 = b.memoizedState;
          h !== d || r !== k2 || Wf.current || jh ? ("function" === typeof m && (Di(b, c, m, d), k2 = b.memoizedState), (h = jh || Fi(b, c, h, d, r, k2, l2)) ? (q2 || "function" !== typeof g.UNSAFE_componentWillMount && "function" !== typeof g.componentWillMount || ("function" === typeof g.componentWillMount && g.componentWillMount(), "function" === typeof g.UNSAFE_componentWillMount && g.UNSAFE_componentWillMount()), "function" === typeof g.componentDidMount && (b.flags |= 4194308)) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), b.memoizedProps = d, b.memoizedState = k2), g.props = d, g.state = k2, g.context = l2, d = h) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), d = false);
        } else {
          g = b.stateNode;
          lh(a, b);
          h = b.memoizedProps;
          l2 = b.type === b.elementType ? h : Ci(b.type, h);
          g.props = l2;
          q2 = b.pendingProps;
          r = g.context;
          k2 = c.contextType;
          "object" === typeof k2 && null !== k2 ? k2 = eh(k2) : (k2 = Zf(c) ? Xf : H.current, k2 = Yf(b, k2));
          var y2 = c.getDerivedStateFromProps;
          (m = "function" === typeof y2 || "function" === typeof g.getSnapshotBeforeUpdate) || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== q2 || r !== k2) && Hi(b, g, d, k2);
          jh = false;
          r = b.memoizedState;
          g.state = r;
          qh(b, d, g, e2);
          var n = b.memoizedState;
          h !== q2 || r !== n || Wf.current || jh ? ("function" === typeof y2 && (Di(b, c, y2, d), n = b.memoizedState), (l2 = jh || Fi(b, c, l2, d, r, n, k2) || false) ? (m || "function" !== typeof g.UNSAFE_componentWillUpdate && "function" !== typeof g.componentWillUpdate || ("function" === typeof g.componentWillUpdate && g.componentWillUpdate(d, n, k2), "function" === typeof g.UNSAFE_componentWillUpdate && g.UNSAFE_componentWillUpdate(d, n, k2)), "function" === typeof g.componentDidUpdate && (b.flags |= 4), "function" === typeof g.getSnapshotBeforeUpdate && (b.flags |= 1024)) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), b.memoizedProps = d, b.memoizedState = n), g.props = d, g.state = n, g.context = k2, d = l2) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), d = false);
        }
        return jj(a, b, c, d, f2, e2);
      }
      function jj(a, b, c, d, e2, f2) {
        gj(a, b);
        var g = 0 !== (b.flags & 128);
        if (!d && !g) return e2 && dg(b, c, false), Zi(a, b, f2);
        d = b.stateNode;
        Wi.current = b;
        var h = g && "function" !== typeof c.getDerivedStateFromError ? null : d.render();
        b.flags |= 1;
        null !== a && g ? (b.child = Ug(b, a.child, null, f2), b.child = Ug(b, null, h, f2)) : Xi(a, b, h, f2);
        b.memoizedState = d.state;
        e2 && dg(b, c, true);
        return b.child;
      }
      function kj(a) {
        var b = a.stateNode;
        b.pendingContext ? ag(a, b.pendingContext, b.pendingContext !== b.context) : b.context && ag(a, b.context, false);
        yh(a, b.containerInfo);
      }
      function lj(a, b, c, d, e2) {
        Ig();
        Jg(e2);
        b.flags |= 256;
        Xi(a, b, c, d);
        return b.child;
      }
      var mj = { dehydrated: null, treeContext: null, retryLane: 0 };
      function nj(a) {
        return { baseLanes: a, cachePool: null, transitions: null };
      }
      function oj(a, b, c) {
        var d = b.pendingProps, e2 = L.current, f2 = false, g = 0 !== (b.flags & 128), h;
        (h = g) || (h = null !== a && null === a.memoizedState ? false : 0 !== (e2 & 2));
        if (h) f2 = true, b.flags &= -129;
        else if (null === a || null !== a.memoizedState) e2 |= 1;
        G2(L, e2 & 1);
        if (null === a) {
          Eg(b);
          a = b.memoizedState;
          if (null !== a && (a = a.dehydrated, null !== a)) return 0 === (b.mode & 1) ? b.lanes = 1 : "$!" === a.data ? b.lanes = 8 : b.lanes = 1073741824, null;
          g = d.children;
          a = d.fallback;
          return f2 ? (d = b.mode, f2 = b.child, g = { mode: "hidden", children: g }, 0 === (d & 1) && null !== f2 ? (f2.childLanes = 0, f2.pendingProps = g) : f2 = pj(g, d, 0, null), a = Tg(a, d, c, null), f2.return = b, a.return = b, f2.sibling = a, b.child = f2, b.child.memoizedState = nj(c), b.memoizedState = mj, a) : qj(b, g);
        }
        e2 = a.memoizedState;
        if (null !== e2 && (h = e2.dehydrated, null !== h)) return rj(a, b, g, d, h, e2, c);
        if (f2) {
          f2 = d.fallback;
          g = b.mode;
          e2 = a.child;
          h = e2.sibling;
          var k2 = { mode: "hidden", children: d.children };
          0 === (g & 1) && b.child !== e2 ? (d = b.child, d.childLanes = 0, d.pendingProps = k2, b.deletions = null) : (d = Pg(e2, k2), d.subtreeFlags = e2.subtreeFlags & 14680064);
          null !== h ? f2 = Pg(h, f2) : (f2 = Tg(f2, g, c, null), f2.flags |= 2);
          f2.return = b;
          d.return = b;
          d.sibling = f2;
          b.child = d;
          d = f2;
          f2 = b.child;
          g = a.child.memoizedState;
          g = null === g ? nj(c) : { baseLanes: g.baseLanes | c, cachePool: null, transitions: g.transitions };
          f2.memoizedState = g;
          f2.childLanes = a.childLanes & ~c;
          b.memoizedState = mj;
          return d;
        }
        f2 = a.child;
        a = f2.sibling;
        d = Pg(f2, { mode: "visible", children: d.children });
        0 === (b.mode & 1) && (d.lanes = c);
        d.return = b;
        d.sibling = null;
        null !== a && (c = b.deletions, null === c ? (b.deletions = [a], b.flags |= 16) : c.push(a));
        b.child = d;
        b.memoizedState = null;
        return d;
      }
      function qj(a, b) {
        b = pj({ mode: "visible", children: b }, a.mode, 0, null);
        b.return = a;
        return a.child = b;
      }
      function sj(a, b, c, d) {
        null !== d && Jg(d);
        Ug(b, a.child, null, c);
        a = qj(b, b.pendingProps.children);
        a.flags |= 2;
        b.memoizedState = null;
        return a;
      }
      function rj(a, b, c, d, e2, f2, g) {
        if (c) {
          if (b.flags & 256) return b.flags &= -257, d = Ki(Error(p(422))), sj(a, b, g, d);
          if (null !== b.memoizedState) return b.child = a.child, b.flags |= 128, null;
          f2 = d.fallback;
          e2 = b.mode;
          d = pj({ mode: "visible", children: d.children }, e2, 0, null);
          f2 = Tg(f2, e2, g, null);
          f2.flags |= 2;
          d.return = b;
          f2.return = b;
          d.sibling = f2;
          b.child = d;
          0 !== (b.mode & 1) && Ug(b, a.child, null, g);
          b.child.memoizedState = nj(g);
          b.memoizedState = mj;
          return f2;
        }
        if (0 === (b.mode & 1)) return sj(a, b, g, null);
        if ("$!" === e2.data) {
          d = e2.nextSibling && e2.nextSibling.dataset;
          if (d) var h = d.dgst;
          d = h;
          f2 = Error(p(419));
          d = Ki(f2, d, void 0);
          return sj(a, b, g, d);
        }
        h = 0 !== (g & a.childLanes);
        if (dh || h) {
          d = Q2;
          if (null !== d) {
            switch (g & -g) {
              case 4:
                e2 = 2;
                break;
              case 16:
                e2 = 8;
                break;
              case 64:
              case 128:
              case 256:
              case 512:
              case 1024:
              case 2048:
              case 4096:
              case 8192:
              case 16384:
              case 32768:
              case 65536:
              case 131072:
              case 262144:
              case 524288:
              case 1048576:
              case 2097152:
              case 4194304:
              case 8388608:
              case 16777216:
              case 33554432:
              case 67108864:
                e2 = 32;
                break;
              case 536870912:
                e2 = 268435456;
                break;
              default:
                e2 = 0;
            }
            e2 = 0 !== (e2 & (d.suspendedLanes | g)) ? 0 : e2;
            0 !== e2 && e2 !== f2.retryLane && (f2.retryLane = e2, ih(a, e2), gi(d, a, e2, -1));
          }
          tj();
          d = Ki(Error(p(421)));
          return sj(a, b, g, d);
        }
        if ("$?" === e2.data) return b.flags |= 128, b.child = a.child, b = uj.bind(null, a), e2._reactRetry = b, null;
        a = f2.treeContext;
        yg = Lf(e2.nextSibling);
        xg = b;
        I3 = true;
        zg = null;
        null !== a && (og[pg++] = rg, og[pg++] = sg, og[pg++] = qg, rg = a.id, sg = a.overflow, qg = b);
        b = qj(b, d.children);
        b.flags |= 4096;
        return b;
      }
      function vj(a, b, c) {
        a.lanes |= b;
        var d = a.alternate;
        null !== d && (d.lanes |= b);
        bh(a.return, b, c);
      }
      function wj(a, b, c, d, e2) {
        var f2 = a.memoizedState;
        null === f2 ? a.memoizedState = { isBackwards: b, rendering: null, renderingStartTime: 0, last: d, tail: c, tailMode: e2 } : (f2.isBackwards = b, f2.rendering = null, f2.renderingStartTime = 0, f2.last = d, f2.tail = c, f2.tailMode = e2);
      }
      function xj(a, b, c) {
        var d = b.pendingProps, e2 = d.revealOrder, f2 = d.tail;
        Xi(a, b, d.children, c);
        d = L.current;
        if (0 !== (d & 2)) d = d & 1 | 2, b.flags |= 128;
        else {
          if (null !== a && 0 !== (a.flags & 128)) a: for (a = b.child; null !== a; ) {
            if (13 === a.tag) null !== a.memoizedState && vj(a, c, b);
            else if (19 === a.tag) vj(a, c, b);
            else if (null !== a.child) {
              a.child.return = a;
              a = a.child;
              continue;
            }
            if (a === b) break a;
            for (; null === a.sibling; ) {
              if (null === a.return || a.return === b) break a;
              a = a.return;
            }
            a.sibling.return = a.return;
            a = a.sibling;
          }
          d &= 1;
        }
        G2(L, d);
        if (0 === (b.mode & 1)) b.memoizedState = null;
        else switch (e2) {
          case "forwards":
            c = b.child;
            for (e2 = null; null !== c; ) a = c.alternate, null !== a && null === Ch(a) && (e2 = c), c = c.sibling;
            c = e2;
            null === c ? (e2 = b.child, b.child = null) : (e2 = c.sibling, c.sibling = null);
            wj(b, false, e2, c, f2);
            break;
          case "backwards":
            c = null;
            e2 = b.child;
            for (b.child = null; null !== e2; ) {
              a = e2.alternate;
              if (null !== a && null === Ch(a)) {
                b.child = e2;
                break;
              }
              a = e2.sibling;
              e2.sibling = c;
              c = e2;
              e2 = a;
            }
            wj(b, true, c, null, f2);
            break;
          case "together":
            wj(b, false, null, null, void 0);
            break;
          default:
            b.memoizedState = null;
        }
        return b.child;
      }
      function ij(a, b) {
        0 === (b.mode & 1) && null !== a && (a.alternate = null, b.alternate = null, b.flags |= 2);
      }
      function Zi(a, b, c) {
        null !== a && (b.dependencies = a.dependencies);
        rh |= b.lanes;
        if (0 === (c & b.childLanes)) return null;
        if (null !== a && b.child !== a.child) throw Error(p(153));
        if (null !== b.child) {
          a = b.child;
          c = Pg(a, a.pendingProps);
          b.child = c;
          for (c.return = b; null !== a.sibling; ) a = a.sibling, c = c.sibling = Pg(a, a.pendingProps), c.return = b;
          c.sibling = null;
        }
        return b.child;
      }
      function yj(a, b, c) {
        switch (b.tag) {
          case 3:
            kj(b);
            Ig();
            break;
          case 5:
            Ah(b);
            break;
          case 1:
            Zf(b.type) && cg(b);
            break;
          case 4:
            yh(b, b.stateNode.containerInfo);
            break;
          case 10:
            var d = b.type._context, e2 = b.memoizedProps.value;
            G2(Wg, d._currentValue);
            d._currentValue = e2;
            break;
          case 13:
            d = b.memoizedState;
            if (null !== d) {
              if (null !== d.dehydrated) return G2(L, L.current & 1), b.flags |= 128, null;
              if (0 !== (c & b.child.childLanes)) return oj(a, b, c);
              G2(L, L.current & 1);
              a = Zi(a, b, c);
              return null !== a ? a.sibling : null;
            }
            G2(L, L.current & 1);
            break;
          case 19:
            d = 0 !== (c & b.childLanes);
            if (0 !== (a.flags & 128)) {
              if (d) return xj(a, b, c);
              b.flags |= 128;
            }
            e2 = b.memoizedState;
            null !== e2 && (e2.rendering = null, e2.tail = null, e2.lastEffect = null);
            G2(L, L.current);
            if (d) break;
            else return null;
          case 22:
          case 23:
            return b.lanes = 0, dj(a, b, c);
        }
        return Zi(a, b, c);
      }
      var zj;
      var Aj;
      var Bj;
      var Cj;
      zj = function(a, b) {
        for (var c = b.child; null !== c; ) {
          if (5 === c.tag || 6 === c.tag) a.appendChild(c.stateNode);
          else if (4 !== c.tag && null !== c.child) {
            c.child.return = c;
            c = c.child;
            continue;
          }
          if (c === b) break;
          for (; null === c.sibling; ) {
            if (null === c.return || c.return === b) return;
            c = c.return;
          }
          c.sibling.return = c.return;
          c = c.sibling;
        }
      };
      Aj = function() {
      };
      Bj = function(a, b, c, d) {
        var e2 = a.memoizedProps;
        if (e2 !== d) {
          a = b.stateNode;
          xh(uh.current);
          var f2 = null;
          switch (c) {
            case "input":
              e2 = Ya2(a, e2);
              d = Ya2(a, d);
              f2 = [];
              break;
            case "select":
              e2 = A3({}, e2, { value: void 0 });
              d = A3({}, d, { value: void 0 });
              f2 = [];
              break;
            case "textarea":
              e2 = gb(a, e2);
              d = gb(a, d);
              f2 = [];
              break;
            default:
              "function" !== typeof e2.onClick && "function" === typeof d.onClick && (a.onclick = Bf);
          }
          ub(c, d);
          var g;
          c = null;
          for (l2 in e2) if (!d.hasOwnProperty(l2) && e2.hasOwnProperty(l2) && null != e2[l2]) if ("style" === l2) {
            var h = e2[l2];
            for (g in h) h.hasOwnProperty(g) && (c || (c = {}), c[g] = "");
          } else "dangerouslySetInnerHTML" !== l2 && "children" !== l2 && "suppressContentEditableWarning" !== l2 && "suppressHydrationWarning" !== l2 && "autoFocus" !== l2 && (ea2.hasOwnProperty(l2) ? f2 || (f2 = []) : (f2 = f2 || []).push(l2, null));
          for (l2 in d) {
            var k2 = d[l2];
            h = null != e2 ? e2[l2] : void 0;
            if (d.hasOwnProperty(l2) && k2 !== h && (null != k2 || null != h)) if ("style" === l2) if (h) {
              for (g in h) !h.hasOwnProperty(g) || k2 && k2.hasOwnProperty(g) || (c || (c = {}), c[g] = "");
              for (g in k2) k2.hasOwnProperty(g) && h[g] !== k2[g] && (c || (c = {}), c[g] = k2[g]);
            } else c || (f2 || (f2 = []), f2.push(
              l2,
              c
            )), c = k2;
            else "dangerouslySetInnerHTML" === l2 ? (k2 = k2 ? k2.__html : void 0, h = h ? h.__html : void 0, null != k2 && h !== k2 && (f2 = f2 || []).push(l2, k2)) : "children" === l2 ? "string" !== typeof k2 && "number" !== typeof k2 || (f2 = f2 || []).push(l2, "" + k2) : "suppressContentEditableWarning" !== l2 && "suppressHydrationWarning" !== l2 && (ea2.hasOwnProperty(l2) ? (null != k2 && "onScroll" === l2 && D2("scroll", a), f2 || h === k2 || (f2 = [])) : (f2 = f2 || []).push(l2, k2));
          }
          c && (f2 = f2 || []).push("style", c);
          var l2 = f2;
          if (b.updateQueue = l2) b.flags |= 4;
        }
      };
      Cj = function(a, b, c, d) {
        c !== d && (b.flags |= 4);
      };
      function Dj(a, b) {
        if (!I3) switch (a.tailMode) {
          case "hidden":
            b = a.tail;
            for (var c = null; null !== b; ) null !== b.alternate && (c = b), b = b.sibling;
            null === c ? a.tail = null : c.sibling = null;
            break;
          case "collapsed":
            c = a.tail;
            for (var d = null; null !== c; ) null !== c.alternate && (d = c), c = c.sibling;
            null === d ? b || null === a.tail ? a.tail = null : a.tail.sibling = null : d.sibling = null;
        }
      }
      function S3(a) {
        var b = null !== a.alternate && a.alternate.child === a.child, c = 0, d = 0;
        if (b) for (var e2 = a.child; null !== e2; ) c |= e2.lanes | e2.childLanes, d |= e2.subtreeFlags & 14680064, d |= e2.flags & 14680064, e2.return = a, e2 = e2.sibling;
        else for (e2 = a.child; null !== e2; ) c |= e2.lanes | e2.childLanes, d |= e2.subtreeFlags, d |= e2.flags, e2.return = a, e2 = e2.sibling;
        a.subtreeFlags |= d;
        a.childLanes = c;
        return b;
      }
      function Ej(a, b, c) {
        var d = b.pendingProps;
        wg(b);
        switch (b.tag) {
          case 2:
          case 16:
          case 15:
          case 0:
          case 11:
          case 7:
          case 8:
          case 12:
          case 9:
          case 14:
            return S3(b), null;
          case 1:
            return Zf(b.type) && $f(), S3(b), null;
          case 3:
            d = b.stateNode;
            zh();
            E3(Wf);
            E3(H);
            Eh();
            d.pendingContext && (d.context = d.pendingContext, d.pendingContext = null);
            if (null === a || null === a.child) Gg(b) ? b.flags |= 4 : null === a || a.memoizedState.isDehydrated && 0 === (b.flags & 256) || (b.flags |= 1024, null !== zg && (Fj(zg), zg = null));
            Aj(a, b);
            S3(b);
            return null;
          case 5:
            Bh(b);
            var e2 = xh(wh.current);
            c = b.type;
            if (null !== a && null != b.stateNode) Bj(a, b, c, d, e2), a.ref !== b.ref && (b.flags |= 512, b.flags |= 2097152);
            else {
              if (!d) {
                if (null === b.stateNode) throw Error(p(166));
                S3(b);
                return null;
              }
              a = xh(uh.current);
              if (Gg(b)) {
                d = b.stateNode;
                c = b.type;
                var f2 = b.memoizedProps;
                d[Of] = b;
                d[Pf] = f2;
                a = 0 !== (b.mode & 1);
                switch (c) {
                  case "dialog":
                    D2("cancel", d);
                    D2("close", d);
                    break;
                  case "iframe":
                  case "object":
                  case "embed":
                    D2("load", d);
                    break;
                  case "video":
                  case "audio":
                    for (e2 = 0; e2 < lf.length; e2++) D2(lf[e2], d);
                    break;
                  case "source":
                    D2("error", d);
                    break;
                  case "img":
                  case "image":
                  case "link":
                    D2(
                      "error",
                      d
                    );
                    D2("load", d);
                    break;
                  case "details":
                    D2("toggle", d);
                    break;
                  case "input":
                    Za2(d, f2);
                    D2("invalid", d);
                    break;
                  case "select":
                    d._wrapperState = { wasMultiple: !!f2.multiple };
                    D2("invalid", d);
                    break;
                  case "textarea":
                    hb(d, f2), D2("invalid", d);
                }
                ub(c, f2);
                e2 = null;
                for (var g in f2) if (f2.hasOwnProperty(g)) {
                  var h = f2[g];
                  "children" === g ? "string" === typeof h ? d.textContent !== h && (true !== f2.suppressHydrationWarning && Af(d.textContent, h, a), e2 = ["children", h]) : "number" === typeof h && d.textContent !== "" + h && (true !== f2.suppressHydrationWarning && Af(
                    d.textContent,
                    h,
                    a
                  ), e2 = ["children", "" + h]) : ea2.hasOwnProperty(g) && null != h && "onScroll" === g && D2("scroll", d);
                }
                switch (c) {
                  case "input":
                    Va2(d);
                    db(d, f2, true);
                    break;
                  case "textarea":
                    Va2(d);
                    jb(d);
                    break;
                  case "select":
                  case "option":
                    break;
                  default:
                    "function" === typeof f2.onClick && (d.onclick = Bf);
                }
                d = e2;
                b.updateQueue = d;
                null !== d && (b.flags |= 4);
              } else {
                g = 9 === e2.nodeType ? e2 : e2.ownerDocument;
                "http://www.w3.org/1999/xhtml" === a && (a = kb(c));
                "http://www.w3.org/1999/xhtml" === a ? "script" === c ? (a = g.createElement("div"), a.innerHTML = "<script><\/script>", a = a.removeChild(a.firstChild)) : "string" === typeof d.is ? a = g.createElement(c, { is: d.is }) : (a = g.createElement(c), "select" === c && (g = a, d.multiple ? g.multiple = true : d.size && (g.size = d.size))) : a = g.createElementNS(a, c);
                a[Of] = b;
                a[Pf] = d;
                zj(a, b, false, false);
                b.stateNode = a;
                a: {
                  g = vb(c, d);
                  switch (c) {
                    case "dialog":
                      D2("cancel", a);
                      D2("close", a);
                      e2 = d;
                      break;
                    case "iframe":
                    case "object":
                    case "embed":
                      D2("load", a);
                      e2 = d;
                      break;
                    case "video":
                    case "audio":
                      for (e2 = 0; e2 < lf.length; e2++) D2(lf[e2], a);
                      e2 = d;
                      break;
                    case "source":
                      D2("error", a);
                      e2 = d;
                      break;
                    case "img":
                    case "image":
                    case "link":
                      D2(
                        "error",
                        a
                      );
                      D2("load", a);
                      e2 = d;
                      break;
                    case "details":
                      D2("toggle", a);
                      e2 = d;
                      break;
                    case "input":
                      Za2(a, d);
                      e2 = Ya2(a, d);
                      D2("invalid", a);
                      break;
                    case "option":
                      e2 = d;
                      break;
                    case "select":
                      a._wrapperState = { wasMultiple: !!d.multiple };
                      e2 = A3({}, d, { value: void 0 });
                      D2("invalid", a);
                      break;
                    case "textarea":
                      hb(a, d);
                      e2 = gb(a, d);
                      D2("invalid", a);
                      break;
                    default:
                      e2 = d;
                  }
                  ub(c, e2);
                  h = e2;
                  for (f2 in h) if (h.hasOwnProperty(f2)) {
                    var k2 = h[f2];
                    "style" === f2 ? sb(a, k2) : "dangerouslySetInnerHTML" === f2 ? (k2 = k2 ? k2.__html : void 0, null != k2 && nb(a, k2)) : "children" === f2 ? "string" === typeof k2 ? ("textarea" !== c || "" !== k2) && ob(a, k2) : "number" === typeof k2 && ob(a, "" + k2) : "suppressContentEditableWarning" !== f2 && "suppressHydrationWarning" !== f2 && "autoFocus" !== f2 && (ea2.hasOwnProperty(f2) ? null != k2 && "onScroll" === f2 && D2("scroll", a) : null != k2 && ta(a, f2, k2, g));
                  }
                  switch (c) {
                    case "input":
                      Va2(a);
                      db(a, d, false);
                      break;
                    case "textarea":
                      Va2(a);
                      jb(a);
                      break;
                    case "option":
                      null != d.value && a.setAttribute("value", "" + Sa(d.value));
                      break;
                    case "select":
                      a.multiple = !!d.multiple;
                      f2 = d.value;
                      null != f2 ? fb(a, !!d.multiple, f2, false) : null != d.defaultValue && fb(
                        a,
                        !!d.multiple,
                        d.defaultValue,
                        true
                      );
                      break;
                    default:
                      "function" === typeof e2.onClick && (a.onclick = Bf);
                  }
                  switch (c) {
                    case "button":
                    case "input":
                    case "select":
                    case "textarea":
                      d = !!d.autoFocus;
                      break a;
                    case "img":
                      d = true;
                      break a;
                    default:
                      d = false;
                  }
                }
                d && (b.flags |= 4);
              }
              null !== b.ref && (b.flags |= 512, b.flags |= 2097152);
            }
            S3(b);
            return null;
          case 6:
            if (a && null != b.stateNode) Cj(a, b, a.memoizedProps, d);
            else {
              if ("string" !== typeof d && null === b.stateNode) throw Error(p(166));
              c = xh(wh.current);
              xh(uh.current);
              if (Gg(b)) {
                d = b.stateNode;
                c = b.memoizedProps;
                d[Of] = b;
                if (f2 = d.nodeValue !== c) {
                  if (a = xg, null !== a) switch (a.tag) {
                    case 3:
                      Af(d.nodeValue, c, 0 !== (a.mode & 1));
                      break;
                    case 5:
                      true !== a.memoizedProps.suppressHydrationWarning && Af(d.nodeValue, c, 0 !== (a.mode & 1));
                  }
                }
                f2 && (b.flags |= 4);
              } else d = (9 === c.nodeType ? c : c.ownerDocument).createTextNode(d), d[Of] = b, b.stateNode = d;
            }
            S3(b);
            return null;
          case 13:
            E3(L);
            d = b.memoizedState;
            if (null === a || null !== a.memoizedState && null !== a.memoizedState.dehydrated) {
              if (I3 && null !== yg && 0 !== (b.mode & 1) && 0 === (b.flags & 128)) Hg(), Ig(), b.flags |= 98560, f2 = false;
              else if (f2 = Gg(b), null !== d && null !== d.dehydrated) {
                if (null === a) {
                  if (!f2) throw Error(p(318));
                  f2 = b.memoizedState;
                  f2 = null !== f2 ? f2.dehydrated : null;
                  if (!f2) throw Error(p(317));
                  f2[Of] = b;
                } else Ig(), 0 === (b.flags & 128) && (b.memoizedState = null), b.flags |= 4;
                S3(b);
                f2 = false;
              } else null !== zg && (Fj(zg), zg = null), f2 = true;
              if (!f2) return b.flags & 65536 ? b : null;
            }
            if (0 !== (b.flags & 128)) return b.lanes = c, b;
            d = null !== d;
            d !== (null !== a && null !== a.memoizedState) && d && (b.child.flags |= 8192, 0 !== (b.mode & 1) && (null === a || 0 !== (L.current & 1) ? 0 === T2 && (T2 = 3) : tj()));
            null !== b.updateQueue && (b.flags |= 4);
            S3(b);
            return null;
          case 4:
            return zh(), Aj(a, b), null === a && sf(b.stateNode.containerInfo), S3(b), null;
          case 10:
            return ah(b.type._context), S3(b), null;
          case 17:
            return Zf(b.type) && $f(), S3(b), null;
          case 19:
            E3(L);
            f2 = b.memoizedState;
            if (null === f2) return S3(b), null;
            d = 0 !== (b.flags & 128);
            g = f2.rendering;
            if (null === g) if (d) Dj(f2, false);
            else {
              if (0 !== T2 || null !== a && 0 !== (a.flags & 128)) for (a = b.child; null !== a; ) {
                g = Ch(a);
                if (null !== g) {
                  b.flags |= 128;
                  Dj(f2, false);
                  d = g.updateQueue;
                  null !== d && (b.updateQueue = d, b.flags |= 4);
                  b.subtreeFlags = 0;
                  d = c;
                  for (c = b.child; null !== c; ) f2 = c, a = d, f2.flags &= 14680066, g = f2.alternate, null === g ? (f2.childLanes = 0, f2.lanes = a, f2.child = null, f2.subtreeFlags = 0, f2.memoizedProps = null, f2.memoizedState = null, f2.updateQueue = null, f2.dependencies = null, f2.stateNode = null) : (f2.childLanes = g.childLanes, f2.lanes = g.lanes, f2.child = g.child, f2.subtreeFlags = 0, f2.deletions = null, f2.memoizedProps = g.memoizedProps, f2.memoizedState = g.memoizedState, f2.updateQueue = g.updateQueue, f2.type = g.type, a = g.dependencies, f2.dependencies = null === a ? null : { lanes: a.lanes, firstContext: a.firstContext }), c = c.sibling;
                  G2(L, L.current & 1 | 2);
                  return b.child;
                }
                a = a.sibling;
              }
              null !== f2.tail && B3() > Gj && (b.flags |= 128, d = true, Dj(f2, false), b.lanes = 4194304);
            }
            else {
              if (!d) if (a = Ch(g), null !== a) {
                if (b.flags |= 128, d = true, c = a.updateQueue, null !== c && (b.updateQueue = c, b.flags |= 4), Dj(f2, true), null === f2.tail && "hidden" === f2.tailMode && !g.alternate && !I3) return S3(b), null;
              } else 2 * B3() - f2.renderingStartTime > Gj && 1073741824 !== c && (b.flags |= 128, d = true, Dj(f2, false), b.lanes = 4194304);
              f2.isBackwards ? (g.sibling = b.child, b.child = g) : (c = f2.last, null !== c ? c.sibling = g : b.child = g, f2.last = g);
            }
            if (null !== f2.tail) return b = f2.tail, f2.rendering = b, f2.tail = b.sibling, f2.renderingStartTime = B3(), b.sibling = null, c = L.current, G2(L, d ? c & 1 | 2 : c & 1), b;
            S3(b);
            return null;
          case 22:
          case 23:
            return Hj(), d = null !== b.memoizedState, null !== a && null !== a.memoizedState !== d && (b.flags |= 8192), d && 0 !== (b.mode & 1) ? 0 !== (fj & 1073741824) && (S3(b), b.subtreeFlags & 6 && (b.flags |= 8192)) : S3(b), null;
          case 24:
            return null;
          case 25:
            return null;
        }
        throw Error(p(156, b.tag));
      }
      function Ij(a, b) {
        wg(b);
        switch (b.tag) {
          case 1:
            return Zf(b.type) && $f(), a = b.flags, a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
          case 3:
            return zh(), E3(Wf), E3(H), Eh(), a = b.flags, 0 !== (a & 65536) && 0 === (a & 128) ? (b.flags = a & -65537 | 128, b) : null;
          case 5:
            return Bh(b), null;
          case 13:
            E3(L);
            a = b.memoizedState;
            if (null !== a && null !== a.dehydrated) {
              if (null === b.alternate) throw Error(p(340));
              Ig();
            }
            a = b.flags;
            return a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
          case 19:
            return E3(L), null;
          case 4:
            return zh(), null;
          case 10:
            return ah(b.type._context), null;
          case 22:
          case 23:
            return Hj(), null;
          case 24:
            return null;
          default:
            return null;
        }
      }
      var Jj = false;
      var U2 = false;
      var Kj = "function" === typeof WeakSet ? WeakSet : Set;
      var V = null;
      function Lj(a, b) {
        var c = a.ref;
        if (null !== c) if ("function" === typeof c) try {
          c(null);
        } catch (d) {
          W(a, b, d);
        }
        else c.current = null;
      }
      function Mj(a, b, c) {
        try {
          c();
        } catch (d) {
          W(a, b, d);
        }
      }
      var Nj = false;
      function Oj(a, b) {
        Cf = dd2;
        a = Me3();
        if (Ne3(a)) {
          if ("selectionStart" in a) var c = { start: a.selectionStart, end: a.selectionEnd };
          else a: {
            c = (c = a.ownerDocument) && c.defaultView || window;
            var d = c.getSelection && c.getSelection();
            if (d && 0 !== d.rangeCount) {
              c = d.anchorNode;
              var e2 = d.anchorOffset, f2 = d.focusNode;
              d = d.focusOffset;
              try {
                c.nodeType, f2.nodeType;
              } catch (F2) {
                c = null;
                break a;
              }
              var g = 0, h = -1, k2 = -1, l2 = 0, m = 0, q2 = a, r = null;
              b: for (; ; ) {
                for (var y2; ; ) {
                  q2 !== c || 0 !== e2 && 3 !== q2.nodeType || (h = g + e2);
                  q2 !== f2 || 0 !== d && 3 !== q2.nodeType || (k2 = g + d);
                  3 === q2.nodeType && (g += q2.nodeValue.length);
                  if (null === (y2 = q2.firstChild)) break;
                  r = q2;
                  q2 = y2;
                }
                for (; ; ) {
                  if (q2 === a) break b;
                  r === c && ++l2 === e2 && (h = g);
                  r === f2 && ++m === d && (k2 = g);
                  if (null !== (y2 = q2.nextSibling)) break;
                  q2 = r;
                  r = q2.parentNode;
                }
                q2 = y2;
              }
              c = -1 === h || -1 === k2 ? null : { start: h, end: k2 };
            } else c = null;
          }
          c = c || { start: 0, end: 0 };
        } else c = null;
        Df = { focusedElem: a, selectionRange: c };
        dd2 = false;
        for (V = b; null !== V; ) if (b = V, a = b.child, 0 !== (b.subtreeFlags & 1028) && null !== a) a.return = b, V = a;
        else for (; null !== V; ) {
          b = V;
          try {
            var n = b.alternate;
            if (0 !== (b.flags & 1024)) switch (b.tag) {
              case 0:
              case 11:
              case 15:
                break;
              case 1:
                if (null !== n) {
                  var t = n.memoizedProps, J2 = n.memoizedState, x = b.stateNode, w = x.getSnapshotBeforeUpdate(b.elementType === b.type ? t : Ci(b.type, t), J2);
                  x.__reactInternalSnapshotBeforeUpdate = w;
                }
                break;
              case 3:
                var u = b.stateNode.containerInfo;
                1 === u.nodeType ? u.textContent = "" : 9 === u.nodeType && u.documentElement && u.removeChild(u.documentElement);
                break;
              case 5:
              case 6:
              case 4:
              case 17:
                break;
              default:
                throw Error(p(163));
            }
          } catch (F2) {
            W(b, b.return, F2);
          }
          a = b.sibling;
          if (null !== a) {
            a.return = b.return;
            V = a;
            break;
          }
          V = b.return;
        }
        n = Nj;
        Nj = false;
        return n;
      }
      function Pj(a, b, c) {
        var d = b.updateQueue;
        d = null !== d ? d.lastEffect : null;
        if (null !== d) {
          var e2 = d = d.next;
          do {
            if ((e2.tag & a) === a) {
              var f2 = e2.destroy;
              e2.destroy = void 0;
              void 0 !== f2 && Mj(b, c, f2);
            }
            e2 = e2.next;
          } while (e2 !== d);
        }
      }
      function Qj(a, b) {
        b = b.updateQueue;
        b = null !== b ? b.lastEffect : null;
        if (null !== b) {
          var c = b = b.next;
          do {
            if ((c.tag & a) === a) {
              var d = c.create;
              c.destroy = d();
            }
            c = c.next;
          } while (c !== b);
        }
      }
      function Rj(a) {
        var b = a.ref;
        if (null !== b) {
          var c = a.stateNode;
          switch (a.tag) {
            case 5:
              a = c;
              break;
            default:
              a = c;
          }
          "function" === typeof b ? b(a) : b.current = a;
        }
      }
      function Sj(a) {
        var b = a.alternate;
        null !== b && (a.alternate = null, Sj(b));
        a.child = null;
        a.deletions = null;
        a.sibling = null;
        5 === a.tag && (b = a.stateNode, null !== b && (delete b[Of], delete b[Pf], delete b[of], delete b[Qf], delete b[Rf]));
        a.stateNode = null;
        a.return = null;
        a.dependencies = null;
        a.memoizedProps = null;
        a.memoizedState = null;
        a.pendingProps = null;
        a.stateNode = null;
        a.updateQueue = null;
      }
      function Tj(a) {
        return 5 === a.tag || 3 === a.tag || 4 === a.tag;
      }
      function Uj(a) {
        a: for (; ; ) {
          for (; null === a.sibling; ) {
            if (null === a.return || Tj(a.return)) return null;
            a = a.return;
          }
          a.sibling.return = a.return;
          for (a = a.sibling; 5 !== a.tag && 6 !== a.tag && 18 !== a.tag; ) {
            if (a.flags & 2) continue a;
            if (null === a.child || 4 === a.tag) continue a;
            else a.child.return = a, a = a.child;
          }
          if (!(a.flags & 2)) return a.stateNode;
        }
      }
      function Vj(a, b, c) {
        var d = a.tag;
        if (5 === d || 6 === d) a = a.stateNode, b ? 8 === c.nodeType ? c.parentNode.insertBefore(a, b) : c.insertBefore(a, b) : (8 === c.nodeType ? (b = c.parentNode, b.insertBefore(a, c)) : (b = c, b.appendChild(a)), c = c._reactRootContainer, null !== c && void 0 !== c || null !== b.onclick || (b.onclick = Bf));
        else if (4 !== d && (a = a.child, null !== a)) for (Vj(a, b, c), a = a.sibling; null !== a; ) Vj(a, b, c), a = a.sibling;
      }
      function Wj(a, b, c) {
        var d = a.tag;
        if (5 === d || 6 === d) a = a.stateNode, b ? c.insertBefore(a, b) : c.appendChild(a);
        else if (4 !== d && (a = a.child, null !== a)) for (Wj(a, b, c), a = a.sibling; null !== a; ) Wj(a, b, c), a = a.sibling;
      }
      var X2 = null;
      var Xj = false;
      function Yj(a, b, c) {
        for (c = c.child; null !== c; ) Zj(a, b, c), c = c.sibling;
      }
      function Zj(a, b, c) {
        if (lc && "function" === typeof lc.onCommitFiberUnmount) try {
          lc.onCommitFiberUnmount(kc, c);
        } catch (h) {
        }
        switch (c.tag) {
          case 5:
            U2 || Lj(c, b);
          case 6:
            var d = X2, e2 = Xj;
            X2 = null;
            Yj(a, b, c);
            X2 = d;
            Xj = e2;
            null !== X2 && (Xj ? (a = X2, c = c.stateNode, 8 === a.nodeType ? a.parentNode.removeChild(c) : a.removeChild(c)) : X2.removeChild(c.stateNode));
            break;
          case 18:
            null !== X2 && (Xj ? (a = X2, c = c.stateNode, 8 === a.nodeType ? Kf(a.parentNode, c) : 1 === a.nodeType && Kf(a, c), bd(a)) : Kf(X2, c.stateNode));
            break;
          case 4:
            d = X2;
            e2 = Xj;
            X2 = c.stateNode.containerInfo;
            Xj = true;
            Yj(a, b, c);
            X2 = d;
            Xj = e2;
            break;
          case 0:
          case 11:
          case 14:
          case 15:
            if (!U2 && (d = c.updateQueue, null !== d && (d = d.lastEffect, null !== d))) {
              e2 = d = d.next;
              do {
                var f2 = e2, g = f2.destroy;
                f2 = f2.tag;
                void 0 !== g && (0 !== (f2 & 2) ? Mj(c, b, g) : 0 !== (f2 & 4) && Mj(c, b, g));
                e2 = e2.next;
              } while (e2 !== d);
            }
            Yj(a, b, c);
            break;
          case 1:
            if (!U2 && (Lj(c, b), d = c.stateNode, "function" === typeof d.componentWillUnmount)) try {
              d.props = c.memoizedProps, d.state = c.memoizedState, d.componentWillUnmount();
            } catch (h) {
              W(c, b, h);
            }
            Yj(a, b, c);
            break;
          case 21:
            Yj(a, b, c);
            break;
          case 22:
            c.mode & 1 ? (U2 = (d = U2) || null !== c.memoizedState, Yj(a, b, c), U2 = d) : Yj(a, b, c);
            break;
          default:
            Yj(a, b, c);
        }
      }
      function ak(a) {
        var b = a.updateQueue;
        if (null !== b) {
          a.updateQueue = null;
          var c = a.stateNode;
          null === c && (c = a.stateNode = new Kj());
          b.forEach(function(b2) {
            var d = bk.bind(null, a, b2);
            c.has(b2) || (c.add(b2), b2.then(d, d));
          });
        }
      }
      function ck(a, b) {
        var c = b.deletions;
        if (null !== c) for (var d = 0; d < c.length; d++) {
          var e2 = c[d];
          try {
            var f2 = a, g = b, h = g;
            a: for (; null !== h; ) {
              switch (h.tag) {
                case 5:
                  X2 = h.stateNode;
                  Xj = false;
                  break a;
                case 3:
                  X2 = h.stateNode.containerInfo;
                  Xj = true;
                  break a;
                case 4:
                  X2 = h.stateNode.containerInfo;
                  Xj = true;
                  break a;
              }
              h = h.return;
            }
            if (null === X2) throw Error(p(160));
            Zj(f2, g, e2);
            X2 = null;
            Xj = false;
            var k2 = e2.alternate;
            null !== k2 && (k2.return = null);
            e2.return = null;
          } catch (l2) {
            W(e2, b, l2);
          }
        }
        if (b.subtreeFlags & 12854) for (b = b.child; null !== b; ) dk(b, a), b = b.sibling;
      }
      function dk(a, b) {
        var c = a.alternate, d = a.flags;
        switch (a.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            ck(b, a);
            ek(a);
            if (d & 4) {
              try {
                Pj(3, a, a.return), Qj(3, a);
              } catch (t) {
                W(a, a.return, t);
              }
              try {
                Pj(5, a, a.return);
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 1:
            ck(b, a);
            ek(a);
            d & 512 && null !== c && Lj(c, c.return);
            break;
          case 5:
            ck(b, a);
            ek(a);
            d & 512 && null !== c && Lj(c, c.return);
            if (a.flags & 32) {
              var e2 = a.stateNode;
              try {
                ob(e2, "");
              } catch (t) {
                W(a, a.return, t);
              }
            }
            if (d & 4 && (e2 = a.stateNode, null != e2)) {
              var f2 = a.memoizedProps, g = null !== c ? c.memoizedProps : f2, h = a.type, k2 = a.updateQueue;
              a.updateQueue = null;
              if (null !== k2) try {
                "input" === h && "radio" === f2.type && null != f2.name && ab(e2, f2);
                vb(h, g);
                var l2 = vb(h, f2);
                for (g = 0; g < k2.length; g += 2) {
                  var m = k2[g], q2 = k2[g + 1];
                  "style" === m ? sb(e2, q2) : "dangerouslySetInnerHTML" === m ? nb(e2, q2) : "children" === m ? ob(e2, q2) : ta(e2, m, q2, l2);
                }
                switch (h) {
                  case "input":
                    bb(e2, f2);
                    break;
                  case "textarea":
                    ib(e2, f2);
                    break;
                  case "select":
                    var r = e2._wrapperState.wasMultiple;
                    e2._wrapperState.wasMultiple = !!f2.multiple;
                    var y2 = f2.value;
                    null != y2 ? fb(e2, !!f2.multiple, y2, false) : r !== !!f2.multiple && (null != f2.defaultValue ? fb(
                      e2,
                      !!f2.multiple,
                      f2.defaultValue,
                      true
                    ) : fb(e2, !!f2.multiple, f2.multiple ? [] : "", false));
                }
                e2[Pf] = f2;
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 6:
            ck(b, a);
            ek(a);
            if (d & 4) {
              if (null === a.stateNode) throw Error(p(162));
              e2 = a.stateNode;
              f2 = a.memoizedProps;
              try {
                e2.nodeValue = f2;
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 3:
            ck(b, a);
            ek(a);
            if (d & 4 && null !== c && c.memoizedState.isDehydrated) try {
              bd(b.containerInfo);
            } catch (t) {
              W(a, a.return, t);
            }
            break;
          case 4:
            ck(b, a);
            ek(a);
            break;
          case 13:
            ck(b, a);
            ek(a);
            e2 = a.child;
            e2.flags & 8192 && (f2 = null !== e2.memoizedState, e2.stateNode.isHidden = f2, !f2 || null !== e2.alternate && null !== e2.alternate.memoizedState || (fk = B3()));
            d & 4 && ak(a);
            break;
          case 22:
            m = null !== c && null !== c.memoizedState;
            a.mode & 1 ? (U2 = (l2 = U2) || m, ck(b, a), U2 = l2) : ck(b, a);
            ek(a);
            if (d & 8192) {
              l2 = null !== a.memoizedState;
              if ((a.stateNode.isHidden = l2) && !m && 0 !== (a.mode & 1)) for (V = a, m = a.child; null !== m; ) {
                for (q2 = V = m; null !== V; ) {
                  r = V;
                  y2 = r.child;
                  switch (r.tag) {
                    case 0:
                    case 11:
                    case 14:
                    case 15:
                      Pj(4, r, r.return);
                      break;
                    case 1:
                      Lj(r, r.return);
                      var n = r.stateNode;
                      if ("function" === typeof n.componentWillUnmount) {
                        d = r;
                        c = r.return;
                        try {
                          b = d, n.props = b.memoizedProps, n.state = b.memoizedState, n.componentWillUnmount();
                        } catch (t) {
                          W(d, c, t);
                        }
                      }
                      break;
                    case 5:
                      Lj(r, r.return);
                      break;
                    case 22:
                      if (null !== r.memoizedState) {
                        gk(q2);
                        continue;
                      }
                  }
                  null !== y2 ? (y2.return = r, V = y2) : gk(q2);
                }
                m = m.sibling;
              }
              a: for (m = null, q2 = a; ; ) {
                if (5 === q2.tag) {
                  if (null === m) {
                    m = q2;
                    try {
                      e2 = q2.stateNode, l2 ? (f2 = e2.style, "function" === typeof f2.setProperty ? f2.setProperty("display", "none", "important") : f2.display = "none") : (h = q2.stateNode, k2 = q2.memoizedProps.style, g = void 0 !== k2 && null !== k2 && k2.hasOwnProperty("display") ? k2.display : null, h.style.display = rb("display", g));
                    } catch (t) {
                      W(a, a.return, t);
                    }
                  }
                } else if (6 === q2.tag) {
                  if (null === m) try {
                    q2.stateNode.nodeValue = l2 ? "" : q2.memoizedProps;
                  } catch (t) {
                    W(a, a.return, t);
                  }
                } else if ((22 !== q2.tag && 23 !== q2.tag || null === q2.memoizedState || q2 === a) && null !== q2.child) {
                  q2.child.return = q2;
                  q2 = q2.child;
                  continue;
                }
                if (q2 === a) break a;
                for (; null === q2.sibling; ) {
                  if (null === q2.return || q2.return === a) break a;
                  m === q2 && (m = null);
                  q2 = q2.return;
                }
                m === q2 && (m = null);
                q2.sibling.return = q2.return;
                q2 = q2.sibling;
              }
            }
            break;
          case 19:
            ck(b, a);
            ek(a);
            d & 4 && ak(a);
            break;
          case 21:
            break;
          default:
            ck(
              b,
              a
            ), ek(a);
        }
      }
      function ek(a) {
        var b = a.flags;
        if (b & 2) {
          try {
            a: {
              for (var c = a.return; null !== c; ) {
                if (Tj(c)) {
                  var d = c;
                  break a;
                }
                c = c.return;
              }
              throw Error(p(160));
            }
            switch (d.tag) {
              case 5:
                var e2 = d.stateNode;
                d.flags & 32 && (ob(e2, ""), d.flags &= -33);
                var f2 = Uj(a);
                Wj(a, f2, e2);
                break;
              case 3:
              case 4:
                var g = d.stateNode.containerInfo, h = Uj(a);
                Vj(a, h, g);
                break;
              default:
                throw Error(p(161));
            }
          } catch (k2) {
            W(a, a.return, k2);
          }
          a.flags &= -3;
        }
        b & 4096 && (a.flags &= -4097);
      }
      function hk(a, b, c) {
        V = a;
        ik(a, b, c);
      }
      function ik(a, b, c) {
        for (var d = 0 !== (a.mode & 1); null !== V; ) {
          var e2 = V, f2 = e2.child;
          if (22 === e2.tag && d) {
            var g = null !== e2.memoizedState || Jj;
            if (!g) {
              var h = e2.alternate, k2 = null !== h && null !== h.memoizedState || U2;
              h = Jj;
              var l2 = U2;
              Jj = g;
              if ((U2 = k2) && !l2) for (V = e2; null !== V; ) g = V, k2 = g.child, 22 === g.tag && null !== g.memoizedState ? jk(e2) : null !== k2 ? (k2.return = g, V = k2) : jk(e2);
              for (; null !== f2; ) V = f2, ik(f2, b, c), f2 = f2.sibling;
              V = e2;
              Jj = h;
              U2 = l2;
            }
            kk(a, b, c);
          } else 0 !== (e2.subtreeFlags & 8772) && null !== f2 ? (f2.return = e2, V = f2) : kk(a, b, c);
        }
      }
      function kk(a) {
        for (; null !== V; ) {
          var b = V;
          if (0 !== (b.flags & 8772)) {
            var c = b.alternate;
            try {
              if (0 !== (b.flags & 8772)) switch (b.tag) {
                case 0:
                case 11:
                case 15:
                  U2 || Qj(5, b);
                  break;
                case 1:
                  var d = b.stateNode;
                  if (b.flags & 4 && !U2) if (null === c) d.componentDidMount();
                  else {
                    var e2 = b.elementType === b.type ? c.memoizedProps : Ci(b.type, c.memoizedProps);
                    d.componentDidUpdate(e2, c.memoizedState, d.__reactInternalSnapshotBeforeUpdate);
                  }
                  var f2 = b.updateQueue;
                  null !== f2 && sh(b, f2, d);
                  break;
                case 3:
                  var g = b.updateQueue;
                  if (null !== g) {
                    c = null;
                    if (null !== b.child) switch (b.child.tag) {
                      case 5:
                        c = b.child.stateNode;
                        break;
                      case 1:
                        c = b.child.stateNode;
                    }
                    sh(b, g, c);
                  }
                  break;
                case 5:
                  var h = b.stateNode;
                  if (null === c && b.flags & 4) {
                    c = h;
                    var k2 = b.memoizedProps;
                    switch (b.type) {
                      case "button":
                      case "input":
                      case "select":
                      case "textarea":
                        k2.autoFocus && c.focus();
                        break;
                      case "img":
                        k2.src && (c.src = k2.src);
                    }
                  }
                  break;
                case 6:
                  break;
                case 4:
                  break;
                case 12:
                  break;
                case 13:
                  if (null === b.memoizedState) {
                    var l2 = b.alternate;
                    if (null !== l2) {
                      var m = l2.memoizedState;
                      if (null !== m) {
                        var q2 = m.dehydrated;
                        null !== q2 && bd(q2);
                      }
                    }
                  }
                  break;
                case 19:
                case 17:
                case 21:
                case 22:
                case 23:
                case 25:
                  break;
                default:
                  throw Error(p(163));
              }
              U2 || b.flags & 512 && Rj(b);
            } catch (r) {
              W(b, b.return, r);
            }
          }
          if (b === a) {
            V = null;
            break;
          }
          c = b.sibling;
          if (null !== c) {
            c.return = b.return;
            V = c;
            break;
          }
          V = b.return;
        }
      }
      function gk(a) {
        for (; null !== V; ) {
          var b = V;
          if (b === a) {
            V = null;
            break;
          }
          var c = b.sibling;
          if (null !== c) {
            c.return = b.return;
            V = c;
            break;
          }
          V = b.return;
        }
      }
      function jk(a) {
        for (; null !== V; ) {
          var b = V;
          try {
            switch (b.tag) {
              case 0:
              case 11:
              case 15:
                var c = b.return;
                try {
                  Qj(4, b);
                } catch (k2) {
                  W(b, c, k2);
                }
                break;
              case 1:
                var d = b.stateNode;
                if ("function" === typeof d.componentDidMount) {
                  var e2 = b.return;
                  try {
                    d.componentDidMount();
                  } catch (k2) {
                    W(b, e2, k2);
                  }
                }
                var f2 = b.return;
                try {
                  Rj(b);
                } catch (k2) {
                  W(b, f2, k2);
                }
                break;
              case 5:
                var g = b.return;
                try {
                  Rj(b);
                } catch (k2) {
                  W(b, g, k2);
                }
            }
          } catch (k2) {
            W(b, b.return, k2);
          }
          if (b === a) {
            V = null;
            break;
          }
          var h = b.sibling;
          if (null !== h) {
            h.return = b.return;
            V = h;
            break;
          }
          V = b.return;
        }
      }
      var lk = Math.ceil;
      var mk = ua2.ReactCurrentDispatcher;
      var nk = ua2.ReactCurrentOwner;
      var ok = ua2.ReactCurrentBatchConfig;
      var K2 = 0;
      var Q2 = null;
      var Y2 = null;
      var Z2 = 0;
      var fj = 0;
      var ej = Uf(0);
      var T2 = 0;
      var pk = null;
      var rh = 0;
      var qk = 0;
      var rk = 0;
      var sk = null;
      var tk = null;
      var fk = 0;
      var Gj = Infinity;
      var uk = null;
      var Oi = false;
      var Pi = null;
      var Ri = null;
      var vk = false;
      var wk = null;
      var xk = 0;
      var yk = 0;
      var zk = null;
      var Ak = -1;
      var Bk = 0;
      function R3() {
        return 0 !== (K2 & 6) ? B3() : -1 !== Ak ? Ak : Ak = B3();
      }
      function yi(a) {
        if (0 === (a.mode & 1)) return 1;
        if (0 !== (K2 & 2) && 0 !== Z2) return Z2 & -Z2;
        if (null !== Kg.transition) return 0 === Bk && (Bk = yc()), Bk;
        a = C;
        if (0 !== a) return a;
        a = window.event;
        a = void 0 === a ? 16 : jd(a.type);
        return a;
      }
      function gi(a, b, c, d) {
        if (50 < yk) throw yk = 0, zk = null, Error(p(185));
        Ac(a, c, d);
        if (0 === (K2 & 2) || a !== Q2) a === Q2 && (0 === (K2 & 2) && (qk |= c), 4 === T2 && Ck(a, Z2)), Dk(a, d), 1 === c && 0 === K2 && 0 === (b.mode & 1) && (Gj = B3() + 500, fg && jg());
      }
      function Dk(a, b) {
        var c = a.callbackNode;
        wc(a, b);
        var d = uc(a, a === Q2 ? Z2 : 0);
        if (0 === d) null !== c && bc(c), a.callbackNode = null, a.callbackPriority = 0;
        else if (b = d & -d, a.callbackPriority !== b) {
          null != c && bc(c);
          if (1 === b) 0 === a.tag ? ig(Ek.bind(null, a)) : hg(Ek.bind(null, a)), Jf(function() {
            0 === (K2 & 6) && jg();
          }), c = null;
          else {
            switch (Dc(d)) {
              case 1:
                c = fc;
                break;
              case 4:
                c = gc;
                break;
              case 16:
                c = hc;
                break;
              case 536870912:
                c = jc;
                break;
              default:
                c = hc;
            }
            c = Fk(c, Gk.bind(null, a));
          }
          a.callbackPriority = b;
          a.callbackNode = c;
        }
      }
      function Gk(a, b) {
        Ak = -1;
        Bk = 0;
        if (0 !== (K2 & 6)) throw Error(p(327));
        var c = a.callbackNode;
        if (Hk() && a.callbackNode !== c) return null;
        var d = uc(a, a === Q2 ? Z2 : 0);
        if (0 === d) return null;
        if (0 !== (d & 30) || 0 !== (d & a.expiredLanes) || b) b = Ik(a, d);
        else {
          b = d;
          var e2 = K2;
          K2 |= 2;
          var f2 = Jk();
          if (Q2 !== a || Z2 !== b) uk = null, Gj = B3() + 500, Kk(a, b);
          do
            try {
              Lk();
              break;
            } catch (h) {
              Mk(a, h);
            }
          while (1);
          $g();
          mk.current = f2;
          K2 = e2;
          null !== Y2 ? b = 0 : (Q2 = null, Z2 = 0, b = T2);
        }
        if (0 !== b) {
          2 === b && (e2 = xc(a), 0 !== e2 && (d = e2, b = Nk(a, e2)));
          if (1 === b) throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B3()), c;
          if (6 === b) Ck(a, d);
          else {
            e2 = a.current.alternate;
            if (0 === (d & 30) && !Ok(e2) && (b = Ik(a, d), 2 === b && (f2 = xc(a), 0 !== f2 && (d = f2, b = Nk(a, f2))), 1 === b)) throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B3()), c;
            a.finishedWork = e2;
            a.finishedLanes = d;
            switch (b) {
              case 0:
              case 1:
                throw Error(p(345));
              case 2:
                Pk(a, tk, uk);
                break;
              case 3:
                Ck(a, d);
                if ((d & 130023424) === d && (b = fk + 500 - B3(), 10 < b)) {
                  if (0 !== uc(a, 0)) break;
                  e2 = a.suspendedLanes;
                  if ((e2 & d) !== d) {
                    R3();
                    a.pingedLanes |= a.suspendedLanes & e2;
                    break;
                  }
                  a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), b);
                  break;
                }
                Pk(a, tk, uk);
                break;
              case 4:
                Ck(a, d);
                if ((d & 4194240) === d) break;
                b = a.eventTimes;
                for (e2 = -1; 0 < d; ) {
                  var g = 31 - oc(d);
                  f2 = 1 << g;
                  g = b[g];
                  g > e2 && (e2 = g);
                  d &= ~f2;
                }
                d = e2;
                d = B3() - d;
                d = (120 > d ? 120 : 480 > d ? 480 : 1080 > d ? 1080 : 1920 > d ? 1920 : 3e3 > d ? 3e3 : 4320 > d ? 4320 : 1960 * lk(d / 1960)) - d;
                if (10 < d) {
                  a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), d);
                  break;
                }
                Pk(a, tk, uk);
                break;
              case 5:
                Pk(a, tk, uk);
                break;
              default:
                throw Error(p(329));
            }
          }
        }
        Dk(a, B3());
        return a.callbackNode === c ? Gk.bind(null, a) : null;
      }
      function Nk(a, b) {
        var c = sk;
        a.current.memoizedState.isDehydrated && (Kk(a, b).flags |= 256);
        a = Ik(a, b);
        2 !== a && (b = tk, tk = c, null !== b && Fj(b));
        return a;
      }
      function Fj(a) {
        null === tk ? tk = a : tk.push.apply(tk, a);
      }
      function Ok(a) {
        for (var b = a; ; ) {
          if (b.flags & 16384) {
            var c = b.updateQueue;
            if (null !== c && (c = c.stores, null !== c)) for (var d = 0; d < c.length; d++) {
              var e2 = c[d], f2 = e2.getSnapshot;
              e2 = e2.value;
              try {
                if (!He3(f2(), e2)) return false;
              } catch (g) {
                return false;
              }
            }
          }
          c = b.child;
          if (b.subtreeFlags & 16384 && null !== c) c.return = b, b = c;
          else {
            if (b === a) break;
            for (; null === b.sibling; ) {
              if (null === b.return || b.return === a) return true;
              b = b.return;
            }
            b.sibling.return = b.return;
            b = b.sibling;
          }
        }
        return true;
      }
      function Ck(a, b) {
        b &= ~rk;
        b &= ~qk;
        a.suspendedLanes |= b;
        a.pingedLanes &= ~b;
        for (a = a.expirationTimes; 0 < b; ) {
          var c = 31 - oc(b), d = 1 << c;
          a[c] = -1;
          b &= ~d;
        }
      }
      function Ek(a) {
        if (0 !== (K2 & 6)) throw Error(p(327));
        Hk();
        var b = uc(a, 0);
        if (0 === (b & 1)) return Dk(a, B3()), null;
        var c = Ik(a, b);
        if (0 !== a.tag && 2 === c) {
          var d = xc(a);
          0 !== d && (b = d, c = Nk(a, d));
        }
        if (1 === c) throw c = pk, Kk(a, 0), Ck(a, b), Dk(a, B3()), c;
        if (6 === c) throw Error(p(345));
        a.finishedWork = a.current.alternate;
        a.finishedLanes = b;
        Pk(a, tk, uk);
        Dk(a, B3());
        return null;
      }
      function Qk(a, b) {
        var c = K2;
        K2 |= 1;
        try {
          return a(b);
        } finally {
          K2 = c, 0 === K2 && (Gj = B3() + 500, fg && jg());
        }
      }
      function Rk(a) {
        null !== wk && 0 === wk.tag && 0 === (K2 & 6) && Hk();
        var b = K2;
        K2 |= 1;
        var c = ok.transition, d = C;
        try {
          if (ok.transition = null, C = 1, a) return a();
        } finally {
          C = d, ok.transition = c, K2 = b, 0 === (K2 & 6) && jg();
        }
      }
      function Hj() {
        fj = ej.current;
        E3(ej);
      }
      function Kk(a, b) {
        a.finishedWork = null;
        a.finishedLanes = 0;
        var c = a.timeoutHandle;
        -1 !== c && (a.timeoutHandle = -1, Gf(c));
        if (null !== Y2) for (c = Y2.return; null !== c; ) {
          var d = c;
          wg(d);
          switch (d.tag) {
            case 1:
              d = d.type.childContextTypes;
              null !== d && void 0 !== d && $f();
              break;
            case 3:
              zh();
              E3(Wf);
              E3(H);
              Eh();
              break;
            case 5:
              Bh(d);
              break;
            case 4:
              zh();
              break;
            case 13:
              E3(L);
              break;
            case 19:
              E3(L);
              break;
            case 10:
              ah(d.type._context);
              break;
            case 22:
            case 23:
              Hj();
          }
          c = c.return;
        }
        Q2 = a;
        Y2 = a = Pg(a.current, null);
        Z2 = fj = b;
        T2 = 0;
        pk = null;
        rk = qk = rh = 0;
        tk = sk = null;
        if (null !== fh) {
          for (b = 0; b < fh.length; b++) if (c = fh[b], d = c.interleaved, null !== d) {
            c.interleaved = null;
            var e2 = d.next, f2 = c.pending;
            if (null !== f2) {
              var g = f2.next;
              f2.next = e2;
              d.next = g;
            }
            c.pending = d;
          }
          fh = null;
        }
        return a;
      }
      function Mk(a, b) {
        do {
          var c = Y2;
          try {
            $g();
            Fh.current = Rh;
            if (Ih) {
              for (var d = M2.memoizedState; null !== d; ) {
                var e2 = d.queue;
                null !== e2 && (e2.pending = null);
                d = d.next;
              }
              Ih = false;
            }
            Hh = 0;
            O3 = N2 = M2 = null;
            Jh = false;
            Kh = 0;
            nk.current = null;
            if (null === c || null === c.return) {
              T2 = 1;
              pk = b;
              Y2 = null;
              break;
            }
            a: {
              var f2 = a, g = c.return, h = c, k2 = b;
              b = Z2;
              h.flags |= 32768;
              if (null !== k2 && "object" === typeof k2 && "function" === typeof k2.then) {
                var l2 = k2, m = h, q2 = m.tag;
                if (0 === (m.mode & 1) && (0 === q2 || 11 === q2 || 15 === q2)) {
                  var r = m.alternate;
                  r ? (m.updateQueue = r.updateQueue, m.memoizedState = r.memoizedState, m.lanes = r.lanes) : (m.updateQueue = null, m.memoizedState = null);
                }
                var y2 = Ui(g);
                if (null !== y2) {
                  y2.flags &= -257;
                  Vi(y2, g, h, f2, b);
                  y2.mode & 1 && Si(f2, l2, b);
                  b = y2;
                  k2 = l2;
                  var n = b.updateQueue;
                  if (null === n) {
                    var t = /* @__PURE__ */ new Set();
                    t.add(k2);
                    b.updateQueue = t;
                  } else n.add(k2);
                  break a;
                } else {
                  if (0 === (b & 1)) {
                    Si(f2, l2, b);
                    tj();
                    break a;
                  }
                  k2 = Error(p(426));
                }
              } else if (I3 && h.mode & 1) {
                var J2 = Ui(g);
                if (null !== J2) {
                  0 === (J2.flags & 65536) && (J2.flags |= 256);
                  Vi(J2, g, h, f2, b);
                  Jg(Ji(k2, h));
                  break a;
                }
              }
              f2 = k2 = Ji(k2, h);
              4 !== T2 && (T2 = 2);
              null === sk ? sk = [f2] : sk.push(f2);
              f2 = g;
              do {
                switch (f2.tag) {
                  case 3:
                    f2.flags |= 65536;
                    b &= -b;
                    f2.lanes |= b;
                    var x = Ni(f2, k2, b);
                    ph(f2, x);
                    break a;
                  case 1:
                    h = k2;
                    var w = f2.type, u = f2.stateNode;
                    if (0 === (f2.flags & 128) && ("function" === typeof w.getDerivedStateFromError || null !== u && "function" === typeof u.componentDidCatch && (null === Ri || !Ri.has(u)))) {
                      f2.flags |= 65536;
                      b &= -b;
                      f2.lanes |= b;
                      var F2 = Qi(f2, h, b);
                      ph(f2, F2);
                      break a;
                    }
                }
                f2 = f2.return;
              } while (null !== f2);
            }
            Sk(c);
          } catch (na2) {
            b = na2;
            Y2 === c && null !== c && (Y2 = c = c.return);
            continue;
          }
          break;
        } while (1);
      }
      function Jk() {
        var a = mk.current;
        mk.current = Rh;
        return null === a ? Rh : a;
      }
      function tj() {
        if (0 === T2 || 3 === T2 || 2 === T2) T2 = 4;
        null === Q2 || 0 === (rh & 268435455) && 0 === (qk & 268435455) || Ck(Q2, Z2);
      }
      function Ik(a, b) {
        var c = K2;
        K2 |= 2;
        var d = Jk();
        if (Q2 !== a || Z2 !== b) uk = null, Kk(a, b);
        do
          try {
            Tk();
            break;
          } catch (e2) {
            Mk(a, e2);
          }
        while (1);
        $g();
        K2 = c;
        mk.current = d;
        if (null !== Y2) throw Error(p(261));
        Q2 = null;
        Z2 = 0;
        return T2;
      }
      function Tk() {
        for (; null !== Y2; ) Uk(Y2);
      }
      function Lk() {
        for (; null !== Y2 && !cc(); ) Uk(Y2);
      }
      function Uk(a) {
        var b = Vk(a.alternate, a, fj);
        a.memoizedProps = a.pendingProps;
        null === b ? Sk(a) : Y2 = b;
        nk.current = null;
      }
      function Sk(a) {
        var b = a;
        do {
          var c = b.alternate;
          a = b.return;
          if (0 === (b.flags & 32768)) {
            if (c = Ej(c, b, fj), null !== c) {
              Y2 = c;
              return;
            }
          } else {
            c = Ij(c, b);
            if (null !== c) {
              c.flags &= 32767;
              Y2 = c;
              return;
            }
            if (null !== a) a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null;
            else {
              T2 = 6;
              Y2 = null;
              return;
            }
          }
          b = b.sibling;
          if (null !== b) {
            Y2 = b;
            return;
          }
          Y2 = b = a;
        } while (null !== b);
        0 === T2 && (T2 = 5);
      }
      function Pk(a, b, c) {
        var d = C, e2 = ok.transition;
        try {
          ok.transition = null, C = 1, Wk(a, b, c, d);
        } finally {
          ok.transition = e2, C = d;
        }
        return null;
      }
      function Wk(a, b, c, d) {
        do
          Hk();
        while (null !== wk);
        if (0 !== (K2 & 6)) throw Error(p(327));
        c = a.finishedWork;
        var e2 = a.finishedLanes;
        if (null === c) return null;
        a.finishedWork = null;
        a.finishedLanes = 0;
        if (c === a.current) throw Error(p(177));
        a.callbackNode = null;
        a.callbackPriority = 0;
        var f2 = c.lanes | c.childLanes;
        Bc(a, f2);
        a === Q2 && (Y2 = Q2 = null, Z2 = 0);
        0 === (c.subtreeFlags & 2064) && 0 === (c.flags & 2064) || vk || (vk = true, Fk(hc, function() {
          Hk();
          return null;
        }));
        f2 = 0 !== (c.flags & 15990);
        if (0 !== (c.subtreeFlags & 15990) || f2) {
          f2 = ok.transition;
          ok.transition = null;
          var g = C;
          C = 1;
          var h = K2;
          K2 |= 4;
          nk.current = null;
          Oj(a, c);
          dk(c, a);
          Oe3(Df);
          dd2 = !!Cf;
          Df = Cf = null;
          a.current = c;
          hk(c, a, e2);
          dc();
          K2 = h;
          C = g;
          ok.transition = f2;
        } else a.current = c;
        vk && (vk = false, wk = a, xk = e2);
        f2 = a.pendingLanes;
        0 === f2 && (Ri = null);
        mc(c.stateNode, d);
        Dk(a, B3());
        if (null !== b) for (d = a.onRecoverableError, c = 0; c < b.length; c++) e2 = b[c], d(e2.value, { componentStack: e2.stack, digest: e2.digest });
        if (Oi) throw Oi = false, a = Pi, Pi = null, a;
        0 !== (xk & 1) && 0 !== a.tag && Hk();
        f2 = a.pendingLanes;
        0 !== (f2 & 1) ? a === zk ? yk++ : (yk = 0, zk = a) : yk = 0;
        jg();
        return null;
      }
      function Hk() {
        if (null !== wk) {
          var a = Dc(xk), b = ok.transition, c = C;
          try {
            ok.transition = null;
            C = 16 > a ? 16 : a;
            if (null === wk) var d = false;
            else {
              a = wk;
              wk = null;
              xk = 0;
              if (0 !== (K2 & 6)) throw Error(p(331));
              var e2 = K2;
              K2 |= 4;
              for (V = a.current; null !== V; ) {
                var f2 = V, g = f2.child;
                if (0 !== (V.flags & 16)) {
                  var h = f2.deletions;
                  if (null !== h) {
                    for (var k2 = 0; k2 < h.length; k2++) {
                      var l2 = h[k2];
                      for (V = l2; null !== V; ) {
                        var m = V;
                        switch (m.tag) {
                          case 0:
                          case 11:
                          case 15:
                            Pj(8, m, f2);
                        }
                        var q2 = m.child;
                        if (null !== q2) q2.return = m, V = q2;
                        else for (; null !== V; ) {
                          m = V;
                          var r = m.sibling, y2 = m.return;
                          Sj(m);
                          if (m === l2) {
                            V = null;
                            break;
                          }
                          if (null !== r) {
                            r.return = y2;
                            V = r;
                            break;
                          }
                          V = y2;
                        }
                      }
                    }
                    var n = f2.alternate;
                    if (null !== n) {
                      var t = n.child;
                      if (null !== t) {
                        n.child = null;
                        do {
                          var J2 = t.sibling;
                          t.sibling = null;
                          t = J2;
                        } while (null !== t);
                      }
                    }
                    V = f2;
                  }
                }
                if (0 !== (f2.subtreeFlags & 2064) && null !== g) g.return = f2, V = g;
                else b: for (; null !== V; ) {
                  f2 = V;
                  if (0 !== (f2.flags & 2048)) switch (f2.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Pj(9, f2, f2.return);
                  }
                  var x = f2.sibling;
                  if (null !== x) {
                    x.return = f2.return;
                    V = x;
                    break b;
                  }
                  V = f2.return;
                }
              }
              var w = a.current;
              for (V = w; null !== V; ) {
                g = V;
                var u = g.child;
                if (0 !== (g.subtreeFlags & 2064) && null !== u) u.return = g, V = u;
                else b: for (g = w; null !== V; ) {
                  h = V;
                  if (0 !== (h.flags & 2048)) try {
                    switch (h.tag) {
                      case 0:
                      case 11:
                      case 15:
                        Qj(9, h);
                    }
                  } catch (na2) {
                    W(h, h.return, na2);
                  }
                  if (h === g) {
                    V = null;
                    break b;
                  }
                  var F2 = h.sibling;
                  if (null !== F2) {
                    F2.return = h.return;
                    V = F2;
                    break b;
                  }
                  V = h.return;
                }
              }
              K2 = e2;
              jg();
              if (lc && "function" === typeof lc.onPostCommitFiberRoot) try {
                lc.onPostCommitFiberRoot(kc, a);
              } catch (na2) {
              }
              d = true;
            }
            return d;
          } finally {
            C = c, ok.transition = b;
          }
        }
        return false;
      }
      function Xk(a, b, c) {
        b = Ji(c, b);
        b = Ni(a, b, 1);
        a = nh(a, b, 1);
        b = R3();
        null !== a && (Ac(a, 1, b), Dk(a, b));
      }
      function W(a, b, c) {
        if (3 === a.tag) Xk(a, a, c);
        else for (; null !== b; ) {
          if (3 === b.tag) {
            Xk(b, a, c);
            break;
          } else if (1 === b.tag) {
            var d = b.stateNode;
            if ("function" === typeof b.type.getDerivedStateFromError || "function" === typeof d.componentDidCatch && (null === Ri || !Ri.has(d))) {
              a = Ji(c, a);
              a = Qi(b, a, 1);
              b = nh(b, a, 1);
              a = R3();
              null !== b && (Ac(b, 1, a), Dk(b, a));
              break;
            }
          }
          b = b.return;
        }
      }
      function Ti(a, b, c) {
        var d = a.pingCache;
        null !== d && d.delete(b);
        b = R3();
        a.pingedLanes |= a.suspendedLanes & c;
        Q2 === a && (Z2 & c) === c && (4 === T2 || 3 === T2 && (Z2 & 130023424) === Z2 && 500 > B3() - fk ? Kk(a, 0) : rk |= c);
        Dk(a, b);
      }
      function Yk(a, b) {
        0 === b && (0 === (a.mode & 1) ? b = 1 : (b = sc, sc <<= 1, 0 === (sc & 130023424) && (sc = 4194304)));
        var c = R3();
        a = ih(a, b);
        null !== a && (Ac(a, b, c), Dk(a, c));
      }
      function uj(a) {
        var b = a.memoizedState, c = 0;
        null !== b && (c = b.retryLane);
        Yk(a, c);
      }
      function bk(a, b) {
        var c = 0;
        switch (a.tag) {
          case 13:
            var d = a.stateNode;
            var e2 = a.memoizedState;
            null !== e2 && (c = e2.retryLane);
            break;
          case 19:
            d = a.stateNode;
            break;
          default:
            throw Error(p(314));
        }
        null !== d && d.delete(b);
        Yk(a, c);
      }
      var Vk;
      Vk = function(a, b, c) {
        if (null !== a) if (a.memoizedProps !== b.pendingProps || Wf.current) dh = true;
        else {
          if (0 === (a.lanes & c) && 0 === (b.flags & 128)) return dh = false, yj(a, b, c);
          dh = 0 !== (a.flags & 131072) ? true : false;
        }
        else dh = false, I3 && 0 !== (b.flags & 1048576) && ug(b, ng, b.index);
        b.lanes = 0;
        switch (b.tag) {
          case 2:
            var d = b.type;
            ij(a, b);
            a = b.pendingProps;
            var e2 = Yf(b, H.current);
            ch(b, c);
            e2 = Nh(null, b, d, a, e2, c);
            var f2 = Sh();
            b.flags |= 1;
            "object" === typeof e2 && null !== e2 && "function" === typeof e2.render && void 0 === e2.$$typeof ? (b.tag = 1, b.memoizedState = null, b.updateQueue = null, Zf(d) ? (f2 = true, cg(b)) : f2 = false, b.memoizedState = null !== e2.state && void 0 !== e2.state ? e2.state : null, kh(b), e2.updater = Ei, b.stateNode = e2, e2._reactInternals = b, Ii(b, d, a, c), b = jj(null, b, d, true, f2, c)) : (b.tag = 0, I3 && f2 && vg(b), Xi(null, b, e2, c), b = b.child);
            return b;
          case 16:
            d = b.elementType;
            a: {
              ij(a, b);
              a = b.pendingProps;
              e2 = d._init;
              d = e2(d._payload);
              b.type = d;
              e2 = b.tag = Zk(d);
              a = Ci(d, a);
              switch (e2) {
                case 0:
                  b = cj(null, b, d, a, c);
                  break a;
                case 1:
                  b = hj(null, b, d, a, c);
                  break a;
                case 11:
                  b = Yi(null, b, d, a, c);
                  break a;
                case 14:
                  b = $i(null, b, d, Ci(d.type, a), c);
                  break a;
              }
              throw Error(p(
                306,
                d,
                ""
              ));
            }
            return b;
          case 0:
            return d = b.type, e2 = b.pendingProps, e2 = b.elementType === d ? e2 : Ci(d, e2), cj(a, b, d, e2, c);
          case 1:
            return d = b.type, e2 = b.pendingProps, e2 = b.elementType === d ? e2 : Ci(d, e2), hj(a, b, d, e2, c);
          case 3:
            a: {
              kj(b);
              if (null === a) throw Error(p(387));
              d = b.pendingProps;
              f2 = b.memoizedState;
              e2 = f2.element;
              lh(a, b);
              qh(b, d, null, c);
              var g = b.memoizedState;
              d = g.element;
              if (f2.isDehydrated) if (f2 = { element: d, isDehydrated: false, cache: g.cache, pendingSuspenseBoundaries: g.pendingSuspenseBoundaries, transitions: g.transitions }, b.updateQueue.baseState = f2, b.memoizedState = f2, b.flags & 256) {
                e2 = Ji(Error(p(423)), b);
                b = lj(a, b, d, c, e2);
                break a;
              } else if (d !== e2) {
                e2 = Ji(Error(p(424)), b);
                b = lj(a, b, d, c, e2);
                break a;
              } else for (yg = Lf(b.stateNode.containerInfo.firstChild), xg = b, I3 = true, zg = null, c = Vg(b, null, d, c), b.child = c; c; ) c.flags = c.flags & -3 | 4096, c = c.sibling;
              else {
                Ig();
                if (d === e2) {
                  b = Zi(a, b, c);
                  break a;
                }
                Xi(a, b, d, c);
              }
              b = b.child;
            }
            return b;
          case 5:
            return Ah(b), null === a && Eg(b), d = b.type, e2 = b.pendingProps, f2 = null !== a ? a.memoizedProps : null, g = e2.children, Ef(d, e2) ? g = null : null !== f2 && Ef(d, f2) && (b.flags |= 32), gj(a, b), Xi(a, b, g, c), b.child;
          case 6:
            return null === a && Eg(b), null;
          case 13:
            return oj(a, b, c);
          case 4:
            return yh(b, b.stateNode.containerInfo), d = b.pendingProps, null === a ? b.child = Ug(b, null, d, c) : Xi(a, b, d, c), b.child;
          case 11:
            return d = b.type, e2 = b.pendingProps, e2 = b.elementType === d ? e2 : Ci(d, e2), Yi(a, b, d, e2, c);
          case 7:
            return Xi(a, b, b.pendingProps, c), b.child;
          case 8:
            return Xi(a, b, b.pendingProps.children, c), b.child;
          case 12:
            return Xi(a, b, b.pendingProps.children, c), b.child;
          case 10:
            a: {
              d = b.type._context;
              e2 = b.pendingProps;
              f2 = b.memoizedProps;
              g = e2.value;
              G2(Wg, d._currentValue);
              d._currentValue = g;
              if (null !== f2) if (He3(f2.value, g)) {
                if (f2.children === e2.children && !Wf.current) {
                  b = Zi(a, b, c);
                  break a;
                }
              } else for (f2 = b.child, null !== f2 && (f2.return = b); null !== f2; ) {
                var h = f2.dependencies;
                if (null !== h) {
                  g = f2.child;
                  for (var k2 = h.firstContext; null !== k2; ) {
                    if (k2.context === d) {
                      if (1 === f2.tag) {
                        k2 = mh(-1, c & -c);
                        k2.tag = 2;
                        var l2 = f2.updateQueue;
                        if (null !== l2) {
                          l2 = l2.shared;
                          var m = l2.pending;
                          null === m ? k2.next = k2 : (k2.next = m.next, m.next = k2);
                          l2.pending = k2;
                        }
                      }
                      f2.lanes |= c;
                      k2 = f2.alternate;
                      null !== k2 && (k2.lanes |= c);
                      bh(
                        f2.return,
                        c,
                        b
                      );
                      h.lanes |= c;
                      break;
                    }
                    k2 = k2.next;
                  }
                } else if (10 === f2.tag) g = f2.type === b.type ? null : f2.child;
                else if (18 === f2.tag) {
                  g = f2.return;
                  if (null === g) throw Error(p(341));
                  g.lanes |= c;
                  h = g.alternate;
                  null !== h && (h.lanes |= c);
                  bh(g, c, b);
                  g = f2.sibling;
                } else g = f2.child;
                if (null !== g) g.return = f2;
                else for (g = f2; null !== g; ) {
                  if (g === b) {
                    g = null;
                    break;
                  }
                  f2 = g.sibling;
                  if (null !== f2) {
                    f2.return = g.return;
                    g = f2;
                    break;
                  }
                  g = g.return;
                }
                f2 = g;
              }
              Xi(a, b, e2.children, c);
              b = b.child;
            }
            return b;
          case 9:
            return e2 = b.type, d = b.pendingProps.children, ch(b, c), e2 = eh(e2), d = d(e2), b.flags |= 1, Xi(a, b, d, c), b.child;
          case 14:
            return d = b.type, e2 = Ci(d, b.pendingProps), e2 = Ci(d.type, e2), $i(a, b, d, e2, c);
          case 15:
            return bj(a, b, b.type, b.pendingProps, c);
          case 17:
            return d = b.type, e2 = b.pendingProps, e2 = b.elementType === d ? e2 : Ci(d, e2), ij(a, b), b.tag = 1, Zf(d) ? (a = true, cg(b)) : a = false, ch(b, c), Gi(b, d, e2), Ii(b, d, e2, c), jj(null, b, d, true, a, c);
          case 19:
            return xj(a, b, c);
          case 22:
            return dj(a, b, c);
        }
        throw Error(p(156, b.tag));
      };
      function Fk(a, b) {
        return ac(a, b);
      }
      function $k(a, b, c, d) {
        this.tag = a;
        this.key = c;
        this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
        this.index = 0;
        this.ref = null;
        this.pendingProps = b;
        this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
        this.mode = d;
        this.subtreeFlags = this.flags = 0;
        this.deletions = null;
        this.childLanes = this.lanes = 0;
        this.alternate = null;
      }
      function Bg(a, b, c, d) {
        return new $k(a, b, c, d);
      }
      function aj(a) {
        a = a.prototype;
        return !(!a || !a.isReactComponent);
      }
      function Zk(a) {
        if ("function" === typeof a) return aj(a) ? 1 : 0;
        if (void 0 !== a && null !== a) {
          a = a.$$typeof;
          if (a === Da2) return 11;
          if (a === Ga) return 14;
        }
        return 2;
      }
      function Pg(a, b) {
        var c = a.alternate;
        null === c ? (c = Bg(a.tag, b, a.key, a.mode), c.elementType = a.elementType, c.type = a.type, c.stateNode = a.stateNode, c.alternate = a, a.alternate = c) : (c.pendingProps = b, c.type = a.type, c.flags = 0, c.subtreeFlags = 0, c.deletions = null);
        c.flags = a.flags & 14680064;
        c.childLanes = a.childLanes;
        c.lanes = a.lanes;
        c.child = a.child;
        c.memoizedProps = a.memoizedProps;
        c.memoizedState = a.memoizedState;
        c.updateQueue = a.updateQueue;
        b = a.dependencies;
        c.dependencies = null === b ? null : { lanes: b.lanes, firstContext: b.firstContext };
        c.sibling = a.sibling;
        c.index = a.index;
        c.ref = a.ref;
        return c;
      }
      function Rg(a, b, c, d, e2, f2) {
        var g = 2;
        d = a;
        if ("function" === typeof a) aj(a) && (g = 1);
        else if ("string" === typeof a) g = 5;
        else a: switch (a) {
          case ya:
            return Tg(c.children, e2, f2, b);
          case za:
            g = 8;
            e2 |= 8;
            break;
          case Aa:
            return a = Bg(12, c, b, e2 | 2), a.elementType = Aa, a.lanes = f2, a;
          case Ea:
            return a = Bg(13, c, b, e2), a.elementType = Ea, a.lanes = f2, a;
          case Fa2:
            return a = Bg(19, c, b, e2), a.elementType = Fa2, a.lanes = f2, a;
          case Ia:
            return pj(c, e2, f2, b);
          default:
            if ("object" === typeof a && null !== a) switch (a.$$typeof) {
              case Ba:
                g = 10;
                break a;
              case Ca:
                g = 9;
                break a;
              case Da2:
                g = 11;
                break a;
              case Ga:
                g = 14;
                break a;
              case Ha2:
                g = 16;
                d = null;
                break a;
            }
            throw Error(p(130, null == a ? a : typeof a, ""));
        }
        b = Bg(g, c, b, e2);
        b.elementType = a;
        b.type = d;
        b.lanes = f2;
        return b;
      }
      function Tg(a, b, c, d) {
        a = Bg(7, a, d, b);
        a.lanes = c;
        return a;
      }
      function pj(a, b, c, d) {
        a = Bg(22, a, d, b);
        a.elementType = Ia;
        a.lanes = c;
        a.stateNode = { isHidden: false };
        return a;
      }
      function Qg(a, b, c) {
        a = Bg(6, a, null, b);
        a.lanes = c;
        return a;
      }
      function Sg(a, b, c) {
        b = Bg(4, null !== a.children ? a.children : [], a.key, b);
        b.lanes = c;
        b.stateNode = { containerInfo: a.containerInfo, pendingChildren: null, implementation: a.implementation };
        return b;
      }
      function al(a, b, c, d, e2) {
        this.tag = b;
        this.containerInfo = a;
        this.finishedWork = this.pingCache = this.current = this.pendingChildren = null;
        this.timeoutHandle = -1;
        this.callbackNode = this.pendingContext = this.context = null;
        this.callbackPriority = 0;
        this.eventTimes = zc(0);
        this.expirationTimes = zc(-1);
        this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
        this.entanglements = zc(0);
        this.identifierPrefix = d;
        this.onRecoverableError = e2;
        this.mutableSourceEagerHydrationData = null;
      }
      function bl2(a, b, c, d, e2, f2, g, h, k2) {
        a = new al(a, b, c, h, k2);
        1 === b ? (b = 1, true === f2 && (b |= 8)) : b = 0;
        f2 = Bg(3, null, null, b);
        a.current = f2;
        f2.stateNode = a;
        f2.memoizedState = { element: d, isDehydrated: c, cache: null, transitions: null, pendingSuspenseBoundaries: null };
        kh(f2);
        return a;
      }
      function cl2(a, b, c) {
        var d = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
        return { $$typeof: wa, key: null == d ? null : "" + d, children: a, containerInfo: b, implementation: c };
      }
      function dl2(a) {
        if (!a) return Vf;
        a = a._reactInternals;
        a: {
          if (Vb(a) !== a || 1 !== a.tag) throw Error(p(170));
          var b = a;
          do {
            switch (b.tag) {
              case 3:
                b = b.stateNode.context;
                break a;
              case 1:
                if (Zf(b.type)) {
                  b = b.stateNode.__reactInternalMemoizedMergedChildContext;
                  break a;
                }
            }
            b = b.return;
          } while (null !== b);
          throw Error(p(171));
        }
        if (1 === a.tag) {
          var c = a.type;
          if (Zf(c)) return bg(a, c, b);
        }
        return b;
      }
      function el2(a, b, c, d, e2, f2, g, h, k2) {
        a = bl2(c, d, true, a, e2, f2, g, h, k2);
        a.context = dl2(null);
        c = a.current;
        d = R3();
        e2 = yi(c);
        f2 = mh(d, e2);
        f2.callback = void 0 !== b && null !== b ? b : null;
        nh(c, f2, e2);
        a.current.lanes = e2;
        Ac(a, e2, d);
        Dk(a, d);
        return a;
      }
      function fl2(a, b, c, d) {
        var e2 = b.current, f2 = R3(), g = yi(e2);
        c = dl2(c);
        null === b.context ? b.context = c : b.pendingContext = c;
        b = mh(f2, g);
        b.payload = { element: a };
        d = void 0 === d ? null : d;
        null !== d && (b.callback = d);
        a = nh(e2, b, g);
        null !== a && (gi(a, e2, g, f2), oh(a, e2, g));
        return g;
      }
      function gl2(a) {
        a = a.current;
        if (!a.child) return null;
        switch (a.child.tag) {
          case 5:
            return a.child.stateNode;
          default:
            return a.child.stateNode;
        }
      }
      function hl2(a, b) {
        a = a.memoizedState;
        if (null !== a && null !== a.dehydrated) {
          var c = a.retryLane;
          a.retryLane = 0 !== c && c < b ? c : b;
        }
      }
      function il(a, b) {
        hl2(a, b);
        (a = a.alternate) && hl2(a, b);
      }
      function jl() {
        return null;
      }
      var kl2 = "function" === typeof reportError ? reportError : function(a) {
        console.error(a);
      };
      function ll(a) {
        this._internalRoot = a;
      }
      ml2.prototype.render = ll.prototype.render = function(a) {
        var b = this._internalRoot;
        if (null === b) throw Error(p(409));
        fl2(a, b, null, null);
      };
      ml2.prototype.unmount = ll.prototype.unmount = function() {
        var a = this._internalRoot;
        if (null !== a) {
          this._internalRoot = null;
          var b = a.containerInfo;
          Rk(function() {
            fl2(null, a, null, null);
          });
          b[uf] = null;
        }
      };
      function ml2(a) {
        this._internalRoot = a;
      }
      ml2.prototype.unstable_scheduleHydration = function(a) {
        if (a) {
          var b = Hc();
          a = { blockedOn: null, target: a, priority: b };
          for (var c = 0; c < Qc.length && 0 !== b && b < Qc[c].priority; c++) ;
          Qc.splice(c, 0, a);
          0 === c && Vc(a);
        }
      };
      function nl(a) {
        return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType);
      }
      function ol(a) {
        return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType && (8 !== a.nodeType || " react-mount-point-unstable " !== a.nodeValue));
      }
      function pl2() {
      }
      function ql2(a, b, c, d, e2) {
        if (e2) {
          if ("function" === typeof d) {
            var f2 = d;
            d = function() {
              var a2 = gl2(g);
              f2.call(a2);
            };
          }
          var g = el2(b, d, a, 0, null, false, false, "", pl2);
          a._reactRootContainer = g;
          a[uf] = g.current;
          sf(8 === a.nodeType ? a.parentNode : a);
          Rk();
          return g;
        }
        for (; e2 = a.lastChild; ) a.removeChild(e2);
        if ("function" === typeof d) {
          var h = d;
          d = function() {
            var a2 = gl2(k2);
            h.call(a2);
          };
        }
        var k2 = bl2(a, 0, false, null, null, false, false, "", pl2);
        a._reactRootContainer = k2;
        a[uf] = k2.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        Rk(function() {
          fl2(b, k2, c, d);
        });
        return k2;
      }
      function rl(a, b, c, d, e2) {
        var f2 = c._reactRootContainer;
        if (f2) {
          var g = f2;
          if ("function" === typeof e2) {
            var h = e2;
            e2 = function() {
              var a2 = gl2(g);
              h.call(a2);
            };
          }
          fl2(b, g, a, e2);
        } else g = ql2(c, b, a, e2, d);
        return gl2(g);
      }
      Ec = function(a) {
        switch (a.tag) {
          case 3:
            var b = a.stateNode;
            if (b.current.memoizedState.isDehydrated) {
              var c = tc(b.pendingLanes);
              0 !== c && (Cc(b, c | 1), Dk(b, B3()), 0 === (K2 & 6) && (Gj = B3() + 500, jg()));
            }
            break;
          case 13:
            Rk(function() {
              var b2 = ih(a, 1);
              if (null !== b2) {
                var c2 = R3();
                gi(b2, a, 1, c2);
              }
            }), il(a, 1);
        }
      };
      Fc = function(a) {
        if (13 === a.tag) {
          var b = ih(a, 134217728);
          if (null !== b) {
            var c = R3();
            gi(b, a, 134217728, c);
          }
          il(a, 134217728);
        }
      };
      Gc = function(a) {
        if (13 === a.tag) {
          var b = yi(a), c = ih(a, b);
          if (null !== c) {
            var d = R3();
            gi(c, a, b, d);
          }
          il(a, b);
        }
      };
      Hc = function() {
        return C;
      };
      Ic = function(a, b) {
        var c = C;
        try {
          return C = a, b();
        } finally {
          C = c;
        }
      };
      yb = function(a, b, c) {
        switch (b) {
          case "input":
            bb(a, c);
            b = c.name;
            if ("radio" === c.type && null != b) {
              for (c = a; c.parentNode; ) c = c.parentNode;
              c = c.querySelectorAll("input[name=" + JSON.stringify("" + b) + '][type="radio"]');
              for (b = 0; b < c.length; b++) {
                var d = c[b];
                if (d !== a && d.form === a.form) {
                  var e2 = Db(d);
                  if (!e2) throw Error(p(90));
                  Wa(d);
                  bb(d, e2);
                }
              }
            }
            break;
          case "textarea":
            ib(a, c);
            break;
          case "select":
            b = c.value, null != b && fb(a, !!c.multiple, b, false);
        }
      };
      Gb = Qk;
      Hb = Rk;
      var sl2 = { usingClientEntryPoint: false, Events: [Cb, ue3, Db, Eb, Fb, Qk] };
      var tl = { findFiberByHostInstance: Wc, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" };
      var ul = { bundleType: tl.bundleType, version: tl.version, rendererPackageName: tl.rendererPackageName, rendererConfig: tl.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: ua2.ReactCurrentDispatcher, findHostInstanceByFiber: function(a) {
        a = Zb(a);
        return null === a ? null : a.stateNode;
      }, findFiberByHostInstance: tl.findFiberByHostInstance || jl, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
      if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
        vl2 = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!vl2.isDisabled && vl2.supportsFiber) try {
          kc = vl2.inject(ul), lc = vl2;
        } catch (a) {
        }
      }
      var vl2;
      exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = sl2;
      exports.createPortal = function(a, b) {
        var c = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
        if (!nl(b)) throw Error(p(200));
        return cl2(a, b, null, c);
      };
      exports.createRoot = function(a, b) {
        if (!nl(a)) throw Error(p(299));
        var c = false, d = "", e2 = kl2;
        null !== b && void 0 !== b && (true === b.unstable_strictMode && (c = true), void 0 !== b.identifierPrefix && (d = b.identifierPrefix), void 0 !== b.onRecoverableError && (e2 = b.onRecoverableError));
        b = bl2(a, 1, false, null, null, c, false, d, e2);
        a[uf] = b.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        return new ll(b);
      };
      exports.findDOMNode = function(a) {
        if (null == a) return null;
        if (1 === a.nodeType) return a;
        var b = a._reactInternals;
        if (void 0 === b) {
          if ("function" === typeof a.render) throw Error(p(188));
          a = Object.keys(a).join(",");
          throw Error(p(268, a));
        }
        a = Zb(b);
        a = null === a ? null : a.stateNode;
        return a;
      };
      exports.flushSync = function(a) {
        return Rk(a);
      };
      exports.hydrate = function(a, b, c) {
        if (!ol(b)) throw Error(p(200));
        return rl(null, a, b, true, c);
      };
      exports.hydrateRoot = function(a, b, c) {
        if (!nl(a)) throw Error(p(405));
        var d = null != c && c.hydratedSources || null, e2 = false, f2 = "", g = kl2;
        null !== c && void 0 !== c && (true === c.unstable_strictMode && (e2 = true), void 0 !== c.identifierPrefix && (f2 = c.identifierPrefix), void 0 !== c.onRecoverableError && (g = c.onRecoverableError));
        b = el2(b, null, a, 1, null != c ? c : null, e2, false, f2, g);
        a[uf] = b.current;
        sf(a);
        if (d) for (a = 0; a < d.length; a++) c = d[a], e2 = c._getVersion, e2 = e2(c._source), null == b.mutableSourceEagerHydrationData ? b.mutableSourceEagerHydrationData = [c, e2] : b.mutableSourceEagerHydrationData.push(
          c,
          e2
        );
        return new ml2(b);
      };
      exports.render = function(a, b, c) {
        if (!ol(b)) throw Error(p(200));
        return rl(null, a, b, false, c);
      };
      exports.unmountComponentAtNode = function(a) {
        if (!ol(a)) throw Error(p(40));
        return a._reactRootContainer ? (Rk(function() {
          rl(null, null, a, false, function() {
            a._reactRootContainer = null;
            a[uf] = null;
          });
        }), true) : false;
      };
      exports.unstable_batchedUpdates = Qk;
      exports.unstable_renderSubtreeIntoContainer = function(a, b, c, d) {
        if (!ol(c)) throw Error(p(200));
        if (null == a || void 0 === a._reactInternals) throw Error(p(38));
        return rl(a, b, c, false, d);
      };
      exports.version = "18.3.1-next-f1338f8080-20240426";
    }
  });

  // ../../opt/files/node_modules/react-dom/index.js
  var require_react_dom = __commonJS({
    "../../opt/files/node_modules/react-dom/index.js"(exports, module) {
      "use strict";
      function checkDCE() {
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
          return;
        }
        if (false) {
          throw new Error("^_^");
        }
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
        } catch (err) {
          console.error(err);
        }
      }
      if (true) {
        checkDCE();
        module.exports = require_react_dom_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // ../../opt/files/node_modules/react-dom/client.js
  var require_client = __commonJS({
    "../../opt/files/node_modules/react-dom/client.js"(exports) {
      "use strict";
      var m = require_react_dom();
      if (true) {
        exports.createRoot = m.createRoot;
        exports.hydrateRoot = m.hydrateRoot;
      } else {
        i = m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        exports.createRoot = function(c, o) {
          i.usingClientEntryPoint = true;
          try {
            return m.createRoot(c, o);
          } finally {
            i.usingClientEntryPoint = false;
          }
        };
        exports.hydrateRoot = function(c, h, o) {
          i.usingClientEntryPoint = true;
          try {
            return m.hydrateRoot(c, h, o);
          } finally {
            i.usingClientEntryPoint = false;
          }
        };
      }
      var i;
    }
  });

  // ../../opt/files/node_modules/react/cjs/react-jsx-runtime.production.min.js
  var require_react_jsx_runtime_production_min = __commonJS({
    "../../opt/files/node_modules/react/cjs/react-jsx-runtime.production.min.js"(exports) {
      "use strict";
      var f2 = require_react();
      var k2 = /* @__PURE__ */ Symbol.for("react.element");
      var l2 = /* @__PURE__ */ Symbol.for("react.fragment");
      var m = Object.prototype.hasOwnProperty;
      var n = f2.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner;
      var p = { key: true, ref: true, __self: true, __source: true };
      function q2(c, a, g) {
        var b, d = {}, e2 = null, h = null;
        void 0 !== g && (e2 = "" + g);
        void 0 !== a.key && (e2 = "" + a.key);
        void 0 !== a.ref && (h = a.ref);
        for (b in a) m.call(a, b) && !p.hasOwnProperty(b) && (d[b] = a[b]);
        if (c && c.defaultProps) for (b in a = c.defaultProps, a) void 0 === d[b] && (d[b] = a[b]);
        return { $$typeof: k2, type: c, key: e2, ref: h, props: d, _owner: n.current };
      }
      exports.Fragment = l2;
      exports.jsx = q2;
      exports.jsxs = q2;
    }
  });

  // ../../opt/files/node_modules/react/jsx-runtime.js
  var require_jsx_runtime = __commonJS({
    "../../opt/files/node_modules/react/jsx-runtime.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_react_jsx_runtime_production_min();
      } else {
        module.exports = null;
      }
    }
  });

  // src/main.tsx
  var import_client = __toESM(require_client());

  // ../../opt/files/kit/index.tsx
  var import_react22 = __toESM(require_react());

  // ../../opt/files/kit/components.mjs
  var y = __toESM(require_react(), 1);
  var Je = __toESM(require_react(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var import_react = __toESM(require_react(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var import_react2 = __toESM(require_react(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  function ee(e2) {
    var r, t, o = "";
    if (typeof e2 == "string" || typeof e2 == "number") o += e2;
    else if (typeof e2 == "object") if (Array.isArray(e2)) {
      var s = e2.length;
      for (r = 0; r < s; r++) e2[r] && (t = ee(e2[r])) && (o && (o += " "), o += t);
    } else for (t in e2) e2[t] && (o && (o += " "), o += t);
    return o;
  }
  function j() {
    for (var e2, r, t = 0, o = "", s = arguments.length; t < s; t++) (e2 = arguments[t]) && (r = ee(e2)) && (o && (o += " "), o += r);
    return o;
  }
  var ve = (e2) => {
    let r = Ce(e2), { conflictingClassGroups: t, conflictingClassGroupModifiers: o } = e2;
    return { getClassGroupId: (a) => {
      let i = a.split("-");
      return i[0] === "" && i.length !== 1 && i.shift(), oe(i, r) || we(a);
    }, getConflictingClassGroupIds: (a, i) => {
      let d = t[a] || [];
      return i && o[a] ? [...d, ...o[a]] : d;
    } };
  };
  var oe = (e2, r) => {
    if (e2.length === 0) return r.classGroupId;
    let t = e2[0], o = r.nextPart.get(t), s = o ? oe(e2.slice(1), o) : void 0;
    if (s) return s;
    if (r.validators.length === 0) return;
    let n = e2.join("-");
    return r.validators.find(({ validator: a }) => a(n))?.classGroupId;
  };
  var te = /^\[(.+)\]$/;
  var we = (e2) => {
    if (te.test(e2)) {
      let r = te.exec(e2)[1], t = r?.substring(0, r.indexOf(":"));
      if (t) return "arbitrary.." + t;
    }
  };
  var Ce = (e2) => {
    let { theme: r, prefix: t } = e2, o = { nextPart: /* @__PURE__ */ new Map(), validators: [] };
    return Se(Object.entries(e2.classGroups), t).forEach(([n, a]) => {
      U(a, o, n, r);
    }), o;
  };
  var U = (e2, r, t, o) => {
    e2.forEach((s) => {
      if (typeof s == "string") {
        let n = s === "" ? r : re(r, s);
        n.classGroupId = t;
        return;
      }
      if (typeof s == "function") {
        if (ke(s)) {
          U(s(o), r, t, o);
          return;
        }
        r.validators.push({ validator: s, classGroupId: t });
        return;
      }
      Object.entries(s).forEach(([n, a]) => {
        U(a, re(r, n), t, o);
      });
    });
  };
  var re = (e2, r) => {
    let t = e2;
    return r.split("-").forEach((o) => {
      t.nextPart.has(o) || t.nextPart.set(o, { nextPart: /* @__PURE__ */ new Map(), validators: [] }), t = t.nextPart.get(o);
    }), t;
  };
  var ke = (e2) => e2.isThemeGetter;
  var Se = (e2, r) => r ? e2.map(([t, o]) => {
    let s = o.map((n) => typeof n == "string" ? r + n : typeof n == "object" ? Object.fromEntries(Object.entries(n).map(([a, i]) => [r + a, i])) : n);
    return [t, s];
  }) : e2;
  var Re = (e2) => {
    if (e2 < 1) return { get: () => {
    }, set: () => {
    } };
    let r = 0, t = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map(), s = (n, a) => {
      t.set(n, a), r++, r > e2 && (r = 0, o = t, t = /* @__PURE__ */ new Map());
    };
    return { get(n) {
      let a = t.get(n);
      if (a !== void 0) return a;
      if ((a = o.get(n)) !== void 0) return s(n, a), a;
    }, set(n, a) {
      t.has(n) ? t.set(n, a) : s(n, a);
    } };
  };
  var Ae = (e2) => {
    let { separator: r, experimentalParseClassName: t } = e2, o = r.length === 1, s = r[0], n = r.length, a = (i) => {
      let d = [], c = 0, u = 0, g;
      for (let p = 0; p < i.length; p++) {
        let x = i[p];
        if (c === 0) {
          if (x === s && (o || i.slice(p, p + n) === r)) {
            d.push(i.slice(u, p)), u = p + n;
            continue;
          }
          if (x === "/") {
            g = p;
            continue;
          }
        }
        x === "[" ? c++ : x === "]" && c--;
      }
      let m = d.length === 0 ? i : i.substring(u), v2 = m.startsWith("!"), w = v2 ? m.substring(1) : m, h = g && g > u ? g - u : void 0;
      return { modifiers: d, hasImportantModifier: v2, baseClassName: w, maybePostfixModifierPosition: h };
    };
    return t ? (i) => t({ className: i, parseClassName: a }) : a;
  };
  var Pe = (e2) => {
    if (e2.length <= 1) return e2;
    let r = [], t = [];
    return e2.forEach((o) => {
      o[0] === "[" ? (r.push(...t.sort(), o), t = []) : t.push(o);
    }), r.push(...t.sort()), r;
  };
  var ze = (e2) => ({ cache: Re(e2.cacheSize), parseClassName: Ae(e2), ...ve(e2) });
  var Me = /\s+/;
  var Ne = (e2, r) => {
    let { parseClassName: t, getClassGroupId: o, getConflictingClassGroupIds: s } = r, n = [], a = e2.trim().split(Me), i = "";
    for (let d = a.length - 1; d >= 0; d -= 1) {
      let c = a[d], { modifiers: u, hasImportantModifier: g, baseClassName: m, maybePostfixModifierPosition: v2 } = t(c), w = !!v2, h = o(w ? m.substring(0, v2) : m);
      if (!h) {
        if (!w) {
          i = c + (i.length > 0 ? " " + i : i);
          continue;
        }
        if (h = o(m), !h) {
          i = c + (i.length > 0 ? " " + i : i);
          continue;
        }
        w = false;
      }
      let p = Pe(u).join(":"), x = g ? p + "!" : p, C = x + h;
      if (n.includes(C)) continue;
      n.push(C);
      let N2 = s(h, w);
      for (let P = 0; P < N2.length; ++P) {
        let L = N2[P];
        n.push(x + L);
      }
      i = c + (i.length > 0 ? " " + i : i);
    }
    return i;
  };
  function Te() {
    let e2 = 0, r, t, o = "";
    for (; e2 < arguments.length; ) (r = arguments[e2++]) && (t = ne(r)) && (o && (o += " "), o += t);
    return o;
  }
  var ne = (e2) => {
    if (typeof e2 == "string") return e2;
    let r, t = "";
    for (let o = 0; o < e2.length; o++) e2[o] && (r = ne(e2[o])) && (t && (t += " "), t += r);
    return t;
  };
  function Be(e2, ...r) {
    let t, o, s, n = a;
    function a(d) {
      let c = r.reduce((u, g) => g(u), e2());
      return t = ze(c), o = t.cache.get, s = t.cache.set, n = i, i(d);
    }
    function i(d) {
      let c = o(d);
      if (c) return c;
      let u = Ne(d, t);
      return s(d, u), u;
    }
    return function() {
      return n(Te.apply(null, arguments));
    };
  }
  var f = (e2) => {
    let r = (t) => t[e2] || [];
    return r.isThemeGetter = true, r;
  };
  var se = /^\[(?:([a-z-]+):)?(.+)\]$/i;
  var Ie = /^\d+\/\d+$/;
  var _e = /* @__PURE__ */ new Set(["px", "full", "screen"]);
  var Ee = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
  var Le = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
  var Ve = /^(rgba?|hsla?|hwb|(ok)?(lab|lch))\(.+\)$/;
  var Ge = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
  var je = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
  var S = (e2) => z(e2) || _e.has(e2) || Ie.test(e2);
  var R = (e2) => M(e2, "length", Ke);
  var z = (e2) => !!e2 && !Number.isNaN(Number(e2));
  var F = (e2) => M(e2, "number", z);
  var B = (e2) => !!e2 && Number.isInteger(Number(e2));
  var Oe = (e2) => e2.endsWith("%") && z(e2.slice(0, -1));
  var l = (e2) => se.test(e2);
  var A = (e2) => Ee.test(e2);
  var We = /* @__PURE__ */ new Set(["length", "size", "percentage"]);
  var $e = (e2) => M(e2, We, ie);
  var De = (e2) => M(e2, "position", ie);
  var He = /* @__PURE__ */ new Set(["image", "url"]);
  var Fe = (e2) => M(e2, He, qe);
  var Ue = (e2) => M(e2, "", Ze);
  var I = () => true;
  var M = (e2, r, t) => {
    let o = se.exec(e2);
    return o ? o[1] ? typeof r == "string" ? o[1] === r : r.has(o[1]) : t(o[2]) : false;
  };
  var Ke = (e2) => Le.test(e2) && !Ve.test(e2);
  var ie = () => false;
  var Ze = (e2) => Ge.test(e2);
  var qe = (e2) => je.test(e2);
  var Ye = () => {
    let e2 = f("colors"), r = f("spacing"), t = f("blur"), o = f("brightness"), s = f("borderColor"), n = f("borderRadius"), a = f("borderSpacing"), i = f("borderWidth"), d = f("contrast"), c = f("grayscale"), u = f("hueRotate"), g = f("invert"), m = f("gap"), v2 = f("gradientColorStops"), w = f("gradientColorStopPositions"), h = f("inset"), p = f("margin"), x = f("opacity"), C = f("padding"), N2 = f("saturate"), P = f("scale"), L = f("sepia"), K2 = f("skew"), Z2 = f("space"), q2 = f("translate"), W = () => ["auto", "contain", "none"], $2 = () => ["auto", "hidden", "clip", "visible", "scroll"], D2 = () => ["auto", l, r], b = () => [l, r], Y2 = () => ["", S, R], V = () => ["auto", z, l], J2 = () => ["bottom", "center", "left", "left-bottom", "left-top", "right", "right-bottom", "right-top", "top"], G2 = () => ["solid", "dashed", "dotted", "double", "none"], X2 = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], H = () => ["start", "end", "center", "between", "around", "evenly", "stretch"], T2 = () => ["", "0", l], Q2 = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"], k2 = () => [z, l];
    return { cacheSize: 500, separator: ":", theme: { colors: [I], spacing: [S, R], blur: ["none", "", A, l], brightness: k2(), borderColor: [e2], borderRadius: ["none", "", "full", A, l], borderSpacing: b(), borderWidth: Y2(), contrast: k2(), grayscale: T2(), hueRotate: k2(), invert: T2(), gap: b(), gradientColorStops: [e2], gradientColorStopPositions: [Oe, R], inset: D2(), margin: D2(), opacity: k2(), padding: b(), saturate: k2(), scale: k2(), sepia: T2(), skew: k2(), space: b(), translate: b() }, classGroups: { aspect: [{ aspect: ["auto", "square", "video", l] }], container: ["container"], columns: [{ columns: [A] }], "break-after": [{ "break-after": Q2() }], "break-before": [{ "break-before": Q2() }], "break-inside": [{ "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"] }], "box-decoration": [{ "box-decoration": ["slice", "clone"] }], box: [{ box: ["border", "content"] }], display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"], float: [{ float: ["right", "left", "none", "start", "end"] }], clear: [{ clear: ["left", "right", "both", "none", "start", "end"] }], isolation: ["isolate", "isolation-auto"], "object-fit": [{ object: ["contain", "cover", "fill", "none", "scale-down"] }], "object-position": [{ object: [...J2(), l] }], overflow: [{ overflow: $2() }], "overflow-x": [{ "overflow-x": $2() }], "overflow-y": [{ "overflow-y": $2() }], overscroll: [{ overscroll: W() }], "overscroll-x": [{ "overscroll-x": W() }], "overscroll-y": [{ "overscroll-y": W() }], position: ["static", "fixed", "absolute", "relative", "sticky"], inset: [{ inset: [h] }], "inset-x": [{ "inset-x": [h] }], "inset-y": [{ "inset-y": [h] }], start: [{ start: [h] }], end: [{ end: [h] }], top: [{ top: [h] }], right: [{ right: [h] }], bottom: [{ bottom: [h] }], left: [{ left: [h] }], visibility: ["visible", "invisible", "collapse"], z: [{ z: ["auto", B, l] }], basis: [{ basis: D2() }], "flex-direction": [{ flex: ["row", "row-reverse", "col", "col-reverse"] }], "flex-wrap": [{ flex: ["wrap", "wrap-reverse", "nowrap"] }], flex: [{ flex: ["1", "auto", "initial", "none", l] }], grow: [{ grow: T2() }], shrink: [{ shrink: T2() }], order: [{ order: ["first", "last", "none", B, l] }], "grid-cols": [{ "grid-cols": [I] }], "col-start-end": [{ col: ["auto", { span: ["full", B, l] }, l] }], "col-start": [{ "col-start": V() }], "col-end": [{ "col-end": V() }], "grid-rows": [{ "grid-rows": [I] }], "row-start-end": [{ row: ["auto", { span: [B, l] }, l] }], "row-start": [{ "row-start": V() }], "row-end": [{ "row-end": V() }], "grid-flow": [{ "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"] }], "auto-cols": [{ "auto-cols": ["auto", "min", "max", "fr", l] }], "auto-rows": [{ "auto-rows": ["auto", "min", "max", "fr", l] }], gap: [{ gap: [m] }], "gap-x": [{ "gap-x": [m] }], "gap-y": [{ "gap-y": [m] }], "justify-content": [{ justify: ["normal", ...H()] }], "justify-items": [{ "justify-items": ["start", "end", "center", "stretch"] }], "justify-self": [{ "justify-self": ["auto", "start", "end", "center", "stretch"] }], "align-content": [{ content: ["normal", ...H(), "baseline"] }], "align-items": [{ items: ["start", "end", "center", "baseline", "stretch"] }], "align-self": [{ self: ["auto", "start", "end", "center", "stretch", "baseline"] }], "place-content": [{ "place-content": [...H(), "baseline"] }], "place-items": [{ "place-items": ["start", "end", "center", "baseline", "stretch"] }], "place-self": [{ "place-self": ["auto", "start", "end", "center", "stretch"] }], p: [{ p: [C] }], px: [{ px: [C] }], py: [{ py: [C] }], ps: [{ ps: [C] }], pe: [{ pe: [C] }], pt: [{ pt: [C] }], pr: [{ pr: [C] }], pb: [{ pb: [C] }], pl: [{ pl: [C] }], m: [{ m: [p] }], mx: [{ mx: [p] }], my: [{ my: [p] }], ms: [{ ms: [p] }], me: [{ me: [p] }], mt: [{ mt: [p] }], mr: [{ mr: [p] }], mb: [{ mb: [p] }], ml: [{ ml: [p] }], "space-x": [{ "space-x": [Z2] }], "space-x-reverse": ["space-x-reverse"], "space-y": [{ "space-y": [Z2] }], "space-y-reverse": ["space-y-reverse"], w: [{ w: ["auto", "min", "max", "fit", "svw", "lvw", "dvw", l, r] }], "min-w": [{ "min-w": [l, r, "min", "max", "fit"] }], "max-w": [{ "max-w": [l, r, "none", "full", "min", "max", "fit", "prose", { screen: [A] }, A] }], h: [{ h: [l, r, "auto", "min", "max", "fit", "svh", "lvh", "dvh"] }], "min-h": [{ "min-h": [l, r, "min", "max", "fit", "svh", "lvh", "dvh"] }], "max-h": [{ "max-h": [l, r, "min", "max", "fit", "svh", "lvh", "dvh"] }], size: [{ size: [l, r, "auto", "min", "max", "fit"] }], "font-size": [{ text: ["base", A, R] }], "font-smoothing": ["antialiased", "subpixel-antialiased"], "font-style": ["italic", "not-italic"], "font-weight": [{ font: ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black", F] }], "font-family": [{ font: [I] }], "fvn-normal": ["normal-nums"], "fvn-ordinal": ["ordinal"], "fvn-slashed-zero": ["slashed-zero"], "fvn-figure": ["lining-nums", "oldstyle-nums"], "fvn-spacing": ["proportional-nums", "tabular-nums"], "fvn-fraction": ["diagonal-fractions", "stacked-fractions"], tracking: [{ tracking: ["tighter", "tight", "normal", "wide", "wider", "widest", l] }], "line-clamp": [{ "line-clamp": ["none", z, F] }], leading: [{ leading: ["none", "tight", "snug", "normal", "relaxed", "loose", S, l] }], "list-image": [{ "list-image": ["none", l] }], "list-style-type": [{ list: ["none", "disc", "decimal", l] }], "list-style-position": [{ list: ["inside", "outside"] }], "placeholder-color": [{ placeholder: [e2] }], "placeholder-opacity": [{ "placeholder-opacity": [x] }], "text-alignment": [{ text: ["left", "center", "right", "justify", "start", "end"] }], "text-color": [{ text: [e2] }], "text-opacity": [{ "text-opacity": [x] }], "text-decoration": ["underline", "overline", "line-through", "no-underline"], "text-decoration-style": [{ decoration: [...G2(), "wavy"] }], "text-decoration-thickness": [{ decoration: ["auto", "from-font", S, R] }], "underline-offset": [{ "underline-offset": ["auto", S, l] }], "text-decoration-color": [{ decoration: [e2] }], "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"], "text-overflow": ["truncate", "text-ellipsis", "text-clip"], "text-wrap": [{ text: ["wrap", "nowrap", "balance", "pretty"] }], indent: [{ indent: b() }], "vertical-align": [{ align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", l] }], whitespace: [{ whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"] }], break: [{ break: ["normal", "words", "all", "keep"] }], hyphens: [{ hyphens: ["none", "manual", "auto"] }], content: [{ content: ["none", l] }], "bg-attachment": [{ bg: ["fixed", "local", "scroll"] }], "bg-clip": [{ "bg-clip": ["border", "padding", "content", "text"] }], "bg-opacity": [{ "bg-opacity": [x] }], "bg-origin": [{ "bg-origin": ["border", "padding", "content"] }], "bg-position": [{ bg: [...J2(), De] }], "bg-repeat": [{ bg: ["no-repeat", { repeat: ["", "x", "y", "round", "space"] }] }], "bg-size": [{ bg: ["auto", "cover", "contain", $e] }], "bg-image": [{ bg: ["none", { "gradient-to": ["t", "tr", "r", "br", "b", "bl", "l", "tl"] }, Fe] }], "bg-color": [{ bg: [e2] }], "gradient-from-pos": [{ from: [w] }], "gradient-via-pos": [{ via: [w] }], "gradient-to-pos": [{ to: [w] }], "gradient-from": [{ from: [v2] }], "gradient-via": [{ via: [v2] }], "gradient-to": [{ to: [v2] }], rounded: [{ rounded: [n] }], "rounded-s": [{ "rounded-s": [n] }], "rounded-e": [{ "rounded-e": [n] }], "rounded-t": [{ "rounded-t": [n] }], "rounded-r": [{ "rounded-r": [n] }], "rounded-b": [{ "rounded-b": [n] }], "rounded-l": [{ "rounded-l": [n] }], "rounded-ss": [{ "rounded-ss": [n] }], "rounded-se": [{ "rounded-se": [n] }], "rounded-ee": [{ "rounded-ee": [n] }], "rounded-es": [{ "rounded-es": [n] }], "rounded-tl": [{ "rounded-tl": [n] }], "rounded-tr": [{ "rounded-tr": [n] }], "rounded-br": [{ "rounded-br": [n] }], "rounded-bl": [{ "rounded-bl": [n] }], "border-w": [{ border: [i] }], "border-w-x": [{ "border-x": [i] }], "border-w-y": [{ "border-y": [i] }], "border-w-s": [{ "border-s": [i] }], "border-w-e": [{ "border-e": [i] }], "border-w-t": [{ "border-t": [i] }], "border-w-r": [{ "border-r": [i] }], "border-w-b": [{ "border-b": [i] }], "border-w-l": [{ "border-l": [i] }], "border-opacity": [{ "border-opacity": [x] }], "border-style": [{ border: [...G2(), "hidden"] }], "divide-x": [{ "divide-x": [i] }], "divide-x-reverse": ["divide-x-reverse"], "divide-y": [{ "divide-y": [i] }], "divide-y-reverse": ["divide-y-reverse"], "divide-opacity": [{ "divide-opacity": [x] }], "divide-style": [{ divide: G2() }], "border-color": [{ border: [s] }], "border-color-x": [{ "border-x": [s] }], "border-color-y": [{ "border-y": [s] }], "border-color-s": [{ "border-s": [s] }], "border-color-e": [{ "border-e": [s] }], "border-color-t": [{ "border-t": [s] }], "border-color-r": [{ "border-r": [s] }], "border-color-b": [{ "border-b": [s] }], "border-color-l": [{ "border-l": [s] }], "divide-color": [{ divide: [s] }], "outline-style": [{ outline: ["", ...G2()] }], "outline-offset": [{ "outline-offset": [S, l] }], "outline-w": [{ outline: [S, R] }], "outline-color": [{ outline: [e2] }], "ring-w": [{ ring: Y2() }], "ring-w-inset": ["ring-inset"], "ring-color": [{ ring: [e2] }], "ring-opacity": [{ "ring-opacity": [x] }], "ring-offset-w": [{ "ring-offset": [S, R] }], "ring-offset-color": [{ "ring-offset": [e2] }], shadow: [{ shadow: ["", "inner", "none", A, Ue] }], "shadow-color": [{ shadow: [I] }], opacity: [{ opacity: [x] }], "mix-blend": [{ "mix-blend": [...X2(), "plus-lighter", "plus-darker"] }], "bg-blend": [{ "bg-blend": X2() }], filter: [{ filter: ["", "none"] }], blur: [{ blur: [t] }], brightness: [{ brightness: [o] }], contrast: [{ contrast: [d] }], "drop-shadow": [{ "drop-shadow": ["", "none", A, l] }], grayscale: [{ grayscale: [c] }], "hue-rotate": [{ "hue-rotate": [u] }], invert: [{ invert: [g] }], saturate: [{ saturate: [N2] }], sepia: [{ sepia: [L] }], "backdrop-filter": [{ "backdrop-filter": ["", "none"] }], "backdrop-blur": [{ "backdrop-blur": [t] }], "backdrop-brightness": [{ "backdrop-brightness": [o] }], "backdrop-contrast": [{ "backdrop-contrast": [d] }], "backdrop-grayscale": [{ "backdrop-grayscale": [c] }], "backdrop-hue-rotate": [{ "backdrop-hue-rotate": [u] }], "backdrop-invert": [{ "backdrop-invert": [g] }], "backdrop-opacity": [{ "backdrop-opacity": [x] }], "backdrop-saturate": [{ "backdrop-saturate": [N2] }], "backdrop-sepia": [{ "backdrop-sepia": [L] }], "border-collapse": [{ border: ["collapse", "separate"] }], "border-spacing": [{ "border-spacing": [a] }], "border-spacing-x": [{ "border-spacing-x": [a] }], "border-spacing-y": [{ "border-spacing-y": [a] }], "table-layout": [{ table: ["auto", "fixed"] }], caption: [{ caption: ["top", "bottom"] }], transition: [{ transition: ["none", "all", "", "colors", "opacity", "shadow", "transform", l] }], duration: [{ duration: k2() }], ease: [{ ease: ["linear", "in", "out", "in-out", l] }], delay: [{ delay: k2() }], animate: [{ animate: ["none", "spin", "ping", "pulse", "bounce", l] }], transform: [{ transform: ["", "gpu", "none"] }], scale: [{ scale: [P] }], "scale-x": [{ "scale-x": [P] }], "scale-y": [{ "scale-y": [P] }], rotate: [{ rotate: [B, l] }], "translate-x": [{ "translate-x": [q2] }], "translate-y": [{ "translate-y": [q2] }], "skew-x": [{ "skew-x": [K2] }], "skew-y": [{ "skew-y": [K2] }], "transform-origin": [{ origin: ["center", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left", "top-left", l] }], accent: [{ accent: ["auto", e2] }], appearance: [{ appearance: ["none", "auto"] }], cursor: [{ cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", l] }], "caret-color": [{ caret: [e2] }], "pointer-events": [{ "pointer-events": ["none", "auto"] }], resize: [{ resize: ["none", "y", "x", ""] }], "scroll-behavior": [{ scroll: ["auto", "smooth"] }], "scroll-m": [{ "scroll-m": b() }], "scroll-mx": [{ "scroll-mx": b() }], "scroll-my": [{ "scroll-my": b() }], "scroll-ms": [{ "scroll-ms": b() }], "scroll-me": [{ "scroll-me": b() }], "scroll-mt": [{ "scroll-mt": b() }], "scroll-mr": [{ "scroll-mr": b() }], "scroll-mb": [{ "scroll-mb": b() }], "scroll-ml": [{ "scroll-ml": b() }], "scroll-p": [{ "scroll-p": b() }], "scroll-px": [{ "scroll-px": b() }], "scroll-py": [{ "scroll-py": b() }], "scroll-ps": [{ "scroll-ps": b() }], "scroll-pe": [{ "scroll-pe": b() }], "scroll-pt": [{ "scroll-pt": b() }], "scroll-pr": [{ "scroll-pr": b() }], "scroll-pb": [{ "scroll-pb": b() }], "scroll-pl": [{ "scroll-pl": b() }], "snap-align": [{ snap: ["start", "end", "center", "align-none"] }], "snap-stop": [{ snap: ["normal", "always"] }], "snap-type": [{ snap: ["none", "x", "y", "both"] }], "snap-strictness": [{ snap: ["mandatory", "proximity"] }], touch: [{ touch: ["auto", "none", "manipulation"] }], "touch-x": [{ "touch-pan": ["x", "left", "right"] }], "touch-y": [{ "touch-pan": ["y", "up", "down"] }], "touch-pz": ["touch-pinch-zoom"], select: [{ select: ["none", "text", "all", "auto"] }], "will-change": [{ "will-change": ["auto", "scroll", "contents", "transform", l] }], fill: [{ fill: [e2, "none"] }], "stroke-w": [{ stroke: [S, R, F] }], stroke: [{ stroke: [e2, "none"] }], sr: ["sr-only", "not-sr-only"], "forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }] }, conflictingClassGroups: { overflow: ["overflow-x", "overflow-y"], overscroll: ["overscroll-x", "overscroll-y"], inset: ["inset-x", "inset-y", "start", "end", "top", "right", "bottom", "left"], "inset-x": ["right", "left"], "inset-y": ["top", "bottom"], flex: ["basis", "grow", "shrink"], gap: ["gap-x", "gap-y"], p: ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"], px: ["pr", "pl"], py: ["pt", "pb"], m: ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"], mx: ["mr", "ml"], my: ["mt", "mb"], size: ["w", "h"], "font-size": ["leading"], "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"], "fvn-ordinal": ["fvn-normal"], "fvn-slashed-zero": ["fvn-normal"], "fvn-figure": ["fvn-normal"], "fvn-spacing": ["fvn-normal"], "fvn-fraction": ["fvn-normal"], "line-clamp": ["display", "overflow"], rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"], "rounded-s": ["rounded-ss", "rounded-es"], "rounded-e": ["rounded-se", "rounded-ee"], "rounded-t": ["rounded-tl", "rounded-tr"], "rounded-r": ["rounded-tr", "rounded-br"], "rounded-b": ["rounded-br", "rounded-bl"], "rounded-l": ["rounded-tl", "rounded-bl"], "border-spacing": ["border-spacing-x", "border-spacing-y"], "border-w": ["border-w-s", "border-w-e", "border-w-t", "border-w-r", "border-w-b", "border-w-l"], "border-w-x": ["border-w-r", "border-w-l"], "border-w-y": ["border-w-t", "border-w-b"], "border-color": ["border-color-s", "border-color-e", "border-color-t", "border-color-r", "border-color-b", "border-color-l"], "border-color-x": ["border-color-r", "border-color-l"], "border-color-y": ["border-color-t", "border-color-b"], "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"], "scroll-mx": ["scroll-mr", "scroll-ml"], "scroll-my": ["scroll-mt", "scroll-mb"], "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"], "scroll-px": ["scroll-pr", "scroll-pl"], "scroll-py": ["scroll-pt", "scroll-pb"], touch: ["touch-x", "touch-y", "touch-pz"], "touch-x": ["touch"], "touch-y": ["touch"], "touch-pz": ["touch"] }, conflictingClassGroupModifiers: { "font-size": ["leading"] } };
  };
  var ae = Be(Ye);
  function _(...e2) {
    return ae(j(e2));
  }
  function le(e2, r) {
    if (typeof e2 == "function") return e2(r);
    e2 != null && (e2.current = r);
  }
  function ce(...e2) {
    return (r) => {
      let t = false, o = e2.map((s) => {
        let n = le(s, r);
        return !t && typeof n == "function" && (t = true), n;
      });
      if (t) return () => {
        for (let s = 0; s < o.length; s++) {
          let n = o[s];
          typeof n == "function" ? n() : le(e2[s], null);
        }
      };
    };
  }
  var Xe = /* @__PURE__ */ Symbol.for("react.lazy");
  var O = y[" use ".trim().toString()];
  function Qe(e2) {
    return typeof e2 == "object" && e2 !== null && "then" in e2;
  }
  function ue(e2) {
    return e2 != null && typeof e2 == "object" && "$$typeof" in e2 && e2.$$typeof === Xe && "_payload" in e2 && Qe(e2._payload);
  }
  function et(e2) {
    let r = tt(e2), t = y.forwardRef((o, s) => {
      let { children: n, ...a } = o;
      ue(n) && typeof O == "function" && (n = O(n._payload));
      let i = y.Children.toArray(n), d = i.find(ot);
      if (d) {
        let c = d.props.children, u = i.map((g) => g === d ? y.Children.count(c) > 1 ? y.Children.only(null) : y.isValidElement(c) ? c.props.children : null : g);
        return (0, import_jsx_runtime.jsx)(r, { ...a, ref: s, children: y.isValidElement(c) ? y.cloneElement(c, void 0, u) : null });
      }
      return (0, import_jsx_runtime.jsx)(r, { ...a, ref: s, children: n });
    });
    return t.displayName = `${e2}.Slot`, t;
  }
  var E = et("Slot");
  function tt(e2) {
    let r = y.forwardRef((t, o) => {
      let { children: s, ...n } = t;
      if (ue(s) && typeof O == "function" && (s = O(s._payload)), y.isValidElement(s)) {
        let a = st(s), i = nt(n, s.props);
        return s.type !== y.Fragment && (i.ref = o ? ce(o, a) : a), y.cloneElement(s, i);
      }
      return y.Children.count(s) > 1 ? y.Children.only(null) : null;
    });
    return r.displayName = `${e2}.SlotClone`, r;
  }
  var rt = /* @__PURE__ */ Symbol("radix.slottable");
  function ot(e2) {
    return y.isValidElement(e2) && typeof e2.type == "function" && "__radixId" in e2.type && e2.type.__radixId === rt;
  }
  function nt(e2, r) {
    let t = { ...r };
    for (let o in r) {
      let s = e2[o], n = r[o];
      /^on[A-Z]/.test(o) ? s && n ? t[o] = (...i) => {
        let d = n(...i);
        return s(...i), d;
      } : s && (t[o] = s) : o === "style" ? t[o] = { ...s, ...n } : o === "className" && (t[o] = [s, n].filter(Boolean).join(" "));
    }
    return { ...e2, ...t };
  }
  function st(e2) {
    let r = Object.getOwnPropertyDescriptor(e2.props, "ref")?.get, t = r && "isReactWarning" in r && r.isReactWarning;
    return t ? e2.ref : (r = Object.getOwnPropertyDescriptor(e2, "ref")?.get, t = r && "isReactWarning" in r && r.isReactWarning, t ? e2.props.ref : e2.props.ref || e2.ref);
  }
  var pe = (e2) => typeof e2 == "boolean" ? `${e2}` : e2 === 0 ? "0" : e2;
  var fe = j;
  var be = (e2, r) => (t) => {
    var o;
    if (r?.variants == null) return fe(e2, t?.class, t?.className);
    let { variants: s, defaultVariants: n } = r, a = Object.keys(s).map((c) => {
      let u = t?.[c], g = n?.[c];
      if (u === null) return null;
      let m = pe(u) || pe(g);
      return s[c][m];
    }), i = t && Object.entries(t).reduce((c, u) => {
      let [g, m] = u;
      return m === void 0 || (c[g] = m), c;
    }, {}), d = r == null || (o = r.compoundVariants) === null || o === void 0 ? void 0 : o.reduce((c, u) => {
      let { class: g, className: m, ...v2 } = u;
      return Object.entries(v2).every((w) => {
        let [h, p] = w;
        return Array.isArray(p) ? p.includes({ ...n, ...i }[h]) : { ...n, ...i }[h] === p;
      }) ? [...c, g, m] : c;
    }, []);
    return fe(e2, a, d, t?.class, t?.className);
  };
  var at = be("inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", { variants: { variant: { default: "border border-border bg-card text-card-foreground shadow-sm hover:bg-muted", primary: "bg-foreground text-background hover:bg-foreground/90", destructive: "bg-red-600 text-white hover:bg-red-700", outline: "border border-border bg-transparent text-textSecondary hover:bg-muted hover:text-textPrimary", secondary: "bg-secondary text-textPrimary hover:bg-secondary/80", ghost: "text-textSecondary hover:bg-muted hover:text-textPrimary", link: "text-textSecondary underline-offset-4 hover:underline hover:text-textPrimary", danger: "bg-destructive/10 text-destructive hover:bg-destructive/20", destructiveOutline: "border border-destructive/40 bg-card text-destructive shadow-sm hover:bg-destructive/5" }, size: { default: "h-10 px-4 py-2 rounded-full", sm: "h-8 px-3 text-xs rounded-full", lg: "h-11 px-6 rounded-full", icon: "h-9 w-9 rounded-lg", control: "h-8 px-4 rounded font-normal", controlIcon: "h-8 w-8 rounded" } }, defaultVariants: { variant: "default", size: "default" } });
  var ge = (0, import_react.forwardRef)(({ className: e2, variant: r, size: t, asChild: o = false, ...s }, n) => (0, import_jsx_runtime2.jsx)(o ? E : "button", { className: _(at({ variant: r, size: t, className: e2 })), ref: n, ...s }));
  ge.displayName = "Button";
  var ct = { primary: "border-ds-ink bg-ds-ink text-ds-page shadow-ds-control", secondary: "border-ds-hairline bg-ds-white text-ds-ink shadow-ds-control", ghost: "border-transparent bg-transparent text-ds-ink", destructive: "border-ds-redBorder bg-ds-white text-ds-red shadow-ds-control", success: "border-ds-teal bg-ds-white text-ds-teal shadow-ds-control" };
  function dt({ variant: e2 = "primary", compact: r = false, fullWidth: t = false, large: o = false, mobileLarge: s = false, className: n }) {
    return _("box-border inline-flex h-8 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded border font-text text-[13px] font-normal leading-none tracking-[-0.01em] transition-[background-color,border-color,color,transform] [transition-duration:120ms]", "hover:scale-105 active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ink4", "disabled:cursor-default disabled:scale-100 disabled:border-ds-hairline disabled:bg-transparent disabled:text-ds-ink4 disabled:shadow-none", r ? "px-3" : "px-3 md:px-4", t && "flex w-full hover:scale-[1.02]", o && "h-[52px] rounded-lg text-[15px]", s && "max-md:flex max-md:h-[52px] max-md:w-full max-md:rounded-lg max-md:text-[15px] max-md:hover:scale-[1.02]", ct[e2], n);
  }
  var he = (0, import_react2.forwardRef)(({ variant: e2, compact: r, fullWidth: t, large: o, mobileLarge: s, className: n, asChild: a = false, iconBefore: i, iconAfter: d, type: c = "button", children: u, ...g }, m) => {
    let v2 = dt({ variant: e2, compact: r, fullWidth: t, large: o, mobileLarge: s, className: n });
    return a ? (0, import_jsx_runtime3.jsx)(E, { ref: m, className: v2, ...g, children: u }) : (0, import_jsx_runtime3.jsxs)("button", { ref: m, type: c, className: v2, ...g, children: [i, u, d] });
  });
  he.displayName = "DsButton";
  var ye = (0, import_react2.forwardRef)(({ label: e2, className: r, asChild: t = false, type: o = "button", ...s }, n) => (0, import_jsx_runtime3.jsx)(t ? E : "button", { ref: n, type: t ? void 0 : o, "aria-label": e2, title: e2, className: _("inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded border-0 bg-transparent p-2 leading-none text-ds-ink transition-colors [transition-duration:120ms] hover:bg-ds-hover active:bg-ds-hoverStrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ink4 disabled:cursor-default disabled:bg-transparent disabled:text-ds-ink4 [&_svg]:h-4 [&_svg]:w-4", r), ...s }));
  ye.displayName = "DsIconButton";

  // ../../opt/files/kit/library.mjs
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react(), 1);
  var import_react5 = __toESM(require_react(), 1);
  var import_react6 = __toESM(require_react(), 1);
  var import_react7 = __toESM(require_react(), 1);
  var import_react8 = __toESM(require_react(), 1);
  var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
  var import_jsx_runtime5 = __toESM(require_jsx_runtime(), 1);
  var import_react9 = __toESM(require_react(), 1);
  var import_jsx_runtime6 = __toESM(require_jsx_runtime(), 1);
  var import_react10 = __toESM(require_react(), 1);
  var import_jsx_runtime7 = __toESM(require_jsx_runtime(), 1);
  var import_react11 = __toESM(require_react(), 1);
  var import_jsx_runtime8 = __toESM(require_jsx_runtime(), 1);
  var import_react12 = __toESM(require_react(), 1);
  var import_react13 = __toESM(require_react(), 1);
  var import_react14 = __toESM(require_react(), 1);
  var import_react15 = __toESM(require_react(), 1);
  var import_jsx_runtime9 = __toESM(require_jsx_runtime(), 1);
  var import_jsx_runtime10 = __toESM(require_jsx_runtime(), 1);
  var import_jsx_runtime11 = __toESM(require_jsx_runtime(), 1);
  var import_jsx_runtime12 = __toESM(require_jsx_runtime(), 1);
  var import_react16 = __toESM(require_react(), 1);
  var import_react17 = __toESM(require_react(), 1);
  var import_jsx_runtime13 = __toESM(require_jsx_runtime(), 1);
  var import_react18 = __toESM(require_react(), 1);
  var import_react19 = __toESM(require_react(), 1);
  var import_jsx_runtime14 = __toESM(require_jsx_runtime(), 1);
  var import_jsx_runtime15 = __toESM(require_jsx_runtime(), 1);
  var import_jsx_runtime16 = __toESM(require_jsx_runtime(), 1);
  var import_jsx_runtime17 = __toESM(require_jsx_runtime(), 1);
  var import_react20 = __toESM(require_react(), 1);
  var import_jsx_runtime18 = __toESM(require_jsx_runtime(), 1);
  var import_react21 = __toESM(require_react(), 1);
  var import_jsx_runtime19 = __toESM(require_jsx_runtime(), 1);
  var ru = Object.create;
  var sr = Object.defineProperty;
  var lu = Object.getOwnPropertyDescriptor;
  var uu = Object.getOwnPropertyNames;
  var su = Object.getPrototypeOf;
  var du = Object.prototype.hasOwnProperty;
  var fu = (e2, a) => () => (a || e2((a = { exports: {} }).exports, a), a.exports);
  var nu = (e2, a, t, o) => {
    if (a && typeof a == "object" || typeof a == "function") for (let r of uu(a)) !du.call(e2, r) && r !== t && sr(e2, r, { get: () => a[r], enumerable: !(o = lu(a, r)) || o.enumerable });
    return e2;
  };
  var dr = (e2, a, t) => (t = e2 != null ? ru(su(e2)) : {}, nu(a || !e2 || !e2.__esModule ? sr(t, "default", { value: e2, enumerable: true }) : t, e2));
  var Oo = fu((bm, ct2) => {
    (function() {
      "use strict";
      var e2 = {}.hasOwnProperty;
      function a() {
        for (var r = "", l2 = 0; l2 < arguments.length; l2++) {
          var u = arguments[l2];
          u && (r = o(r, t(u)));
        }
        return r;
      }
      function t(r) {
        if (typeof r == "string" || typeof r == "number") return r;
        if (typeof r != "object") return "";
        if (Array.isArray(r)) return a.apply(null, r);
        if (r.toString !== Object.prototype.toString && !r.toString.toString().includes("[native code]")) return r.toString();
        var l2 = "";
        for (var u in r) e2.call(r, u) && r[u] && (l2 = o(l2, u));
        return l2;
      }
      function o(r, l2) {
        return l2 ? r ? r + " " + l2 : r + l2 : r;
      }
      typeof ct2 < "u" && ct2.exports ? (a.default = a, ct2.exports = a) : typeof define == "function" && typeof define.amd == "object" && define.amd ? define("classnames", [], function() {
        return a;
      }) : window.classNames = a;
    })();
  });
  var Fa = (...e2) => e2.filter((a, t, o) => !!a && a.trim() !== "" && o.indexOf(a) === t).join(" ").trim();
  var fr = (e2) => e2.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  var nr = (e2) => e2.replace(/^([A-Z])|[\s-_]+(\w)/g, (a, t, o) => o ? o.toUpperCase() : t.toLowerCase());
  var yt = (e2) => {
    let a = nr(e2);
    return a.charAt(0).toUpperCase() + a.slice(1);
  };
  var ir = { xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  var cr = (e2) => {
    for (let a in e2) if (a.startsWith("aria-") || a === "role" || a === "title") return true;
    return false;
  };
  var mr = (0, import_react7.forwardRef)(({ color: e2 = "currentColor", size: a = 24, strokeWidth: t = 2, absoluteStrokeWidth: o, className: r = "", children: l2, iconNode: u, ...s }, d) => (0, import_react7.createElement)("svg", { ref: d, ...ir, width: a, height: a, stroke: e2, strokeWidth: o ? Number(t) * 24 / Number(a) : t, className: Fa("lucide", r), ...!l2 && !cr(s) && { "aria-hidden": "true" }, ...s }, [...u.map(([f2, i]) => (0, import_react7.createElement)(f2, i)), ...Array.isArray(l2) ? l2 : [l2]]));
  var De2 = (e2, a) => {
    let t = (0, import_react6.forwardRef)(({ className: o, ...r }, l2) => (0, import_react6.createElement)(mr, { ref: l2, iconNode: a, className: Fa(`lucide-${fr(yt(e2))}`, `lucide-${e2}`, o), ...r }));
    return t.displayName = yt(e2), t;
  };
  var xu = [["path", { d: "M7 7h10v10", key: "1tivn9" }], ["path", { d: "M7 17 17 7", key: "1vkiza" }]];
  var pe2 = De2("arrow-up-right", xu);
  var Lu = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
  var Qe2 = De2("check", Lu);
  var hu = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]];
  var oe2 = De2("loader-circle", hu);
  var wt = (e2) => (0, import_jsx_runtime4.jsx)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: e2 });
  var xr = wt((0, import_jsx_runtime4.jsx)("path", { d: "M6.25 6.25L17.75 17.75M17.75 6.25L6.25 17.75" }));
  var Ta = wt((0, import_jsx_runtime4.jsx)("path", { d: "M14.9998 20L7.70696 12.7071C7.31643 12.3166 7.31643 11.6834 7.70695 11.2929L14.9998 4" }));
  var qa = wt((0, import_jsx_runtime4.jsx)("path", { d: "M9 4L16.2929 11.2929C16.6834 11.6834 16.6834 12.3166 16.2929 12.7071L9 20" }));
  function Nu({ children: e2, width: a = "fluid", className: t, ...o }) {
    return (0, import_jsx_runtime8.jsx)("main", { ...o, className: t ? `file-card ${t}` : "file-card", "data-width": a, children: e2 });
  }
  function Le2(e2, a) {
    return e2 == null || a == null ? NaN : e2 < a ? -1 : e2 > a ? 1 : e2 >= a ? 0 : NaN;
  }
  function Bt(e2, a) {
    return e2 == null || a == null ? NaN : a < e2 ? -1 : a > e2 ? 1 : a >= e2 ? 0 : NaN;
  }
  function Va(e2) {
    let a, t, o;
    e2.length !== 2 ? (a = Le2, t = (s, d) => Le2(e2(s), d), o = (s, d) => e2(s) - d) : (a = e2 === Le2 || e2 === Bt ? e2 : ts, t = e2, o = e2);
    function r(s, d, f2 = 0, i = s.length) {
      if (f2 < i) {
        if (a(d, d) !== 0) return i;
        do {
          let c = f2 + i >>> 1;
          t(s[c], d) < 0 ? f2 = c + 1 : i = c;
        } while (f2 < i);
      }
      return f2;
    }
    function l2(s, d, f2 = 0, i = s.length) {
      if (f2 < i) {
        if (a(d, d) !== 0) return i;
        do {
          let c = f2 + i >>> 1;
          t(s[c], d) <= 0 ? f2 = c + 1 : i = c;
        } while (f2 < i);
      }
      return f2;
    }
    function u(s, d, f2 = 0, i = s.length) {
      let c = r(s, d, f2, i - 1);
      return c > f2 && o(s[c - 1], d) > -o(s[c], d) ? c - 1 : c;
    }
    return { left: r, center: u, right: l2 };
  }
  function ts() {
    return 0;
  }
  function Ft(e2) {
    return e2 === null ? NaN : +e2;
  }
  var Pr = Va(Le2);
  var vr = Pr.right;
  var os = Pr.left;
  var rs = Va(Ft).center;
  var qt = Math.sqrt(50);
  var Ot = Math.sqrt(10);
  var Nt = Math.sqrt(2);
  function Q(e2, a, t) {
    e2.prototype = a.prototype = t, t.constructor = e2;
  }
  function le2(e2, a) {
    var t = Object.create(e2.prototype);
    for (var o in a) t[o] = a[o];
    return t;
  }
  function Z() {
  }
  var ue2 = 0.7;
  var Ie2 = 1 / ue2;
  var qe2 = "\\s*([+-]?\\d+)\\s*";
  var la = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*";
  var $ = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*";
  var ds = /^#([0-9a-f]{3,8})$/;
  var fs = new RegExp(`^rgb\\(${qe2},${qe2},${qe2}\\)$`);
  var ns = new RegExp(`^rgb\\(${$},${$},${$}\\)$`);
  var is = new RegExp(`^rgba\\(${qe2},${qe2},${qe2},${la}\\)$`);
  var cs = new RegExp(`^rgba\\(${$},${$},${$},${la}\\)$`);
  var ps = new RegExp(`^hsl\\(${la},${$},${$}\\)$`);
  var ms = new RegExp(`^hsla\\(${la},${$},${$},${la}\\)$`);
  var Dr = { aliceblue: 15792383, antiquewhite: 16444375, aqua: 65535, aquamarine: 8388564, azure: 15794175, beige: 16119260, bisque: 16770244, black: 0, blanchedalmond: 16772045, blue: 255, blueviolet: 9055202, brown: 10824234, burlywood: 14596231, cadetblue: 6266528, chartreuse: 8388352, chocolate: 13789470, coral: 16744272, cornflowerblue: 6591981, cornsilk: 16775388, crimson: 14423100, cyan: 65535, darkblue: 139, darkcyan: 35723, darkgoldenrod: 12092939, darkgray: 11119017, darkgreen: 25600, darkgrey: 11119017, darkkhaki: 12433259, darkmagenta: 9109643, darkolivegreen: 5597999, darkorange: 16747520, darkorchid: 10040012, darkred: 9109504, darksalmon: 15308410, darkseagreen: 9419919, darkslateblue: 4734347, darkslategray: 3100495, darkslategrey: 3100495, darkturquoise: 52945, darkviolet: 9699539, deeppink: 16716947, deepskyblue: 49151, dimgray: 6908265, dimgrey: 6908265, dodgerblue: 2003199, firebrick: 11674146, floralwhite: 16775920, forestgreen: 2263842, fuchsia: 16711935, gainsboro: 14474460, ghostwhite: 16316671, gold: 16766720, goldenrod: 14329120, gray: 8421504, green: 32768, greenyellow: 11403055, grey: 8421504, honeydew: 15794160, hotpink: 16738740, indianred: 13458524, indigo: 4915330, ivory: 16777200, khaki: 15787660, lavender: 15132410, lavenderblush: 16773365, lawngreen: 8190976, lemonchiffon: 16775885, lightblue: 11393254, lightcoral: 15761536, lightcyan: 14745599, lightgoldenrodyellow: 16448210, lightgray: 13882323, lightgreen: 9498256, lightgrey: 13882323, lightpink: 16758465, lightsalmon: 16752762, lightseagreen: 2142890, lightskyblue: 8900346, lightslategray: 7833753, lightslategrey: 7833753, lightsteelblue: 11584734, lightyellow: 16777184, lime: 65280, limegreen: 3329330, linen: 16445670, magenta: 16711935, maroon: 8388608, mediumaquamarine: 6737322, mediumblue: 205, mediumorchid: 12211667, mediumpurple: 9662683, mediumseagreen: 3978097, mediumslateblue: 8087790, mediumspringgreen: 64154, mediumturquoise: 4772300, mediumvioletred: 13047173, midnightblue: 1644912, mintcream: 16121850, mistyrose: 16770273, moccasin: 16770229, navajowhite: 16768685, navy: 128, oldlace: 16643558, olive: 8421376, olivedrab: 7048739, orange: 16753920, orangered: 16729344, orchid: 14315734, palegoldenrod: 15657130, palegreen: 10025880, paleturquoise: 11529966, palevioletred: 14381203, papayawhip: 16773077, peachpuff: 16767673, peru: 13468991, pink: 16761035, plum: 14524637, powderblue: 11591910, purple: 8388736, rebeccapurple: 6697881, red: 16711680, rosybrown: 12357519, royalblue: 4286945, saddlebrown: 9127187, salmon: 16416882, sandybrown: 16032864, seagreen: 3050327, seashell: 16774638, sienna: 10506797, silver: 12632256, skyblue: 8900331, slateblue: 6970061, slategray: 7372944, slategrey: 7372944, snow: 16775930, springgreen: 65407, steelblue: 4620980, tan: 13808780, teal: 32896, thistle: 14204888, tomato: 16737095, turquoise: 4251856, violet: 15631086, wheat: 16113331, white: 16777215, whitesmoke: 16119285, yellow: 16776960, yellowgreen: 10145074 };
  Q(Z, se2, { copy(e2) {
    return Object.assign(new this.constructor(), this, e2);
  }, displayable() {
    return this.rgb().displayable();
  }, hex: Rr, formatHex: Rr, formatHex8: xs, formatHsl: Ls, formatRgb: Br, toString: Br });
  function Rr() {
    return this.rgb().formatHex();
  }
  function xs() {
    return this.rgb().formatHex8();
  }
  function Ls() {
    return Hr(this).formatHsl();
  }
  function Br() {
    return this.rgb().formatRgb();
  }
  function se2(e2) {
    var a, t;
    return e2 = (e2 + "").trim().toLowerCase(), (a = ds.exec(e2)) ? (t = a[1].length, a = parseInt(a[1], 16), t === 6 ? Fr(a) : t === 3 ? new T(a >> 8 & 15 | a >> 4 & 240, a >> 4 & 15 | a & 240, (a & 15) << 4 | a & 15, 1) : t === 8 ? Xa(a >> 24 & 255, a >> 16 & 255, a >> 8 & 255, (a & 255) / 255) : t === 4 ? Xa(a >> 12 & 15 | a >> 8 & 240, a >> 8 & 15 | a >> 4 & 240, a >> 4 & 15 | a & 240, ((a & 15) << 4 | a & 15) / 255) : null) : (a = fs.exec(e2)) ? new T(a[1], a[2], a[3], 1) : (a = ns.exec(e2)) ? new T(a[1] * 255 / 100, a[2] * 255 / 100, a[3] * 255 / 100, 1) : (a = is.exec(e2)) ? Xa(a[1], a[2], a[3], a[4]) : (a = cs.exec(e2)) ? Xa(a[1] * 255 / 100, a[2] * 255 / 100, a[3] * 255 / 100, a[4]) : (a = ps.exec(e2)) ? Or(a[1], a[2] / 100, a[3] / 100, 1) : (a = ms.exec(e2)) ? Or(a[1], a[2] / 100, a[3] / 100, a[4]) : Dr.hasOwnProperty(e2) ? Fr(Dr[e2]) : e2 === "transparent" ? new T(NaN, NaN, NaN, 0) : null;
  }
  function Fr(e2) {
    return new T(e2 >> 16 & 255, e2 >> 8 & 255, e2 & 255, 1);
  }
  function Xa(e2, a, t, o) {
    return o <= 0 && (e2 = a = t = NaN), new T(e2, a, t, o);
  }
  function ua(e2) {
    return e2 instanceof Z || (e2 = se2(e2)), e2 ? (e2 = e2.rgb(), new T(e2.r, e2.g, e2.b, e2.opacity)) : new T();
  }
  function Oe2(e2, a, t, o) {
    return arguments.length === 1 ? ua(e2) : new T(e2, a, t, o ?? 1);
  }
  function T(e2, a, t, o) {
    this.r = +e2, this.g = +a, this.b = +t, this.opacity = +o;
  }
  Q(T, Oe2, le2(Z, { brighter(e2) {
    return e2 = e2 == null ? Ie2 : Math.pow(Ie2, e2), new T(this.r * e2, this.g * e2, this.b * e2, this.opacity);
  }, darker(e2) {
    return e2 = e2 == null ? ue2 : Math.pow(ue2, e2), new T(this.r * e2, this.g * e2, this.b * e2, this.opacity);
  }, rgb() {
    return this;
  }, clamp() {
    return new T(ge2(this.r), ge2(this.g), ge2(this.b), Za(this.opacity));
  }, displayable() {
    return -0.5 <= this.r && this.r < 255.5 && -0.5 <= this.g && this.g < 255.5 && -0.5 <= this.b && this.b < 255.5 && 0 <= this.opacity && this.opacity <= 1;
  }, hex: Tr, formatHex: Tr, formatHex8: hs, formatRgb: qr, toString: qr }));
  function Tr() {
    return `#${he2(this.r)}${he2(this.g)}${he2(this.b)}`;
  }
  function hs() {
    return `#${he2(this.r)}${he2(this.g)}${he2(this.b)}${he2((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
  }
  function qr() {
    let e2 = Za(this.opacity);
    return `${e2 === 1 ? "rgb(" : "rgba("}${ge2(this.r)}, ${ge2(this.g)}, ${ge2(this.b)}${e2 === 1 ? ")" : `, ${e2})`}`;
  }
  function Za(e2) {
    return isNaN(e2) ? 1 : Math.max(0, Math.min(1, e2));
  }
  function ge2(e2) {
    return Math.max(0, Math.min(255, Math.round(e2) || 0));
  }
  function he2(e2) {
    return e2 = ge2(e2), (e2 < 16 ? "0" : "") + e2.toString(16);
  }
  function Or(e2, a, t, o) {
    return o <= 0 ? e2 = a = t = NaN : t <= 0 || t >= 1 ? e2 = a = NaN : a <= 0 && (e2 = NaN), new G(e2, a, t, o);
  }
  function Hr(e2) {
    if (e2 instanceof G) return new G(e2.h, e2.s, e2.l, e2.opacity);
    if (e2 instanceof Z || (e2 = se2(e2)), !e2) return new G();
    if (e2 instanceof G) return e2;
    e2 = e2.rgb();
    var a = e2.r / 255, t = e2.g / 255, o = e2.b / 255, r = Math.min(a, t, o), l2 = Math.max(a, t, o), u = NaN, s = l2 - r, d = (l2 + r) / 2;
    return s ? (a === l2 ? u = (t - o) / s + (t < o) * 6 : t === l2 ? u = (o - a) / s + 2 : u = (a - t) / s + 4, s /= d < 0.5 ? l2 + r : 2 - l2 - r, u *= 60) : s = d > 0 && d < 1 ? 0 : u, new G(u, s, d, e2.opacity);
  }
  function sa(e2, a, t, o) {
    return arguments.length === 1 ? Hr(e2) : new G(e2, a, t, o ?? 1);
  }
  function G(e2, a, t, o) {
    this.h = +e2, this.s = +a, this.l = +t, this.opacity = +o;
  }
  Q(G, sa, le2(Z, { brighter(e2) {
    return e2 = e2 == null ? Ie2 : Math.pow(Ie2, e2), new G(this.h, this.s, this.l * e2, this.opacity);
  }, darker(e2) {
    return e2 = e2 == null ? ue2 : Math.pow(ue2, e2), new G(this.h, this.s, this.l * e2, this.opacity);
  }, rgb() {
    var e2 = this.h % 360 + (this.h < 0) * 360, a = isNaN(e2) || isNaN(this.s) ? 0 : this.s, t = this.l, o = t + (t < 0.5 ? t : 1 - t) * a, r = 2 * t - o;
    return new T(Ut(e2 >= 240 ? e2 - 240 : e2 + 120, r, o), Ut(e2, r, o), Ut(e2 < 120 ? e2 + 240 : e2 - 120, r, o), this.opacity);
  }, clamp() {
    return new G(Nr(this.h), $a(this.s), $a(this.l), Za(this.opacity));
  }, displayable() {
    return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && 0 <= this.l && this.l <= 1 && 0 <= this.opacity && this.opacity <= 1;
  }, formatHsl() {
    let e2 = Za(this.opacity);
    return `${e2 === 1 ? "hsl(" : "hsla("}${Nr(this.h)}, ${$a(this.s) * 100}%, ${$a(this.l) * 100}%${e2 === 1 ? ")" : `, ${e2})`}`;
  } }));
  function Nr(e2) {
    return e2 = (e2 || 0) % 360, e2 < 0 ? e2 + 360 : e2;
  }
  function $a(e2) {
    return Math.max(0, Math.min(1, e2 || 0));
  }
  function Ut(e2, a, t) {
    return (e2 < 60 ? a + (t - a) * e2 / 60 : e2 < 180 ? t : e2 < 240 ? a + (t - a) * (240 - e2) / 60 : a) * 255;
  }
  var Ka = Math.PI / 180;
  var _a = 180 / Math.PI;
  var Ya = 18;
  var Ur = 0.96422;
  var Vr = 1;
  var Er = 0.82521;
  var Wr = 4 / 29;
  var Ne2 = 6 / 29;
  var Gr = 3 * Ne2 * Ne2;
  var gs = Ne2 * Ne2 * Ne2;
  function zr(e2) {
    if (e2 instanceof K) return new K(e2.l, e2.a, e2.b, e2.opacity);
    if (e2 instanceof J) return Xr(e2);
    e2 instanceof T || (e2 = ua(e2));
    var a = Gt(e2.r), t = Gt(e2.g), o = Gt(e2.b), r = Vt((0.2225045 * a + 0.7168786 * t + 0.0606169 * o) / Vr), l2, u;
    return a === t && t === o ? l2 = u = r : (l2 = Vt((0.4360747 * a + 0.3850649 * t + 0.1430804 * o) / Ur), u = Vt((0.0139322 * a + 0.0971045 * t + 0.7141733 * o) / Er)), new K(116 * r - 16, 500 * (l2 - r), 200 * (r - u), e2.opacity);
  }
  function He2(e2, a, t, o) {
    return arguments.length === 1 ? zr(e2) : new K(e2, a, t, o ?? 1);
  }
  function K(e2, a, t, o) {
    this.l = +e2, this.a = +a, this.b = +t, this.opacity = +o;
  }
  Q(K, He2, le2(Z, { brighter(e2) {
    return new K(this.l + Ya * (e2 ?? 1), this.a, this.b, this.opacity);
  }, darker(e2) {
    return new K(this.l - Ya * (e2 ?? 1), this.a, this.b, this.opacity);
  }, rgb() {
    var e2 = (this.l + 16) / 116, a = isNaN(this.a) ? e2 : e2 + this.a / 500, t = isNaN(this.b) ? e2 : e2 - this.b / 200;
    return a = Ur * Et(a), e2 = Vr * Et(e2), t = Er * Et(t), new T(Wt(3.1338561 * a - 1.6168667 * e2 - 0.4906146 * t), Wt(-0.9787684 * a + 1.9161415 * e2 + 0.033454 * t), Wt(0.0719453 * a - 0.2289914 * e2 + 1.4052427 * t), this.opacity);
  } }));
  function Vt(e2) {
    return e2 > gs ? Math.pow(e2, 1 / 3) : e2 / Gr + Wr;
  }
  function Et(e2) {
    return e2 > Ne2 ? e2 * e2 * e2 : Gr * (e2 - Wr);
  }
  function Wt(e2) {
    return 255 * (e2 <= 31308e-7 ? 12.92 * e2 : 1.055 * Math.pow(e2, 1 / 2.4) - 0.055);
  }
  function Gt(e2) {
    return (e2 /= 255) <= 0.04045 ? e2 / 12.92 : Math.pow((e2 + 0.055) / 1.055, 2.4);
  }
  function Is(e2) {
    if (e2 instanceof J) return new J(e2.h, e2.c, e2.l, e2.opacity);
    if (e2 instanceof K || (e2 = zr(e2)), e2.a === 0 && e2.b === 0) return new J(NaN, 0 < e2.l && e2.l < 100 ? 0 : NaN, e2.l, e2.opacity);
    var a = Math.atan2(e2.b, e2.a) * _a;
    return new J(a < 0 ? a + 360 : a, Math.sqrt(e2.a * e2.a + e2.b * e2.b), e2.l, e2.opacity);
  }
  function da(e2, a, t, o) {
    return arguments.length === 1 ? Is(e2) : new J(e2, a, t, o ?? 1);
  }
  function J(e2, a, t, o) {
    this.h = +e2, this.c = +a, this.l = +t, this.opacity = +o;
  }
  function Xr(e2) {
    if (isNaN(e2.h)) return new K(e2.l, 0, 0, e2.opacity);
    var a = e2.h * Ka;
    return new K(e2.l, Math.cos(a) * e2.c, Math.sin(a) * e2.c, e2.opacity);
  }
  Q(J, da, le2(Z, { brighter(e2) {
    return new J(this.h, this.c, this.l + Ya * (e2 ?? 1), this.opacity);
  }, darker(e2) {
    return new J(this.h, this.c, this.l - Ya * (e2 ?? 1), this.opacity);
  }, rgb() {
    return Xr(this).rgb();
  } }));
  var _r = -0.14861;
  var zt = 1.78277;
  var Xt = -0.29227;
  var ja = -0.90649;
  var fa = 1.97294;
  var $r = fa * ja;
  var Zr = fa * zt;
  var Kr = zt * Xt - ja * _r;
  function Cs(e2) {
    if (e2 instanceof Ce2) return new Ce2(e2.h, e2.s, e2.l, e2.opacity);
    e2 instanceof T || (e2 = ua(e2));
    var a = e2.r / 255, t = e2.g / 255, o = e2.b / 255, r = (Kr * o + $r * a - Zr * t) / (Kr + $r - Zr), l2 = o - r, u = (fa * (t - r) - Xt * l2) / ja, s = Math.sqrt(u * u + l2 * l2) / (fa * r * (1 - r)), d = s ? Math.atan2(u, l2) * _a - 120 : NaN;
    return new Ce2(d < 0 ? d + 360 : d, s, r, e2.opacity);
  }
  function Ue2(e2, a, t, o) {
    return arguments.length === 1 ? Cs(e2) : new Ce2(e2, a, t, o ?? 1);
  }
  function Ce2(e2, a, t, o) {
    this.h = +e2, this.s = +a, this.l = +t, this.opacity = +o;
  }
  Q(Ce2, Ue2, le2(Z, { brighter(e2) {
    return e2 = e2 == null ? Ie2 : Math.pow(Ie2, e2), new Ce2(this.h, this.s, this.l * e2, this.opacity);
  }, darker(e2) {
    return e2 = e2 == null ? ue2 : Math.pow(ue2, e2), new Ce2(this.h, this.s, this.l * e2, this.opacity);
  }, rgb() {
    var e2 = isNaN(this.h) ? 0 : (this.h + 120) * Ka, a = +this.l, t = isNaN(this.s) ? 0 : this.s * a * (1 - a), o = Math.cos(e2), r = Math.sin(e2);
    return new T(255 * (a + t * (_r * o + zt * r)), 255 * (a + t * (Xt * o + ja * r)), 255 * (a + t * (fa * o)), this.opacity);
  } }));
  function $t(e2, a, t, o, r) {
    var l2 = e2 * e2, u = l2 * e2;
    return ((1 - 3 * e2 + 3 * l2 - u) * a + (4 - 6 * l2 + 3 * u) * t + (1 + 3 * e2 + 3 * l2 - 3 * u) * o + u * r) / 6;
  }
  function Yr(e2) {
    var a = e2.length - 1;
    return function(t) {
      var o = t <= 0 ? t = 0 : t >= 1 ? (t = 1, a - 1) : Math.floor(t * a), r = e2[o], l2 = e2[o + 1], u = o > 0 ? e2[o - 1] : 2 * r - l2, s = o < a - 1 ? e2[o + 2] : 2 * l2 - r;
      return $t((t - o / a) * a, u, r, l2, s);
    };
  }
  function jr(e2) {
    var a = e2.length;
    return function(t) {
      var o = Math.floor(((t %= 1) < 0 ? ++t : t) * a), r = e2[(o + a - 1) % a], l2 = e2[o % a], u = e2[(o + 1) % a], s = e2[(o + 2) % a];
      return $t((t - o / a) * a, r, l2, u, s);
    };
  }
  var Ve2 = (e2) => () => e2;
  function Qr(e2, a) {
    return function(t) {
      return e2 + t * a;
    };
  }
  function Ss(e2, a, t) {
    return e2 = Math.pow(e2, t), a = Math.pow(a, t) - e2, t = 1 / t, function(o) {
      return Math.pow(e2 + o * a, t);
    };
  }
  function Ee2(e2, a) {
    var t = a - e2;
    return t ? Qr(e2, t > 180 || t < -180 ? t - 360 * Math.round(t / 360) : t) : Ve2(isNaN(e2) ? a : e2);
  }
  function Jr(e2) {
    return (e2 = +e2) == 1 ? R2 : function(a, t) {
      return t - a ? Ss(a, t, e2) : Ve2(isNaN(a) ? t : a);
    };
  }
  function R2(e2, a) {
    var t = a - e2;
    return t ? Qr(e2, t) : Ve2(isNaN(e2) ? a : e2);
  }
  var We2 = (function e(a) {
    var t = Jr(a);
    function o(r, l2) {
      var u = t((r = Oe2(r)).r, (l2 = Oe2(l2)).r), s = t(r.g, l2.g), d = t(r.b, l2.b), f2 = R2(r.opacity, l2.opacity);
      return function(i) {
        return r.r = u(i), r.g = s(i), r.b = d(i), r.opacity = f2(i), r + "";
      };
    }
    return o.gamma = e, o;
  })(1);
  function el(e2) {
    return function(a) {
      var t = a.length, o = new Array(t), r = new Array(t), l2 = new Array(t), u, s;
      for (u = 0; u < t; ++u) s = Oe2(a[u]), o[u] = s.r || 0, r[u] = s.g || 0, l2[u] = s.b || 0;
      return o = e2(o), r = e2(r), l2 = e2(l2), s.opacity = 1, function(d) {
        return s.r = o(d), s.g = r(d), s.b = l2(d), s + "";
      };
    };
  }
  var bs = el(Yr);
  var ys = el(jr);
  var Kt = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g;
  var Zt = new RegExp(Kt.source, "g");
  function na(e2, a) {
    return e2 = +e2, a = +a, function(t) {
      return Math.round(e2 * (1 - t) + a * t);
    };
  }
  function sl(e2) {
    return function(a, t) {
      var o = e2((a = sa(a)).h, (t = sa(t)).h), r = R2(a.s, t.s), l2 = R2(a.l, t.l), u = R2(a.opacity, t.opacity);
      return function(s) {
        return a.h = o(s), a.s = r(s), a.l = l2(s), a.opacity = u(s), a + "";
      };
    };
  }
  var _t = sl(Ee2);
  var Yt = sl(R2);
  function Qa(e2, a) {
    var t = R2((e2 = He2(e2)).l, (a = He2(a)).l), o = R2(e2.a, a.a), r = R2(e2.b, a.b), l2 = R2(e2.opacity, a.opacity);
    return function(u) {
      return e2.l = t(u), e2.a = o(u), e2.b = r(u), e2.opacity = l2(u), e2 + "";
    };
  }
  function dl(e2) {
    return function(a, t) {
      var o = e2((a = da(a)).h, (t = da(t)).h), r = R2(a.c, t.c), l2 = R2(a.l, t.l), u = R2(a.opacity, t.opacity);
      return function(s) {
        return a.h = o(s), a.c = r(s), a.l = l2(s), a.opacity = u(s), a + "";
      };
    };
  }
  var jt = dl(Ee2);
  var Qt = dl(R2);
  function fl(e2) {
    return (function a(t) {
      t = +t;
      function o(r, l2) {
        var u = e2((r = Ue2(r)).h, (l2 = Ue2(l2)).h), s = R2(r.s, l2.s), d = R2(r.l, l2.l), f2 = R2(r.opacity, l2.opacity);
        return function(i) {
          return r.h = u(i), r.s = s(i), r.l = d(Math.pow(i, t)), r.opacity = f2(i), r + "";
        };
      }
      return o.gamma = a, o;
    })(1);
  }
  var Jt = fl(Ee2);
  var eo = fl(R2);
  function cl(e2) {
    return Math.abs(e2 = Math.round(e2)) >= 1e21 ? e2.toLocaleString("en").replace(/,/g, "") : e2.toString(10);
  }
  function be2(e2, a) {
    if ((t = (e2 = a ? e2.toExponential(a - 1) : e2.toExponential()).indexOf("e")) < 0) return null;
    var t, o = e2.slice(0, t);
    return [o.length > 1 ? o[0] + o.slice(2) : o, +e2.slice(t + 1)];
  }
  function _2(e2) {
    return e2 = be2(Math.abs(e2)), e2 ? e2[1] : NaN;
  }
  function pl(e2, a) {
    return function(t, o) {
      for (var r = t.length, l2 = [], u = 0, s = e2[0], d = 0; r > 0 && s > 0 && (d + s + 1 > o && (s = Math.max(1, o - d)), l2.push(t.substring(r -= s, r + s)), !((d += s + 1) > o)); ) s = e2[u = (u + 1) % e2.length];
      return l2.reverse().join(a);
    };
  }
  function ml(e2) {
    return function(a) {
      return a.replace(/[0-9]/g, function(t) {
        return e2[+t];
      });
    };
  }
  var Ds = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;
  function fe2(e2) {
    if (!(a = Ds.exec(e2))) throw new Error("invalid format: " + e2);
    var a;
    return new Ja({ fill: a[1], align: a[2], sign: a[3], symbol: a[4], zero: a[5], width: a[6], comma: a[7], precision: a[8] && a[8].slice(1), trim: a[9], type: a[10] });
  }
  fe2.prototype = Ja.prototype;
  function Ja(e2) {
    this.fill = e2.fill === void 0 ? " " : e2.fill + "", this.align = e2.align === void 0 ? ">" : e2.align + "", this.sign = e2.sign === void 0 ? "-" : e2.sign + "", this.symbol = e2.symbol === void 0 ? "" : e2.symbol + "", this.zero = !!e2.zero, this.width = e2.width === void 0 ? void 0 : +e2.width, this.comma = !!e2.comma, this.precision = e2.precision === void 0 ? void 0 : +e2.precision, this.trim = !!e2.trim, this.type = e2.type === void 0 ? "" : e2.type + "";
  }
  Ja.prototype.toString = function() {
    return this.fill + this.align + this.sign + this.symbol + (this.zero ? "0" : "") + (this.width === void 0 ? "" : Math.max(1, this.width | 0)) + (this.comma ? "," : "") + (this.precision === void 0 ? "" : "." + Math.max(0, this.precision | 0)) + (this.trim ? "~" : "") + this.type;
  };
  function xl(e2) {
    e: for (var a = e2.length, t = 1, o = -1, r; t < a; ++t) switch (e2[t]) {
      case ".":
        o = r = t;
        break;
      case "0":
        o === 0 && (o = t), r = t;
        break;
      default:
        if (!+e2[t]) break e;
        o > 0 && (o = 0);
        break;
    }
    return o > 0 ? e2.slice(0, o) + e2.slice(r + 1) : e2;
  }
  var lo;
  function Ll(e2, a) {
    var t = be2(e2, a);
    if (!t) return e2 + "";
    var o = t[0], r = t[1], l2 = r - (lo = Math.max(-8, Math.min(8, Math.floor(r / 3))) * 3) + 1, u = o.length;
    return l2 === u ? o : l2 > u ? o + new Array(l2 - u + 1).join("0") : l2 > 0 ? o.slice(0, l2) + "." + o.slice(l2) : "0." + new Array(1 - l2).join("0") + be2(e2, Math.max(0, a + l2 - 1))[0];
  }
  function uo(e2, a) {
    var t = be2(e2, a);
    if (!t) return e2 + "";
    var o = t[0], r = t[1];
    return r < 0 ? "0." + new Array(-r).join("0") + o : o.length > r + 1 ? o.slice(0, r + 1) + "." + o.slice(r + 1) : o + new Array(r - o.length + 2).join("0");
  }
  var so = { "%": (e2, a) => (e2 * 100).toFixed(a), b: (e2) => Math.round(e2).toString(2), c: (e2) => e2 + "", d: cl, e: (e2, a) => e2.toExponential(a), f: (e2, a) => e2.toFixed(a), g: (e2, a) => e2.toPrecision(a), o: (e2) => Math.round(e2).toString(8), p: (e2, a) => uo(e2 * 100, a), r: uo, s: Ll, X: (e2) => Math.round(e2).toString(16).toUpperCase(), x: (e2) => Math.round(e2).toString(16) };
  function fo(e2) {
    return e2;
  }
  var hl = Array.prototype.map;
  var gl = ["y", "z", "a", "f", "p", "n", "\xB5", "m", "", "k", "M", "G", "T", "P", "E", "Z", "Y"];
  function Il(e2) {
    var a = e2.grouping === void 0 || e2.thousands === void 0 ? fo : pl(hl.call(e2.grouping, Number), e2.thousands + ""), t = e2.currency === void 0 ? "" : e2.currency[0] + "", o = e2.currency === void 0 ? "" : e2.currency[1] + "", r = e2.decimal === void 0 ? "." : e2.decimal + "", l2 = e2.numerals === void 0 ? fo : ml(hl.call(e2.numerals, String)), u = e2.percent === void 0 ? "%" : e2.percent + "", s = e2.minus === void 0 ? "\u2212" : e2.minus + "", d = e2.nan === void 0 ? "NaN" : e2.nan + "";
    function f2(c) {
      c = fe2(c);
      var n = c.fill, p = c.align, x = c.sign, m = c.symbol, C = c.zero, y2 = c.width, P = c.comma, g = c.precision, M2 = c.trim, L = c.type;
      L === "n" ? (P = true, L = "g") : so[L] || (g === void 0 && (g = 12), M2 = true, L = "g"), (C || n === "0" && p === "=") && (C = true, n = "0", p = "=");
      var h = m === "$" ? t : m === "#" && /[boxX]/.test(L) ? "0" + L.toLowerCase() : "", b = m === "$" ? o : /[%p]/.test(L) ? u : "", F2 = so[L], U2 = /[defgprs%]/.test(L);
      g = g === void 0 ? 6 : /[gprs]/.test(L) ? Math.max(1, Math.min(21, g)) : Math.max(0, Math.min(20, g));
      function te2(w) {
        var ce2 = h, V = b, Ae2, ur, va;
        if (L === "c") V = F2(w) + V, w = "";
        else {
          w = +w;
          var Ma = w < 0 || 1 / w < 0;
          if (w = isNaN(w) ? d : F2(Math.abs(w), g), M2 && (w = xl(w)), Ma && +w == 0 && x !== "+" && (Ma = false), ce2 = (Ma ? x === "(" ? x : s : x === "-" || x === "(" ? "" : x) + ce2, V = (L === "s" ? gl[8 + lo / 3] : "") + V + (Ma && x === "(" ? ")" : ""), U2) {
            for (Ae2 = -1, ur = w.length; ++Ae2 < ur; ) if (va = w.charCodeAt(Ae2), 48 > va || va > 57) {
              V = (va === 46 ? r + w.slice(Ae2 + 1) : w.slice(Ae2)) + V, w = w.slice(0, Ae2);
              break;
            }
          }
        }
        P && !C && (w = a(w, 1 / 0));
        var Aa = ce2.length + w.length + V.length, j2 = Aa < y2 ? new Array(y2 - Aa + 1).join(n) : "";
        switch (P && C && (w = a(j2 + w, j2.length ? y2 - V.length : 1 / 0), j2 = ""), p) {
          case "<":
            w = ce2 + w + V + j2;
            break;
          case "=":
            w = ce2 + j2 + w + V;
            break;
          case "^":
            w = j2.slice(0, Aa = j2.length >> 1) + ce2 + w + V + j2.slice(Aa);
            break;
          default:
            w = j2 + ce2 + w + V;
            break;
        }
        return l2(w);
      }
      return te2.toString = function() {
        return c + "";
      }, te2;
    }
    function i(c, n) {
      var p = f2((c = fe2(c), c.type = "f", c)), x = Math.max(-8, Math.min(8, Math.floor(_2(n) / 3))) * 3, m = Math.pow(10, -x), C = gl[8 + x / 3];
      return function(y2) {
        return p(m * y2) + C;
      };
    }
    return { format: f2, formatPrefix: i };
  }
  var et2;
  var at2;
  var tt2;
  no({ thousands: ",", grouping: [3], currency: ["$", ""] });
  function no(e2) {
    return et2 = Il(e2), at2 = et2.format, tt2 = et2.formatPrefix, et2;
  }
  var xo = /* @__PURE__ */ new Date();
  var Lo = /* @__PURE__ */ new Date();
  function B2(e2, a, t, o) {
    function r(l2) {
      return e2(l2 = arguments.length === 0 ? /* @__PURE__ */ new Date() : /* @__PURE__ */ new Date(+l2)), l2;
    }
    return r.floor = (l2) => (e2(l2 = /* @__PURE__ */ new Date(+l2)), l2), r.ceil = (l2) => (e2(l2 = new Date(l2 - 1)), a(l2, 1), e2(l2), l2), r.round = (l2) => {
      let u = r(l2), s = r.ceil(l2);
      return l2 - u < s - l2 ? u : s;
    }, r.offset = (l2, u) => (a(l2 = /* @__PURE__ */ new Date(+l2), u == null ? 1 : Math.floor(u)), l2), r.range = (l2, u, s) => {
      let d = [];
      if (l2 = r.ceil(l2), s = s == null ? 1 : Math.floor(s), !(l2 < u) || !(s > 0)) return d;
      let f2;
      do
        d.push(f2 = /* @__PURE__ */ new Date(+l2)), a(l2, s), e2(l2);
      while (f2 < l2 && l2 < u);
      return d;
    }, r.filter = (l2) => B2((u) => {
      if (u >= u) for (; e2(u), !l2(u); ) u.setTime(u - 1);
    }, (u, s) => {
      if (u >= u) if (s < 0) for (; ++s <= 0; ) for (; a(u, -1), !l2(u); ) ;
      else for (; --s >= 0; ) for (; a(u, 1), !l2(u); ) ;
    }), t && (r.count = (l2, u) => (xo.setTime(+l2), Lo.setTime(+u), e2(xo), e2(Lo), Math.floor(t(xo, Lo))), r.every = (l2) => (l2 = Math.floor(l2), !isFinite(l2) || !(l2 > 0) ? null : l2 > 1 ? r.filter(o ? (u) => o(u) % l2 === 0 : (u) => r.count(0, u) % l2 === 0) : r)), r;
  }
  var ye2 = B2((e2) => {
    e2.setTime(e2 - e2.getMilliseconds());
  }, (e2, a) => {
    e2.setTime(+e2 + a * 1e3);
  }, (e2, a) => (a - e2) / 1e3, (e2) => e2.getUTCSeconds());
  var Cl = ye2.range;
  var ot2 = B2((e2) => {
    e2.setTime(e2 - e2.getMilliseconds() - e2.getSeconds() * 1e3);
  }, (e2, a) => {
    e2.setTime(+e2 + a * 6e4);
  }, (e2, a) => (a - e2) / 6e4, (e2) => e2.getMinutes());
  var Bs = ot2.range;
  var rt2 = B2((e2) => {
    e2.setUTCSeconds(0, 0);
  }, (e2, a) => {
    e2.setTime(+e2 + a * 6e4);
  }, (e2, a) => (a - e2) / 6e4, (e2) => e2.getUTCMinutes());
  var Fs = rt2.range;
  var lt2 = B2((e2) => {
    e2.setTime(e2 - e2.getMilliseconds() - e2.getSeconds() * 1e3 - e2.getMinutes() * 6e4);
  }, (e2, a) => {
    e2.setTime(+e2 + a * 36e5);
  }, (e2, a) => (a - e2) / 36e5, (e2) => e2.getHours());
  var Ts = lt2.range;
  var ut2 = B2((e2) => {
    e2.setUTCMinutes(0, 0, 0);
  }, (e2, a) => {
    e2.setTime(+e2 + a * 36e5);
  }, (e2, a) => (a - e2) / 36e5, (e2) => e2.getUTCHours());
  var qs = ut2.range;
  var st2 = B2((e2) => e2.setHours(0, 0, 0, 0), (e2, a) => e2.setDate(e2.getDate() + a), (e2, a) => (a - e2 - (a.getTimezoneOffset() - e2.getTimezoneOffset()) * 6e4) / 864e5, (e2) => e2.getDate() - 1);
  var Os = st2.range;
  var dt2 = B2((e2) => {
    e2.setUTCHours(0, 0, 0, 0);
  }, (e2, a) => {
    e2.setUTCDate(e2.getUTCDate() + a);
  }, (e2, a) => (a - e2) / 864e5, (e2) => e2.getUTCDate() - 1);
  var Ns = dt2.range;
  var Sl = B2((e2) => {
    e2.setUTCHours(0, 0, 0, 0);
  }, (e2, a) => {
    e2.setUTCDate(e2.getUTCDate() + a);
  }, (e2, a) => (a - e2) / 864e5, (e2) => Math.floor(e2 / 864e5));
  var Hs = Sl.range;
  function we2(e2) {
    return B2((a) => {
      a.setDate(a.getDate() - (a.getDay() + 7 - e2) % 7), a.setHours(0, 0, 0, 0);
    }, (a, t) => {
      a.setDate(a.getDate() + t * 7);
    }, (a, t) => (t - a - (t.getTimezoneOffset() - a.getTimezoneOffset()) * 6e4) / 6048e5);
  }
  var ca = we2(0);
  var bl = we2(1);
  var yl = we2(2);
  var wl = we2(3);
  var kl = we2(4);
  var Pl = we2(5);
  var vl = we2(6);
  var Ml = ca.range;
  var Vs = bl.range;
  var Es = yl.range;
  var Ws = wl.range;
  var Gs = kl.range;
  var zs = Pl.range;
  var Xs = vl.range;
  function ke2(e2) {
    return B2((a) => {
      a.setUTCDate(a.getUTCDate() - (a.getUTCDay() + 7 - e2) % 7), a.setUTCHours(0, 0, 0, 0);
    }, (a, t) => {
      a.setUTCDate(a.getUTCDate() + t * 7);
    }, (a, t) => (t - a) / 6048e5);
  }
  var pa = ke2(0);
  var Al = ke2(1);
  var Dl = ke2(2);
  var Rl = ke2(3);
  var Bl = ke2(4);
  var Fl = ke2(5);
  var Tl = ke2(6);
  var ql = pa.range;
  var $s = Al.range;
  var Zs = Dl.range;
  var Ks = Rl.range;
  var _s = Bl.range;
  var Ys = Fl.range;
  var js = Tl.range;
  var ft = B2((e2) => {
    e2.setDate(1), e2.setHours(0, 0, 0, 0);
  }, (e2, a) => {
    e2.setMonth(e2.getMonth() + a);
  }, (e2, a) => a.getMonth() - e2.getMonth() + (a.getFullYear() - e2.getFullYear()) * 12, (e2) => e2.getMonth());
  var Qs = ft.range;
  var nt2 = B2((e2) => {
    e2.setUTCDate(1), e2.setUTCHours(0, 0, 0, 0);
  }, (e2, a) => {
    e2.setUTCMonth(e2.getUTCMonth() + a);
  }, (e2, a) => a.getUTCMonth() - e2.getUTCMonth() + (a.getUTCFullYear() - e2.getUTCFullYear()) * 12, (e2) => e2.getUTCMonth());
  var Js = nt2.range;
  var ma = B2((e2) => {
    e2.setMonth(0, 1), e2.setHours(0, 0, 0, 0);
  }, (e2, a) => {
    e2.setFullYear(e2.getFullYear() + a);
  }, (e2, a) => a.getFullYear() - e2.getFullYear(), (e2) => e2.getFullYear());
  ma.every = (e2) => !isFinite(e2 = Math.floor(e2)) || !(e2 > 0) ? null : B2((a) => {
    a.setFullYear(Math.floor(a.getFullYear() / e2) * e2), a.setMonth(0, 1), a.setHours(0, 0, 0, 0);
  }, (a, t) => {
    a.setFullYear(a.getFullYear() + t * e2);
  });
  var ed = ma.range;
  var xa = B2((e2) => {
    e2.setUTCMonth(0, 1), e2.setUTCHours(0, 0, 0, 0);
  }, (e2, a) => {
    e2.setUTCFullYear(e2.getUTCFullYear() + a);
  }, (e2, a) => a.getUTCFullYear() - e2.getUTCFullYear(), (e2) => e2.getUTCFullYear());
  xa.every = (e2) => !isFinite(e2 = Math.floor(e2)) || !(e2 > 0) ? null : B2((a) => {
    a.setUTCFullYear(Math.floor(a.getUTCFullYear() / e2) * e2), a.setUTCMonth(0, 1), a.setUTCHours(0, 0, 0, 0);
  }, (a, t) => {
    a.setUTCFullYear(a.getUTCFullYear() + t * e2);
  });
  var ad = xa.range;
  function Co(e2, a) {
    a.domain && ("nice" in e2 || "quantiles" in e2 || "padding" in e2, e2.domain(a.domain));
  }
  function So(e2, a) {
    a.range && ("padding" in e2, e2.range(a.range));
  }
  function bo(e2, a) {
    "align" in e2 && "align" in a && typeof a.align < "u" && e2.align(a.align);
  }
  function yo(e2, a) {
    "base" in e2 && "base" in a && typeof a.base < "u" && e2.base(a.base);
  }
  function wo(e2, a) {
    "clamp" in e2 && "clamp" in a && typeof a.clamp < "u" && e2.clamp(a.clamp);
  }
  function ko(e2, a) {
    "constant" in e2 && "constant" in a && typeof a.constant < "u" && e2.constant(a.constant);
  }
  function Po(e2, a) {
    "exponent" in e2 && "exponent" in a && typeof a.exponent < "u" && e2.exponent(a.exponent);
  }
  var Ol = { lab: Qa, hcl: jt, "hcl-long": Qt, hsl: _t, "hsl-long": Yt, cubehelix: Jt, "cubehelix-long": eo, rgb: We2 };
  function vo(e2) {
    switch (e2) {
      case "lab":
      case "hcl":
      case "hcl-long":
      case "hsl":
      case "hsl-long":
      case "cubehelix":
      case "cubehelix-long":
      case "rgb":
        return Ol[e2];
      default:
    }
    var a = e2.type, t = e2.gamma, o = Ol[a];
    return typeof t > "u" ? o : o.gamma(t);
  }
  function Mo(e2, a) {
    if ("interpolate" in a && "interpolate" in e2 && typeof a.interpolate < "u") {
      var t = vo(a.interpolate);
      e2.interpolate(t);
    }
  }
  var td = new Date(Date.UTC(2020, 1, 2, 3, 4, 5));
  var od = "%Y-%m-%d %H:%M";
  function Ao(e2) {
    var a = e2.tickFormat(1, od)(td);
    return a === "2020-02-02 03:04";
  }
  var Nl = { day: st2, hour: lt2, minute: ot2, month: ft, second: ye2, week: ca, year: ma };
  var Hl = { day: dt2, hour: ut2, minute: rt2, month: nt2, second: ye2, week: pa, year: xa };
  function Do(e2, a) {
    if ("nice" in a && typeof a.nice < "u" && "nice" in e2) {
      var t = a.nice;
      if (typeof t == "boolean") t && e2.nice();
      else if (typeof t == "number") e2.nice(t);
      else {
        var o = e2, r = Ao(o);
        if (typeof t == "string") o.nice(r ? Hl[t] : Nl[t]);
        else {
          var l2 = t.interval, u = t.step, s = (r ? Hl[l2] : Nl[l2]).every(u);
          s != null && o.nice(s);
        }
      }
    }
  }
  function Ro(e2, a) {
    "padding" in e2 && "padding" in a && typeof a.padding < "u" && e2.padding(a.padding), "paddingInner" in e2 && "paddingInner" in a && typeof a.paddingInner < "u" && e2.paddingInner(a.paddingInner), "paddingOuter" in e2 && "paddingOuter" in a && typeof a.paddingOuter < "u" && e2.paddingOuter(a.paddingOuter);
  }
  function Bo(e2, a) {
    if (a.reverse) {
      var t = e2.range().slice().reverse();
      "padding" in e2, e2.range(t);
    }
  }
  function Fo(e2, a) {
    "round" in a && typeof a.round < "u" && (a.round && "interpolate" in a && typeof a.interpolate < "u" ? console.warn("[visx/scale/applyRound] ignoring round: scale config contains round and interpolate. only applying interpolate. config:", a) : "round" in e2 ? e2.round(a.round) : "interpolate" in e2 && a.round && e2.interpolate(na));
  }
  function To(e2, a) {
    "unknown" in e2 && "unknown" in a && typeof a.unknown < "u" && e2.unknown(a.unknown);
  }
  function qo(e2, a) {
    if ("zero" in a && a.zero === true) {
      var t = e2.domain(), o = t[0], r = t[1], l2 = r < o, u = l2 ? [r, o] : [o, r], s = u[0], d = u[1], f2 = [Math.min(0, s), Math.max(0, d)];
      e2.domain(l2 ? f2.reverse() : f2);
    }
  }
  var rd = ["domain", "nice", "zero", "interpolate", "round", "range", "reverse", "align", "base", "clamp", "constant", "exponent", "padding", "unknown"];
  var ld = { domain: Co, nice: Do, zero: qo, interpolate: Mo, round: Fo, align: bo, base: yo, clamp: wo, constant: ko, exponent: Po, padding: Ro, range: So, reverse: Bo, unknown: To };
  function La() {
    for (var e2 = arguments.length, a = new Array(e2), t = 0; t < e2; t++) a[t] = arguments[t];
    var o = new Set(a), r = rd.filter(function(l2) {
      return o.has(l2);
    });
    return function(u, s) {
      return typeof s < "u" && r.forEach(function(d) {
        ld[d](u, s);
      }), u;
    };
  }
  var ud = La("domain", "range", "reverse", "align", "padding", "round");
  var sd = La("domain", "range", "reverse", "clamp", "interpolate", "nice", "round", "zero");
  var No = Math.PI;
  var Ho = 2 * No;
  var ve2 = 1e-6;
  var dd = Ho - ve2;
  function Uo() {
    this._x0 = this._y0 = this._x1 = this._y1 = null, this._ = "";
  }
  function Ul() {
    return new Uo();
  }
  Uo.prototype = Ul.prototype = { constructor: Uo, moveTo: function(e2, a) {
    this._ += "M" + (this._x0 = this._x1 = +e2) + "," + (this._y0 = this._y1 = +a);
  }, closePath: function() {
    this._x1 !== null && (this._x1 = this._x0, this._y1 = this._y0, this._ += "Z");
  }, lineTo: function(e2, a) {
    this._ += "L" + (this._x1 = +e2) + "," + (this._y1 = +a);
  }, quadraticCurveTo: function(e2, a, t, o) {
    this._ += "Q" + +e2 + "," + +a + "," + (this._x1 = +t) + "," + (this._y1 = +o);
  }, bezierCurveTo: function(e2, a, t, o, r, l2) {
    this._ += "C" + +e2 + "," + +a + "," + +t + "," + +o + "," + (this._x1 = +r) + "," + (this._y1 = +l2);
  }, arcTo: function(e2, a, t, o, r) {
    e2 = +e2, a = +a, t = +t, o = +o, r = +r;
    var l2 = this._x1, u = this._y1, s = t - e2, d = o - a, f2 = l2 - e2, i = u - a, c = f2 * f2 + i * i;
    if (r < 0) throw new Error("negative radius: " + r);
    if (this._x1 === null) this._ += "M" + (this._x1 = e2) + "," + (this._y1 = a);
    else if (c > ve2) if (!(Math.abs(i * s - d * f2) > ve2) || !r) this._ += "L" + (this._x1 = e2) + "," + (this._y1 = a);
    else {
      var n = t - l2, p = o - u, x = s * s + d * d, m = n * n + p * p, C = Math.sqrt(x), y2 = Math.sqrt(c), P = r * Math.tan((No - Math.acos((x + c - m) / (2 * C * y2))) / 2), g = P / y2, M2 = P / C;
      Math.abs(g - 1) > ve2 && (this._ += "L" + (e2 + g * f2) + "," + (a + g * i)), this._ += "A" + r + "," + r + ",0,0," + +(i * n > f2 * p) + "," + (this._x1 = e2 + M2 * s) + "," + (this._y1 = a + M2 * d);
    }
  }, arc: function(e2, a, t, o, r, l2) {
    e2 = +e2, a = +a, t = +t, l2 = !!l2;
    var u = t * Math.cos(o), s = t * Math.sin(o), d = e2 + u, f2 = a + s, i = 1 ^ l2, c = l2 ? o - r : r - o;
    if (t < 0) throw new Error("negative radius: " + t);
    this._x1 === null ? this._ += "M" + d + "," + f2 : (Math.abs(this._x1 - d) > ve2 || Math.abs(this._y1 - f2) > ve2) && (this._ += "L" + d + "," + f2), t && (c < 0 && (c = c % Ho + Ho), c > dd ? this._ += "A" + t + "," + t + ",0,1," + i + "," + (e2 - u) + "," + (a - s) + "A" + t + "," + t + ",0,1," + i + "," + (this._x1 = d) + "," + (this._y1 = f2) : c > ve2 && (this._ += "A" + t + "," + t + ",0," + +(c >= No) + "," + i + "," + (this._x1 = e2 + t * Math.cos(r)) + "," + (this._y1 = a + t * Math.sin(r))));
  }, rect: function(e2, a, t, o) {
    this._ += "M" + (this._x0 = this._x1 = +e2) + "," + (this._y0 = this._y1 = +a) + "h" + +t + "v" + +o + "h" + -t + "Z";
  }, toString: function() {
    return this._;
  } };
  function Vl(e2) {
    this._context = e2;
  }
  Vl.prototype = { areaStart: function() {
    this._line = 0;
  }, areaEnd: function() {
    this._line = NaN;
  }, lineStart: function() {
    this._point = 0;
  }, lineEnd: function() {
    (this._line || this._line !== 0 && this._point === 1) && this._context.closePath(), this._line = 1 - this._line;
  }, point: function(e2, a) {
    switch (e2 = +e2, a = +a, this._point) {
      case 0:
        this._point = 1, this._line ? this._context.lineTo(e2, a) : this._context.moveTo(e2, a);
        break;
      case 1:
        this._point = 2;
      default:
        this._context.lineTo(e2, a);
        break;
    }
  } };
  var Xl = dr(Oo());
  var $l = dr(Oo());
  var Ld = (0, import_jsx_runtime9.jsx)("svg", { "aria-hidden": "true", width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", children: (0, import_jsx_runtime9.jsx)("path", { d: "M11.5497 2.03292C11.7307 1.65569 12.2693 1.65569 12.4503 2.03292L15.0189 7.38732C15.0918 7.53919 15.2367 7.64404 15.4041 7.66599L21.3154 8.44106C21.732 8.49569 21.8986 9.0078 21.5935 9.29588L17.2708 13.3775C17.1479 13.4935 17.0924 13.6637 17.1232 13.8297L18.2087 19.6603C18.2853 20.0717 17.8494 20.388 17.4803 20.1888L12.2376 17.3585C12.0894 17.2785 11.9106 17.2785 11.7624 17.3585L6.51969 20.1888C6.15063 20.388 5.71473 20.0717 5.79132 19.6603L6.87675 13.8297C6.90764 13.6637 6.8521 13.4935 6.7292 13.3775L2.40651 9.29588C2.10142 9.0078 2.26803 8.49569 2.68463 8.44106L8.5959 7.66599C8.7633 7.64404 8.90823 7.53919 8.98108 7.38732L11.5497 2.03292Z" }) });
  var jo = { label: "Let\u2019s buy this", request: "I want this product. Check the current offer and prepare checkout for the selected variant. Resolve only essential missing choices in our conversation.", kind: "checkout" };
  function Rd() {
    return (0, import_jsx_runtime13.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: (0, import_jsx_runtime13.jsx)("path", { d: "M20.5 12C20.5 9.76676 19.686 8.06004 18.2871 6.89355C16.8661 5.70886 14.7409 5 12 5C9.25912 5 7.13392 5.70886 5.71288 6.89355C4.31396 8.06004 3.49999 9.76677 3.49999 12C3.49999 12.4778 3.67754 13.2204 3.91698 13.9678C4.14619 14.6832 4.39417 15.2886 4.45995 15.4463C4.47153 15.474 4.45918 15.4447 4.47753 15.4883L4.51269 15.5781L4.55273 15.6973C4.71413 16.2258 4.88032 17.3955 4.10253 18.9609C4.45806 18.9447 4.80995 18.8667 5.14062 18.752C5.48117 18.6338 5.77064 18.4882 5.9746 18.3721C6.07544 18.3146 6.15337 18.2661 6.20312 18.2334C6.22792 18.2171 6.2459 18.2042 6.25585 18.1973C6.25889 18.1952 6.26114 18.1935 6.26269 18.1924C6.57078 17.9671 6.98047 17.9376 7.31835 18.1152C8.64944 18.8149 10.295 19 12 19C14.7409 19 16.8661 18.2911 18.2871 17.1064C19.686 15.94 20.5 14.2332 20.5 12ZM22.5 12C22.5 14.7665 21.4668 17.06 19.5674 18.6436C17.6898 20.2087 15.0646 21 12 21C10.3808 21 8.55858 20.8483 6.91699 20.1357C6.63773 20.2919 6.25326 20.4829 5.79589 20.6416C4.84476 20.9715 3.45924 21.2047 2.07226 20.5479C1.80018 20.419 1.59992 20.1742 1.52831 19.8818C1.45679 19.5894 1.52128 19.28 1.70312 19.04C2.39144 18.1322 2.60883 17.4279 2.66894 16.9775C2.72939 16.5244 2.63731 16.2736 2.63476 16.2666L2.63378 16.2646C2.63187 16.2601 2.63059 16.2546 2.62695 16.2461C2.62373 16.2386 2.61901 16.2282 2.61425 16.2168L2.61327 16.2158C2.53665 16.0321 2.2661 15.369 2.01269 14.5781C1.76944 13.8189 1.49999 12.8165 1.49999 12C1.49999 9.23347 2.5332 6.93995 4.43261 5.35645C6.31017 3.79128 8.93544 3 12 3C15.0646 3 17.6898 3.79129 19.5674 5.35645C21.4668 6.93996 22.5 9.23348 22.5 12Z" }) });
  }
  var Bd = { idle: { icon: (0, import_jsx_runtime13.jsx)(Rd, {}), label: jo.label, shortLabel: "Buy this", variant: "active" }, sending: { icon: (0, import_jsx_runtime13.jsx)(oe2, { className: "file-spin", size: 16, strokeWidth: 2.25, "aria-hidden": "true" }), label: "Sending\u2026", variant: "disabled" }, sent: { icon: (0, import_jsx_runtime13.jsx)(Qe2, { size: 16, strokeWidth: 2.25, "aria-hidden": "true" }), label: "Sent to Instinct", shortLabel: "Sent", variant: "disabled" } };

  // ../../opt/files/node_modules/react-router/dist/development/chunk-BV7QT456.mjs
  var React = __toESM(require_react(), 1);
  var React2 = __toESM(require_react(), 1);
  var React3 = __toESM(require_react(), 1);
  var React4 = __toESM(require_react(), 1);
  var React9 = __toESM(require_react(), 1);
  var React8 = __toESM(require_react(), 1);
  var React7 = __toESM(require_react(), 1);
  var React6 = __toESM(require_react(), 1);
  var React5 = __toESM(require_react(), 1);
  var React10 = __toESM(require_react(), 1);
  var React11 = __toESM(require_react(), 1);
  var import_meta = {};
  var ABSOLUTE_URL_REGEX = /^(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i;
  var PROTOCOL_RELATIVE_URL_REGEX = /^[\\/]{2}/;
  function normalizeProtocolRelativeUrl(url, protocol) {
    return protocol + url.replace(/\\/g, "/");
  }
  function isLocation(obj) {
    return typeof obj === "object" && obj != null && "pathname" in obj && "search" in obj && "hash" in obj && "state" in obj && "key" in obj;
  }
  function createMemoryHistory(options = {}) {
    let { initialEntries = ["/"], initialIndex, v5Compat = false } = options;
    let entries;
    entries = initialEntries.map(
      (entry, index2) => createMemoryLocation(
        entry,
        typeof entry === "string" ? null : entry.state,
        index2 === 0 ? "default" : void 0,
        typeof entry === "string" ? void 0 : entry.mask
      )
    );
    let index = clampIndex(
      initialIndex == null ? entries.length - 1 : initialIndex
    );
    let action = "POP";
    let listener = null;
    function clampIndex(n) {
      return Math.min(Math.max(n, 0), entries.length - 1);
    }
    function getCurrentLocation() {
      return entries[index];
    }
    function createMemoryLocation(to, state = null, key, mask) {
      let location = createLocation(
        entries ? getCurrentLocation().pathname : "/",
        to,
        state,
        key,
        mask
      );
      warning(
        location.pathname.charAt(0) === "/",
        `relative pathnames are not supported in memory history: ${JSON.stringify(
          to
        )}`
      );
      return location;
    }
    function createHref2(to) {
      return typeof to === "string" ? to : createPath(to);
    }
    let history = {
      get index() {
        return index;
      },
      get action() {
        return action;
      },
      get location() {
        return getCurrentLocation();
      },
      createHref: createHref2,
      createURL(to) {
        return new URL(createHref2(to), "http://localhost");
      },
      encodeLocation(to) {
        let path = typeof to === "string" ? parsePath(to) : to;
        return {
          pathname: path.pathname || "",
          search: path.search || "",
          hash: path.hash || ""
        };
      },
      push(to, state) {
        action = "PUSH";
        let nextLocation = isLocation(to) ? to : createMemoryLocation(to, state);
        index += 1;
        entries.splice(index, entries.length, nextLocation);
        if (v5Compat && listener) {
          listener({ action, location: nextLocation, delta: 1 });
        }
      },
      replace(to, state) {
        action = "REPLACE";
        let nextLocation = isLocation(to) ? to : createMemoryLocation(to, state);
        entries[index] = nextLocation;
        if (v5Compat && listener) {
          listener({ action, location: nextLocation, delta: 0 });
        }
      },
      go(delta) {
        action = "POP";
        let nextIndex = clampIndex(index + delta);
        let nextLocation = entries[nextIndex];
        index = nextIndex;
        if (listener) {
          listener({ action, location: nextLocation, delta });
        }
      },
      listen(fn) {
        listener = fn;
        return () => {
          listener = null;
        };
      }
    };
    return history;
  }
  function invariant(value, message) {
    if (value === false || value === null || typeof value === "undefined") {
      throw new Error(message);
    }
  }
  function warning(cond, message) {
    if (!cond) {
      if (typeof console !== "undefined") console.warn(message);
      try {
        throw new Error(message);
      } catch (e2) {
      }
    }
  }
  function createKey() {
    return Math.random().toString(36).substring(2, 10);
  }
  function createLocation(current, to, state = null, key, mask) {
    let location = {
      pathname: typeof current === "string" ? current : current.pathname,
      search: "",
      hash: "",
      ...typeof to === "string" ? parsePath(to) : to,
      state,
      // TODO: This could be cleaned up.  push/replace should probably just take
      // full Locations now and avoid the need to run through this flow at all
      // But that's a pretty big refactor to the current test suite so going to
      // keep as is for the time being and just let any incoming keys take precedence
      key: to && to.key || key || createKey(),
      mask
    };
    return location;
  }
  function createPath({
    pathname = "/",
    search = "",
    hash = ""
  }) {
    if (search && search !== "?")
      pathname += search.charAt(0) === "?" ? search : "?" + search;
    if (hash && hash !== "#")
      pathname += hash.charAt(0) === "#" ? hash : "#" + hash;
    return pathname;
  }
  function parsePath(path) {
    let parsedPath = {};
    if (path) {
      let hashIndex = path.indexOf("#");
      if (hashIndex >= 0) {
        parsedPath.hash = path.substring(hashIndex);
        path = path.substring(0, hashIndex);
      }
      let searchIndex = path.indexOf("?");
      if (searchIndex >= 0) {
        parsedPath.search = path.substring(searchIndex);
        path = path.substring(0, searchIndex);
      }
      if (path) {
        parsedPath.pathname = path;
      }
    }
    return parsedPath;
  }
  var _map;
  _map = /* @__PURE__ */ new WeakMap();
  function matchRoutes(routes, locationArg, basename = "/") {
    return matchRoutesImpl(routes, locationArg, basename, false);
  }
  function matchRoutesImpl(routes, locationArg, basename, allowPartial, precomputedBranches) {
    let location = typeof locationArg === "string" ? parsePath(locationArg) : locationArg;
    let pathname = stripBasename(location.pathname || "/", basename);
    if (pathname == null) {
      return null;
    }
    let branches = precomputedBranches ?? flattenAndRankRoutes(routes);
    let matches = null;
    let decoded = decodePath(pathname);
    for (let i = 0; matches == null && i < branches.length; ++i) {
      matches = matchRouteBranch(
        branches[i],
        decoded,
        allowPartial
      );
    }
    return matches;
  }
  function convertRouteMatchToUiMatch(match, loaderData) {
    let { route, pathname, params } = match;
    return {
      id: route.id,
      pathname,
      params,
      data: loaderData[route.id],
      loaderData: loaderData[route.id],
      handle: route.handle
    };
  }
  function flattenAndRankRoutes(routes) {
    let branches = flattenRoutes(routes);
    rankRouteBranches(branches);
    return branches;
  }
  function flattenRoutes(routes, branches = [], parentsMeta = [], parentPath = "", _hasParentOptionalSegments = false) {
    let flattenRoute = (route, index, hasParentOptionalSegments = _hasParentOptionalSegments, relativePath) => {
      let meta = {
        relativePath: relativePath === void 0 ? route.path || "" : relativePath,
        caseSensitive: route.caseSensitive === true,
        childrenIndex: index,
        route
      };
      if (meta.relativePath.startsWith("/")) {
        if (!meta.relativePath.startsWith(parentPath) && hasParentOptionalSegments) {
          return;
        }
        invariant(
          meta.relativePath.startsWith(parentPath),
          `Absolute route path "${meta.relativePath}" nested under path "${parentPath}" is not valid. An absolute child route path must start with the combined path of all its parent routes.`
        );
        meta.relativePath = meta.relativePath.slice(parentPath.length);
      }
      let path = joinPaths([parentPath, meta.relativePath]);
      let routesMeta = parentsMeta.concat(meta);
      if (route.children && route.children.length > 0) {
        invariant(
          // Our types know better, but runtime JS may not!
          // @ts-expect-error
          route.index !== true,
          `Index routes must not have child routes. Please remove all child routes from route path "${path}".`
        );
        flattenRoutes(
          route.children,
          branches,
          routesMeta,
          path,
          hasParentOptionalSegments
        );
      }
      if (route.path == null && !route.index) {
        return;
      }
      branches.push({
        path,
        score: computeScore(path, route.index),
        routesMeta: routesMeta.map((meta2, i) => {
          let [matcher, params] = compilePath(
            meta2.relativePath,
            meta2.caseSensitive,
            i === routesMeta.length - 1
          );
          return {
            ...meta2,
            matcher,
            compiledParams: params
          };
        })
      });
    };
    routes.forEach((route, index) => {
      if (route.path === "" || !route.path?.includes("?")) {
        flattenRoute(route, index);
      } else {
        for (let exploded of explodeOptionalSegments(route.path)) {
          flattenRoute(route, index, true, exploded);
        }
      }
    });
    return branches;
  }
  function explodeOptionalSegments(path) {
    let segments = path.split("/");
    if (segments.length === 0) return [];
    let [first, ...rest] = segments;
    let isOptional = first.endsWith("?");
    let required = first.replace(/\?$/, "");
    if (rest.length === 0) {
      return isOptional ? [required, ""] : [required];
    }
    let restExploded = explodeOptionalSegments(rest.join("/"));
    let result = [];
    result.push(
      ...restExploded.map(
        (subpath) => subpath === "" ? required : [required, subpath].join("/")
      )
    );
    if (isOptional) {
      result.push(...restExploded);
    }
    return result.map(
      (exploded) => path.startsWith("/") && exploded === "" ? "/" : exploded
    );
  }
  function rankRouteBranches(branches) {
    branches.sort(
      (a, b) => a.score !== b.score ? b.score - a.score : compareIndexes(
        a.routesMeta.map((meta) => meta.childrenIndex),
        b.routesMeta.map((meta) => meta.childrenIndex)
      )
    );
  }
  var paramRe = /^:[\w-]+$/;
  var dynamicSegmentValue = 3;
  var indexRouteValue = 2;
  var emptySegmentValue = 1;
  var staticSegmentValue = 10;
  var splatPenalty = -2;
  var isSplat = (s) => s === "*";
  function computeScore(path, index) {
    let segments = path.split("/");
    let initialScore = segments.length;
    if (segments.some(isSplat)) {
      initialScore += splatPenalty;
    }
    if (index) {
      initialScore += indexRouteValue;
    }
    return segments.filter((s) => !isSplat(s)).reduce(
      (score, segment) => score + (paramRe.test(segment) ? dynamicSegmentValue : segment === "" ? emptySegmentValue : staticSegmentValue),
      initialScore
    );
  }
  function compareIndexes(a, b) {
    let siblings = a.length === b.length && a.slice(0, -1).every((n, i) => n === b[i]);
    return siblings ? (
      // If two routes are siblings, we should try to match the earlier sibling
      // first. This allows people to have fine-grained control over the matching
      // behavior by simply putting routes with identical paths in the order they
      // want them tried.
      a[a.length - 1] - b[b.length - 1]
    ) : (
      // Otherwise, it doesn't really make sense to rank non-siblings by index,
      // so they sort equally.
      0
    );
  }
  function matchRouteBranch(branch, pathname, allowPartial = false) {
    let { routesMeta } = branch;
    let matchedParams = {};
    let matchedPathname = "/";
    let matches = [];
    for (let i = 0; i < routesMeta.length; ++i) {
      let meta = routesMeta[i];
      let end = i === routesMeta.length - 1;
      let remainingPathname = matchedPathname === "/" ? pathname : pathname.slice(matchedPathname.length) || "/";
      let pattern = {
        path: meta.relativePath,
        caseSensitive: meta.caseSensitive,
        end
      };
      let match = (
        // Use precomputed matcher if it exists
        meta.matcher && meta.compiledParams ? matchPathImpl(
          pattern,
          remainingPathname,
          meta.matcher,
          meta.compiledParams
        ) : matchPath(pattern, remainingPathname)
      );
      let route = meta.route;
      if (!match && end && allowPartial && !routesMeta[routesMeta.length - 1].route.index) {
        match = matchPath(
          {
            path: meta.relativePath,
            caseSensitive: meta.caseSensitive,
            end: false
          },
          remainingPathname
        );
      }
      if (!match) {
        return null;
      }
      Object.assign(matchedParams, match.params);
      matches.push({
        // TODO: Can this as be avoided?
        params: matchedParams,
        pathname: joinPaths([matchedPathname, match.pathname]),
        pathnameBase: normalizePathname(
          joinPaths([matchedPathname, match.pathnameBase])
        ),
        route
      });
      if (match.pathnameBase !== "/") {
        matchedPathname = joinPaths([matchedPathname, match.pathnameBase]);
      }
    }
    return matches;
  }
  function matchPath(pattern, pathname) {
    if (typeof pattern === "string") {
      pattern = { path: pattern, caseSensitive: false, end: true };
    }
    let [matcher, compiledParams] = compilePath(
      pattern.path,
      pattern.caseSensitive,
      pattern.end
    );
    return matchPathImpl(pattern, pathname, matcher, compiledParams);
  }
  function matchPathImpl(pattern, pathname, matcher, compiledParams) {
    let match = pathname.match(matcher);
    if (!match) return null;
    let matchedPathname = match[0];
    let pathnameBase = removeTrailingSlash(matchedPathname, 1);
    let captureGroups = match.slice(1);
    let params = compiledParams.reduce(
      (memo2, { paramName, isOptional }, index) => {
        if (paramName === "*") {
          let splatValue = captureGroups[index] || "";
          pathnameBase = removeTrailingSlash(
            matchedPathname.slice(0, matchedPathname.length - splatValue.length),
            1
          );
        }
        const value = captureGroups[index];
        if (isOptional && !value) {
          memo2[paramName] = void 0;
        } else {
          memo2[paramName] = (value || "").replace(/%2F/g, "/");
        }
        return memo2;
      },
      {}
    );
    return {
      params,
      pathname: matchedPathname,
      pathnameBase,
      pattern
    };
  }
  function compilePath(path, caseSensitive = false, end = true) {
    warning(
      path === "*" || !path.endsWith("*") || path.endsWith("/*"),
      `Route path "${path}" will be treated as if it were "${path.replace(/\*$/, "/*")}" because the \`*\` character must always follow a \`/\` in the pattern. To get rid of this warning, please change the route path to "${path.replace(/\*$/, "/*")}".`
    );
    let params = [];
    let regexpSource = "^" + path.replace(/\/*\*?$/, "").replace(/^\/*/, "/").replace(/[\\.*+^${}|()[\]]/g, "\\$&").replace(
      /\/:([\w-]+)(\?)?/g,
      (match, paramName, isOptional, index, str) => {
        params.push({ paramName, isOptional: isOptional != null });
        if (isOptional) {
          let nextChar = str.charAt(index + match.length);
          if (nextChar && nextChar !== "/") {
            return "/([^\\/]*)";
          }
          return "(?:/([^\\/]*))?";
        }
        return "/([^\\/]+)";
      }
    ).replace(/\/([\w-]+)\?(\/|$)/g, "(/$1)?$2");
    if (path.endsWith("*")) {
      params.push({ paramName: "*" });
      regexpSource += path === "*" || path === "/*" ? "(.*)$" : "(?:\\/(.+)|\\/*)$";
    } else if (end) {
      regexpSource += "\\/*$";
    } else if (path !== "" && path !== "/") {
      regexpSource += "(?:(?=\\/|$))";
    } else {
    }
    let matcher = new RegExp(regexpSource, caseSensitive ? void 0 : "i");
    return [matcher, params];
  }
  function decodePath(value) {
    try {
      return value.split("/").map((v2) => decodeURIComponent(v2).replace(/\//g, "%2F")).join("/");
    } catch (error) {
      warning(
        false,
        `The URL path "${value}" could not be decoded because it is a malformed URL segment. This is probably due to a bad percent encoding (${error}).`
      );
      return value;
    }
  }
  function stripBasename(pathname, basename) {
    if (basename === "/") return pathname;
    if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
      return null;
    }
    let startIndex = basename.endsWith("/") ? basename.length - 1 : basename.length;
    let nextChar = pathname.charAt(startIndex);
    if (nextChar && nextChar !== "/") {
      return null;
    }
    return pathname.slice(startIndex) || "/";
  }
  function resolvePath(to, fromPathname = "/") {
    let {
      pathname: toPathname,
      search = "",
      hash = ""
    } = typeof to === "string" ? parsePath(to) : to;
    let pathname;
    if (toPathname) {
      toPathname = removeDoubleSlashes(toPathname);
      if (toPathname.startsWith("/") || toPathname.startsWith("\\")) {
        pathname = resolvePathname(toPathname.substring(1), "/");
      } else {
        pathname = resolvePathname(toPathname, fromPathname);
      }
    } else {
      pathname = fromPathname;
    }
    return {
      pathname,
      search: normalizeSearch(search),
      hash: normalizeHash(hash)
    };
  }
  function resolvePathname(relativePath, fromPathname) {
    let segments = removeTrailingSlash(fromPathname).split("/");
    let relativeSegments = relativePath.split("/");
    relativeSegments.forEach((segment) => {
      if (segment === "..") {
        if (segments.length > 1) segments.pop();
      } else if (segment !== ".") {
        segments.push(segment);
      }
    });
    return segments.length > 1 ? segments.join("/") : "/";
  }
  function getInvalidPathError(char, field, dest, path) {
    return `Cannot include a '${char}' character in a manually specified \`to.${field}\` field [${JSON.stringify(
      path
    )}].  Please separate it out to the \`to.${dest}\` field. Alternatively you may provide the full path as a string in <Link to="..."> and the router will parse it for you.`;
  }
  function getPathContributingMatches(matches) {
    return matches.filter(
      (match, index) => index === 0 || match.route.path && match.route.path.length > 0
    );
  }
  function getResolveToMatches(matches) {
    let pathMatches = getPathContributingMatches(matches);
    return pathMatches.map(
      (match, idx) => idx === pathMatches.length - 1 ? match.pathname : match.pathnameBase
    );
  }
  function resolveTo(toArg, routePathnames, locationPathname, isPathRelative = false) {
    let to;
    if (typeof toArg === "string") {
      to = parsePath(toArg);
    } else {
      to = { ...toArg };
      invariant(
        !to.pathname || !to.pathname.includes("?"),
        getInvalidPathError("?", "pathname", "search", to)
      );
      invariant(
        !to.pathname || !to.pathname.includes("#"),
        getInvalidPathError("#", "pathname", "hash", to)
      );
      invariant(
        !to.search || !to.search.includes("#"),
        getInvalidPathError("#", "search", "hash", to)
      );
    }
    let isEmptyPath = toArg === "" || to.pathname === "";
    let toPathname = isEmptyPath ? "/" : to.pathname;
    let from;
    if (toPathname == null) {
      from = locationPathname;
    } else {
      let routePathnameIndex = routePathnames.length - 1;
      if (!isPathRelative && toPathname.startsWith("..")) {
        let toSegments = toPathname.split("/");
        while (toSegments[0] === "..") {
          toSegments.shift();
          routePathnameIndex -= 1;
        }
        to.pathname = toSegments.join("/");
      }
      from = routePathnameIndex >= 0 ? routePathnames[routePathnameIndex] : "/";
    }
    let path = resolvePath(to, from);
    let hasExplicitTrailingSlash = toPathname && toPathname !== "/" && toPathname.endsWith("/");
    let hasCurrentTrailingSlash = (isEmptyPath || toPathname === ".") && locationPathname.endsWith("/");
    if (!path.pathname.endsWith("/") && (hasExplicitTrailingSlash || hasCurrentTrailingSlash)) {
      path.pathname += "/";
    }
    return path;
  }
  var removeDoubleSlashes = (path) => path.replace(/[\\/]{2,}/g, "/");
  var joinPaths = (paths) => removeDoubleSlashes(paths.join("/"));
  function removeTrailingSlash(path, minLength = 0) {
    let end = path.length;
    while (end > minLength && path.charCodeAt(end - 1) === 47) {
      end--;
    }
    return end === path.length ? path : path.slice(0, end);
  }
  var normalizePathname = (pathname) => removeTrailingSlash(pathname).replace(/^\/*/, "/");
  var normalizeSearch = (search) => !search || search === "?" ? "" : search.startsWith("?") ? search : "?" + search;
  var normalizeHash = (hash) => !hash || hash === "#" ? "" : hash.startsWith("#") ? hash : "#" + hash;
  var ErrorResponseImpl = class {
    constructor(status, statusText, data2, internal = false) {
      this.status = status;
      this.statusText = statusText || "";
      this.internal = internal;
      if (data2 instanceof Error) {
        this.data = data2.toString();
        this.error = data2;
      } else {
        this.data = data2;
      }
    }
  };
  function isRouteErrorResponse(error) {
    return error != null && typeof error.status === "number" && typeof error.statusText === "string" && typeof error.internal === "boolean" && "data" in error;
  }
  function getRoutePattern(matches) {
    let parts = matches.map((m) => m.route.path).filter(Boolean);
    return joinPaths(parts) || "/";
  }
  var isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined" && typeof window.document.createElement !== "undefined";
  function parseToInfo(_to, basename) {
    let to = _to;
    if (typeof to !== "string" || !ABSOLUTE_URL_REGEX.test(to)) {
      return {
        absoluteURL: void 0,
        isExternal: false,
        to
      };
    }
    let absoluteURL = to;
    let isExternal = false;
    if (isBrowser) {
      try {
        let currentUrl = new URL(window.location.href);
        let targetUrl = PROTOCOL_RELATIVE_URL_REGEX.test(to) ? new URL(normalizeProtocolRelativeUrl(to, currentUrl.protocol)) : new URL(to);
        let path = stripBasename(targetUrl.pathname, basename);
        if (targetUrl.origin === currentUrl.origin && path != null) {
          to = path + targetUrl.search + targetUrl.hash;
        } else {
          isExternal = true;
        }
      } catch (e2) {
        warning(
          false,
          `<Link to="${to}"> contains an invalid URL which will probably break when clicked - please update to a valid URL path.`
        );
      }
    }
    return {
      absoluteURL,
      isExternal,
      to
    };
  }
  var objectProtoNames = Object.getOwnPropertyNames(Object.prototype).sort().join("\0");
  var DEFAULT_NAVIGATION_URL = new URL("http://localhost");
  function getNavigatorCurrentUrl(navigator2) {
    if (navigator2.createURL) {
      return navigator2.createURL("/");
    }
    try {
      return new URL(navigator2.createHref("/"), DEFAULT_NAVIGATION_URL);
    } catch {
      return DEFAULT_NAVIGATION_URL;
    }
  }
  function isSameOrigin(a, b) {
    return a.origin === b.origin && (a.origin !== "null" || a.protocol === b.protocol && a.host === b.host);
  }
  function isExplicitUrl(destination, target) {
    if (destination.startsWith("//")) {
      return true;
    }
    let protocol = target.protocol.toLowerCase();
    if (!destination.toLowerCase().startsWith(protocol)) {
      return false;
    }
    return target.host === "" || destination.slice(protocol.length).startsWith("//");
  }
  function validateNavigationTarget(original, resolved, currentUrl, externalPolicy) {
    let originalUrl = null;
    try {
      originalUrl = original == null ? null : new URL(original, currentUrl);
    } catch {
    }
    let resolvedUrl = new URL(resolved, currentUrl);
    let originalIsExternal = originalUrl != null && !isSameOrigin(originalUrl, currentUrl);
    let resolvedIsExternal = !isSameOrigin(resolvedUrl, currentUrl);
    if (externalPolicy === "reject") {
      if (originalIsExternal || resolvedIsExternal) {
        throw new Error("External navigation is not allowed");
      }
    } else if (resolvedIsExternal) {
      if (originalUrl == null || !isExplicitUrl(original, originalUrl) || !isSameOrigin(originalUrl, resolvedUrl)) {
        throw new Error("External navigation is not allowed");
      }
    }
  }
  var validMutationMethodsArr = [
    "POST",
    "PUT",
    "PATCH",
    "DELETE"
  ];
  var validMutationMethods = new Set(
    validMutationMethodsArr
  );
  var validRequestMethodsArr = [
    "GET",
    ...validMutationMethodsArr
  ];
  var validRequestMethods = new Set(validRequestMethodsArr);
  var _routes;
  var _branches;
  var _hmrRoutes;
  var _hmrBranches;
  _routes = /* @__PURE__ */ new WeakMap();
  _branches = /* @__PURE__ */ new WeakMap();
  _hmrRoutes = /* @__PURE__ */ new WeakMap();
  _hmrBranches = /* @__PURE__ */ new WeakMap();
  var invalidProtocols = [
    "about:",
    "blob:",
    "chrome:",
    "chrome-untrusted:",
    "content:",
    "data:",
    "devtools:",
    "file:",
    "filesystem:",
    // eslint-disable-next-line no-script-url
    "javascript:"
  ];
  function hasInvalidProtocol(location) {
    try {
      return invalidProtocols.includes(new URL(location).protocol);
    } catch {
      return false;
    }
  }
  var DataRouterContext = React.createContext(null);
  DataRouterContext.displayName = "DataRouter";
  var DataRouterStateContext = React.createContext(null);
  DataRouterStateContext.displayName = "DataRouterState";
  var RSCRouterContext = React.createContext(false);
  function useIsRSCRouterContext() {
    return React.useContext(RSCRouterContext);
  }
  var ViewTransitionContext = React.createContext({
    isTransitioning: false
  });
  ViewTransitionContext.displayName = "ViewTransition";
  var FetchersContext = React.createContext(
    /* @__PURE__ */ new Map()
  );
  FetchersContext.displayName = "Fetchers";
  var AwaitContext = React.createContext(null);
  AwaitContext.displayName = "Await";
  var NavigationContext = React.createContext(
    null
  );
  NavigationContext.displayName = "Navigation";
  var LocationContext = React.createContext(
    null
  );
  LocationContext.displayName = "Location";
  var RouteContext = React.createContext({
    outlet: null,
    matches: [],
    isDataRoute: false
  });
  RouteContext.displayName = "Route";
  var RouteErrorContext = React.createContext(null);
  RouteErrorContext.displayName = "RouteError";
  var ENABLE_DEV_WARNINGS = true;
  var ERROR_DIGEST_BASE = "REACT_ROUTER_ERROR";
  var ERROR_DIGEST_REDIRECT = "REDIRECT";
  var ERROR_DIGEST_ROUTE_ERROR_RESPONSE = "ROUTE_ERROR_RESPONSE";
  function decodeRedirectErrorDigest(digest) {
    if (digest.startsWith(`${ERROR_DIGEST_BASE}:${ERROR_DIGEST_REDIRECT}:{`)) {
      try {
        let parsed = JSON.parse(digest.slice(28));
        if (typeof parsed === "object" && parsed && typeof parsed.status === "number" && typeof parsed.statusText === "string" && typeof parsed.location === "string" && typeof parsed.reloadDocument === "boolean" && typeof parsed.replace === "boolean") {
          return parsed;
        }
      } catch {
      }
    }
  }
  function decodeRouteErrorResponseDigest(digest) {
    if (digest.startsWith(
      `${ERROR_DIGEST_BASE}:${ERROR_DIGEST_ROUTE_ERROR_RESPONSE}:{`
    )) {
      try {
        let parsed = JSON.parse(digest.slice(40));
        if (typeof parsed === "object" && parsed && typeof parsed.status === "number" && typeof parsed.statusText === "string") {
          return new ErrorResponseImpl(
            parsed.status,
            parsed.statusText,
            parsed.data
          );
        }
      } catch {
      }
    }
  }
  function useHref(to, { relative } = {}) {
    invariant(
      useInRouterContext(),
      // TODO: This error is probably because they somehow have 2 versions of the
      // router loaded. We can help them understand how to avoid that.
      `useHref() may be used only in the context of a <Router> component.`
    );
    let { basename, navigator: navigator2 } = React2.useContext(NavigationContext);
    let { hash, pathname, search } = useResolvedPath(to, { relative });
    let joinedPathname = pathname;
    if (basename !== "/") {
      joinedPathname = pathname === "/" ? basename : joinPaths([basename, pathname]);
    }
    return navigator2.createHref({ pathname: joinedPathname, search, hash });
  }
  function useInRouterContext() {
    return React2.useContext(LocationContext) != null;
  }
  function useLocation() {
    invariant(
      useInRouterContext(),
      // TODO: This error is probably because they somehow have 2 versions of the
      // router loaded. We can help them understand how to avoid that.
      `useLocation() may be used only in the context of a <Router> component.`
    );
    return React2.useContext(LocationContext).location;
  }
  var navigateEffectWarning = `You should call navigate() in a React.useEffect(), not when your component is first rendered.`;
  function useIsomorphicLayoutEffect(cb) {
    let isStatic = React2.useContext(NavigationContext).static;
    if (!isStatic) {
      React2.useLayoutEffect(cb);
    }
  }
  function useNavigate() {
    let { isDataRoute } = React2.useContext(RouteContext);
    return isDataRoute ? useNavigateStable() : useNavigateUnstable();
  }
  function useNavigateUnstable() {
    invariant(
      useInRouterContext(),
      // TODO: This error is probably because they somehow have 2 versions of the
      // router loaded. We can help them understand how to avoid that.
      `useNavigate() may be used only in the context of a <Router> component.`
    );
    let dataRouterContext = React2.useContext(DataRouterContext);
    let { basename, navigator: navigator2 } = React2.useContext(NavigationContext);
    let { matches } = React2.useContext(RouteContext);
    let { pathname: locationPathname } = useLocation();
    let routePathnamesJson = JSON.stringify(getResolveToMatches(matches));
    let activeRef = React2.useRef(false);
    useIsomorphicLayoutEffect(() => {
      activeRef.current = true;
    });
    let navigate = React2.useCallback(
      (to, options = {}) => {
        warning(activeRef.current, navigateEffectWarning);
        if (!activeRef.current) return;
        if (typeof to === "number") {
          navigator2.go(to);
          return;
        }
        let path = resolveTo(
          to,
          JSON.parse(routePathnamesJson),
          locationPathname,
          options.relative === "path"
        );
        if (dataRouterContext == null && basename !== "/") {
          path.pathname = path.pathname === "/" ? basename : joinPaths([basename, path.pathname]);
        }
        validateNavigationTarget(
          typeof to === "string" ? to : createPath(to),
          navigator2.createHref(path),
          getNavigatorCurrentUrl(navigator2),
          "reject"
        );
        (!!options.replace ? navigator2.replace : navigator2.push)(
          path,
          options.state,
          options
        );
      },
      [
        basename,
        navigator2,
        routePathnamesJson,
        locationPathname,
        dataRouterContext
      ]
    );
    return navigate;
  }
  var OutletContext = React2.createContext(null);
  function useResolvedPath(to, { relative } = {}) {
    let { matches } = React2.useContext(RouteContext);
    let { pathname: locationPathname } = useLocation();
    let routePathnamesJson = JSON.stringify(getResolveToMatches(matches));
    return React2.useMemo(
      () => resolveTo(
        to,
        JSON.parse(routePathnamesJson),
        locationPathname,
        relative === "path"
      ),
      [to, routePathnamesJson, locationPathname, relative]
    );
  }
  function useRoutesImpl(routes, locationArg, dataRouterOpts) {
    invariant(
      useInRouterContext(),
      // TODO: This error is probably because they somehow have 2 versions of the
      // router loaded. We can help them understand how to avoid that.
      `useRoutes() may be used only in the context of a <Router> component.`
    );
    let { navigator: navigator2 } = React2.useContext(NavigationContext);
    let { matches: parentMatches } = React2.useContext(RouteContext);
    let routeMatch = parentMatches[parentMatches.length - 1];
    let parentParams = routeMatch ? routeMatch.params : {};
    let parentPathname = routeMatch ? routeMatch.pathname : "/";
    let parentPathnameBase = routeMatch ? routeMatch.pathnameBase : "/";
    let parentRoute = routeMatch && routeMatch.route;
    if (ENABLE_DEV_WARNINGS) {
      let parentPath = parentRoute && parentRoute.path || "";
      warningOnce(
        parentPathname,
        !parentRoute || parentPath.endsWith("*") || parentPath.endsWith("*?"),
        `You rendered descendant <Routes> (or called \`useRoutes()\`) at "${parentPathname}" (under <Route path="${parentPath}">) but the parent route path has no trailing "*". This means if you navigate deeper, the parent won't match anymore and therefore the child routes will never render.

Please change the parent <Route path="${parentPath}"> to <Route path="${parentPath === "/" ? "*" : `${parentPath}/*`}">.`
      );
    }
    let locationFromContext = useLocation();
    let location;
    if (locationArg) {
      let parsedLocationArg = typeof locationArg === "string" ? parsePath(locationArg) : locationArg;
      invariant(
        parentPathnameBase === "/" || parsedLocationArg.pathname?.startsWith(parentPathnameBase),
        `When overriding the location using \`<Routes location>\` or \`useRoutes(routes, location)\`, the location pathname must begin with the portion of the URL pathname that was matched by all parent routes. The current pathname base is "${parentPathnameBase}" but pathname "${parsedLocationArg.pathname}" was given in the \`location\` prop.`
      );
      location = parsedLocationArg;
    } else {
      location = locationFromContext;
    }
    let pathname = location.pathname || "/";
    let remainingPathname = pathname;
    if (parentPathnameBase !== "/") {
      let parentSegments = parentPathnameBase.replace(/^\//, "").split("/");
      let segments = pathname.replace(/^\//, "").split("/");
      remainingPathname = "/" + segments.slice(parentSegments.length).join("/");
    }
    let matches = dataRouterOpts && dataRouterOpts.state.matches.length ? (
      // If we're in a data router, use the matches we've already identified but ensure
      // we have the latest route instances from the manifest in case elements have changed
      dataRouterOpts.state.matches.map(
        (m) => Object.assign(m, {
          route: dataRouterOpts.manifest[m.route.id] || m.route
        })
      )
    ) : matchRoutes(routes, { pathname: remainingPathname });
    if (ENABLE_DEV_WARNINGS) {
      warning(
        parentRoute || matches != null,
        `No routes matched location "${location.pathname}${location.search}${location.hash}" `
      );
      warning(
        matches == null || matches[matches.length - 1].route.element !== void 0 || matches[matches.length - 1].route.Component !== void 0 || matches[matches.length - 1].route.lazy !== void 0,
        `Matched leaf route at location "${location.pathname}${location.search}${location.hash}" does not have an element or Component. This means it will render an <Outlet /> with a null value by default resulting in an "empty" page.`
      );
    }
    let renderedMatches = _renderMatches(
      matches && matches.map(
        (match) => Object.assign({}, match, {
          params: Object.assign({}, parentParams, match.params),
          pathname: joinPaths([
            parentPathnameBase,
            // Re-encode pathnames that were decoded inside matchRoutes.
            // Pre-encode `%`, `?` and `#` ahead of `encodeLocation` because it uses
            // `new URL()` internally and we need to prevent it from treating
            // them as separators
            navigator2.encodeLocation ? navigator2.encodeLocation(
              match.pathname.replace(/%/g, "%25").replace(/\?/g, "%3F").replace(/#/g, "%23")
            ).pathname : match.pathname
          ]),
          pathnameBase: match.pathnameBase === "/" ? parentPathnameBase : joinPaths([
            parentPathnameBase,
            // Re-encode pathnames that were decoded inside matchRoutes
            // Pre-encode `%`, `?` and `#` ahead of `encodeLocation` because it uses
            // `new URL()` internally and we need to prevent it from treating
            // them as separators
            navigator2.encodeLocation ? navigator2.encodeLocation(
              match.pathnameBase.replace(/%/g, "%25").replace(/\?/g, "%3F").replace(/#/g, "%23")
            ).pathname : match.pathnameBase
          ])
        })
      ),
      parentMatches,
      dataRouterOpts
    );
    if (locationArg && renderedMatches) {
      return /* @__PURE__ */ React2.createElement(
        LocationContext.Provider,
        {
          value: {
            location: {
              pathname: "/",
              search: "",
              hash: "",
              state: null,
              key: "default",
              mask: void 0,
              ...location
            },
            navigationType: "POP"
            /* Pop */
          }
        },
        renderedMatches
      );
    }
    return renderedMatches;
  }
  function DefaultErrorComponent() {
    let error = useRouteError();
    let message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : JSON.stringify(error);
    let stack = error instanceof Error ? error.stack : null;
    let lightgrey = "rgba(200,200,200, 0.5)";
    let preStyles = { padding: "0.5rem", backgroundColor: lightgrey };
    let codeStyles = { padding: "2px 4px", backgroundColor: lightgrey };
    let devInfo = null;
    if (ENABLE_DEV_WARNINGS) {
      console.error(
        "Error handled by React Router default ErrorBoundary:",
        error
      );
      devInfo = /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("p", null, "\u{1F4BF} Hey developer \u{1F44B}"), /* @__PURE__ */ React2.createElement("p", null, "You can provide a way better UX than this when your app throws errors by providing your own ", /* @__PURE__ */ React2.createElement("code", { style: codeStyles }, "ErrorBoundary"), " or", " ", /* @__PURE__ */ React2.createElement("code", { style: codeStyles }, "errorElement"), " prop on your route."));
    }
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("h2", null, "Unexpected Application Error!"), /* @__PURE__ */ React2.createElement("h3", { style: { fontStyle: "italic" } }, message), stack ? /* @__PURE__ */ React2.createElement("pre", { style: preStyles }, stack) : null, devInfo);
  }
  var defaultErrorElement = /* @__PURE__ */ React2.createElement(DefaultErrorComponent, null);
  var RenderErrorBoundary = class extends React2.Component {
    constructor(props) {
      super(props);
      this.state = {
        location: props.location,
        revalidation: props.revalidation,
        error: props.error
      };
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    static getDerivedStateFromProps(props, state) {
      if (state.location !== props.location || state.revalidation !== "idle" && props.revalidation === "idle") {
        return {
          error: props.error,
          location: props.location,
          revalidation: props.revalidation
        };
      }
      return {
        error: props.error !== void 0 ? props.error : state.error,
        location: state.location,
        revalidation: props.revalidation || state.revalidation
      };
    }
    componentDidCatch(error, errorInfo) {
      if (this.props.onError) {
        this.props.onError(error, errorInfo);
      } else {
        console.error(
          "React Router caught the following error during render",
          error
        );
      }
    }
    render() {
      let error = this.state.error;
      if (this.context && typeof error === "object" && error && "digest" in error && typeof error.digest === "string") {
        const decoded = decodeRouteErrorResponseDigest(error.digest);
        if (decoded) error = decoded;
      }
      let result = error !== void 0 ? /* @__PURE__ */ React2.createElement(RouteContext.Provider, { value: this.props.routeContext }, /* @__PURE__ */ React2.createElement(
        RouteErrorContext.Provider,
        {
          value: error,
          children: this.props.component
        }
      )) : this.props.children;
      if (this.context) {
        return /* @__PURE__ */ React2.createElement(RSCErrorHandler, { error }, result);
      }
      return result;
    }
  };
  RenderErrorBoundary.contextType = RSCRouterContext;
  var errorRedirectHandledMap = /* @__PURE__ */ new WeakMap();
  function RSCErrorHandler({
    children,
    error
  }) {
    let { basename, navigator: navigator2 } = React2.useContext(NavigationContext);
    if (typeof error === "object" && error && "digest" in error && typeof error.digest === "string") {
      let redirect2 = decodeRedirectErrorDigest(error.digest);
      if (redirect2) {
        let existingRedirect = errorRedirectHandledMap.get(error);
        if (existingRedirect) throw existingRedirect;
        let parsed = parseToInfo(redirect2.location, basename);
        let target = parsed.absoluteURL || parsed.to;
        validateNavigationTarget(
          redirect2.location,
          target,
          getNavigatorCurrentUrl(navigator2),
          "allow-explicit"
        );
        if (hasInvalidProtocol(target)) {
          throw new Error("Invalid redirect location");
        }
        if (isBrowser && !errorRedirectHandledMap.get(error)) {
          if (parsed.isExternal || redirect2.reloadDocument) {
            window.location.href = target;
          } else {
            const redirectPromise = Promise.resolve().then(
              () => window.__reactRouterDataRouter.navigate(parsed.to, {
                replace: redirect2.replace
              })
            );
            errorRedirectHandledMap.set(error, redirectPromise);
            throw redirectPromise;
          }
        }
        return /* @__PURE__ */ React2.createElement("meta", { httpEquiv: "refresh", content: `0;url=${target}` });
      }
    }
    return children;
  }
  function RenderedRoute({ routeContext, match, children }) {
    let dataRouterContext = React2.useContext(DataRouterContext);
    if (dataRouterContext && dataRouterContext.static && dataRouterContext.staticContext && (match.route.errorElement || match.route.ErrorBoundary)) {
      dataRouterContext.staticContext._deepestRenderedBoundaryId = match.route.id;
    }
    return /* @__PURE__ */ React2.createElement(RouteContext.Provider, { value: routeContext }, children);
  }
  function _renderMatches(matches, parentMatches = [], dataRouterOpts) {
    let dataRouterState = dataRouterOpts?.state;
    if (matches == null) {
      if (!dataRouterState) {
        return null;
      }
      if (dataRouterState.errors) {
        matches = dataRouterState.matches;
      } else if (parentMatches.length === 0 && !dataRouterState.initialized && dataRouterState.matches.length > 0) {
        matches = dataRouterState.matches;
      } else {
        return null;
      }
    }
    let renderedMatches = matches;
    let errors = dataRouterState?.errors;
    if (errors != null) {
      let errorIndex = renderedMatches.findIndex(
        (m) => m.route.id && errors?.[m.route.id] !== void 0
      );
      invariant(
        errorIndex >= 0,
        `Could not find a matching route for errors on route IDs: ${Object.keys(
          errors
        ).join(",")}`
      );
      renderedMatches = renderedMatches.slice(
        0,
        Math.min(renderedMatches.length, errorIndex + 1)
      );
    }
    let renderFallback = false;
    let fallbackIndex = -1;
    if (dataRouterOpts && dataRouterState) {
      renderFallback = dataRouterState.renderFallback;
      for (let i = 0; i < renderedMatches.length; i++) {
        let match = renderedMatches[i];
        if (match.route.HydrateFallback || match.route.hydrateFallbackElement) {
          fallbackIndex = i;
        }
        if (match.route.id) {
          let { loaderData, errors: errors2 } = dataRouterState;
          let needsToRunLoader = match.route.loader && !loaderData.hasOwnProperty(match.route.id) && (!errors2 || errors2[match.route.id] === void 0);
          if (match.route.lazy || needsToRunLoader) {
            if (dataRouterOpts.isStatic) {
              renderFallback = true;
            }
            if (fallbackIndex >= 0) {
              renderedMatches = renderedMatches.slice(0, fallbackIndex + 1);
            } else {
              renderedMatches = [renderedMatches[0]];
            }
            break;
          }
        }
      }
    }
    let onErrorHandler = dataRouterOpts?.onError;
    let onError = dataRouterState && onErrorHandler ? (error, errorInfo) => {
      onErrorHandler(error, {
        location: dataRouterState.location,
        params: dataRouterState.matches?.[0]?.params ?? {},
        pattern: getRoutePattern(dataRouterState.matches),
        errorInfo
      });
    } : void 0;
    return renderedMatches.reduceRight(
      (outlet, match, index) => {
        let error;
        let shouldRenderHydrateFallback = false;
        let errorElement = null;
        let hydrateFallbackElement = null;
        if (dataRouterState) {
          error = errors && match.route.id ? errors[match.route.id] : void 0;
          errorElement = match.route.errorElement || defaultErrorElement;
          if (renderFallback) {
            if (fallbackIndex < 0 && index === 0) {
              warningOnce(
                "route-fallback",
                false,
                "No `HydrateFallback` element provided to render during initial hydration"
              );
              shouldRenderHydrateFallback = true;
              hydrateFallbackElement = null;
            } else if (fallbackIndex === index) {
              shouldRenderHydrateFallback = true;
              hydrateFallbackElement = match.route.hydrateFallbackElement || null;
            }
          }
        }
        let matches2 = parentMatches.concat(renderedMatches.slice(0, index + 1));
        let getChildren = () => {
          let children;
          if (error) {
            children = errorElement;
          } else if (shouldRenderHydrateFallback) {
            children = hydrateFallbackElement;
          } else if (match.route.Component) {
            children = /* @__PURE__ */ React2.createElement(match.route.Component, null);
          } else if (match.route.element) {
            children = match.route.element;
          } else {
            children = outlet;
          }
          return /* @__PURE__ */ React2.createElement(
            RenderedRoute,
            {
              match,
              routeContext: {
                outlet,
                matches: matches2,
                isDataRoute: dataRouterState != null
              },
              children
            }
          );
        };
        return dataRouterState && (match.route.ErrorBoundary || match.route.errorElement || index === 0) ? /* @__PURE__ */ React2.createElement(
          RenderErrorBoundary,
          {
            location: dataRouterState.location,
            revalidation: dataRouterState.revalidation,
            component: errorElement,
            error,
            children: getChildren(),
            routeContext: { outlet: null, matches: matches2, isDataRoute: true },
            onError
          }
        ) : getChildren();
      },
      null
    );
  }
  function getDataRouterConsoleError(hookName) {
    return `${hookName} must be used within a data router.  See https://reactrouter.com/en/main/routers/picking-a-router.`;
  }
  function useDataRouterContext(hookName) {
    let ctx = React2.useContext(DataRouterContext);
    invariant(ctx, getDataRouterConsoleError(hookName));
    return ctx;
  }
  function useDataRouterState(hookName) {
    let state = React2.useContext(DataRouterStateContext);
    invariant(state, getDataRouterConsoleError(hookName));
    return state;
  }
  function useRouteContext(hookName) {
    let route = React2.useContext(RouteContext);
    invariant(route, getDataRouterConsoleError(hookName));
    return route;
  }
  function useCurrentRouteId(hookName) {
    let route = useRouteContext(hookName);
    let thisRoute = route.matches[route.matches.length - 1];
    invariant(
      thisRoute.route.id,
      `${hookName} can only be used on routes that contain a unique "id"`
    );
    return thisRoute.route.id;
  }
  function useRouteId() {
    return useCurrentRouteId(
      "useRouteId"
      /* UseRouteId */
    );
  }
  function useNavigation() {
    let state = useDataRouterState(
      "useNavigation"
      /* UseNavigation */
    );
    return React2.useMemo(() => {
      let { matches, historyAction, ...rest } = state.navigation;
      return rest;
    }, [state.navigation]);
  }
  function useMatches() {
    let { matches, loaderData } = useDataRouterState(
      "useMatches"
      /* UseMatches */
    );
    return React2.useMemo(
      () => matches.map((m) => convertRouteMatchToUiMatch(m, loaderData)),
      [matches, loaderData]
    );
  }
  function useRouteError() {
    let error = React2.useContext(RouteErrorContext);
    let state = useDataRouterState(
      "useRouteError"
      /* UseRouteError */
    );
    let routeId = useCurrentRouteId(
      "useRouteError"
      /* UseRouteError */
    );
    if (error !== void 0) {
      return error;
    }
    return state.errors?.[routeId];
  }
  function useNavigateStable() {
    let { router } = useDataRouterContext(
      "useNavigate"
      /* UseNavigateStable */
    );
    let id = useCurrentRouteId(
      "useNavigate"
      /* UseNavigateStable */
    );
    let activeRef = React2.useRef(false);
    useIsomorphicLayoutEffect(() => {
      activeRef.current = true;
    });
    let navigate = React2.useCallback(
      async (to, options = {}) => {
        warning(activeRef.current, navigateEffectWarning);
        if (!activeRef.current) return;
        if (typeof to === "number") {
          await router.navigate(to);
        } else {
          await router.navigate(to, { fromRouteId: id, ...options });
        }
      },
      [router, id]
    );
    return navigate;
  }
  var alreadyWarned = {};
  function warningOnce(key, cond, message) {
    if (!cond && !alreadyWarned[key]) {
      alreadyWarned[key] = true;
      warning(false, message);
    }
  }
  var USE_OPTIMISTIC = "useOptimistic";
  var useOptimisticImpl = React3[USE_OPTIMISTIC];
  var MemoizedDataRoutes = React3.memo(DataRoutes2);
  function DataRoutes2({
    routes,
    manifest,
    future,
    state,
    isStatic,
    onError
  }) {
    return useRoutesImpl(routes, void 0, {
      manifest,
      state,
      isStatic,
      onError,
      future
    });
  }
  function MemoryRouter({
    basename,
    children,
    initialEntries,
    initialIndex,
    useTransitions
  }) {
    let historyRef = React3.useRef();
    if (historyRef.current == null) {
      historyRef.current = createMemoryHistory({
        initialEntries,
        initialIndex,
        v5Compat: true
      });
    }
    let history = historyRef.current;
    let [state, setStateImpl] = React3.useState({
      action: history.action,
      location: history.location
    });
    let setState = React3.useCallback(
      (newState) => {
        if (useTransitions === false) {
          setStateImpl(newState);
        } else {
          React3.startTransition(() => setStateImpl(newState));
        }
      },
      [useTransitions]
    );
    React3.useLayoutEffect(() => history.listen(setState), [history, setState]);
    return /* @__PURE__ */ React3.createElement(
      Router,
      {
        basename,
        children,
        location: state.location,
        navigationType: state.action,
        navigator: history,
        useTransitions
      }
    );
  }
  function Router({
    basename: basenameProp = "/",
    children = null,
    location: locationProp,
    navigationType = "POP",
    navigator: navigator2,
    static: staticProp = false,
    useTransitions
  }) {
    invariant(
      !useInRouterContext(),
      `You cannot render a <Router> inside another <Router>. You should never have more than one in your app.`
    );
    let basename = basenameProp.replace(/^\/*/, "/");
    let navigationContext = React3.useMemo(
      () => ({
        basename,
        navigator: navigator2,
        static: staticProp,
        useTransitions,
        future: {}
      }),
      [basename, navigator2, staticProp, useTransitions]
    );
    if (typeof locationProp === "string") {
      locationProp = parsePath(locationProp);
    }
    let {
      pathname = "/",
      search = "",
      hash = "",
      state = null,
      key = "default",
      mask
    } = locationProp;
    let locationContext = React3.useMemo(() => {
      let trailingPathname = stripBasename(pathname, basename);
      if (trailingPathname == null) {
        return null;
      }
      return {
        location: {
          pathname: trailingPathname,
          search,
          hash,
          state,
          key,
          mask
        },
        navigationType
      };
    }, [basename, pathname, search, hash, state, key, navigationType, mask]);
    warning(
      locationContext != null,
      `<Router basename="${basename}"> is not able to match the URL "${pathname}${search}${hash}" because it does not start with the basename, so the <Router> won't render anything.`
    );
    if (locationContext == null) {
      return null;
    }
    return /* @__PURE__ */ React3.createElement(NavigationContext.Provider, { value: navigationContext }, /* @__PURE__ */ React3.createElement(LocationContext.Provider, { children, value: locationContext }));
  }
  var defaultMethod = "get";
  var defaultEncType = "application/x-www-form-urlencoded";
  function isHtmlElement(object) {
    return typeof HTMLElement !== "undefined" && object instanceof HTMLElement;
  }
  function isButtonElement(object) {
    return isHtmlElement(object) && object.tagName.toLowerCase() === "button";
  }
  function isFormElement(object) {
    return isHtmlElement(object) && object.tagName.toLowerCase() === "form";
  }
  function isInputElement(object) {
    return isHtmlElement(object) && object.tagName.toLowerCase() === "input";
  }
  function isModifiedEvent(event) {
    return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
  }
  function shouldProcessLinkClick(event, target) {
    return event.button === 0 && // Ignore everything but left clicks
    (!target || target === "_self") && // Let browser handle "target=_blank" etc.
    !isModifiedEvent(event);
  }
  var _formDataSupportsSubmitter = null;
  function isFormDataSubmitterSupported() {
    if (_formDataSupportsSubmitter === null) {
      try {
        new FormData(
          document.createElement("form"),
          // @ts-expect-error if FormData supports the submitter parameter, this will throw
          0
        );
        _formDataSupportsSubmitter = false;
      } catch (e2) {
        _formDataSupportsSubmitter = true;
      }
    }
    return _formDataSupportsSubmitter;
  }
  var supportedFormEncTypes = /* @__PURE__ */ new Set([
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/plain"
  ]);
  function getFormEncType(encType) {
    if (encType != null && !supportedFormEncTypes.has(encType)) {
      warning(
        false,
        `"${encType}" is not a valid \`encType\` for \`<Form>\`/\`<fetcher.Form>\` and will default to "${defaultEncType}"`
      );
      return null;
    }
    return encType;
  }
  function getFormSubmissionInfo(target, basename) {
    let method;
    let action;
    let encType;
    let formData;
    let body;
    if (isFormElement(target)) {
      let attr = target.getAttribute("action");
      action = attr ? stripBasename(attr, basename) : null;
      method = target.getAttribute("method") || defaultMethod;
      encType = getFormEncType(target.getAttribute("enctype")) || defaultEncType;
      formData = new FormData(target);
    } else if (isButtonElement(target) || isInputElement(target) && (target.type === "submit" || target.type === "image")) {
      let form = target.form;
      if (form == null) {
        throw new Error(
          `Cannot submit a <button> or <input type="submit"> without a <form>`
        );
      }
      let attr = target.getAttribute("formaction") || form.getAttribute("action");
      action = attr ? stripBasename(attr, basename) : null;
      method = target.getAttribute("formmethod") || form.getAttribute("method") || defaultMethod;
      encType = getFormEncType(target.getAttribute("formenctype")) || getFormEncType(form.getAttribute("enctype")) || defaultEncType;
      formData = new FormData(form, target);
      if (!isFormDataSubmitterSupported()) {
        let { name, type, value } = target;
        if (type === "image") {
          let prefix = name ? `${name}.` : "";
          formData.append(`${prefix}x`, "0");
          formData.append(`${prefix}y`, "0");
        } else if (name) {
          formData.append(name, value);
        }
      }
    } else if (isHtmlElement(target)) {
      throw new Error(
        `Cannot submit element that is not <form>, <button>, or <input type="submit|image">`
      );
    } else {
      method = defaultMethod;
      action = null;
      encType = defaultEncType;
      body = target;
    }
    if (formData && encType === "text/plain") {
      body = formData;
      formData = void 0;
    }
    return { action, method: method.toLowerCase(), encType, formData, body };
  }
  var objectProtoNames2 = Object.getOwnPropertyNames(Object.prototype).sort().join("\0");
  var ESCAPE_LOOKUP = {
    "&": "\\u0026",
    ">": "\\u003e",
    "<": "\\u003c",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029"
  };
  var ESCAPE_REGEX = /[&><\u2028\u2029]/g;
  function escapeHtml(html) {
    return html.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match]);
  }
  function invariant2(value, message) {
    if (value === false || value === null || typeof value === "undefined") {
      throw new Error(message);
    }
  }
  function singleFetchUrl(reqUrl, basename, trailingSlashAware, extension) {
    let url = typeof reqUrl === "string" ? new URL(
      reqUrl,
      // This can be called during the SSR flow via PrefetchPageLinksImpl so
      // don't assume window is available
      typeof window === "undefined" ? "server://singlefetch/" : window.location.origin
    ) : reqUrl;
    if (trailingSlashAware) {
      if (url.pathname.endsWith("/")) {
        url.pathname = `${url.pathname}_.${extension}`;
      } else {
        url.pathname = `${url.pathname}.${extension}`;
      }
    } else {
      if (url.pathname === "/") {
        url.pathname = `_root.${extension}`;
      } else if (basename && stripBasename(url.pathname, basename) === "/") {
        url.pathname = `${removeTrailingSlash(basename)}/_root.${extension}`;
      } else {
        url.pathname = `${removeTrailingSlash(url.pathname)}.${extension}`;
      }
    }
    return url;
  }
  async function loadRouteModule(route, routeModulesCache) {
    if (route.id in routeModulesCache) {
      return routeModulesCache[route.id];
    }
    try {
      let routeModule = await import(
        /* @vite-ignore */
        /* webpackIgnore: true */
        route.module
      );
      routeModulesCache[route.id] = routeModule;
      return routeModule;
    } catch (error) {
      console.error(
        `Error loading route module \`${route.module}\`, reloading page...`
      );
      console.error(error);
      if (window.__reactRouterContext && window.__reactRouterContext.isSpaMode && // @ts-expect-error
      import_meta.hot) {
        throw error;
      }
      window.location.reload();
      return new Promise(() => {
      });
    }
  }
  function isPageLinkDescriptor(object) {
    return object != null && typeof object.page === "string";
  }
  function isHtmlLinkDescriptor(object) {
    if (object == null) {
      return false;
    }
    if (object.href == null) {
      return object.rel === "preload" && typeof object.imageSrcSet === "string" && typeof object.imageSizes === "string";
    }
    return typeof object.rel === "string" && typeof object.href === "string";
  }
  async function getKeyedPrefetchLinks(matches, manifest, routeModules) {
    let links = await Promise.all(
      matches.map(async (match) => {
        let route = manifest.routes[match.route.id];
        if (route) {
          let mod = await loadRouteModule(route, routeModules);
          return mod.links ? mod.links() : [];
        }
        return [];
      })
    );
    return dedupeLinkDescriptors(
      links.flat(1).filter(isHtmlLinkDescriptor).filter((link) => link.rel === "stylesheet" || link.rel === "preload").map(
        (link) => link.rel === "stylesheet" ? { ...link, rel: "prefetch", as: "style" } : { ...link, rel: "prefetch" }
      )
    );
  }
  function getNewMatchesForLinks(page, nextMatches, currentMatches, manifest, location, mode) {
    let isNew = (match, index) => {
      if (!currentMatches[index]) return true;
      return match.route.id !== currentMatches[index].route.id;
    };
    let matchPathChanged = (match, index) => {
      return (
        // param change, /users/123 -> /users/456
        currentMatches[index].pathname !== match.pathname || // splat param changed, which is not present in match.path
        // e.g. /files/images/avatar.jpg -> files/finances.xls
        currentMatches[index].route.path?.endsWith("*") && currentMatches[index].params["*"] !== match.params["*"]
      );
    };
    if (mode === "assets") {
      return nextMatches.filter(
        (match, index) => isNew(match, index) || matchPathChanged(match, index)
      );
    }
    if (mode === "data") {
      return nextMatches.filter((match, index) => {
        let manifestRoute = manifest.routes[match.route.id];
        if (!manifestRoute || !manifestRoute.hasLoader) {
          return false;
        }
        if (isNew(match, index) || matchPathChanged(match, index)) {
          return true;
        }
        if (match.route.shouldRevalidate) {
          let routeChoice = match.route.shouldRevalidate({
            currentUrl: new URL(
              location.pathname + location.search + location.hash,
              window.origin
            ),
            currentParams: currentMatches[0]?.params || {},
            nextUrl: new URL(page, window.origin),
            nextParams: match.params,
            defaultShouldRevalidate: true
          });
          if (typeof routeChoice === "boolean") {
            return routeChoice;
          }
        }
        return true;
      });
    }
    return [];
  }
  function getModuleLinkHrefs(matches, manifest, { includeHydrateFallback } = {}) {
    return dedupeHrefs(
      matches.map((match) => {
        let route = manifest.routes[match.route.id];
        if (!route) return [];
        let hrefs = [route.module];
        if (route.clientActionModule) {
          hrefs = hrefs.concat(route.clientActionModule);
        }
        if (route.clientLoaderModule) {
          hrefs = hrefs.concat(route.clientLoaderModule);
        }
        if (includeHydrateFallback && route.hydrateFallbackModule) {
          hrefs = hrefs.concat(route.hydrateFallbackModule);
        }
        if (route.imports) {
          hrefs = hrefs.concat(route.imports);
        }
        return hrefs;
      }).flat(1)
    );
  }
  function dedupeHrefs(hrefs) {
    return [...new Set(hrefs)];
  }
  function sortKeys(obj) {
    let sorted = {};
    let keys = Object.keys(obj).sort();
    for (let key of keys) {
      sorted[key] = obj[key];
    }
    return sorted;
  }
  function dedupeLinkDescriptors(descriptors, preloads) {
    let set = /* @__PURE__ */ new Set();
    let preloadsSet = new Set(preloads);
    return descriptors.reduce((deduped, descriptor) => {
      let alreadyModulePreload = preloads && !isPageLinkDescriptor(descriptor) && descriptor.as === "script" && descriptor.href && preloadsSet.has(descriptor.href);
      if (alreadyModulePreload) {
        return deduped;
      }
      let key = JSON.stringify(sortKeys(descriptor));
      if (!set.has(key)) {
        set.add(key);
        deduped.push({ key, link: descriptor });
      }
      return deduped;
    }, []);
  }
  function useDataRouterContext2() {
    let context = React8.useContext(DataRouterContext);
    invariant2(
      context,
      "You must render this element inside a <DataRouterContext.Provider> element"
    );
    return context;
  }
  function useDataRouterStateContext() {
    let context = React8.useContext(DataRouterStateContext);
    invariant2(
      context,
      "You must render this element inside a <DataRouterStateContext.Provider> element"
    );
    return context;
  }
  var FrameworkContext = React8.createContext(void 0);
  FrameworkContext.displayName = "FrameworkContext";
  function useFrameworkContext() {
    let context = React8.useContext(FrameworkContext);
    invariant2(
      context,
      "You must render this element inside a <HydratedRouter> element"
    );
    return context;
  }
  function usePrefetchBehavior(prefetch, theirElementProps) {
    let frameworkContext = React8.useContext(FrameworkContext);
    let [maybePrefetch, setMaybePrefetch] = React8.useState(false);
    let [shouldPrefetch, setShouldPrefetch] = React8.useState(false);
    let { onFocus, onBlur, onMouseEnter, onMouseLeave, onTouchStart } = theirElementProps;
    let ref = React8.useRef(null);
    React8.useEffect(() => {
      if (prefetch === "render") {
        setShouldPrefetch(true);
      }
      if (prefetch === "viewport") {
        let callback = (entries) => {
          entries.forEach((entry) => {
            setShouldPrefetch(entry.isIntersecting);
          });
        };
        let observer = new IntersectionObserver(callback, { threshold: 0.5 });
        if (ref.current) observer.observe(ref.current);
        return () => {
          observer.disconnect();
        };
      }
    }, [prefetch]);
    React8.useEffect(() => {
      if (maybePrefetch) {
        let id = setTimeout(() => {
          setShouldPrefetch(true);
        }, 100);
        return () => {
          clearTimeout(id);
        };
      }
    }, [maybePrefetch]);
    let setIntent = () => {
      setMaybePrefetch(true);
    };
    let cancelIntent = () => {
      setMaybePrefetch(false);
      setShouldPrefetch(false);
    };
    if (!frameworkContext) {
      return [false, ref, {}];
    }
    if (prefetch !== "intent") {
      return [shouldPrefetch, ref, {}];
    }
    return [
      shouldPrefetch,
      ref,
      {
        onFocus: composeEventHandlers(onFocus, setIntent),
        onBlur: composeEventHandlers(onBlur, cancelIntent),
        onMouseEnter: composeEventHandlers(onMouseEnter, setIntent),
        onMouseLeave: composeEventHandlers(onMouseLeave, cancelIntent),
        onTouchStart: composeEventHandlers(onTouchStart, setIntent)
      }
    ];
  }
  function composeEventHandlers(theirHandler, ourHandler) {
    return (event) => {
      theirHandler && theirHandler(event);
      if (!event.defaultPrevented) {
        ourHandler(event);
      }
    };
  }
  function PrefetchPageLinks({ page, ...linkProps }) {
    let rsc = useIsRSCRouterContext();
    let { nonce: contextNonce } = useFrameworkContext();
    let { router } = useDataRouterContext2();
    let matches = React8.useMemo(
      () => matchRoutes(router.routes, page, router.basename),
      [router.routes, page, router.basename]
    );
    if (!matches) {
      return null;
    }
    if (linkProps.nonce == null && contextNonce) {
      linkProps = { ...linkProps, nonce: contextNonce };
    }
    if (rsc) {
      return /* @__PURE__ */ React8.createElement(RSCPrefetchPageLinksImpl, { page, matches, ...linkProps });
    }
    return /* @__PURE__ */ React8.createElement(PrefetchPageLinksImpl, { page, matches, ...linkProps });
  }
  function useKeyedPrefetchLinks(matches) {
    let { manifest, routeModules } = useFrameworkContext();
    let [keyedPrefetchLinks, setKeyedPrefetchLinks] = React8.useState([]);
    React8.useEffect(() => {
      let interrupted = false;
      void getKeyedPrefetchLinks(matches, manifest, routeModules).then(
        (links) => {
          if (!interrupted) {
            setKeyedPrefetchLinks(links);
          }
        }
      );
      return () => {
        interrupted = true;
      };
    }, [matches, manifest, routeModules]);
    return keyedPrefetchLinks;
  }
  function RSCPrefetchPageLinksImpl({
    page,
    matches: nextMatches,
    ...linkProps
  }) {
    let location = useLocation();
    let { future } = useFrameworkContext();
    let { basename } = useDataRouterContext2();
    let dataHrefs = React8.useMemo(() => {
      if (page === location.pathname + location.search + location.hash) {
        return [];
      }
      let url = singleFetchUrl(
        page,
        basename,
        future.v8_trailingSlashAwareDataRequests,
        "rsc"
      );
      let hasSomeRoutesWithShouldRevalidate = false;
      let targetRoutes = [];
      for (let match of nextMatches) {
        if (typeof match.route.shouldRevalidate === "function") {
          hasSomeRoutesWithShouldRevalidate = true;
        } else {
          targetRoutes.push(match.route.id);
        }
      }
      if (hasSomeRoutesWithShouldRevalidate && targetRoutes.length > 0) {
        url.searchParams.set("_routes", targetRoutes.join(","));
      }
      return [url.pathname + url.search];
    }, [
      basename,
      future.v8_trailingSlashAwareDataRequests,
      page,
      location,
      nextMatches
    ]);
    return /* @__PURE__ */ React8.createElement(React8.Fragment, null, dataHrefs.map((href) => /* @__PURE__ */ React8.createElement("link", { key: href, rel: "prefetch", as: "fetch", href, ...linkProps })));
  }
  function PrefetchPageLinksImpl({
    page,
    matches: nextMatches,
    ...linkProps
  }) {
    let location = useLocation();
    let { future, manifest, routeModules } = useFrameworkContext();
    let { basename } = useDataRouterContext2();
    let { loaderData, matches } = useDataRouterStateContext();
    let newMatchesForData = React8.useMemo(
      () => getNewMatchesForLinks(
        page,
        nextMatches,
        matches,
        manifest,
        location,
        "data"
      ),
      [page, nextMatches, matches, manifest, location]
    );
    let newMatchesForAssets = React8.useMemo(
      () => getNewMatchesForLinks(
        page,
        nextMatches,
        matches,
        manifest,
        location,
        "assets"
      ),
      [page, nextMatches, matches, manifest, location]
    );
    let dataHrefs = React8.useMemo(() => {
      if (page === location.pathname + location.search + location.hash) {
        return [];
      }
      let routesParams = /* @__PURE__ */ new Set();
      let foundOptOutRoute = false;
      nextMatches.forEach((m) => {
        let manifestRoute = manifest.routes[m.route.id];
        if (!manifestRoute || !manifestRoute.hasLoader) {
          return;
        }
        if (!newMatchesForData.some((m2) => m2.route.id === m.route.id) && m.route.id in loaderData && routeModules[m.route.id]?.shouldRevalidate) {
          foundOptOutRoute = true;
        } else if (manifestRoute.hasClientLoader) {
          foundOptOutRoute = true;
        } else {
          routesParams.add(m.route.id);
        }
      });
      if (routesParams.size === 0) {
        return [];
      }
      let url = singleFetchUrl(
        page,
        basename,
        future.v8_trailingSlashAwareDataRequests,
        "data"
      );
      if (foundOptOutRoute && routesParams.size > 0) {
        url.searchParams.set(
          "_routes",
          nextMatches.filter((m) => routesParams.has(m.route.id)).map((m) => m.route.id).join(",")
        );
      }
      return [url.pathname + url.search];
    }, [
      basename,
      future.v8_trailingSlashAwareDataRequests,
      loaderData,
      location,
      manifest,
      newMatchesForData,
      nextMatches,
      page,
      routeModules
    ]);
    let moduleHrefs = React8.useMemo(
      () => getModuleLinkHrefs(newMatchesForAssets, manifest),
      [newMatchesForAssets, manifest]
    );
    let keyedPrefetchLinks = useKeyedPrefetchLinks(newMatchesForAssets);
    return /* @__PURE__ */ React8.createElement(React8.Fragment, null, dataHrefs.map((href) => /* @__PURE__ */ React8.createElement("link", { key: href, rel: "prefetch", as: "fetch", href, ...linkProps })), moduleHrefs.map((href) => /* @__PURE__ */ React8.createElement("link", { key: href, rel: "modulepreload", href, ...linkProps })), keyedPrefetchLinks.map(({ key, link }) => (
      // these don't spread `linkProps` because they are full link descriptors
      // already with their own props
      /* @__PURE__ */ React8.createElement(
        "link",
        {
          key,
          nonce: linkProps.nonce,
          ...link,
          crossOrigin: link.crossOrigin ?? linkProps.crossOrigin
        }
      )
    )));
  }
  function mergeRefs(...refs) {
    return (value) => {
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(value);
        } else if (ref != null) {
          ref.current = value;
        }
      });
    };
  }
  var isBrowser2 = typeof window !== "undefined" && typeof window.document !== "undefined" && typeof window.document.createElement !== "undefined";
  try {
    if (isBrowser2) {
      window.__reactRouterVersion = // @ts-expect-error
      "7.18.3";
    }
  } catch (e2) {
  }
  function HistoryRouter({
    basename,
    children,
    history,
    useTransitions
  }) {
    let [state, setStateImpl] = React10.useState({
      action: history.action,
      location: history.location
    });
    let setState = React10.useCallback(
      (newState) => {
        if (useTransitions === false) {
          setStateImpl(newState);
        } else {
          React10.startTransition(() => setStateImpl(newState));
        }
      },
      [useTransitions]
    );
    React10.useLayoutEffect(() => history.listen(setState), [history, setState]);
    return /* @__PURE__ */ React10.createElement(
      Router,
      {
        basename,
        children,
        location: state.location,
        navigationType: state.action,
        navigator: history,
        useTransitions
      }
    );
  }
  HistoryRouter.displayName = "unstable_HistoryRouter";
  var Link = React10.forwardRef(
    function LinkWithRef({
      onClick,
      discover = "render",
      prefetch = "none",
      relative,
      reloadDocument,
      replace: replace2,
      mask,
      state,
      target,
      to,
      preventScrollReset,
      viewTransition,
      defaultShouldRevalidate,
      ...rest
    }, forwardedRef) {
      let { basename, navigator: navigator2, useTransitions } = React10.useContext(NavigationContext);
      let isAbsolute = typeof to === "string" && ABSOLUTE_URL_REGEX.test(to);
      let parsed = parseToInfo(to, basename);
      to = parsed.to;
      let href = useHref(to, { relative });
      let location = useLocation();
      let maskedHref = null;
      if (mask) {
        let resolved = resolveTo(
          mask,
          [],
          location.mask ? location.mask.pathname : "/",
          true
        );
        if (basename !== "/") {
          resolved.pathname = resolved.pathname === "/" ? basename : joinPaths([basename, resolved.pathname]);
        }
        maskedHref = navigator2.createHref(resolved);
      }
      let [shouldPrefetch, prefetchRef, prefetchHandlers] = usePrefetchBehavior(
        prefetch,
        rest
      );
      let internalOnClick = useLinkClickHandler(to, {
        replace: replace2,
        mask,
        state,
        target,
        preventScrollReset,
        relative,
        viewTransition,
        defaultShouldRevalidate,
        useTransitions
      });
      function handleClick(event) {
        if (onClick) onClick(event);
        if (!event.defaultPrevented) {
          internalOnClick(event);
        }
      }
      let isSpaLink = !(parsed.isExternal || reloadDocument);
      let link = (
        // eslint-disable-next-line jsx-a11y/anchor-has-content
        /* @__PURE__ */ React10.createElement(
          "a",
          {
            ...rest,
            ...prefetchHandlers,
            href: (isSpaLink ? maskedHref : void 0) || parsed.absoluteURL || href,
            onClick: isSpaLink ? handleClick : onClick,
            ref: mergeRefs(forwardedRef, prefetchRef),
            target,
            "data-discover": !isAbsolute && discover === "render" ? "true" : void 0
          }
        )
      );
      return shouldPrefetch && !isAbsolute ? /* @__PURE__ */ React10.createElement(React10.Fragment, null, link, /* @__PURE__ */ React10.createElement(PrefetchPageLinks, { page: href })) : link;
    }
  );
  Link.displayName = "Link";
  var NavLink = React10.forwardRef(
    function NavLinkWithRef({
      "aria-current": ariaCurrentProp = "page",
      caseSensitive = false,
      className: classNameProp = "",
      end = false,
      style: styleProp,
      to,
      viewTransition,
      children,
      ...rest
    }, ref) {
      let path = useResolvedPath(to, { relative: rest.relative });
      let location = useLocation();
      let routerState = React10.useContext(DataRouterStateContext);
      let { navigator: navigator2, basename } = React10.useContext(NavigationContext);
      let isTransitioning = routerState != null && // Conditional usage is OK here because the usage of a data router is static
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useViewTransitionState(path) && viewTransition === true;
      let toPathname = navigator2.encodeLocation ? navigator2.encodeLocation(path).pathname : path.pathname;
      let locationPathname = location.pathname;
      let nextLocationPathname = routerState && routerState.navigation && routerState.navigation.location ? routerState.navigation.location.pathname : null;
      if (!caseSensitive) {
        locationPathname = locationPathname.toLowerCase();
        nextLocationPathname = nextLocationPathname ? nextLocationPathname.toLowerCase() : null;
        toPathname = toPathname.toLowerCase();
      }
      if (nextLocationPathname && basename) {
        nextLocationPathname = stripBasename(nextLocationPathname, basename) || nextLocationPathname;
      }
      const endSlashPosition = toPathname !== "/" && toPathname.endsWith("/") ? toPathname.length - 1 : toPathname.length;
      let isActive = locationPathname === toPathname || !end && locationPathname.startsWith(toPathname) && locationPathname.charAt(endSlashPosition) === "/";
      let isPending = nextLocationPathname != null && (nextLocationPathname === toPathname || !end && nextLocationPathname.startsWith(toPathname) && nextLocationPathname.charAt(toPathname.length) === "/");
      let renderProps = {
        isActive,
        isPending,
        isTransitioning
      };
      let ariaCurrent = isActive ? ariaCurrentProp : void 0;
      let className;
      if (typeof classNameProp === "function") {
        className = classNameProp(renderProps);
      } else {
        className = [
          classNameProp,
          isActive ? "active" : null,
          isPending ? "pending" : null,
          isTransitioning ? "transitioning" : null
        ].filter(Boolean).join(" ");
      }
      let style = typeof styleProp === "function" ? styleProp(renderProps) : styleProp;
      return /* @__PURE__ */ React10.createElement(
        Link,
        {
          ...rest,
          "aria-current": ariaCurrent,
          className,
          ref,
          style,
          to,
          viewTransition
        },
        typeof children === "function" ? children(renderProps) : children
      );
    }
  );
  NavLink.displayName = "NavLink";
  var Form = React10.forwardRef(
    ({
      discover = "render",
      fetcherKey,
      navigate,
      reloadDocument,
      replace: replace2,
      state,
      method = defaultMethod,
      action,
      onSubmit,
      relative,
      preventScrollReset,
      viewTransition,
      defaultShouldRevalidate,
      ...props
    }, forwardedRef) => {
      let { useTransitions } = React10.useContext(NavigationContext);
      let submit = useSubmit();
      let formAction = useFormAction(action, { relative });
      let formMethod = method.toLowerCase() === "get" ? "get" : "post";
      let isAbsolute = typeof action === "string" && ABSOLUTE_URL_REGEX.test(action);
      let submitHandler = (event) => {
        onSubmit && onSubmit(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        let submitter = event.nativeEvent.submitter;
        let submitMethod = submitter?.getAttribute("formmethod") || method;
        let doSubmit = () => submit(submitter || event.currentTarget, {
          fetcherKey,
          method: submitMethod,
          navigate,
          replace: replace2,
          state,
          relative,
          preventScrollReset,
          viewTransition,
          defaultShouldRevalidate
        });
        if (useTransitions && navigate !== false) {
          React10.startTransition(() => doSubmit());
        } else {
          doSubmit();
        }
      };
      return /* @__PURE__ */ React10.createElement(
        "form",
        {
          ref: forwardedRef,
          method: formMethod,
          action: formAction,
          onSubmit: reloadDocument ? onSubmit : submitHandler,
          ...props,
          "data-discover": !isAbsolute && discover === "render" ? "true" : void 0
        }
      );
    }
  );
  Form.displayName = "Form";
  function ScrollRestoration({
    getKey,
    storageKey,
    ...props
  }) {
    let remixContext = React10.useContext(FrameworkContext);
    let { basename } = React10.useContext(NavigationContext);
    let location = useLocation();
    let matches = useMatches();
    useScrollRestoration({ getKey, storageKey });
    let ssrKey = React10.useMemo(
      () => {
        if (!remixContext || !getKey) return null;
        let userKey = getScrollRestorationKey(
          location,
          matches,
          basename,
          getKey
        );
        return userKey !== location.key ? userKey : null;
      },
      // Nah, we only need this the first time for the SSR render
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );
    if (!remixContext || remixContext.isSpaMode) {
      return null;
    }
    let restoreScroll = ((storageKey2, restoreKey) => {
      if (!window.history.state || !window.history.state.key) {
        let key = Math.random().toString(32).slice(2);
        window.history.replaceState({ key }, "");
      }
      try {
        let positions = JSON.parse(sessionStorage.getItem(storageKey2) || "{}");
        let storedY = positions[restoreKey || window.history.state.key];
        if (typeof storedY === "number") {
          window.scrollTo(0, storedY);
        }
      } catch (error) {
        console.error(error);
        sessionStorage.removeItem(storageKey2);
      }
    }).toString();
    if (props.nonce == null && remixContext?.nonce) {
      props.nonce = remixContext.nonce;
    }
    return /* @__PURE__ */ React10.createElement(
      "script",
      {
        ...props,
        suppressHydrationWarning: true,
        dangerouslySetInnerHTML: {
          __html: `(${restoreScroll})(${escapeHtml(
            JSON.stringify(storageKey || SCROLL_RESTORATION_STORAGE_KEY)
          )}, ${escapeHtml(JSON.stringify(ssrKey))})`
        }
      }
    );
  }
  ScrollRestoration.displayName = "ScrollRestoration";
  function getDataRouterConsoleError2(hookName) {
    return `${hookName} must be used within a data router.  See https://reactrouter.com/en/main/routers/picking-a-router.`;
  }
  function useDataRouterContext3(hookName) {
    let ctx = React10.useContext(DataRouterContext);
    invariant(ctx, getDataRouterConsoleError2(hookName));
    return ctx;
  }
  function useDataRouterState2(hookName) {
    let state = React10.useContext(DataRouterStateContext);
    invariant(state, getDataRouterConsoleError2(hookName));
    return state;
  }
  function useLinkClickHandler(to, {
    target,
    replace: replaceProp,
    mask,
    state,
    preventScrollReset,
    relative,
    viewTransition,
    defaultShouldRevalidate,
    useTransitions
  } = {}) {
    let navigate = useNavigate();
    let location = useLocation();
    let path = useResolvedPath(to, { relative });
    return React10.useCallback(
      (event) => {
        if (shouldProcessLinkClick(event, target)) {
          event.preventDefault();
          let replace2 = replaceProp !== void 0 ? replaceProp : createPath(location) === createPath(path);
          let doNavigate = () => navigate(to, {
            replace: replace2,
            mask,
            state,
            preventScrollReset,
            relative,
            viewTransition,
            defaultShouldRevalidate
          });
          if (useTransitions) {
            React10.startTransition(() => doNavigate());
          } else {
            doNavigate();
          }
        }
      },
      [
        location,
        navigate,
        path,
        replaceProp,
        mask,
        state,
        target,
        to,
        preventScrollReset,
        relative,
        viewTransition,
        defaultShouldRevalidate,
        useTransitions
      ]
    );
  }
  var fetcherId = 0;
  var getUniqueFetcherId = () => `__${String(++fetcherId)}__`;
  function useSubmit() {
    let { router } = useDataRouterContext3(
      "useSubmit"
      /* UseSubmit */
    );
    let { basename } = React10.useContext(NavigationContext);
    let currentRouteId = useRouteId();
    let routerFetch = router.fetch;
    let routerNavigate = router.navigate;
    return React10.useCallback(
      async (target, options = {}) => {
        let { action, method, encType, formData, body } = getFormSubmissionInfo(
          target,
          basename
        );
        if (options.navigate === false) {
          let key = options.fetcherKey || getUniqueFetcherId();
          await routerFetch(key, currentRouteId, options.action || action, {
            defaultShouldRevalidate: options.defaultShouldRevalidate,
            preventScrollReset: options.preventScrollReset,
            formData,
            body,
            formMethod: options.method || method,
            formEncType: options.encType || encType,
            flushSync: options.flushSync
          });
        } else {
          await routerNavigate(options.action || action, {
            defaultShouldRevalidate: options.defaultShouldRevalidate,
            preventScrollReset: options.preventScrollReset,
            formData,
            body,
            formMethod: options.method || method,
            formEncType: options.encType || encType,
            replace: options.replace,
            state: options.state,
            fromRouteId: currentRouteId,
            flushSync: options.flushSync,
            viewTransition: options.viewTransition
          });
        }
      },
      [routerFetch, routerNavigate, basename, currentRouteId]
    );
  }
  function useFormAction(action, { relative } = {}) {
    let { basename } = React10.useContext(NavigationContext);
    let routeContext = React10.useContext(RouteContext);
    invariant(routeContext, "useFormAction must be used inside a RouteContext");
    let [match] = routeContext.matches.slice(-1);
    let path = { ...useResolvedPath(action ? action : ".", { relative }) };
    let location = useLocation();
    if (action == null) {
      path.search = location.search;
      let params = new URLSearchParams(path.search);
      let indexValues = params.getAll("index");
      let hasNakedIndexParam = indexValues.some((v2) => v2 === "");
      if (hasNakedIndexParam) {
        params.delete("index");
        indexValues.filter((v2) => v2).forEach((v2) => params.append("index", v2));
        let qs2 = params.toString();
        path.search = qs2 ? `?${qs2}` : "";
      }
    }
    if ((!action || action === ".") && match.route.index) {
      path.search = path.search ? path.search.replace(/^\?/, "?index&") : "?index";
    }
    if (basename !== "/") {
      path.pathname = path.pathname === "/" ? basename : joinPaths([basename, path.pathname]);
    }
    return createPath(path);
  }
  var SCROLL_RESTORATION_STORAGE_KEY = "react-router-scroll-positions";
  var savedScrollPositions = {};
  function getScrollRestorationKey(location, matches, basename, getKey) {
    let key = null;
    if (getKey) {
      if (basename !== "/") {
        key = getKey(
          {
            ...location,
            pathname: stripBasename(location.pathname, basename) || location.pathname
          },
          matches
        );
      } else {
        key = getKey(location, matches);
      }
    }
    if (key == null) {
      key = location.key;
    }
    return key;
  }
  function useScrollRestoration({
    getKey,
    storageKey
  } = {}) {
    let { router } = useDataRouterContext3(
      "useScrollRestoration"
      /* UseScrollRestoration */
    );
    let { restoreScrollPosition, preventScrollReset } = useDataRouterState2(
      "useScrollRestoration"
      /* UseScrollRestoration */
    );
    let { basename } = React10.useContext(NavigationContext);
    let location = useLocation();
    let matches = useMatches();
    let navigation = useNavigation();
    React10.useEffect(() => {
      window.history.scrollRestoration = "manual";
      return () => {
        window.history.scrollRestoration = "auto";
      };
    }, []);
    usePageHide(
      React10.useCallback(() => {
        if (navigation.state === "idle") {
          let key = getScrollRestorationKey(location, matches, basename, getKey);
          savedScrollPositions[key] = window.scrollY;
        }
        try {
          sessionStorage.setItem(
            storageKey || SCROLL_RESTORATION_STORAGE_KEY,
            JSON.stringify(savedScrollPositions)
          );
        } catch (error) {
          warning(
            false,
            `Failed to save scroll positions in sessionStorage, <ScrollRestoration /> will not work properly (${error}).`
          );
        }
        window.history.scrollRestoration = "auto";
      }, [navigation.state, getKey, basename, location, matches, storageKey])
    );
    if (typeof document !== "undefined") {
      React10.useLayoutEffect(() => {
        try {
          let sessionPositions = sessionStorage.getItem(
            storageKey || SCROLL_RESTORATION_STORAGE_KEY
          );
          if (sessionPositions) {
            savedScrollPositions = JSON.parse(sessionPositions);
          }
        } catch (e2) {
        }
      }, [storageKey]);
      React10.useLayoutEffect(() => {
        let disableScrollRestoration = router?.enableScrollRestoration(
          savedScrollPositions,
          () => window.scrollY,
          getKey ? (location2, matches2) => getScrollRestorationKey(location2, matches2, basename, getKey) : void 0
        );
        return () => disableScrollRestoration && disableScrollRestoration();
      }, [router, basename, getKey]);
      React10.useLayoutEffect(() => {
        if (restoreScrollPosition === false) {
          return;
        }
        if (typeof restoreScrollPosition === "number") {
          window.scrollTo(0, restoreScrollPosition);
          return;
        }
        try {
          if (location.hash) {
            let el2 = document.getElementById(
              decodeURIComponent(location.hash.slice(1))
            );
            if (el2) {
              el2.scrollIntoView();
              return;
            }
          }
        } catch {
          warning(
            false,
            `"${location.hash.slice(
              1
            )}" is not a decodable element ID. The view will not scroll to it.`
          );
        }
        if (preventScrollReset === true) {
          return;
        }
        window.scrollTo(0, 0);
      }, [location, restoreScrollPosition, preventScrollReset]);
    }
  }
  function usePageHide(callback, options) {
    let { capture } = options || {};
    React10.useEffect(() => {
      let opts = capture != null ? { capture } : void 0;
      window.addEventListener("pagehide", callback, opts);
      return () => {
        window.removeEventListener("pagehide", callback, opts);
      };
    }, [callback, capture]);
  }
  function useViewTransitionState(to, { relative } = {}) {
    let vtContext = React10.useContext(ViewTransitionContext);
    invariant(
      vtContext != null,
      "`useViewTransitionState` must be used within `react-router-dom`'s `RouterProvider`.  Did you accidentally import `RouterProvider` from `react-router`?"
    );
    let { basename } = useDataRouterContext3(
      "useViewTransitionState"
      /* useViewTransitionState */
    );
    let path = useResolvedPath(to, { relative });
    if (!vtContext.isTransitioning) {
      return false;
    }
    let currentPath = stripBasename(vtContext.currentLocation.pathname, basename) || vtContext.currentLocation.pathname;
    let nextPath = stripBasename(vtContext.nextLocation.pathname, basename) || vtContext.nextLocation.pathname;
    return matchPath(path.pathname, nextPath) != null || matchPath(path.pathname, currentPath) != null;
  }

  // ../../opt/files/kit/index.tsx
  var import_jsx_runtime20 = __toESM(require_jsx_runtime());
  function RouteBridge() {
    const location = useLocation();
    const navigate = useNavigate();
    (0, import_react22.useEffect)(() => {
      window.instinctFile.route(location.pathname + location.search + location.hash);
    }, [location]);
    (0, import_react22.useEffect)(() => {
      const restore = (event) => navigate(event.detail, { replace: true });
      window.addEventListener("instinct-route", restore);
      return () => window.removeEventListener("instinct-route", restore);
    }, [navigate]);
    return null;
  }
  function FileRouter({ children }) {
    return /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(MemoryRouter, { initialEntries: [window.instinctFile.initialRoute], children: [
      /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(RouteBridge, {}),
      children
    ] });
  }

  // src/App.tsx
  var import_react24 = __toESM(require_react());

  // src/legal.tsx
  var import_react23 = __toESM(require_react());
  var import_jsx_runtime21 = __toESM(require_jsx_runtime());
  function inline(text, key) {
    const parts = text.split(/\*\*(.+?)\*\*/g);
    return parts.map((p, i) => i % 2 === 1 ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("strong", { children: p }, `${key}-${i}`) : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(import_react23.default.Fragment, { children: p }, `${key}-${i}`));
  }
  function LegalDoc({ md: md2 }) {
    const lines = md2.split("\n");
    const out = [];
    let i = 0;
    let k2 = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      if (line.startsWith("## ")) {
        out.push(/* @__PURE__ */ (0, import_jsx_runtime21.jsx)("h2", { children: inline(line.slice(3), k2) }, k2++));
        i++;
        continue;
      }
      if (line.startsWith("# ")) {
        out.push(/* @__PURE__ */ (0, import_jsx_runtime21.jsx)("h1", { children: inline(line.slice(2), k2) }, k2++));
        i++;
        continue;
      }
      if (line.startsWith("|")) {
        const rows = [];
        while (i < lines.length && lines[i].startsWith("|")) {
          const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
          if (!/^[-: ]+$/.test(cells.join(""))) rows.push(cells);
          i++;
        }
        out.push(
          /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("table", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("tr", { children: rows[0]?.map((c, j2) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("th", { children: inline(c, j2) }, j2)) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("tbody", { children: rows.slice(1).map((r, ri) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("tr", { children: r.map((c, ci) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("td", { children: inline(c, ci) }, ci)) }, ri)) })
          ] }, k2++)
        );
        continue;
      }
      if (line.startsWith("- ")) {
        const items = [];
        while (i < lines.length && lines[i].startsWith("- ")) {
          items.push(lines[i].slice(2));
          i++;
        }
        out.push(/* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ul", { children: items.map((it2, j2) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("li", { children: inline(it2, j2) }, j2)) }, k2++));
        continue;
      }
      out.push(/* @__PURE__ */ (0, import_jsx_runtime21.jsx)("p", { children: inline(line, k2) }, k2++));
      i++;
    }
    return /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "udc-legal-doc", children: out });
  }
  var TERMS_MD = `# Updowncircle (UDC) - Terms & Conditions

Version: 0.3 | Effective date: 25 October 2026 | Website: updowncircle.site

## 1. Who we are
"UDC", "we", "us" means Muhammad N P, sole proprietor trading as "Updowncircle", Zam Zam Manzil, PO Varam, Kannur, Kerala, India. Contact: udc@updowncircle.site.

## 2. What UDC is, and what it is not
2.1 UDC is a WhatsApp-first coordination service for business-to-business import and export. Through our assistant "AKIF" and our team, we introduce verified buyers, sellers and agents, record requirements and offers, coordinate documents, track milestones and flag exceptions.
2.2 UDC is **not** a bank, issuing bank, confirming bank, payment service, escrow agent, insurer, freight forwarder, customs broker, inspection company or law firm.
2.3 UDC is **not** a party to the sale contract between buyer and seller unless we say so in a separate signed document.
2.4 **UDC never holds, receives, routes or releases the price of the goods.** Goods payment moves between the buyer's bank and the seller's bank under the sale contract and any bank instrument. UDC's own fee is invoiced separately (Section 9).
2.5 **UDC does not guarantee** payment, delivery, quality, quantity, inspection results, a buyer's or seller's performance, bank acceptance, or that any deal will complete.

## 3. Eligibility, accounts and acceptance
3.1 UDC is for businesses and persons acting for a business, aged 18 or over, with legal capacity. **These terms are for businesses only; we do not offer the service to consumers.**
3.2 You may register as Buyer, Seller or Agent. You may hold more than one role with our approval.
3.3 You must give true, complete and current information and keep it updated.
3.4 Account recovery after changing your WhatsApp number requires verifying the registered email by one-time code. An email match alone never merges accounts.
3.5 You are responsible for activity on your WhatsApp number and account. Tell us promptly if it is lost or misused.
3.6 **How you accept these terms.** You accept these terms when you reply "I agree" on WhatsApp (or tick the box on the website) after we send you the link to the version in force. We keep a record of the date, time, version and your number. If you act for a business you confirm you are authorised to bind it.

## 4. Verification before trading
4.1 Only verified accounts can submit requirements or offers that we route to others.
4.2 Verification covers identity, business and bank-related evidence, reviewed by a human. Email code confirmation is not business verification.
4.3 We may approve, reject, suspend or ask for more evidence at our discretion, and record the reason in our audit log.
4.4 "Verified" means we reviewed the documents you gave us at a point in time. It is not a guarantee of creditworthiness, honesty or performance. Do your own due diligence.

## 5. AKIF, our AI assistant
5.1 AKIF is an AI assistant. It does not pretend to be human. You can ask for a human at any time.
5.2 AKIF can extract requirements, search our own verified records, prepare drafts, explain steps and send status updates.
5.3 AKIF cannot bind UDC or you to a contract, approve verification, issue or confirm a letter of credit, or confirm a payment without trusted evidence. Anything AKIF says about price, availability or timing is information to be confirmed by the parties in writing.
5.4 AKIF shows matches only from UDC's verified database. If there is no confirmed match, it will say so. A listing in our database is not proof of stock or capacity. AKIF's matches are suggestions, not recommendations to deal.
5.5 Legal questions, complaints and unusual requests are passed to a human.
5.6 AKIF may make mistakes. Check important details before you rely on them. AKIF's messages are not legal, financial or customs advice - ask your bank, customs broker or adviser.
5.7 Messages in and out of AKIF are logged (see our Privacy Policy).

## 6. How a deal works
6.1 Typical steps: requirement/listing, matching, outreach, negotiation, optional NCNDA, commercial documents (such as LOI, ICPO, SCO, FCO), sale and purchase agreement (SPA), payment arrangements, shipping, inspection, close-out.
6.2 Buyers and sellers decide their own terms. Nothing is accepted unless that party says so. Offers, counter-offers and quotes are binding only as the parties' documents say.
6.3 We may propose Incoterms (default suggestion: CIF) and a documentary letter of credit (DLC). These are proposals, not requirements.
6.4 Documents (LOI, ICPO, SCO, FCO, SPA, NCNDA) are between the trading parties. UDC supplies coordination notes and templates only. Get your own legal advice.

## 7. Payment and DLC
7.1 The proposed payment method is an irrevocable documentary letter of credit issued by the buyer's bank in favour of the seller. Payment goes bank to bank. UDC is never the issuer, beneficiary, custodian or guarantor.
7.2 We may ask for destination inspection (for example by SGS) as a condition. This applies **only if** the buyer and seller agree it in writing **and** the banks involved accept the wording. Under ICC UCP 600, banks examine documents, not goods, and banks will disregard any condition that is not backed by a stated document (UCP 600 art. 14(h)). A destination-inspection condition should be backed by a stated document, such as an inspection certificate issued by the named inspection company, dated before shipment. Where a credit is used, it should state that it is subject to UCP 600. We do not promise any bank will accept a destination-inspection condition.
7.3 Bank charges, inspection fees, freight, insurance, duties and taxes are paid by whoever the SPA says.
7.4 We track and log bank and inspection statuses that are evidenced to us. We do not verify them on behalf of any party and they are not guarantees.

## 8. Documents and the secure vault
8.1 Do not send sensitive documents over WhatsApp chat. We give you a secure, time-limited upload link instead.
8.2 Originals are kept in private storage with access controls. Access to vault documents is logged. AKIF sees verification outcomes, not raw documents.
8.3 You may request deletion of a document or of your data (see the retention table in our Privacy Policy). Data we must keep by law, or need to keep to handle a dispute, fraud or tax matter, will be restricted and not used for other purposes.
8.4 You confirm you have the right to upload the documents you give us.

## 9. Fees and commission
9.1 **UDC's service commission.** Unless a signed fee schedule for a deal says otherwise, UDC charges the seller a service commission on each completed deal:
- Deal value of INR 25,00,000 (Rs 25 lakh) or more: **1%** of the deal value (invoice value).
- Deal value below INR 25,00,000: **2%** of the deal value (invoice value).

For deals in a foreign currency, the deal value is converted to INR at the RBI reference rate on the invoice date.
9.2 By accepting these terms, a seller accepts this fee schedule. Any different rate or paying side for a deal will be set out in a written fee schedule that you have accepted; any fee schedule will state rate, paying side, calculation base, currency, trigger, tax and reversal treatment.
9.3 Commission is invoiced separately, as UDC's own invoice. It is never taken from goods payment. UDC is not a party to the sale contract and does not endorse any price.
9.4 GST at the applicable rate is added once UDC is registered under GST. Until then, no GST is charged.
9.5 Agents' commission is governed by the Agent Referral & Commission Agreement, which overrides these terms on agent commission.

## 10. Non-circumvention
10.1 If you enter a deal with a party introduced by UDC within 24 months of the introduction, whether or not through UDC, you will pay UDC the commission UDC would have earned under the fee schedule that applied to that deal.
10.2 This does not stop you from trading with anyone.
10.3 The amount in 10.1 is a genuine pre-estimate of UDC's loss, not a penalty.
10.4 Where parties also sign an NCNDA, the NCNDA applies alongside this section; this section applies whenever you accept an introduction from UDC.

## 11. Acceptable use
You must not: give false information; impersonate anyone; trade in goods that are illegal, sanctioned or restricted; launder money or evade tax; send malware or spam; scrape or reverse-engineer our service; or attempt to gain access to others' data. Report unlawful content or conduct to udc@updowncircle.site.

## 12. Compliance
12.1 You are responsible for your own licences, IEC, export/import permits, customs, FEMA/RBI, sanctions, GST, tax and other legal compliance.
12.2 We may refuse, pause or report a transaction, without liability, if we suspect a breach of law, including dealings with sanctioned persons or restricted goods, and may share information with authorities where required.

## 13. Intellectual property
UDC, AKIF, the website and content belong to us or our licensors. You get a limited, non-exclusive, non-transferable right to use the service for its purpose. You keep ownership of your own content and give us a licence to use it to run the service.

## 14. Availability
We try to keep the service running but do not promise it will be uninterrupted or error-free. Features may change. WhatsApp and other third parties may have outages outside our control.

## 15. Disclaimers
To the extent allowed by law, the service is provided "as is". We give no warranty about goods, parties, prices, banks, inspectors, carriers or outcomes.

## 16. Limitation of liability
16.1 To the extent allowed by law, UDC is not liable for losses from a trading party's default, non-payment, non-delivery, quality dispute, bank decision, inspection result, shipping delay, customs action or market change.
16.2 UDC is not liable for indirect or consequential loss, or loss of profit or goodwill.
16.3 Subject to 16.4, UDC's total liability to you for all claims arising from the service in any 12 months is limited to the **greater of** (a) the fees you paid UDC in that period and (b) INR 1,000.
16.4 Nothing in these terms limits liability for fraud, wilful misconduct, or anything the law does not allow to be limited.

## 17. Indemnity
You will compensate UDC for losses, including reasonable legal costs, arising from third-party claims caused by (a) information or documents you gave that were false or that you had no right to give, (b) your breach of these terms, or (c) your breach of law. UDC will tell you promptly of a claim and let you defend it.

## 18. Suspension and ending
You may close your account by messaging us. We may suspend or end access for breach, failed verification, suspected fraud or legal need. Sections that by nature continue (fees owed, non-circumvention, liability, disputes) continue after ending.

## 19. Disputes between users
Disputes between buyer and seller are for them to resolve under their SPA. We may help by sharing records and escalating, but we do not decide or adjudicate the dispute unless all parties agree in writing.

## 20. Governing law and disputes with UDC
20.1 Indian law governs these terms.
20.2 Disputes are first referred to good-faith discussion for 30 days (write to udc@updowncircle.site).
20.3 If not resolved, the dispute goes to arbitration by a sole arbitrator under the Arbitration and Conciliation Act 1996, appointed by mutual agreement of both parties, failing which by the court or institution under section 11 of that Act. Seat: **Kannur, Kerala**. Language: **English**.
20.4 Subject to arbitration, the courts at Kannur, Kerala have exclusive jurisdiction.

## 21. Changes
We may update these terms. We will tell you through WhatsApp or the site at least 15 days before a material change takes effect, and we keep a version log. Continued use after the effective date means you accept the update. Material changes to fees or your rights need fresh acceptance.

## 22. Contact and grievances
General: udc@updowncircle.site. Privacy and data grievances: see the Privacy Policy. Contact person for data questions: Muhammad N P, udc@updowncircle.site.

## 23. Misc
Entire agreement; severability (if a part is invalid, the rest continues); no waiver (a right is not lost because we do not use it at once); force majeure (we are not liable for failure caused by events beyond our reasonable control); no assignment by you without our consent; notices by WhatsApp, email or the site are deemed delivered 24 hours after sending. These terms are for business users only (see 3.1); the Consumer Protection (E-Commerce) Rules 2020 do not apply to purchases for a commercial purpose.`;
  var PRIVACY_MD = `# Updowncircle (UDC) - Privacy Policy

Version: 0.2 | Effective: 25 October 2026 | Law: Digital Personal Data Protection Act, 2023 (DPDP Act) and the DPDP Rules 2025, plus the IT Act 2000.

This policy is written to meet the DPDP Act and the DPDP Rules from day one.

## 1. Who is responsible
Muhammad N P, sole proprietor of "Updowncircle", Zam Zam Manzil, PO Varam, Kannur, Kerala, India ("UDC") decides why and how your personal data is processed. In DPDP terms, UDC is the Data Fiduciary. Contact person for data questions: **Muhammad N P, udc@updowncircle.site**.

## 2. What we collect
- **Contact and account:** name, WhatsApp number, email, role (Buyer/Seller/Agent), company name and type, country.
- **Verification:** identity proof (passport, PAN or company registration), business registration and tax documents, bank-related evidence (documents such as a cancelled cheque or LC advice - never login credentials or OTPs), directors/owners' details where needed. **We never collect Aadhaar numbers or full Aadhaar copies. If you send a document showing an Aadhaar number, mask it first.**
- **Trade information:** requirements, listings, quotes, offers, deal documents, shipment and inspection status, commission records.
- **Deal documents sent over WhatsApp:** text and content extracted from deal documents you send in chat (outside the secure vault), used for deal coordination and document intelligence (see Section 3).
- **Messages:** WhatsApp messages with AKIF and our team, in and out, including voice notes, images or files if you send them.
- **Technical:** IP address, device and log data, access logs for vault documents, audit logs.
We do not knowingly collect data from children under 18.

## 3. Why we use it (purposes)
1. Create and run your account and recover it securely.
2. Verify identity and business before trading.
3. Match requirements and offers and introduce parties.
4. Coordinate deals: documents, milestones, reminders, exceptions. This includes extracting and storing the text of deal documents you send over WhatsApp, so AKIF and our team can track terms, statuses and deadlines for the deal ("document intelligence").
5. Run AKIF (AI assistant) to understand your messages and prepare replies.
6. Invoice and record UDC commission and agent commission.
7. Security, fraud prevention, audit and dispute handling.
8. Comply with law, tax and regulator requests.
9. Service messages. We do not sell your data. We send marketing only if you separately consent.

## 4. Consent
4.1 **Notice before consent (DPDP Act s.5, Rule 3).** Before we collect personal data in onboarding, AKIF shows you a stand-alone notice (in English, and Malayalam on request) that: (a) itemises the personal data we collect and the specific purpose for each item (the lists in Sections 2 and 3); (b) links to this full policy; and (c) describes how to withdraw consent (message "withdraw consent" on WhatsApp or email udc@updowncircle.site), how to exercise your rights (Section 9), and how to complain to the Data Protection Board of India. We record the time, the wording shown and your reply.
4.2 Consent is free, specific, informed and unambiguous, given by a clear action. It covers only the purposes in Section 3 that need consent.
4.3 You can **withdraw consent** any time by messaging "withdraw consent" or emailing udc@updowncircle.site. Withdrawal is as easy as giving consent, and triggers a human-handled request. It does not affect past processing. If you withdraw, we may no longer be able to provide the service, and we will say so.
4.4 Some processing is allowed by law without consent (the DPDP Act's "legitimate uses", such as legal obligations or compliance with a court order). We use these only where they apply.

## 5. AI processing
AKIF uses AI models to read your messages, pull out requirement fields and draft replies, so AKIF sees the text of your WhatsApp messages and verification outcomes. Text extracted from deal documents you send over WhatsApp may be processed for the deal-coordination purposes in Section 3(4). Raw documents stored in the secure vault are not given to the AI or stored in AI memory. Policy checks are done by code, not by the AI. A human reviews verification decisions. Our AI/service providers process data on our instructions under contract.

## 6. Documents and security
Documents go to private storage through secure, short-lived upload links, not through chat. Access is role-limited and logged. We use encryption in transit and at rest, access control, backups, and audit logs. Access and audit logs are retained for a minimum of one year (DPDP Rules 6 and 8). No system is perfectly secure.

## 7. Who we share with
- The **other party in a deal**: only what is needed for that deal and that you authorise (for example company name and offer details), not your verification files.
- **Agents**: see only redacted deal-stage summaries of referred prospects, not prices, identity scans, bank details or documents, unless you authorise it. If you were referred by an agent, that referring agent sees your redacted deal-stage status.
- **Service providers (processors, under contract):** WhatsApp/Meta (messaging), Supabase (cloud hosting and database), AI model providers (message understanding and drafting, on our instructions), and email/OTP providers (account codes and notices).
- **Banks, inspectors, carriers** when you ask us to coordinate with them.
- **Authorities**, where law requires.
Cross-border transfer: your data may be processed outside India. We transfer only where the law allows.

## 8. How long we keep data (retention)
| Data | Kept for |
|---|---|
| Account and contact data | While your account is active, then 12 months after closure |
| Verification documents | While active, then 12 months after closing, unless deleted earlier on valid request, except what tax/audit law requires |
| Deal records, commission and invoices | 8 years, for tax and accounting law |
| Chat logs (including extracted deal-document text) | 12 months after last activity |
| Access and audit logs | Minimum 1 year (DPDP Rules 6 and 8) |
| Consent records | 3 years after withdrawal |
After that we delete or anonymise it. We may keep data longer where law requires or for a live dispute or claim; data kept for these reasons is restricted and not used for other purposes.

## 9. Your rights under the DPDP Act
1. **Access:** a summary of your data, what we process, and who we shared it with.
2. **Correction and completion** of inaccurate or incomplete data.
3. **Erasure:** delete data you no longer want us to hold, unless we must keep it by law.
4. **Grievance redressal** (Section 10).
5. **Nominate** another person to exercise your rights if you die or cannot act.
6. **Withdraw consent** (Section 4).
Send requests by WhatsApp ("delete my data") or email udc@updowncircle.site. We verify who you are first, then respond within 30 days. Document deletion requests are logged. Deleting a vault document may stop a verification or deal from continuing. Data we must keep by law will be restricted and not used for other purposes.

## 10. Grievances
Contact person for data questions (and Grievance Officer for IT Rules purposes):
Name: **Muhammad N P (Proprietor)**
Email: **udc@updowncircle.site**
Address: Zam Zam Manzil, PO Varam, Kannur, Kerala, India
We acknowledge within 24 hours and resolve within 15 days, and in any case within the 90-day maximum in the DPDP Rules (Rule 14(3)). If unresolved, you may complain to the **Data Protection Board of India** after you have used our grievance process.

## 11. Data breach
If a personal data breach occurs, UDC will inform each affected person without delay by WhatsApp or email, saying what happened, the likely effect, what we have done and who to contact, and will report to the Data Protection Board of India within the periods in the DPDP Rules (a first report without delay and a detailed report within 72 hours).

## 12. Changes
We will post updates here and tell you through WhatsApp or email. Where the change needs fresh consent we will ask again.

## 13. Contact
udc@updowncircle.site | Zam Zam Manzil, PO Varam, Kannur, Kerala, India`;

  // src/photos/udc-hero.png
  var udc_hero_default = "./assets/USORHZDA.png";

  // src/App.tsx
  var import_jsx_runtime22 = __toESM(require_jsx_runtime());
  var chatMessages = [
    { from: "buyer", text: "Need 100 MT copper cathode, CIF Jebel Ali. Target USD 5,900/MT.", time: "10:02" },
    { from: "akif", text: "On it. Checking UDC\u2019s verified supplier database.", time: "10:02" },
    { from: "akif", text: "3 verified suppliers match your spec. Profiles ready for your review.", time: "10:03" },
    { from: "buyer", text: "The second one looks right. What\u2019s next?", time: "10:04" },
    { from: "akif", text: "Draft contract sent for your approval. Once you sign off, your bank issues the DLC directly to the seller\u2019s bank. UDC never holds your money.", time: "10:04" },
    { from: "akif", text: "SGS inspection booked at destination. Funds release only after the report clears.", time: "10:05" },
    { from: "akif", text: "Deal closed. Shipment tracked to Jebel Ali. Documents in this chat.", time: "10:06" }
  ];
  var steps = [
    { title: "Ask on WhatsApp", body: "Message AKIF with the commodity, volume, target price and destination. No app to install, no portal to learn. The chat is the interface." },
    { title: "Verified match", body: "Matches come only from UDC\u2019s own verified database of buyers and suppliers. No open listings, no scraped contacts, no cold spam." },
    { title: "DLC coordination", body: "Your bank issues the letter of credit directly to the seller\u2019s bank. UDC coordinates the paperwork between the parties and never holds your money." },
    { title: "SGS inspection", body: "An independent SGS inspection at the destination confirms the cargo is what the contract says before funds move." },
    { title: "Tracked delivery", body: "Shipment tracked to the destination port, documents reconciled, deal closed - all in the same chat where it started." }
  ];
  var trust = [
    { title: "Verification gates", body: "Every buyer and supplier passes verification before entering the database. Unverified parties simply do not get matched.", icon: "shield" },
    { title: "Database-only matching", body: "No open marketplace, no scraping. Matches are drawn from verified records UDC stands behind.", icon: "database" },
    { title: "Truth over automation", body: "AKIF is designed to say what is confirmed, what is pending, and what it does not know - never a confident guess.", icon: "eye" },
    { title: "Human approval", body: "Contracts and money move only after a person approves. Always. Automation prepares, people decide.", icon: "check" }
  ];
  var tutorials = [
    { icon: "buyer", title: "Join as a buyer", scenes: [
      { kind: "msg", text: "Hi AKIF - I want to buy 100 MT copper cathode, CIF Jebel Ali.", cap: "Message UDC on WhatsApp", title: "", sub: "", kicker: "" },
      { kind: "akif", text: "Welcome. One quick verification and your RFQ goes live.", cap: "AKIF replies in the same chat", title: "", sub: "", kicker: "" },
      { kind: "check", title: "Verification passed", sub: "KYC approved - verify once, not per deal", cap: "You verify once, right in chat", text: "", kicker: "" },
      { kind: "card", kicker: "RFQ POSTED", title: "100 MT copper cathode", sub: "Target USD 5,900/MT \xB7 CIF Jebel Ali", cap: "Your RFQ goes to verified sellers only", text: "" },
      { kind: "check", title: "3 verified offers received", sub: "Compare terms and accept in chat", cap: "Offers come back to you - no cold calls", text: "", kicker: "" }
    ] },
    { icon: "seller", title: "Join as a seller", scenes: [
      { kind: "msg", text: "I sell copper cathode from Kochi. How do I list?", cap: "Message UDC on WhatsApp", title: "", sub: "", kicker: "" },
      { kind: "akif", text: "Send your business registration and two trade references.", cap: "AKIF asks for your documents", title: "", sub: "", kicker: "" },
      { kind: "check", title: "Business verified", sub: "KYB - registration and references checked", cap: "Your business gets verified", text: "", kicker: "" },
      { kind: "card", kicker: "LISTING LIVE", title: "Copper cathode, Grade A", sub: "25 MT/month \xB7 FOB Kochi", cap: "Your product goes live with its terms", text: "" },
      { kind: "check", title: "New RFQ matches your listing", sub: "AKIF introduces the verified buyer", cap: "Matching buyers come to you", text: "", kicker: "" }
    ] },
    { icon: "agent", title: "Join as an agent", scenes: [
      { kind: "msg", text: "I want to refer buyers from my network.", cap: "Message UDC on WhatsApp", title: "", sub: "", kicker: "" },
      { kind: "akif", text: "Here are your referral terms, in writing.", cap: "AKIF sends your terms", title: "", sub: "", kicker: "" },
      { kind: "card", kicker: "REFERRAL TERMS", title: "Commission on closed deals", sub: "Written, auditable, deal data masked", cap: "Terms are written and auditable", text: "" },
      { kind: "msg", text: "Sharing a contact: Anil, imports copper into Jebel Ali.", cap: "You refer a contact from your network", title: "", sub: "", kicker: "" },
      { kind: "check", title: "Referral credited", sub: "Paid when their deal closes", cap: "You earn when their deal closes", text: "", kicker: "" }
    ] }
  ];
  function Icon({ name }) {
    const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
    if (name === "shield") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M9 12l2 2 4-4" })
    ] });
    if (name === "database") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("ellipse", { cx: "12", cy: "5.5", rx: "7", ry: "2.5" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M5 11.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" })
    ] });
    if (name === "eye") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("circle", { cx: "12", cy: "12", r: "2.8" })
    ] });
    if (name === "buyer") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("circle", { cx: "12", cy: "8", r: "3.4" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M5.5 20c.8-3.6 3.4-5.4 6.5-5.4s5.7 1.8 6.5 5.4" })
    ] });
    if (name === "seller") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M3 20V9l5 3.2V9l5 3.2V9l5 3.2V20H3z" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M7 20v-3m4 3v-3m4 3v-3" })
    ] });
    if (name === "agent") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M8 12l2.5 2.5L16 9" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M12 21c-4.4-1.8-7-5.5-7-10V6l7-3 7 3v5c0 4.5-2.6 8.2-7 10z", opacity: "0.45" })
    ] });
    if (name === "doc") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M7 3h7l4 4v14H7V3z" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M14 3v4h4M10 12h5m-5 4h5" })
    ] });
    if (name === "mic") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("rect", { x: "9", y: "3", width: "6", height: "10", rx: "3" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" })
    ] });
    if (name === "bell") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M10 19a2 2 0 0 0 4 0" })
    ] });
    if (name === "memo") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M4 5h16v11H9l-5 4V5z" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M8 9h8M8 12.5h5" })
    ] });
    if (name === "bank") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M3 9l9-6 9 6" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M4 9.5h16M5 9.5V19m4.5-9.5V19M12 9.5V19m4.5-9.5V19M19 9.5V19M3 21h18" })
    ] });
    return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("circle", { cx: "12", cy: "12", r: "9" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M8.5 12.2l2.4 2.3 4.6-4.8" })
    ] });
  }
  var CITY_LL = [
    [25.26, 55.3],
    [19.08, 72.88],
    [9.93, 76.27],
    [31.23, 121.47],
    [1.35, 103.82],
    [51.92, 4.48],
    [53.55, 10],
    [6.45, 3.39],
    [-23.96, -46.33],
    [21.49, 39.19],
    [40.71, -74],
    [-33.87, 151.21]
  ];
  var ARC_PAIRS = [
    [0, 2],
    [0, 5],
    [0, 7],
    [0, 11],
    [1, 0],
    [2, 4],
    [3, 0],
    [4, 3],
    [5, 6],
    [10, 5],
    [8, 7],
    [3, 10],
    [1, 4],
    [6, 0]
  ];
  function llToVec(lat, lon) {
    const la2 = lat * Math.PI / 180, lo2 = lon * Math.PI / 180;
    return [Math.cos(la2) * Math.cos(lo2), Math.sin(la2), Math.cos(la2) * Math.sin(lo2)];
  }
  function arcPoint(a, b, s, alt) {
    const x = a[0] + (b[0] - a[0]) * s;
    const y2 = a[1] + (b[1] - a[1]) * s;
    const z3 = a[2] + (b[2] - a[2]) * s;
    const len = Math.hypot(x, y2, z3) || 1;
    const e2 = 1 + Math.sin(Math.PI * s) * alt;
    return [x / len * e2, y2 / len * e2, z3 / len * e2];
  }
  var ROT_GLSL = `
    vec3 rot(vec3 p, float ay, float ax) {
        float cy = cos(ay), sy = sin(ay);
        vec3 q = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
        float cx = cos(ax), sx = sin(ax);
        return vec3(q.x, q.y * cx - q.z * sx, q.y * sx + q.z * cx);
    }
`;
  var POINT_VERT = `
    attribute vec3 aPos;
    uniform float uRotY, uTilt, uSize, uDpr;
    uniform vec2 uCenter, uRes;
    uniform float uRadius;
    varying float vAlpha;
    ${ROT_GLSL}
    void main() {
        vec3 p = rot(aPos, uRotY, uTilt);
        vAlpha = p.z > 0.0 ? 0.16 + p.z * 0.50 : 0.045;
        vec2 px = uCenter + vec2(p.x, -p.y) * uRadius;
        gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
        gl_PointSize = uSize * uDpr * (p.z > 0.0 ? 1.0 + p.z * 0.5 : 0.8);
    }
`;
  var POINT_FRAG = `
    precision mediump float;
    varying float vAlpha;
    uniform vec3 uColor;
    void main() {
        float r = length(gl_PointCoord - 0.5);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.12, r) * vAlpha;
        gl_FragColor = vec4(uColor, a);
    }
`;
  var LINE_VERT = `
    attribute vec3 aPos;
    uniform float uRotY, uTilt, uAlphaMul;
    uniform vec2 uCenter, uRes;
    uniform float uRadius;
    varying float vAlpha;
    ${ROT_GLSL}
    void main() {
        vec3 p = rot(aPos, uRotY, uTilt);
        vAlpha = (p.z > -0.12 ? 0.30 + max(p.z, 0.0) * 0.55 : 0.0) * uAlphaMul;
        vec2 px = uCenter + vec2(p.x, -p.y) * uRadius;
        gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
    }
`;
  var LINE_FRAG = `
    precision mediump float;
    varying float vAlpha;
    uniform vec3 uColor;
    void main() { gl_FragColor = vec4(uColor, vAlpha); }
`;
  var ATMO_VERT = `
    attribute vec3 aPos;
    uniform float uRotY, uTilt, uScale;
    uniform vec2 uCenter, uRes;
    uniform float uRadius;
    varying float vF;
    ${ROT_GLSL}
    void main() {
        vec3 p = rot(aPos * uScale, uRotY, uTilt);
        vF = pow(1.0 - clamp(p.z / uScale, 0.0, 1.0), 2.6);
        vec2 px = uCenter + vec2(p.x, -p.y) * uRadius;
        gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
    }
`;
  var ATMO_FRAG = `
    precision mediump float;
    varying float vF;
    uniform vec3 uColor;
    void main() { gl_FragColor = vec4(uColor, vF * 0.26); }
`;
  function makeProgram(gl2, vs, fs2) {
    const compile = (type, src) => {
      const sh = gl2.createShader(type);
      if (!sh) return null;
      gl2.shaderSource(sh, src);
      gl2.compileShader(sh);
      if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS)) return null;
      return sh;
    };
    const v2 = compile(gl2.VERTEX_SHADER, vs);
    const f2 = compile(gl2.FRAGMENT_SHADER, fs2);
    if (!v2 || !f2) return null;
    const prog = gl2.createProgram();
    if (!prog) return null;
    gl2.attachShader(prog, v2);
    gl2.attachShader(prog, f2);
    gl2.linkProgram(prog);
    if (!gl2.getProgramParameter(prog, gl2.LINK_STATUS)) return null;
    return prog;
  }
  function GlobeCanvas() {
    const canvasRef = (0, import_react24.useRef)(null);
    const wrapRef = (0, import_react24.useRef)(null);
    const imgRef = (0, import_react24.useRef)(null);
    (0, import_react24.useEffect)(() => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const gl2 = canvas.getContext("webgl", { alpha: true, antialias: true });
      if (!gl2) return;
      if (imgRef.current) imgRef.current.style.display = "none";
      const pointProg = makeProgram(gl2, POINT_VERT, POINT_FRAG);
      const lineProg = makeProgram(gl2, LINE_VERT, LINE_FRAG);
      const atmoProg = makeProgram(gl2, ATMO_VERT, ATMO_FRAG);
      if (!pointProg || !lineProg || !atmoProg) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const small = wrap.clientWidth < 600;
      const N2 = small ? 1100 : 2e3;
      const spherePts = new Float32Array(N2 * 3);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N2; i++) {
        const y2 = 1 - i / (N2 - 1) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y2 * y2));
        const th = golden * i;
        spherePts[i * 3] = Math.cos(th) * r;
        spherePts[i * 3 + 1] = y2;
        spherePts[i * 3 + 2] = Math.sin(th) * r;
      }
      const sphereBuf = gl2.createBuffer();
      gl2.bindBuffer(gl2.ARRAY_BUFFER, sphereBuf);
      gl2.bufferData(gl2.ARRAY_BUFFER, spherePts, gl2.STATIC_DRAW);
      const cities = CITY_LL.map(([a, b]) => llToVec(a, b));
      const cityArr = new Float32Array(cities.length * 3);
      cities.forEach((c, i) => {
        cityArr[i * 3] = c[0];
        cityArr[i * 3 + 1] = c[1];
        cityArr[i * 3 + 2] = c[2];
      });
      const cityBuf = gl2.createBuffer();
      gl2.bindBuffer(gl2.ARRAY_BUFFER, cityBuf);
      gl2.bufferData(gl2.ARRAY_BUFFER, cityArr, gl2.STATIC_DRAW);
      const SEG = 48;
      const arcBuffers = [];
      const arcMeta = [];
      ARC_PAIRS.forEach(([ai, bi], i) => {
        const a = cities[ai], b = cities[bi];
        const data2 = new Float32Array((SEG + 1) * 3);
        for (let k2 = 0; k2 <= SEG; k2++) {
          const p = arcPoint(a, b, k2 / SEG, 0.18);
          data2[k2 * 3] = p[0];
          data2[k2 * 3 + 1] = p[1];
          data2[k2 * 3 + 2] = p[2];
        }
        const buf = gl2.createBuffer();
        gl2.bindBuffer(gl2.ARRAY_BUFFER, buf);
        gl2.bufferData(gl2.ARRAY_BUFFER, data2, gl2.STATIC_DRAW);
        arcBuffers.push(buf);
        arcMeta.push({ phase: i * 0.617, speed: 11e-5 + i % 3 * 5e-5, a, b });
      });
      const pulseBuf = gl2.createBuffer();
      const BANDS = 40, SLICES = 80;
      const mesh = [];
      for (let b = 0; b <= BANDS; b++) {
        const phi = b / BANDS * Math.PI;
        for (let s = 0; s <= SLICES; s++) {
          const theta = s / SLICES * Math.PI * 2;
          mesh.push(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
        }
      }
      const idx = [];
      for (let b = 0; b < BANDS; b++) {
        for (let s = 0; s < SLICES; s++) {
          const a0 = b * (SLICES + 1) + s;
          const b0 = a0 + SLICES + 1;
          idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
        }
      }
      const meshBuf = gl2.createBuffer();
      gl2.bindBuffer(gl2.ARRAY_BUFFER, meshBuf);
      gl2.bufferData(gl2.ARRAY_BUFFER, new Float32Array(mesh), gl2.STATIC_DRAW);
      const idxBuf = gl2.createBuffer();
      gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl2.bufferData(gl2.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl2.STATIC_DRAW);
      gl2.enable(gl2.BLEND);
      gl2.blendFunc(gl2.SRC_ALPHA, gl2.ONE_MINUS_SRC_ALPHA);
      gl2.clearColor(0, 0, 0, 0);
      let raf = 0;
      let visible = true;
      const uniforms = (prog) => ({
        rotY: gl2.getUniformLocation(prog, "uRotY"),
        tilt: gl2.getUniformLocation(prog, "uTilt"),
        size: gl2.getUniformLocation(prog, "uSize"),
        dpr: gl2.getUniformLocation(prog, "uDpr"),
        center: gl2.getUniformLocation(prog, "uCenter"),
        res: gl2.getUniformLocation(prog, "uRes"),
        radius: gl2.getUniformLocation(prog, "uRadius"),
        color: gl2.getUniformLocation(prog, "uColor"),
        alphaMul: gl2.getUniformLocation(prog, "uAlphaMul"),
        scale: gl2.getUniformLocation(prog, "uScale")
      });
      const uP = uniforms(pointProg);
      const uL = uniforms(lineProg);
      const uA = uniforms(atmoProg);
      const aPosP = gl2.getAttribLocation(pointProg, "aPos");
      const aPosL = gl2.getAttribLocation(lineProg, "aPos");
      const aPosA = gl2.getAttribLocation(atmoProg, "aPos");
      const draw = (t) => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = wrap.clientWidth, h = wrap.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.max(1, Math.round(w * dpr));
          canvas.height = Math.max(1, Math.round(h * dpr));
          canvas.style.width = w + "px";
          canvas.style.height = h + "px";
        }
        gl2.viewport(0, 0, canvas.width, canvas.height);
        gl2.clear(gl2.COLOR_BUFFER_BIT);
        const ang = reduced ? 0.6 : t * 7e-5;
        const tilt = 0.42;
        const R3 = Math.min(w, h) * 0.44;
        const cx = w / 2, cy = h * 0.17;
        gl2.useProgram(atmoProg);
        gl2.uniform1f(uA.rotY, ang);
        gl2.uniform1f(uA.tilt, tilt);
        gl2.uniform2f(uA.center, cx, cy);
        gl2.uniform2f(uA.res, w, h);
        gl2.uniform1f(uA.radius, R3);
        gl2.uniform1f(uA.scale, 1.05);
        gl2.uniform3f(uA.color, 0.45, 0.45, 0.45);
        gl2.bindBuffer(gl2.ARRAY_BUFFER, meshBuf);
        gl2.enableVertexAttribArray(aPosA);
        gl2.vertexAttribPointer(aPosA, 3, gl2.FLOAT, false, 0, 0);
        gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, idxBuf);
        gl2.drawElements(gl2.TRIANGLES, idx.length, gl2.UNSIGNED_SHORT, 0);
        gl2.useProgram(pointProg);
        gl2.uniform1f(uP.rotY, ang);
        gl2.uniform1f(uP.tilt, tilt);
        gl2.uniform2f(uP.center, cx, cy);
        gl2.uniform2f(uP.res, w, h);
        gl2.uniform1f(uP.radius, R3);
        gl2.uniform1f(uP.dpr, dpr);
        gl2.uniform1f(uP.size, small ? 2.1 : 2.4);
        gl2.uniform3f(uP.color, 0.35, 0.35, 0.35);
        gl2.bindBuffer(gl2.ARRAY_BUFFER, sphereBuf);
        gl2.enableVertexAttribArray(aPosP);
        gl2.vertexAttribPointer(aPosP, 3, gl2.FLOAT, false, 0, 0);
        gl2.drawArrays(gl2.POINTS, 0, N2);
        gl2.useProgram(lineProg);
        gl2.uniform1f(uL.rotY, ang);
        gl2.uniform1f(uL.tilt, tilt);
        gl2.uniform2f(uL.center, cx, cy);
        gl2.uniform2f(uL.res, w, h);
        gl2.uniform1f(uL.radius, R3);
        gl2.uniform3f(uL.color, 0.3, 0.3, 0.3);
        gl2.uniform1f(uL.alphaMul, 0.65);
        gl2.enableVertexAttribArray(aPosL);
        for (const buf of arcBuffers) {
          gl2.bindBuffer(gl2.ARRAY_BUFFER, buf);
          gl2.vertexAttribPointer(aPosL, 3, gl2.FLOAT, false, 0, 0);
          gl2.drawArrays(gl2.LINE_STRIP, 0, SEG + 1);
        }
        const pulses = new Float32Array(arcMeta.length * 3);
        arcMeta.forEach((arc, i) => {
          const sp = ((t * arc.speed + arc.phase) % 1 + 1) % 1;
          const p = arcPoint(arc.a, arc.b, sp, 0.18);
          pulses[i * 3] = p[0];
          pulses[i * 3 + 1] = p[1];
          pulses[i * 3 + 2] = p[2];
        });
        gl2.useProgram(pointProg);
        gl2.uniform1f(uP.size, small ? 5.5 : 6.5);
        gl2.uniform3f(uP.color, 0, 0, 0);
        gl2.bindBuffer(gl2.ARRAY_BUFFER, pulseBuf);
        gl2.bufferData(gl2.ARRAY_BUFFER, pulses, gl2.DYNAMIC_DRAW);
        gl2.enableVertexAttribArray(aPosP);
        gl2.vertexAttribPointer(aPosP, 3, gl2.FLOAT, false, 0, 0);
        gl2.drawArrays(gl2.POINTS, 0, arcMeta.length);
        gl2.uniform1f(uP.size, small ? 4 : 4.6);
        gl2.uniform3f(uP.color, 0.05, 0.05, 0.05);
        gl2.bindBuffer(gl2.ARRAY_BUFFER, cityBuf);
        gl2.vertexAttribPointer(aPosP, 3, gl2.FLOAT, false, 0, 0);
        gl2.drawArrays(gl2.POINTS, 0, cities.length);
      };
      const loop = (t) => {
        if (visible) draw(t);
        raf = requestAnimationFrame(loop);
      };
      const io = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      });
      io.observe(wrap);
      if (reduced) draw(0);
      else raf = requestAnimationFrame(loop);
      return () => {
        cancelAnimationFrame(raf);
        io.disconnect();
      };
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-globe", ref: wrapRef, "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("img", { className: "udc-globe-fallback", ref: imgRef, src: udc_hero_default, alt: "" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("canvas", { ref: canvasRef })
    ] });
  }
  function StepsShow() {
    const [active, setActive] = (0, import_react24.useState)(0);
    (0, import_react24.useEffect)(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      const id = window.setInterval(() => setActive((a) => (a + 1) % steps.length), 3600);
      return () => window.clearInterval(id);
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section udc-stepshow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Step by step" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "How UDC works" }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-scenes2", children: steps.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: `udc-scene2${i === active ? " is-active" : ""}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-scene-ghost", children: i + 1 }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-scene-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("p", { className: "udc-scene-kicker", children: [
            "Step ",
            i + 1,
            " of ",
            steps.length
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-scene-title", children: s.title }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-scene-body", children: s.body })
        ] })
      ] }, i)) }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-steps-progress2", children: steps.map((_3, i) => /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("button", { type: "button", className: `udc-progress-dot${i === active ? " is-active" : ""}`, onClick: () => setActive(i), "aria-label": `Show step ${i + 1}` }, i)) })
    ] });
  }
  function App() {
    const [hash, setHash] = (0, import_react24.useState)(() => window.location.hash);
    (0, import_react24.useEffect)(() => {
      const onHash = () => {
        setHash(window.location.hash);
        window.scrollTo(0, 0);
      };
      window.addEventListener("hashchange", onHash);
      return () => window.removeEventListener("hashchange", onHash);
    }, []);
    (0, import_react24.useEffect)(() => {
      const els = Array.from(document.querySelectorAll(".reveal"));
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      }, { threshold: 0.12 });
      els.forEach((el2) => io.observe(el2));
      return () => io.disconnect();
    }, []);
    if (hash === "#/terms" || hash === "#/privacy") {
      return /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Nu, { className: "udc-card", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-legal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("a", { className: "udc-legal-back", href: "#", children: "\u2190 Back to UDC" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(LegalDoc, { md: hash === "#/terms" ? TERMS_MD : PRIVACY_MD }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-footer-line", style: { marginTop: 44 }, children: "Concept preview of the UDC platform. Capabilities shown are the design, not live features." })
      ] }) }) });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Nu, { className: "udc-card", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc", children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("header", { className: "udc-hero", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(GlobeCanvas, {}),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-hero-content", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-brand udc-hero-anim", style: { animationDelay: "0.1s" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-mark", children: "UDC" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-brand-sub", children: "UpdownCircle" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("h1", { className: "udc-h1 udc-hero-anim", style: { animationDelay: "0.25s" }, children: [
            "Global trade, ",
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-grad", children: "in one chat." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-lede udc-hero-anim", style: { animationDelay: "0.45s" }, children: "UDC is built to take a B2B deal from the first WhatsApp message to delivered cargo: verified counterparties, bank-to-bank payment coordination and independent inspection. AKIF - AI Knowledge and Intelligent Framework, the platform\u2019s AI assistant - runs the conversation. People approve the decisions that matter." }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-hero-actions udc-hero-anim", style: { animationDelay: "0.6s" }, children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-soon", children: "Launching soon on WhatsApp" }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-scroll-cue", "aria-hidden": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-scroll-cue-line" }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-scroll-cue-text", children: "Scroll" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(StepsShow, {}),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "A deal, as it happens" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "Watch AKIF work a deal" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-section-sub", children: "An illustrative exchange - 100 MT copper cathode, CIF Jebel Ali." }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-phone", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-phone-top", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-avatar", children: "A" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-phone-name", children: "AKIF \xB7 UDC" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-phone-status", children: [
                /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-dot" }),
                " online"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-chat", children: chatMessages.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: `udc-bubble ${m.from}`, style: { animationDelay: `${0.7 + i * 1.15}s` }, children: [
            m.from === "akif" && /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-bubble-who", children: "AKIF" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-bubble-text", children: m.text }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("span", { className: "udc-bubble-time", children: [
              m.time,
              m.from === "buyer" && /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-ticks", children: "\u2713\u2713" })
            ] })
          ] }, i)) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Why UDC" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "The marketplace is the problem" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-section-sub", children: "Open B2B marketplaces are designed to maximize listings. UDC is designed to close real deals." }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-compare", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-compare-card old", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-compare-head", children: "The old way" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("ul", { className: "udc-compare-list", children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "Open listings invite fake suppliers" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "Unverified contacts, endless noise" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "Money wired on trust and hope" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "Ghosted in the middle of a deal" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-compare-card new", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-compare-head", children: "The UDC way" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("ul", { className: "udc-compare-list", children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "Verified, database-only network" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "Every counterparty vetted before matching" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "Bank-to-bank DLC, never custodied" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "AKIF stays on the deal until it closes" })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Who it is for" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "Three seats at the table" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-aud-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-aud", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "buyer" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: "Buyers" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-trust-body", children: "Source verified suppliers without the marketplace noise. Compare real offers, pay through your own bank\u2019s letter of credit, and release funds only after inspection." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-aud", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "seller" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: "Sellers" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-trust-body", children: "Reach serious, verified buyers. No listing fees burned on window shoppers, no fake LOIs. Built so you deal only with buyers whose banks stand behind the paperwork." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-aud", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "agent" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: "Agents" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-trust-body", children: "Earn referral commissions on closed deals, with auditable terms in writing. Deal data stays masked - your network works for you, not around you." })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Getting started" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "How to join" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-section-sub", children: "Three roles, one chat. Here is exactly how each one starts." }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-join-grid", children: tutorials.map((t, r) => /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-join", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: t.icon }) }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: t.title }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-tut-stage", "aria-label": t.title, children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tut-bar", "aria-hidden": "true" }),
            t.scenes.map((s, i) => {
              const delay = `${0.6 + i * 2.4}s`;
              const cap = /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("p", { className: "udc-tut-cap", children: [
                /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("b", { children: i + 1 }),
                s.cap
              ] });
              if (s.kind === "msg") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-tut-item udc-tut-msg-wrap", style: { animationDelay: delay }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-tut-msg", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-bubble-text", children: s.text }) }),
                cap
              ] }, i);
              if (s.kind === "akif") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-tut-item udc-tut-akif-wrap", style: { animationDelay: delay }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-tut-akif", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tut-who", children: "AKIF" }),
                  /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-bubble-text", children: s.text })
                ] }),
                cap
              ] }, i);
              if (s.kind === "check") return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-tut-item", style: { animationDelay: delay }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-tut-check", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tut-badge", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("path", { d: "M4.5 12.5l5 5L19.5 7" }) }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("span", { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("strong", { children: s.title }),
                    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("em", { children: s.sub })
                  ] })
                ] }),
                cap
              ] }, i);
              return /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-tut-item", style: { animationDelay: delay }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-tut-card", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-tut-kicker", children: s.kicker }),
                  /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-tut-card-title", children: s.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-tut-card-sub", children: s.sub })
                ] }),
                cap
              ] }, i);
            })
          ] })
        ] }, r)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Meet AKIF" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "An assistant that works the deal" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-section-sub", children: "AKIF (AI Knowledge and Intelligent Framework) is designed as a deal coordinator in your chat, not a search box." }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-trust-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-trust", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "memo" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: "Remembers the deal" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-trust-body", children: "Specs, volumes, target prices, documents - AKIF is built to hold the full context of your deal across the whole conversation." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-trust", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "mic" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: "Reads what you send" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-trust-body", children: "Documents, photos and voice notes are designed to become structured deal data, not attachments lost in a thread." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-trust", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "bell" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: "Follows up first" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-trust-body", children: "Pending answers, missing documents, next steps - AKIF is designed to chase them, so the deal keeps moving while you work." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-trust", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "eye" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: "Honest when there is no match" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-trust-body", children: "If no verified counterparty fits, AKIF says so. No padded results, no maybes dressed as matches. Ever." })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Payment security" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "Bank-grade by design" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-section-sub", children: "UDC never holds your money. Payment moves through the instrument global trade has trusted for decades - the documentary letter of credit, issued bank to bank." }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-flow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-flow-node", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "buyer" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Buyer" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-flow-arrow", "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-flow-node bank", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "bank" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Buyer\u2019s bank" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("em", { children: "issues the DLC" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-flow-arrow", "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-flow-node bank", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "bank" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Seller\u2019s bank" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("em", { children: "advises the LC" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-flow-arrow", "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-flow-node", children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: "seller" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Seller" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-flow-note", children: "UDC coordinates the paperwork between the parties. It is never the custodian of funds." }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("ul", { className: "udc-assure", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "The LC is issued by the buyer\u2019s bank, directly to the seller\u2019s bank." }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "Funds release only after the destination inspection clears." }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: "You approve the contract before anything moves." })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Inspection and tracking" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "Seen, verified, then paid" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-section-sub", children: "An independent SGS inspection at destination stands between the cargo and the money." }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("ol", { className: "udc-timeline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tl-dot" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("strong", { children: "Goods loaded" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Loading confirmed with the seller." })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tl-dot" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("strong", { children: "In transit" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Shipment milestones reported in the chat." })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tl-dot" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("strong", { children: "Arrived at destination" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Port arrival logged." })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tl-dot teal" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("strong", { children: "SGS inspection" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Independent inspection of the actual cargo." })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tl-dot teal" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("strong", { children: "Report clears" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Documents reconciled against the contract." })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-tl-dot teal" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("strong", { children: "Payment released" }),
              /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { children: "Banks settle. Deal closed in the same chat." })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Built to be trusted" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "Trust is the product" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "udc-trust-grid", children: trust.map((t, i) => /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-trust reveal", style: { transitionDelay: `${i * 60}ms` }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-trust-icon", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(Icon, { name: t.icon }) }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h3", { className: "udc-trust-title", children: t.title }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-trust-body", children: t.body })
        ] }, i)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Questions" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("h2", { className: "udc-h2", children: "Asked often" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-faq", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("summary", { children: "Who holds the money during a deal?" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { children: "No one at UDC. The buyer\u2019s bank issues the letter of credit directly to the seller\u2019s bank. UDC coordinates the documentation and is never the custodian of funds." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("summary", { children: "How are buyers and suppliers verified?" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { children: "Every party is designed to pass document and identity verification before entering the matching database. Unverified parties simply never get matched." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("summary", { children: "What does it cost?" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { children: "UDC is designed to earn a transparent service fee on completed deals, agreed in writing before you commit. No listing fees, no hidden charges." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("summary", { children: "What if a deal falls through?" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { children: "Nothing moves until you approve the contract, and funds release only after the destination inspection clears. If a deal stops before that, your money never left your bank." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("summary", { children: "Which commodities can I trade?" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { children: "The platform is built for container-load B2B trade - metals, agricultural goods and industrial raw materials." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("summary", { children: "How do I start?" }),
            /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { children: "Message AKIF on WhatsApp with what you want to buy or sell. That is the entire onboarding." })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("section", { className: "udc-section udc-cta reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-eyebrow", children: "Launching soon on WhatsApp" }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("h2", { className: "udc-cta-title", children: [
          "Your next deal starts with ",
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("span", { className: "udc-grad", children: "one message." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-cta-sub", children: "No app. No portal. One WhatsApp chat, from first quote to delivered cargo." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("footer", { className: "udc-footer reveal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "udc-footer-line", children: "Concept preview of the UDC platform. Capabilities shown are the design, not live features." }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "udc-footer-links", children: [
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("a", { className: "udc-footer-link", href: "https://updowncircle.site", children: "updowncircle.site" }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("a", { className: "udc-footer-link", href: "#/terms", children: "Terms & Conditions" }),
          /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("a", { className: "udc-footer-link", href: "#/privacy", children: "Privacy Policy" })
        ] })
      ] })
    ] }) });
  }

  // src/main.tsx
  var import_jsx_runtime23 = __toESM(require_jsx_runtime());
  (0, import_client.createRoot)(document.getElementById("root")).render(/* @__PURE__ */ (0, import_jsx_runtime23.jsx)(FileRouter, { children: /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(App, {}) }));
})();
/*! Bundled license information:

classnames/index.js:
  (*!
  	Copyright (c) 2018 Jed Watson.
  	Licensed under the MIT License (MIT), see
  	http://jedwatson.github.io/classnames
  *)

lucide-react/dist/esm/shared/src/utils/mergeClasses.js:
lucide-react/dist/esm/shared/src/utils/toKebabCase.js:
lucide-react/dist/esm/shared/src/utils/toCamelCase.js:
lucide-react/dist/esm/shared/src/utils/toPascalCase.js:
lucide-react/dist/esm/defaultAttributes.js:
lucide-react/dist/esm/shared/src/utils/hasA11yProp.js:
lucide-react/dist/esm/Icon.js:
lucide-react/dist/esm/createLucideIcon.js:
lucide-react/dist/esm/icons/arrow-up-right.js:
lucide-react/dist/esm/icons/check.js:
lucide-react/dist/esm/icons/loader-circle.js:
lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.577.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

scheduler/cjs/scheduler.production.min.js:
  (**
   * @license React
   * scheduler.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-dom/cjs/react-dom.production.min.js:
  (**
   * @license React
   * react-dom.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.min.js:
  (**
   * @license React
   * react-jsx-runtime.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-router/dist/development/chunk-BV7QT456.mjs:
react-router/dist/development/index.mjs:
  (**
   * react-router v7.18.3
   *
   * Copyright (c) Remix Software Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE.md file in the root directory of this source tree.
   *
   * @license MIT
   *)
*/
