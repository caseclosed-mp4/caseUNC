const SECRET = "caseUNC-report-seal-key-v1-do-not-trust-client-alone";
const SALT_A = "cAsEuNc::v1::anti-spoof";

// Detect report-only page (separate output-only view, no decoder UI)
const IS_REPORT_ONLY =
  document.body.classList.contains("report-only") ||
  /report\.html([?#]|$)/i.test(location.pathname) ||
  location.search.includes("output=1") ||
  location.hash.includes("output=1");

const $ = (id) => document.getElementById(id);

function absUrl(path) {
  // Build absolute URL relative to this script's directory so links work on
  // GitHub Pages, local file://, and any deployment path.
  const base = location.href.replace(/[^/]*$/, "");
  return new URL(path, base).toString();
}

function buildShareUrl(payloadB64) {
  const page = IS_REPORT_ONLY ? "" : "report.html";
  return `${absUrl(page)}#r=${encodeURIComponent(payloadB64)}`;
}

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
  const trimmed = raw.trim();
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

function riskClass(risk) {
  if (risk === "spoofed") return "bad";
  if (risk === "suspicious" || risk === "elevated") return "warn";
  return "ok";
}

function setStatus(kind, text) {
  const el = $("status");
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = text;
}

let currentReport = null;

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

function updateShareBar(rawInput) {
  const bar = $("shareBar");
  const urlInput = $("shareUrl");
  const openBtn = $("openShareBtn");
  if (!bar) return; // report-only page without share UI
  const trimmed = (rawInput || "").trim();
  if (!trimmed) {
    bar.hidden = true;
    return;
  }
  const url = buildShareUrl(trimmed);
  if (urlInput) urlInput.value = url;
  if (openBtn) openBtn.href = url;
  bar.hidden = false;
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
    updateShareBar(raw);
  } catch (err) {
    $("reportView").hidden = true;
    setStatus("bad", String(err.message || err));
    const bar = $("shareBar");
    if (bar) bar.hidden = true;
  }
}

function bootFromHash() {
  const hash = location.hash || "";
  const m = hash.match(/[#&]r=([^&]+)/);
  if (m) {
    try {
      const payload = decodeURIComponent(m[1]);
      if ($("reportInput")) $("reportInput").value = payload;
      parseInput();
      return true;
    } catch {
      /* ignore */
    }
  }
  return false;
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
  }
  const viewer = $("viewer");
  if (viewer) viewer.hidden = true;
}

// ---------- Wire up elements that may or may not exist on each page ----------
if ($("parseBtn")) $("parseBtn").addEventListener("click", parseInput);

if ($("clearBtn")) $("clearBtn").addEventListener("click", () => {
  if ($("reportInput")) $("reportInput").value = "";
  $("reportView").hidden = true;
  $("status").hidden = true;
  const bar = $("shareBar");
  if (bar) bar.hidden = true;
  currentReport = null;
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
  // Forward the r= payload so the main viewer auto-loads it.
  location.href = absUrl("index.html") + hash;
});

// ---------- Boot ----------
if (IS_REPORT_ONLY) {
  // On the output-only page we expect a #r= payload. If missing, show an error
  // and link back to the main viewer instead of rendering the decoder UI.
  const loaded = bootFromHash();
  const viewer = $("viewer");
  const loading = $("report-loading");
  if (!loaded) {
    showError("No report payload in URL. Open a report link generated from the main viewer.");
  } else {
    if (loading) loading.hidden = true;
    if (viewer) viewer.hidden = false;
  }
} else {
  bootFromHash();
}
