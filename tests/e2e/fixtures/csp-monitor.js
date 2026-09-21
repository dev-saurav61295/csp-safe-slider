// Loaded before any library code so violations during init are captured too.
window.__cspViolations = [];
window.addEventListener('securitypolicyviolation', (event) => {
  window.__cspViolations.push({
    violatedDirective: event.violatedDirective,
    blockedURI: event.blockedURI,
    sourceFile: event.sourceFile,
    lineNumber: event.lineNumber,
  });
});

// Continuous mutation instrumentation: catches forbidden attributes/nodes
// even if they are added and later removed before a test gets to inspect
// the DOM — a final snapshot alone would miss that.
window.__forbiddenMutations = [];
function describe(node) {
  if (node.nodeType !== 1) return null;
  const el = /** @type {Element} */ (node);
  return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`;
}
const mo = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === 'attributes') {
      const name = record.attributeName || '';
      const el = /** @type {Element} */ (record.target);
      if (name === 'style' && el.getAttribute('style')) {
        window.__forbiddenMutations.push(`style attribute set on ${describe(el)}`);
      }
      if (name.startsWith('on') && el.getAttribute(name) != null) {
        window.__forbiddenMutations.push(`${name} handler attribute set on ${describe(el)}`);
      }
    }
    if (record.type === 'childList') {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          const el = /** @type {Element} */ (node);
          if (el.tagName === 'STYLE') window.__forbiddenMutations.push('<style> element inserted');
          if (el.tagName === 'SCRIPT' && !el.hasAttribute('src')) {
            window.__forbiddenMutations.push('inline <script> element inserted');
          }
        }
      });
    }
  }
});
mo.observe(document.documentElement, {
  attributes: true,
  subtree: true,
  childList: true,
});
window.__cspMonitorObserver = mo;
