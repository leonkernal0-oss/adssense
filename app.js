// VoidTools app logic
const tools = document.querySelectorAll('[id^="tool-"]');
document.querySelectorAll('#nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tools.forEach(t => t.classList.add('hidden'));
    document.getElementById('tool-' + btn.dataset.tool).classList.remove('hidden');
  });
});

let gpuAnim = null, gpuRunning = false, gpuFrames = 0, gpuLast = 0;
const gpuCanvas = document.getElementById('gpu-canvas');
let gl = null, gpuProgram = null, gpuStartTime = 0;
document.getElementById('gpu-complexity').addEventListener('input', e => {
  document.getElementById('gpu-comp-val').textContent = e.target.value;
});
function initGL() {
  if (gl) return true;
  gl = gpuCanvas.getContext('webgl') || gpuCanvas.getContext('experimental-webgl');
  if (!gl) { alert('WebGL not supported'); return false; }
  gpuCanvas.width = gpuCanvas.clientWidth * (window.devicePixelRatio || 1);
  gpuCanvas.height = 180 * (window.devicePixelRatio || 1);
  gl.viewport(0, 0, gpuCanvas.width, gpuCanvas.height);
  const vs = 'attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }';
  const fs = 'precision highp float; uniform float u_time; uniform float u_comp; uniform vec2 u_res; void main(){ vec2 uv = gl_FragCoord.xy / u_res; float c = 0.; for(float i=0.; i<20.; i++){ if(i >= u_comp) break; float t = u_time * (0.3 + i*0.07); vec2 p = uv * (2. + i*0.4) + vec2(sin(t+i), cos(t*1.3+i)); c += 0.5 + 0.5*sin(p.x*6. + p.y*4. + t); } c /= u_comp; vec3 col = vec3(0.1 + c*0.4, 0.3 + c*0.7, 0.5 + c*0.5); gl_FragColor = vec4(col, 1.); }';
  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog); gl.useProgram(prog); gpuProgram = prog;
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return true;
}
function startGPU() {
  if (!initGL()) return; stopGPU(); gpuRunning = true; gpuFrames = 0; gpuStartTime = performance.now(); gpuLast = gpuStartTime;
  document.getElementById('gpu-frames').textContent = '0';
  function loop(now) {
    if (!gpuRunning) return;
    const comp = +document.getElementById('gpu-complexity').value;
    gl.uniform1f(gl.getUniformLocation(gpuProgram, 'u_time'), (now - gpuStartTime) / 1000);
    gl.uniform1f(gl.getUniformLocation(gpuProgram, 'u_comp'), comp);
    gl.uniform2f(gl.getUniformLocation(gpuProgram, 'u_res'), gpuCanvas.width, gpuCanvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gpuFrames++;
    const dt = now - gpuLast;
    if (dt >= 250) {
      const fps = Math.round(gpuFrames / ((now - gpuStartTime) / 1000));
      document.getElementById('gpu-fps').textContent = fps;
      document.getElementById('gpu-ms').textContent = (1000 / Math.max(fps,1)).toFixed(1);
      document.getElementById('gpu-frames').textContent = gpuFrames.toLocaleString();
      gpuLast = now;
    }
    gpuAnim = requestAnimationFrame(loop);
  }
  gpuAnim = requestAnimationFrame(loop);
}
function stopGPU() { gpuRunning = false; if (gpuAnim) cancelAnimationFrame(gpuAnim); }

let volStream = null, volCtx = null, volAnalyser = null, volAnim = null;
const volCanvas = document.getElementById('vol-canvas');
const volCtx2d = volCanvas.getContext('2d');
async function startVolume() {
  stopVolume();
  try { volStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch(e) { alert('Mic permission denied'); return; }
  volCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = volCtx.createMediaStreamSource(volStream);
  volAnalyser = volCtx.createAnalyser(); volAnalyser.fftSize = 256; src.connect(volAnalyser);
  const data = new Uint8Array(volAnalyser.frequencyBinCount);
  volCanvas.width = volCanvas.clientWidth * 2; volCanvas.height = 160;
  function draw() {
    if (!volAnalyser) return;
    volAnim = requestAnimationFrame(draw);
    volAnalyser.getByteTimeDomainData(data);
    let sum = 0, peak = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; peak = Math.max(peak, Math.abs(v)); }
    const rms = Math.sqrt(sum / data.length);
    const pct = Math.min(100, Math.round(rms * 250));
    const db = rms > 0.0001 ? (20 * Math.log10(rms)).toFixed(1) : '-∞';
    document.getElementById('vol-fill').style.width = pct + '%';
    document.getElementById('vol-label').textContent = pct + '%';
    document.getElementById('vol-db').textContent = db;
    document.getElementById('vol-peak').textContent = (peak * 100).toFixed(0) + '%';
    document.getElementById('vol-rms').textContent = (rms * 100).toFixed(1) + '%';
    volCtx2d.fillStyle = '#0e0e16'; volCtx2d.fillRect(0, 0, volCanvas.width, volCanvas.height);
    volCtx2d.strokeStyle = '#00f5d4'; volCtx2d.lineWidth = 2; volCtx2d.beginPath();
    const slice = volCanvas.width / data.length;
    for (let i = 0; i < data.length; i++) {
      const y = ((data[i] / 255) * volCanvas.height);
      if (i === 0) volCtx2d.moveTo(0, y); else volCtx2d.lineTo(i * slice, y);
    }
    volCtx2d.stroke();
  }
  draw();
}
function stopVolume() {
  if (volAnim) cancelAnimationFrame(volAnim);
  if (volStream) volStream.getTracks().forEach(t => t.stop());
  if (volCtx) volCtx.close();
  volStream = volCtx = volAnalyser = null;
  document.getElementById('vol-fill').style.width = '0%';
  document.getElementById('vol-label').textContent = '0%';
}

function runFPSBench() {
  let frames = 0, min = 999, max = 0, last = performance.now();
  const start = last; const samples = [];
  document.getElementById('fps-bar-label').textContent = 'Running...';
  document.getElementById('fps-bar').style.width = '0%';
  function tick(now) {
    frames++; const dt = now - last;
    if (dt > 0) { const f = 1000 / dt; samples.push(f); min = Math.min(min, f); max = Math.max(max, f); }
    last = now;
    const prog = Math.min(100, ((now - start) / 5000) * 100);
    document.getElementById('fps-bar').style.width = prog + '%';
    document.getElementById('fps-bar-label').textContent = prog.toFixed(0) + '%';
    if (now - start < 5000) requestAnimationFrame(tick);
    else {
      const avg = samples.reduce((a,b)=>a+b,0) / samples.length;
      document.getElementById('fps-avg').textContent = Math.round(avg);
      document.getElementById('fps-min').textContent = Math.round(min);
      document.getElementById('fps-max').textContent = Math.round(max);
      document.getElementById('fps-bar-label').textContent = 'Done';
    }
  }
  requestAnimationFrame(tick);
}

let cpuWorkers = [], cpuRunning = false, cpuTotal = 0, cpuStart = 0, cpuTimer = null;
document.getElementById('cpu-workers').addEventListener('input', e => {
  document.getElementById('cpu-workers-val').textContent = e.target.value;
});
function startCPU() {
  stopCPU(); cpuRunning = true; cpuTotal = 0; cpuStart = performance.now();
  const n = +document.getElementById('cpu-workers').value;
  const code = 'let ops=0;onmessage=function(){const end=performance.now()+50;while(performance.now()<end){let x=0;for(let i=0;i<5000;i++)x+=Math.sqrt(i)*Math.sin(i);ops++;}postMessage(ops);ops=0;setTimeout(()=>postMessage("tick"),0);};';
  for (let i = 0; i < n; i++) {
    const blob = new Blob([code], { type: 'application/javascript' });
    const w = new Worker(URL.createObjectURL(blob));
    w.onmessage = e => {
      if (typeof e.data === 'number') cpuTotal += e.data;
      else if (cpuRunning) w.postMessage('go');
    };
    w.postMessage('go'); cpuWorkers.push(w);
  }
  cpuTimer = setInterval(() => {
    const secs = (performance.now() - cpuStart) / 1000;
    document.getElementById('cpu-total').textContent = cpuTotal.toLocaleString();
    document.getElementById('cpu-ops').textContent = Math.round(cpuTotal / secs).toLocaleString();
    document.getElementById('cpu-time').textContent = secs.toFixed(1) + 's';
  }, 200);
}
function stopCPU() {
  cpuRunning = false; cpuWorkers.forEach(w => w.terminate()); cpuWorkers = [];
  if (cpuTimer) clearInterval(cpuTimer);
}

const defaultRates = {USD:1,EUR:0.92,GBP:0.79,JPY:149.5,PHP:58.2,AUD:1.53,CAD:1.36,CHF:0.88,CNY:7.24,INR:83.5,KRW:1350,SGD:1.34,HKD:7.82,THB:35.8,MYR:4.72,IDR:15800,VND:25400,NZD:1.67,MXN:17.1,BRL:5.05};
let rates = JSON.parse(localStorage.getItem('voidtools_rates') || 'null') || {...defaultRates};
function fillCurrencySelects() {
  const from = document.getElementById('cur-from'), to = document.getElementById('cur-to');
  const keys = Object.keys(rates).sort();
  from.innerHTML = to.innerHTML = keys.map(k => '<option value="'+k+'">'+k+'</option>').join('');
  from.value = 'USD'; to.value = 'EUR';
}
fillCurrencySelects();
function convertCurrency() {
  const amount = parseFloat(document.getElementById('cur-amount').value) || 0;
  const from = document.getElementById('cur-from').value, to = document.getElementById('cur-to').value;
  const result = (amount / rates[from]) * rates[to];
  const el = document.getElementById('cur-result'); el.classList.remove('empty');
  el.textContent = amount.toLocaleString()+' '+from+' = '+result.toLocaleString(undefined,{maximumFractionDigits:4})+' '+to;
}

document.getElementById('pw-len').addEventListener('input', e => { document.getElementById('pw-len-val').textContent = e.target.value; });
function genPassword() {
  const len = +document.getElementById('pw-len').value;
  let chars = '';
  if (document.getElementById('pw-upper').checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (document.getElementById('pw-lower').checked) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (document.getElementById('pw-num').checked) chars += '0123456789';
  if (document.getElementById('pw-sym').checked) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  if (!chars) { alert('Select at least one set'); return; }
  const arr = new Uint32Array(len); crypto.getRandomValues(arr);
  let pw = ''; for (let i = 0; i < len; i++) pw += chars[arr[i] % chars.length];
  const el = document.getElementById('pw-result'); el.classList.remove('empty'); el.textContent = pw;
}

function genQR() {
  const text = document.getElementById('qr-text').value.trim();
  if (!text) { alert('Enter text'); return; }
  const canvas = document.getElementById('qr-canvas'); canvas.classList.remove('hidden');
  // simple canvas QR placeholder - use offline-friendly data URL pattern
  const ctx = canvas.getContext('2d');
  canvas.width = 220; canvas.height = 220;
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,220,220);
  ctx.fillStyle = '#07070c'; ctx.font = '12px monospace';
  ctx.fillText('QR: ' + text.slice(0,24), 20, 110);
  // real QR would need the full lib; for offline stress tools this is secondary
}

const units = {
  Length: { m:1, km:0.001, cm:100, mm:1000, mi:0.000621371, yd:1.09361, ft:3.28084, in:39.3701 },
  Weight: { kg:1, g:1000, mg:1e6, lb:2.20462, oz:35.274, ton:0.001 },
  Temperature: null,
  Area: { 'm²':1, 'km²':1e-6, 'cm²':1e4, 'ft²':10.7639, acre:0.000247105, ha:0.0001 },
  Volume: { L:1, mL:1000, 'm³':0.001, gal:0.264172, qt:1.05669, cup:4.22675 },
  Speed: { 'm/s':1, 'km/h':3.6, mph:2.23694, knot:1.94384 },
  Data: { B:1, KB:1/1024, MB:1/(1024**2), GB:1/(1024**3), TB:1/(1024**4), bit:8 }
};
function loadUnitOptions() {
  const cat = document.getElementById('unit-cat').value;
  const from = document.getElementById('unit-from'), to = document.getElementById('unit-to');
  if (cat === 'Temperature') {
    from.innerHTML = to.innerHTML = ['C','F','K'].map(u => '<option value="'+u+'">°'+u+'</option>').join('');
    return;
  }
  const keys = Object.keys(units[cat]);
  from.innerHTML = to.innerHTML = keys.map(k => '<option value="'+k+'">'+k+'</option>').join('');
  if (keys.length > 1) to.selectedIndex = 1;
}
(function() {
  document.getElementById('unit-cat').innerHTML = Object.keys(units).map(k => '<option value="'+k+'">'+k+'</option>').join('');
  loadUnitOptions();
})();
function convertUnit() {
  const cat = document.getElementById('unit-cat').value;
  const val = parseFloat(document.getElementById('unit-val').value) || 0;
  const from = document.getElementById('unit-from').value, to = document.getElementById('unit-to').value;
  let result;
  if (cat === 'Temperature') {
    let c = val;
    if (from === 'F') c = (val - 32) * 5/9;
    if (from === 'K') c = val - 273.15;
    if (to === 'C') result = c; if (to === 'F') result = c * 9/5 + 32; if (to === 'K') result = c + 273.15;
  } else result = (val / units[cat][from]) * units[cat][to];
  const el = document.getElementById('unit-result'); el.classList.remove('empty');
  el.textContent = val+' '+from+' = '+result.toLocaleString(undefined,{maximumFractionDigits:8})+' '+to;
}

function updateColor(hex) {
  document.getElementById('color-preview').style.background = hex;
  document.getElementById('c-hex').textContent = hex.toUpperCase();
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  document.getElementById('c-rgb').textContent = r+', '+g+', '+b;
  const rn=r/255,gn=g/255,bn=b/255, max=Math.max(rn,gn,bn), min=Math.min(rn,gn,bn);
  let h=0,s=0,l=(max+min)/2;
  if (max!==min) {
    const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case rn:h=((gn-bn)/d+(gn<bn?6:0))/6;break;case gn:h=((bn-rn)/d+2)/6;break;case bn:h=((rn-gn)/d+4)/6;break;}
  }
  document.getElementById('c-hsl').textContent = Math.round(h*360)+'°, '+Math.round(s*100)+'%, '+Math.round(l*100)+'%';
  const k=1-max, c=k===1?0:(1-rn-k)/(1-k), m=k===1?0:(1-gn-k)/(1-k), y=k===1?0:(1-bn-k)/(1-k);
  document.getElementById('c-cmyk').textContent = Math.round(c*100)+', '+Math.round(m*100)+', '+Math.round(y*100)+', '+Math.round(k*100);
}
document.getElementById('color-pick').addEventListener('input', e => updateColor(e.target.value));

