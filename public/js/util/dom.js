// Mini DOM helpers. esc() is kritisch voor XSS-veiligheid: alle strings
// die uit de API komen moeten hierdoorheen voordat ze in innerHTML komen.

const ESC_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
}

export function el(id) {
  return document.getElementById(id);
}

export function setHTML(target, html) {
  const node = typeof target === 'string' ? document.getElementById(target) : target;
  if (node) node.innerHTML = html;
}

export function on(target, event, handler) {
  const node = typeof target === 'string' ? document.getElementById(target) : target;
  if (node) node.addEventListener(event, handler);
}
