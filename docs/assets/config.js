/**
 * caseUNC viewer configuration.
 *
 * Set `apiUrl` to the origin of your deployed report API (see worker/README.md)
 * and short links light up. Leave it empty to auto-detect: the viewer will try
 * the same origin, which is what you want when the Worker serves docs/ too.
 *
 * You can also set it without touching this file, either from the viewer UI
 * (stored in localStorage) or per-link with ?api=https://your-api.example
 */
window.caseUNCConfig = {
  apiUrl: "",
  /** Set false to stop the viewer probing the same origin for an API. */
  trySameOrigin: true,
};
