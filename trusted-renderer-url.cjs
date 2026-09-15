const AUXILIARY_QUERY_MODES = Object.freeze({
  danmu: 'danmu',
  display: 'display',
  highlight: 'highlight',
  'live-info': 'live-info'
});

/** Only the five built-in renderer documents may use the privileged preload. */
function getTrustedRendererMode(rawUrl, applicationOrigin) {
  try {
    const target = new URL(rawUrl);
    if (target.origin !== applicationOrigin || target.pathname !== '/') return '';
    const entries = Array.from(target.searchParams.entries());
    if (entries.length === 0) return 'main';
    if (entries.length !== 1 || entries[0][1] !== '') return '';
    return AUXILIARY_QUERY_MODES[entries[0][0]] || '';
  } catch {
    return '';
  }
}

module.exports = { getTrustedRendererMode };
