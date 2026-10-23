import RFB from '@novnc/novnc';

let rfb;
let parentOrigin;
const status = document.getElementById('status');
try { parentOrigin = new URL(document.referrer).origin; } catch { /* no parent */ }
const permitted = parent !== window && window.viewerParents.includes(parentOrigin);

function ready() {
  if (permitted) parent.postMessage({ type: 'changuito-viewer-ready' }, parentOrigin);
}
window.addEventListener('message', event => {
  if (!permitted || event.source !== parent || event.origin !== parentOrigin || event.data?.type !== 'changuito-viewer-connect') return;
  const { jobId, ticket } = event.data;
  if (!/^[0-9a-f]{32}$/.test(jobId) || !/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return;
  rfb?.disconnect();
  const url = new URL(`/viewer/${jobId}/socket`, location.origin);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  rfb = new RFB(document.getElementById('screen'), url.toString(), { shared: false, wsProtocols: ['changuito.viewer', ticket] });
  rfb.scaleViewport = true;
  rfb.resizeSession = false;
  rfb.addEventListener('connect', () => { status.textContent = 'Conectado / Connected'; });
  rfb.addEventListener('disconnect', () => { status.textContent = 'Desconectado / Disconnected'; });
  rfb.addEventListener('securityfailure', () => { status.textContent = 'Acceso rechazado / Access denied'; });
});
document.getElementById('reconnect').onclick = ready;
document.getElementById('keyboard').addEventListener('input', event => {
  for (const character of event.target.value) {
    const code = character.codePointAt(0);
    rfb?.sendKey(code > 255 ? 0x01000000 | code : code);
  }
  event.target.value = '';
});
document.getElementById('tab').onclick = () => rfb?.sendKey(0xff09);
document.getElementById('backspace').onclick = () => rfb?.sendKey(0xff08);
ready();
