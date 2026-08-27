/**
 * caseUNC share-link helpers — pure logic, no DOM.
 *
 * Split out of app.js so it can be exercised by `worker/test/viewer.test.mjs`.
 * UMD-ish so it loads via <script> in the browser and via require() in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.caseUNCShare = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Short-link form: report.html#k=9F3A1B2C7D */
  var KEY_RE = /(?:^|[#&])k=([^&]+)/;
  /** Legacy long form: report.html#r=<whole base64 report> — still accepted. */
  var RAW_RE = /(?:^|[#&])r=([^&]+)/;

  /**
   * Pull the report reference out of a URL fragment.
   * @returns {{kind:'key'|'payload', value:string}|null}
   */
  function parseHash(hash) {
    if (typeof hash !== "string" || !hash) return null;
    var m = hash.match(KEY_RE);
    if (m && m[1]) return { kind: "key", value: decodeURIComponent(m[1]) };
    m = hash.match(RAW_RE);
    if (m && m[1]) return { kind: "payload", value: decodeURIComponent(m[1]) };
    return null;
  }

  /** Read `name` out of a query string or fragment (`?api=x` / `#api=x`). */
  function readParam(haystack, name) {
    if (typeof haystack !== "string" || !haystack) return null;
    var re = new RegExp("(?:^|[?&#])" + name + "=([^&#]+)");
    var m = haystack.match(re);
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  }

  /** `https://host/caseUNC/` + key -> shareable short URL. */
  function shortUrl(pageBase, key) {
    return pageBase + "#k=" + encodeURIComponent(key);
  }

  /** Strip trailing slashes so `${base}/api/report` never doubles up. */
  function trimSlashes(value) {
    return String(value).replace(/\/+$/, "");
  }

  /** Absolute POST/GET endpoint for the report API. */
  function reportEndpoint(apiBase) {
    return trimSlashes(apiBase) + "/api/report";
  }

  /** Health endpoint, derived from a report endpoint or API origin. */
  function healthEndpoint(apiBase) {
    return trimSlashes(String(apiBase).replace(/\/api\/report\/?$/, "")) + "/api/health";
  }

  /**
   * Work out where the report API lives.
   *
   * Precedence, first non-empty wins:
   *   1. `?api=` in the query string   (handy for testing your own deploy)
   *   2. `#api=` in the fragment
   *   3. window.caseUNCConfig.apiUrl  (docs/assets/config.js)
   *   4. localStorage "caseUNC.apiUrl" (set from the viewer UI)
   *   5. same origin                    (the all-in-one Worker+assets deploy)
   *
   * @param {object} o {query, hash, configApi, storedApi, origin, trySameOrigin}
   * @returns {{base:string, endpoint:string, source:string}|null}
   */
  function resolveApi(o) {
    o = o || {};
    var order = [
      ["query", readParam(o.query, "api")],
      ["hash", readParam(o.hash, "api")],
      ["config", o.configApi],
      ["stored", o.storedApi],
    ];
    if (o.trySameOrigin !== false && o.origin) order.push(["same-origin", o.origin]);

    for (var i = 0; i < order.length; i++) {
      var source = order[i][0];
      var raw = order[i][1];
      if (typeof raw !== "string") continue;
      var base = raw.trim();
      if (!base) continue;
      return { base: trimSlashes(base), endpoint: reportEndpoint(base), source: source };
    }
    return null;
  }

  return {
    KEY_RE: KEY_RE,
    RAW_RE: RAW_RE,
    parseHash: parseHash,
    readParam: readParam,
    shortUrl: shortUrl,
    reportEndpoint: reportEndpoint,
    healthEndpoint: healthEndpoint,
    resolveApi: resolveApi,
  };
});