function textTransform(mode) {
  const t = document.getElementById('text-in').value; let out = t;
  if (mode==='upper') out=t.toUpperCase();
  if (mode==='lower') out=t.toLowerCase();
  if (mode==='title') out=t.replace(/\w\S*/g, w => w.charAt(0).toUpperCase()+w.slice(1).toLowerCase());
  if (mode==='reverse') out=t.split('').reverse().join('');
  if (mode==='slug') out=t.toLowerCase().trim().replace(/[^\w\s-]/g,'').replace(/[\s_-]+/g,'-').replace(/^-+|-+$/g,'');
  const el=document.getElementById('text-result'); el.classList.remove('empty'); el.textContent=out;
}
function textCount() {
  const t=document.getElementById('text-in').value;
  const words=t.trim()?t.trim().split(/\s+/).length:0;
  const el=document.getElementById('text-result'); el.classList.remove('empty');
  el.textContent='Chars: '+t.length+' · Words: '+words+' · Lines: '+(t?t.split('\n').length:0);
}

function b64Encode() {
  try { const el=document.getElementById('b64-result'); el.classList.remove('empty');
    el.textContent=btoa(unescape(encodeURIComponent(document.getElementById('b64-in').value)));
  } catch(e){alert('Encode failed');}
}
function b64Decode() {
  try { const el=document.getElementById('b64-result'); el.classList.remove('empty');
    el.textContent=decodeURIComponent(escape(atob(document.getElementById('b64-in').value)));
  } catch(e){alert('Invalid Base64');}
}

async function genHash() {
  const text=document.getElementById('hash-in').value;
  const algo=document.getElementById('hash-algo').value;
  const buf=await crypto.subtle.digest(algo, new TextEncoder().encode(text));
  const hex=[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const el=document.getElementById('hash-result'); el.classList.remove('empty'); el.textContent=hex;
}

function copyText(id) {
  const t=document.getElementById(id).textContent;
  if (!t||t.includes('appears')||t.includes('Click')||t.includes('here')) return;
  navigator.clipboard.writeText(t).then(()=>{
    const btn=event.target; const old=btn.textContent; btn.textContent='Copied!';
    setTimeout(()=>btn.textContent=old,1200);
  });
}
