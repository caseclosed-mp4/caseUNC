const SECRET = "caseUNC-report-seal-key-v1-do-not-trust-client-alone";
const SALT_A = "cAsEuNc::v1::anti-spoof";

// Detect report-only page (separate output-only view, no decoder UI)
const IS_REPORT_ONLY =
  document.body.classList.contains("report-only") ||
  /report\.html([?#]|$)/i.test(location.pathname) ||
  location.search.includes("output=1") ||
  location.hash.includes("output=1");

const $ = (id) => document.getElementById(id);

// Loaded from assets/key.js and assets/share.js (pure modules, unit-tested).
const Key = window.caseUNCKey;
const Share = window.caseUNCShare;

function absUrl(path) {
  // Build absolute URL relative to this script's directory so links work on
  // GitHub Pages, local file://, and any deployment path.
  const base = location.href.replace(/[^/]*$/, "");
  return new URL(path, base).toString();
}

// ---------------------------------------------------------------------------
// Report API
// ---------------------------------------------------------------------------

function readStoredApi() {
  try {
    return localStorage.getItem("caseUNC.apiUrl");
  } catch {
    return null;
  }
}

function apiInfo() {
  if (!Share) return null;
  const cfg = window.caseUNCConfig || {};
  return Share.resolveApi({
    query: location.search,
    hash: location.hash,
    configApi: cfg.apiUrl,
    storedApi: readStoredApi(),
    origin: location.origin,
    trySameOrigin: cfg.trySameOrigin !== false,
  });
}

/** The output-only page a short link should open. */
function shortUrlFor(key) {
  return Share.shortUrl(absUrl("report.html"), key);
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function apiError(res, data, fallback) {
  const detail = (data && (data.hint || data.error)) || `HTTP ${res.status}`;
  const err = new Error(fallback ? `${fallback}: ${detail}` : detail);
  err.code = data && data.error;
  err.status = res.status;
  return err;
}

/** Resolve a short key back into the base64 report code. */
async function fetchPayloadByKey(key) {
  const api = apiInfo();
  if (!api) throw new Error("no report API configured");

  const res = await fetch(`${api.endpoint}/${encodeURIComponent(key)}`);
  const data = await readJson(res);
  if (!res.ok) throw apiError(res, data, `report ${key} not available`);
  if (!data || typeof data.payload !== "string") {
    throw new Error("report API returned no payload");
  }
  return data.payload;
}

/** Hand a base64 report code to the API, get a short key back. */
async function publishPayload(payloadB64) {
  const api = apiInfo();
  if (!api) {
    const err = new Error("no report API configured");
    err.code = "no_api";
    throw err;
  }

  const headers = { "content-type": "text/plain; charset=utf-8" };
  const token = (window.caseUNCConfig || {}).apiToken;
  if (token) headers["x-caseunc-token"] = token;

  let res;
  try {
    res = await fetch(api.endpoint, { method: "POST", headers, body: payloadB64 });
  } catch (networkErr) {
    const err = new Error(`cannot reach ${api.endpoint} (${networkErr.message || "network error"})`);
    err.code = "unreachable";
    throw err;
  }

  const data = await readJson(res);
  if (!res.ok) throw apiError(res, data, "publish failed");
  if (!data || typeof data.key !== "string" || !data.key) {
    throw new Error("report API returned no key");
  }

  // Content-addressed: the key must be derivable from what we sent, otherwise
  // the endpoint is handing out keys for something else.
  const expected = await Key.derive(payloadB64);
  if (expected !== data.key) {
    throw new Error(`API returned key ${data.key}, payload hashes to ${expected}`);
  }

  return { key: data.key, dedup: Boolean(data.dedup), source: api.source };
}

// ---------------------------------------------------------------------------
// Decoding / verification
// ---------------------------------------------------------------------------

function b64ToBytes(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const dig = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(dig);
}

async function hmacSha256Hex(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return bytesToHex(sig);
}

function decodePayload(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) throw new Error("Empty input");
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  let jsonText;
  try {
    jsonText = new TextDecoder().decode(b64ToBytes(trimmed));
  } catch {
    throw new Error("Invalid base64 payload");
  }
  return JSON.parse(jsonText);
}

async function verifySeal(report) {
  if (!report.seal || !report.seal.envelope) {
    return { ok: false, reason: "Missing seal envelope" };
  }
  const material = [
    String(report.sessionId || ""),
    String(report.version || ""),
    String(report.executor && report.executor.name || ""),
    String(report.summary && report.summary.passed || ""),
    String(report.summary && report.summary.failed || ""),
    String(report.summary && report.summary.rate || ""),
    String(report.integrity && report.integrity.risk || ""),
    String(report.integrity && report.integrity.score || ""),
    SALT_A,
  ].join("#");
  const bodyHash = await sha256Hex(material);
  if (report.seal.bodyHash !== bodyHash) {
    return { ok: false, reason: "Body hash mismatch (report tampered or foreign build)" };
  }
  const env = report.seal.envelope;
  const material2 = `${env.ts}.${env.nonce}.${bodyHash}`;
  const expected = await hmacSha256Hex(SECRET, material2);
  if (expected !== env.sig) {
    return { ok: false, reason: "HMAC signature mismatch" };
  }
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(env.ts || 0));
  if (age > 86400 * 30) {
    return { ok: false, reason: "Seal timestamp outside 30-day window", soft: true };
  }
  return { ok: true, bodyHash, age };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function riskClass(risk) {
  if (risk === "spoofed") return "bad";
  if (risk === "suspicious" || risk === "elevated") return "warn";
  return "ok";
}

function setStatus(kind, text) {
  const el = $("status");
  if (!el) return;
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = text;
}

let currentReport = null;
/** Set when a short key is known for `currentKeyPayload`. */
let currentKey = null;
let currentKeyPayload = null;

function populateCategories(results) {
  const sel = $("filterCat");
  const cats = [...new Set(results.map((r) => r.category).filter(Boolean))].sort();
  sel.innerHTML = `<option value="all">All categories</option>` + cats.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function renderFindings(integrity) {
  const box = $("findings");
  box.innerHTML = "";
  if (!integrity || !integrity.findings || !integrity.findings.length) {
    box.innerHTML = `<div class="finding low">No spoof findings recorded.</div>`;
    return;
  }
  for (const f of integrity.findings) {
    const div = document.createElement("div");
    div.className = `finding ${f.severity || "medium"}`;
    div.textContent = `[${(f.severity || "?").toUpperCase()}] ${f.code} — ${f.detail}`;
    box.appendChild(div);
  }
}

function renderResults(report) {
  const q = $("filterText").value.trim().toLowerCase();
  const st = $("filterStatus").value;
  const cat = $("filterCat").value;
  const box = $("results");
  box.innerHTML = "";
  const rows = (report.results || []).filter((r) => {
    if (st !== "all" && r.status !== st) return false;
    if (cat !== "all" && r.category !== cat) return false;
    if (q && !(`${r.name} ${r.message || ""} ${r.category || ""}`.toLowerCase().includes(q))) return false;
    return true;
  });
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div><span class="badge ${r.status}">${(r.status || "?").toUpperCase()}</span></div>
      <div>
        <div class="name">${escapeHtml(r.name || "")}</div>
        <div class="msg">${escapeHtml(r.message || "")}${r.missingAliases && r.missingAliases.length ? " · missing aliases: " + escapeHtml(r.missingAliases.join(", ")) : ""}</div>
      </div>
      <div class="cat">${escapeHtml(r.category || "")}</div>
    `;
    box.appendChild(row);
  }
  if (!rows.length) {
    box.innerHTML = `<div class="muted">No tests match filters.</div>`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function presentShare({ short, key, note, label }) {
  const urlInput = $("shareUrl");
  const labelEl = $("shareLabel");
  const noteEl = $("shareNote");
  const keyChip = $("shareKey");
  const openBtn = $("openShareBtn");

  if (urlInput) urlInput.value = short;
  if (openBtn) openBtn.href = short;
  if (labelEl) labelEl.textContent = label;
  if (noteEl) noteEl.textContent = note;
  if (keyChip) {
    keyChip.hidden = !key;
    if (key) {
      keyChip.textContent = `key ${key}`;
      keyChip.title = "Content-addressed SHA-256 key. The same report always maps to the same key.";
    }
  }
}

async function refreshShare(rawInput) {
  const bar = $("shareBar");
  if (!bar) return; // page without share UI

  const trimmed = (rawInput || "").trim();
  const meta = $("shareMeta");
  if (!trimmed) {
    bar.hidden = true;
    if (meta) meta.hidden = true;
    return;
  }

  const longUrl = `${absUrl("report.html")}#r=${encodeURIComponent(trimmed)}`;
  bar.hidden = false;
  if (meta) meta.hidden = false;

  // We already have a key for exactly this payload (opened via #k=, or published
  // a moment ago), so there is no reason to POST it back at the API. Comparing
  // the payload is what stops a stale key being shown for a freshly pasted one.
  if (currentKey && currentKeyPayload === trimmed) {
    const short = shortUrlFor(currentKey);
    presentShare({
      short,
      key: currentKey,
      label: "🔗 Short link:",
      note: `loaded from the report API · ${longUrl.length} chars inline → ${short.length} chars`,
    });
    return;
  }

  // Show the legacy long link right away so the bar is never useless while the
  // publish is in flight (or if it fails).
  presentShare({ short: longUrl, key: null, label: "🔗 Shareable link:", note: "Publishing short link…" });

  try {
    const { key, source } = await publishPayload(trimmed);
    currentKey = key;
    currentKeyPayload = trimmed;
    const short = shortUrlFor(key);
    presentShare({
      short,
      key,
      label: "🔗 Short link:",
      note: `published to the report API (${source}) · ${longUrl.length} chars inline → ${short.length} chars`,
    });
  } catch (err) {
    presentShare({
      short: longUrl,
      key: null,
      label: "🔗 Long link (short link unavailable):",
      note: `${err.message}. Deploy the report API (worker/README.md) or set the API URL above — until then this link carries the whole report inline.`,
    });
  }
}

async function showReport(report) {
  currentReport = report;
  const seal = await verifySeal(report);
  $("reportView").hidden = false;
  // Update page title on report-only page so tabs/bookmarks are descriptive
  if (IS_REPORT_ONLY && report.executor && report.executor.name) {
    const ex = report.executor.name + (report.executor.version ? " " + report.executor.version : "");
    const rate = report.summary && typeof report.summary.rate === "number" ? ` · ${report.summary.rate}%` : "";
    document.title = `caseUNC — ${ex}${rate}`;
  }

  const ex = report.executor || {};
  const sum = report.summary || {};
  const integ = report.integrity || {};

  $("stExec").textContent = `${ex.name || "Unknown"}${ex.version ? " " + ex.version : ""}`;
  $("stRate").textContent = `${sum.rate ?? "—"}%`;
  $("stPass").textContent = String(sum.passed ?? "—");
  $("stFail").textContent = String(sum.failed ?? "—");
  $("stRisk").textContent = `${integ.risk || "n/a"} (${integ.score ?? 0})`;
  $("stRisk").className = `value ${riskClass(integ.risk)}`;
  $("stSeal").textContent = seal.ok ? "VALID" : "INVALID";
  $("stSeal").className = `value ${seal.ok ? "ok" : "bad"}`;

  if (seal.ok) {
    setStatus("ok", `Seal valid · HMAC-SHA256 · body ${seal.bodyHash.slice(0, 16)}… · age ${seal.age}s`);
  } else if (seal.soft) {
    setStatus("warn", `Seal signature ok but ${seal.reason}`);
  } else {
    setStatus("bad", `SPOOF / TAMPER WARNING: ${seal.reason}`);
  }

  const meta = $("metaGrid");
  meta.innerHTML = [
    ["Session", report.sessionId],
    ["Version", report.version],
    ["Build", report.buildId],
    ["Timestamp", report.timestampIso || report.timestamp],
    ["Duration", typeof report.duration === "number" ? report.duration.toFixed(3) + "s" : report.duration],
    ["PlaceId", ex.placeId],
    ["GameId", ex.gameId],
    ["Skipped", sum.skipped],
    ["Alias gaps", sum.aliasMissing],
    ["Schema", report.schema],
  ]
    .map(([k, v]) => `<div>${k}: <span>${escapeHtml(v ?? "—")}</span></div>`)
    .join("");

  populateCategories(report.results || []);
  renderFindings(integ);
  renderResults(report);
}

async function parseInput() {
  const raw = $("reportInput") ? $("reportInput").value : "";
  try {
    const report = decodePayload(raw);
    await showReport(report);
    await refreshShare(raw);
  } catch (err) {
    if ($("reportView")) $("reportView").hidden = true;
    setStatus("bad", String(err.message || err));
    const bar = $("shareBar");
    if (bar) bar.hidden = true;
    const meta = $("shareMeta");
    if (meta) meta.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Report a boot failure without wrecking the page. On the output-only page the
 * whole page *is* the report, so we replace it with an error. On the main
 * viewer the paste box must stay usable, so we only flag a warning.
 */
function failBoot(message) {
  if (IS_REPORT_ONLY) showError(message);
  else setStatus("warn", message);
}

/**
 * Load a report referenced by the URL fragment. `#k=<key>` fetches from the
 * report API; `#r=<base64>` is the legacy inline form and still works.
 * @returns {Promise<boolean>} true when a report was rendered
 */
async function bootFromHash() {
  const ref = Share ? Share.parseHash(location.hash || "") : null;
  if (!ref) return false;

  try {
    if (ref.kind === "payload") {
      if ($("reportInput")) $("reportInput").value = ref.value;
      await parseInput();
      return true;
    }

    if (!Key.isValid(ref.value)) {
      failBoot(`"${ref.value}" is not a valid report key.`);
      return false;
    }

    const loading = $("report-loading");
    if (loading) loading.textContent = `Fetching report ${ref.value}…`;

    const payload = await fetchPayloadByKey(ref.value);

    // Prove the blob the API handed back really is the one the key names.
    const derived = await Key.derive(payload);
    if (derived !== ref.value) {
      failBoot(`Key mismatch: this payload hashes to ${derived}, but the link asked for ${ref.value}.`);
      return false;
    }

    currentKey = ref.value;
    currentKeyPayload = payload;
    if ($("reportInput")) $("reportInput").value = payload;
    await parseInput();
    return true;
  } catch (err) {
    failBoot(String(err.message || err));
    return false;
  }
}

function showError(msg) {
  const loading = $("report-loading");
  const errEl = $("report-error");
  if (loading) loading.hidden = true;
  if (errEl) {
    errEl.hidden = false;
    errEl.innerHTML = "";
    const text = document.createTextNode(msg + " ");
    const link = document.createElement("a");
    link.href = absUrl("index.html#viewer");
    link.textContent = "← Open the main viewer";
    errEl.appendChild(text);
    errEl.appendChild(link);

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent =
      " Short links expire when their TTL runs out. If you have the base64 report code, paste it into the main viewer instead.";
    errEl.appendChild(hint);
  }
  const viewer = $("viewer");
  if (viewer) viewer.hidden = true;
}

// ---------------------------------------------------------------------------
// Wire up elements that may or may not exist on each page
// ---------------------------------------------------------------------------

if ($("parseBtn")) $("parseBtn").addEventListener("click", parseInput);

if ($("clearBtn")) $("clearBtn").addEventListener("click", () => {
  if ($("reportInput")) $("reportInput").value = "";
  $("reportView").hidden = true;
  $("status").hidden = true;
  const bar = $("shareBar");
  if (bar) bar.hidden = true;
  const meta = $("shareMeta");
  if (meta) meta.hidden = true;
  currentReport = null;
  currentKey = null;
  currentKeyPayload = null;
  if (IS_REPORT_ONLY) {
    // On the output-only page a clear makes no sense without a decoder; bounce
    // the user back to the main viewer.
    location.href = absUrl("index.html#viewer");
  }
});

if ($("filterText")) $("filterText").addEventListener("input", () => currentReport && renderResults(currentReport));
if ($("filterStatus")) $("filterStatus").addEventListener("change", () => currentReport && renderResults(currentReport));
if ($("filterCat")) $("filterCat").addEventListener("change", () => currentReport && renderResults(currentReport));

if ($("fileInput")) $("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  if ($("reportInput")) $("reportInput").value = text;
  parseInput();
});

if ($("copyLoadstring")) $("copyLoadstring").addEventListener("click", async () => {
  const text = $("loadstringBox").textContent;
  try {
    await navigator.clipboard.writeText(text);
    $("copyLoadstring").textContent = "Copied";
    setTimeout(() => ($("copyLoadstring").textContent = "Copy loadstring"), 1200);
  } catch {
    $("copyLoadstring").textContent = "Select & copy manually";
  }
});

if ($("scrollViewer")) $("scrollViewer").addEventListener("click", () => $("viewer").scrollIntoView({ behavior: "smooth" }));

// Share-link copy button (exists on both pages)
if ($("copyShareBtn")) $("copyShareBtn").addEventListener("click", async () => {
  const urlInput = $("shareUrl");
  const text = urlInput ? urlInput.value : location.href;
  try {
    await navigator.clipboard.writeText(text);
    const btn = $("copyShareBtn");
    const oldText = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = oldText), 1200);
  } catch {
    // Fallback: select the input so the user can Ctrl-C
    if (urlInput) {
      urlInput.select();
    }
  }
});

// "Open in main viewer" button on report-only page
if ($("openMainBtn")) $("openMainBtn").addEventListener("click", () => {
  const hash = location.hash || "";
  // Forward the k=/r= payload so the main viewer auto-loads it.
  location.href = absUrl("index.html") + hash;
});

// ---------- Report API settings (main viewer only) ----------
function describeApi() {
  const status = $("apiStatus");
  const input = $("apiUrlInput");
  if (!status) return;
  const api = apiInfo();
  if (!api) {
    status.textContent = "No API configured. Short links are unavailable.";
    return;
  }
  status.textContent = `Using ${api.endpoint} (from ${api.source}).`;
  if (input && input.value.trim() === "" && api.source === "stored") {
    input.placeholder = api.base;
  }
}

if ($("apiUrlInput")) {
  $("apiUrlInput").value = readStoredApi() || "";
  describeApi();
}

if ($("apiSaveBtn")) $("apiSaveBtn").addEventListener("click", async () => {
  const value = $("apiUrlInput").value.trim();
  try {
    if (value) localStorage.setItem("caseUNC.apiUrl", value);
    else localStorage.removeItem("caseUNC.apiUrl");
  } catch {
    /* private mode: nothing we can do */
  }
  describeApi();

  const btn = $("apiSaveBtn");
  btn.textContent = "Saved";
  setTimeout(() => (btn.textContent = "Save"), 1200);

  // Re-publish whatever is on screen so the share bar picks up the new API.
  if (currentReport && $("reportInput")) await refreshShare($("reportInput").value);
});

if ($("apiTestBtn")) $("apiTestBtn").addEventListener("click", async () => {
  const btn = $("apiTestBtn");
  const status = $("apiStatus");
  const api = apiInfo();
  if (!api) {
    if (status) status.textContent = "Nothing to test — set an API URL first.";
    return;
  }
  btn.textContent = "Testing…";
  try {
    const res = await fetch(Share.healthEndpoint(api.endpoint));
    const data = await readJson(res);
    if (!res.ok || !data || !data.ok) throw new Error(`HTTP ${res.status}`);
    const days = Math.round((data.ttlSeconds || 0) / 86400);
    status.textContent =
      `OK · ${data.service} v${data.version} · ${data.keyLength}-char keys · ` +
      `${days}-day TTL${data.writeProtected ? " · writes need a token" : ""}`;
  } catch (err) {
    status.textContent =
      `Unreachable: ${err.message}. If the API is on another origin, its CORS ` +
      `settings must allow ${location.origin}.`;
  }
  btn.textContent = "Test";
});

// ---------- Boot ----------
(async () => {
  if (IS_REPORT_ONLY) {
    // On the output-only page we expect a #k= (or legacy #r=) reference. If it
    // is missing, show an error and link back to the main viewer instead of
    // rendering the decoder UI.
    const loaded = await bootFromHash();
    if (loaded) {
      const loading = $("report-loading");
      const viewer = $("viewer");
      if (loading) loading.hidden = true;
      if (viewer) viewer.hidden = false;
    } else if (!$("report-error") || $("report-error").hidden) {
      // bootFromHash already reported a specific failure (expired key, bad key,
      // unreachable API); only add the generic message when it said nothing.
      showError("No report key in URL. Open a report link generated from the main viewer.");
    }
  } else {
    await bootFromHash();
  }
})();
