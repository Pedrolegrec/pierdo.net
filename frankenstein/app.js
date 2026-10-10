// Loader: three.js needs WebGL 2. Without it the page shows the still picture and the credits instead of an empty box.
const probe = document.createElement('canvas'), gl = probe.getContext('webgl2');
if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); import('./main.js').catch((e) => { console.warn(e); noGL(); }); } else noGL();
function noGL() {
  const n = document.getElementById('nogl'); if (n) n.style.display = 'flex';
  document.getElementById('loading').classList.add('done');
  for (const id of ['btnLive', 'btnMusic', 'btnMoon', 'btnPumpkin', 'btnReset']) { const b = document.getElementById(id); if (b) b.disabled = true; }
}
