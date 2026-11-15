/* 坐姿健康操：畫面、攝影機、語音、流程 */
(function(){
'use strict';
var E = window.SEX, $ = function(id){ return document.getElementById(id); };
var PFX = 'sex.';
var CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
var MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
var BADGE = 'https://visitor-badge.laobi.icu/badge?page_id=m255525.seatedexercisecam';
function lsGet(k, d){ try{ var v = localStorage.getItem(PFX + k); return v == null ? d : v; }catch(e){ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(PFX + k, v); }catch(e){} }
function lsJson(k, d){ try{ var v = JSON.parse(lsGet(k, null)); return v == null ? d : v; }catch(e){ return d; } }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
function openModal(h){ $('modalBox').innerHTML = h; $('modal').classList.add('show'); }
function closeModal(){ $('modal').classList.remove('show'); }
var toastT;
function toast(s){ var t = document.querySelector('.toast'); if(!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = s; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function(){ t.hidden = true; }, 2800); }

/* ---------- 設定 ---------- */
var SET = Object.assign({voice:true, rate:'slow', rest:10, fs:'m', skel:true, course:'warm', sens:'std', demo:true}, lsJson('set', {}));
function saveSet(){ lsSet('set', JSON.stringify(SET)); }
function applyView(){ document.documentElement.dataset.fs = SET.fs === 'xl' ? 'xl' : 'm'; }
var CUSTOM = lsJson('custom', E.MOVES.map(function(m){ return [m.id, m.id === 'march' || m.id === 'altArms' ? 0 : 8]; }));

/* ---------- 語音與提示音 ---------- */
var zhVoice = null;
function pickVoice(){ try{ var vs = speechSynthesis.getVoices(); zhVoice = vs.filter(function(v){ return /zh[-_]TW/i.test(v.lang); })[0] || vs.filter(function(v){ return /^zh/i.test(v.lang); })[0] || null; }catch(e){} }
if(window.speechSynthesis){ pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text, cut){
  if(!SET.voice || !window.speechSynthesis) return;
  try{ if(cut) speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = 'zh-TW'; if(zhVoice) u.voice = zhVoice; u.rate = SET.rate === 'slow' ? .85 : 1; speechSynthesis.speak(u); }catch(e){}
}
var AC = null;
function beep(f, len){ try{ AC = AC || new (window.AudioContext || window.webkitAudioContext)(); var t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = f || 880; o.connect(g); g.connect(AC.destination); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + (len || .18)); o.start(t); o.stop(t + (len || .18) + .02); }catch(e){} }

/* ---------- 攝影機與姿勢辨識 ---------- */
var video = $('cam'), stream = null, landmarker = null, lmLoading = null, lastVT = -1, lastLm = null;
async function initCamera(deviceId){
  var base = {width:{ideal:640}, height:{ideal:480}, frameRate:{ideal:30}};
  var c = deviceId ? {video:Object.assign({}, base, {deviceId:{exact:deviceId}}), audio:false} : {video:Object.assign({}, base, {facingMode:'user'}), audio:false};
  var s;
  try{ s = await navigator.mediaDevices.getUserMedia(c); }
  catch(e){ if(!deviceId) throw e; lsSet('cam', ''); s = await navigator.mediaDevices.getUserMedia({video:Object.assign({}, base, {facingMode:'user'}), audio:false}); }
  stopCamera(); stream = s; video.srcObject = s; lastVT = -1;
  await new Promise(function(res, rej){ video.onloadedmetadata = res; setTimeout(function(){ rej(new Error('camera timeout')); }, 8000); });
  await video.play();
  if(deviceId) lsSet('cam', deviceId);
}
function stopCamera(){ if(stream){ stream.getTracks().forEach(function(t){ t.stop(); }); stream = null; } video.srcObject = null; }
async function listCams(){ try{ return (await navigator.mediaDevices.enumerateDevices()).filter(function(d){ return d.kind === 'videoinput'; }); }catch(e){ return []; } }
function preferredCam(cams){
  var saved = lsGet('cam', '');
  if(saved && cams.some(function(c){ return c.deviceId === saved; })) return saved;
  var usb = cams.filter(function(c){ return /usb|uvc|external|webcam/i.test(c.label) && !/integrated|built[- ]?in|internal|內建/i.test(c.label); })[0];
  return usb ? usb.deviceId : null;
}
function initLandmarker(){
  if(landmarker) return Promise.resolve();
  if(lmLoading) return lmLoading;
  lmLoading = (async function(){
    var vision = await import(CDN);
    var fs = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
    var opts = {baseOptions:{modelAssetPath:MODEL_URL, delegate:'GPU'}, runningMode:'VIDEO', numPoses:1, minPoseDetectionConfidence:.4, minPosePresenceConfidence:.4, minTrackingConfidence:.4};
    try{ landmarker = await vision.PoseLandmarker.createFromOptions(fs, opts); }
    catch(e){ opts.baseOptions.delegate = 'CPU'; landmarker = await vision.PoseLandmarker.createFromOptions(fs, opts); }
  })();
  lmLoading.catch(function(){ lmLoading = null; });
  return lmLoading;
}
function detect(){
  if(!landmarker || !stream || video.readyState < 2 || video.currentTime === lastVT) return lastLm;
  lastVT = video.currentTime;
  try{ var r = landmarker.detectForVideo(video, performance.now()); lastLm = r.landmarks && r.landmarks[0] || null; }catch(e){}
  return lastLm;
}
function aspect(){ return (video.videoWidth || 4) / (video.videoHeight || 3); }

/* ---------- 示範小人 ---------- */
function drawFigure(cv, id, u){
  if(!cv) return;
  var W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if(cv.width !== Math.round(W * dpr)){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  var F = E.FIG[id] || E.FIG.armsUp, A = F[0], B = F[1], P = {};
  Object.keys(A).forEach(function(k){ P[k] = [A[k][0] + (B[k][0] - A[k][0]) * u, A[k][1] + (B[k][1] - A[k][1]) * u]; });
  var s = Math.min(W / 3.2, H / 3.3), cx = W / 2, cy = H * .64;
  var Q = function(k){ return [cx + P[k][0] * s, cy + P[k][1] * s]; };
  // 椅子
  x.fillStyle = '#c98b52'; x.fillRect(cx - .55 * s, cy - 1.45 * s, 1.1 * s, .12 * s);
  x.fillStyle = '#d99a5e'; x.fillRect(cx - .6 * s, cy - .32 * s, 1.2 * s, .14 * s);
  x.fillStyle = '#a86f3e'; [-.52, .46].forEach(function(o){ x.fillRect(cx + o * s, cy - .2 * s, .06 * s, .8 * s); });
  x.fillRect(cx - .52 * s, cy - 1.45 * s, .06 * s, 1.2 * s); x.fillRect(cx + .46 * s, cy - 1.45 * s, .06 * s, 1.2 * s);
  // 地面
  x.fillStyle = 'rgba(79,154,92,.18)'; x.beginPath(); x.ellipse(cx, cy + .62 * s, 1.2 * s, .12 * s, 0, 0, 7); x.fill();
  var line = function(a, b, w, c){ x.strokeStyle = c; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); };
  var hipC = [(Q('lhip')[0] + Q('rhip')[0]) / 2, (Q('lhip')[1] + Q('rhip')[1]) / 2];
  // 腿
  ['l', 'r'].forEach(function(sd){ line(Q(sd + 'hip'), Q(sd + 'kn'), .2 * s, '#3c5a8a'); line(Q(sd + 'kn'), Q(sd + 'ft'), .17 * s, '#3c5a8a'); var f = Q(sd + 'ft'); x.fillStyle = '#5b3a24'; x.beginPath(); x.ellipse(f[0], f[1] + .04 * s, .13 * s, .06 * s, 0, 0, 7); x.fill(); });
  // 身體
  x.fillStyle = '#e8743b'; x.beginPath(); var a = Q('lsh'), b = Q('rsh'); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(Q('rhip')[0] + .05 * s, Q('rhip')[1]); x.lineTo(Q('lhip')[0] - .05 * s, Q('lhip')[1]); x.closePath(); x.fill();
  line(a, b, .16 * s, '#e8743b');
  // 手
  ['l', 'r'].forEach(function(sd){ line(Q(sd + 'sh'), Q(sd + 'el'), .13 * s, '#e8743b'); line(Q(sd + 'el'), Q(sd + 'ha'), .11 * s, '#f1c9a0'); var h = Q(sd + 'ha'); x.fillStyle = '#f1c9a0'; x.beginPath(); x.arc(h[0], h[1], .08 * s, 0, 7); x.fill(); });
  // 頭
  var hd = Q('head'), nk = Q('neck'); line(nk, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], .1 * s, '#f1c9a0');
  x.fillStyle = '#f1c9a0'; x.beginPath(); x.arc(hd[0], hd[1], .27 * s, 0, 7); x.fill();
  x.fillStyle = '#d8d8d8'; x.beginPath(); x.arc(hd[0], hd[1] - .05 * s, .28 * s, Math.PI, 0); x.fill();
  x.fillStyle = '#3a2a20'; [-.09, .09].forEach(function(o){ x.beginPath(); x.arc(hd[0] + o * s, hd[1] + .02 * s, .028 * s, 0, 7); x.fill(); });
  x.strokeStyle = '#b5523a'; x.lineWidth = .03 * s; x.beginPath(); x.arc(hd[0], hd[1] + .08 * s, .08 * s, .2, Math.PI - .2); x.stroke();
  // 左右標示（鏡像：畫面左邊＝你的左邊）
  x.fillStyle = 'rgba(36,48,31,.55)'; x.font = '900 ' + Math.round(.2 * s) + 'px "Noto Sans TC",sans-serif'; x.textAlign = 'center';
  x.fillText('左', cx - 1.25 * s, cy - 1.9 * s); x.fillText('右', cx + 1.25 * s, cy - 1.9 * s);
  void hipC;
}
// 骨架線（畫在鏡像後的攝影機畫面上）
var BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26]];
function drawSkel(cv, lm){
  if(!cv) return;
  var W = cv.clientWidth, H = cv.clientHeight; if(cv.width !== W){ cv.width = W; cv.height = H; }
  var x = cv.getContext('2d'); x.clearRect(0, 0, W, H);
  if(!lm || !SET.skel) return;
  var vw = video.videoWidth || 4, vh = video.videoHeight || 3, s = Math.max(W / vw, H / vh), ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
  var pt = function(i){ return [lm[i].x * vw * s + ox, lm[i].y * vh * s + oy]; };   // canvas 本身已鏡像
  x.lineCap = 'round';
  BONES.forEach(function(b){ if((lm[b[0]].visibility || 0) < .5 || (lm[b[1]].visibility || 0) < .5) return; var p = pt(b[0]), q = pt(b[1]); x.strokeStyle = 'rgba(255,182,39,.9)'; x.lineWidth = 6; x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); });
  [0, 11, 12, 15, 16, 25, 26].forEach(function(i){ if((lm[i].visibility || 0) < .5) return; var p = pt(i); x.fillStyle = i === 15 || i === 16 ? '#4f9a5c' : '#fff'; x.beginPath(); x.arc(p[0], p[1], 7, 0, 7); x.fill(); });
}

/* ---------- 流程 ---------- */
var V = {scr:'home', mode:lsGet('mode', 'cam'), camErr:'', camReady:false};
var R = null;   // 進行中的一次運動
function planOf(courseId){ if(courseId === 'custom') return CUSTOM.filter(function(c){ return c[1] > 0; }).map(function(c){ return {id:c[0], n:c[1]}; }); return E.courseById[courseId].steps.map(function(s){ return {id:s[0], n:s[1]}; }); }
function courseName(id){ return id === 'custom' ? '我的課程' : E.courseById[id].n; }
function startRun(){
  var plan = planOf(SET.course);
  if(!plan.length){ toast('我的課程還沒有選動作'); return; }
  R = {plan:plan, i:0, phase:'intro', t0:performance.now(), until:performance.now() + 5200, count:0, reps:0, active:0, lastTick:performance.now(), lastRep:performance.now(), counter:null, beatAt:0, paused:false, stall:false, mode:V.mode};
  V.scr = 'run'; render(); introMove();
}
function cur(){ return R && E.moveById[R.plan[R.i].id]; }
function introMove(){
  var m = cur(), st = R.plan[R.i];
  R.phase = 'intro'; R.count = 0; R.counter = R.mode === 'cam' ? E.makeCounter(m.id, {sens:SET.sens}) : null; R.stall = false; R.moveBeat = false; R.missMs = 0;
  var txt = (R.i === 0 ? '我們開始囉。' : '下一個動作，') + '第' + E.zhNum(R.i + 1) + '個：' + m.n + '，做' + E.zhNum(st.n) + '次。' + m.say;
  // 先看示範影片：至少完整示範兩次、口令唸完，最後 3 秒倒數
  var speech = SET.voice ? Array.from(txt).length * (SET.rate === 'slow' ? 270 : 230) + 600 : 0, demo = SET.demo ? 2 * m.tempo * 1000 + 600 : 2000;
  R.introMs = Math.max(speech, demo) + 3000;
  R.introAt = performance.now(); R.until = R.introAt + R.introMs;
  say(txt, true);
  render(); demoTo('demoIntro', m);
}
// 3D 示範老師：搬到指定的容器並換動作（3D 載入失敗就用 2D 小人）
function demoTo(id, m){
  var el = $(id); if(!el) return false;
  if(!(window.Demo3D && Demo3D.ready)) return false;
  Demo3D.attach(el); Demo3D.show(m.id, m.tempo); Demo3D.setPhase(null);
  var box = el.closest('.figbox,.vid'); if(box) box.classList.add('has3d');
  return true;
}
function goMove(){ R.phase = 'go'; R.lastRep = performance.now(); R.beatAt = performance.now(); beep(660, .25); render(); demoTo('demoRun', cur()); }
function addRep(){
  if(!R || R.phase !== 'go') return;
  R.count++; R.reps++; R.lastRep = performance.now(); R.stall = false;
  var st = R.plan[R.i];
  say(E.zhNum(R.count), true); beep(R.count >= st.n ? 1046 : 880, .12);
  var el = document.querySelector('.counter'); if(el){ el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  paintRun();
  if(R.count >= st.n) setTimeout(function(){ if(R && R.phase === 'go' && R.count >= R.plan[R.i].n) finishMove(); }, 700);
}
function finishMove(){
  if(R.i >= R.plan.length - 1){ finishAll(); return; }
  R.phase = 'rest'; R.until = performance.now() + SET.rest * 1000;
  say('很好！休息一下，慢慢呼吸。', true); render();
}
function nextMove(){ R.i++; introMove(); }
function finishAll(){
  var sec = R.active / 1000, reps = R.reps;
  if(reps > 0){ var log = E.addLog(lsJson('log', {}), E.dayKey(), sec, reps); lsSet('log', JSON.stringify(log)); }
  V.last = {sec:sec, reps:reps, course:courseName(SET.course)};
  R = null; V.scr = 'done';
  say('全部做完了，你好棒！記得喝口水。', true); beep(1046, .3);
  stopCamera(); render();
}
function quitRun(){ if(R && R.reps > 0){ finishAll(); return; } R = null; stopCamera(); try{ speechSynthesis.cancel(); }catch(e){} V.scr = 'home'; render(); }

function loop(){
  requestAnimationFrame(loop);
  if(V.scr === 'ready' && V.mode === 'cam') { var lm0 = detect(); drawSkel($('skel'), lm0); paintCheck(lm0); return; }
  if(!R || V.scr !== 'run') return;
  var now = performance.now(), dt = now - R.lastTick; R.lastTick = now;
  if(R.paused) return;
  var m = cur();
  if(R.phase === 'go') R.active += dt;
  // 示範小人：跟著節拍來回
  var u = (1 - Math.cos(((now - R.beatAt) / (m.tempo * 1000)) * Math.PI * 2)) / 2;
  if(!(window.Demo3D && Demo3D.ready)){ drawFigure($('fig'), m.id, R.phase === 'go' || R.phase === 'intro' ? u : 0); drawFigure($('figI'), m.id, (1 - Math.cos(((now - (R.introAt || 0)) / (m.tempo * 1000)) * Math.PI * 2)) / 2); }
  else if(R.phase === 'go' && (R.mode !== 'cam' || R.moveBeat)){ var cy = Demo3D.cycles(m.id); Demo3D.setPhase(((R.count % cy) + Math.min(1, (now - R.beatAt) / (m.tempo * 1000))) / cy); }
  // 說明與倒數時，鏡頭先暖機（量肩寬、學起始值），這段時間的動作不計數
  if(R.phase === 'intro' && R.mode === 'cam' && R.counter){ var lm1 = detect(); drawSkel($('skel'), lm1); R.counter.update(E.pick(lm1, aspect()), now / 1000); R.counter.count = 0; }
  if(R.phase === 'intro'){
    var leftMs = R.until - now, c = $('cdNum'), pg = $('vprog');
    if(pg) pg.style.width = Math.min(100, (now - R.introAt) / Math.max(1, R.introMs - 3000) * 100) + '%';
    if(c){ var show = leftMs <= 3000; c.hidden = !show; if(show) c.textContent = Math.max(1, Math.ceil(leftMs / 1000)); if(show && !R.cdSaid){ R.cdSaid = true; say('準備，三、二、一', false); } }
    if(now >= R.until){ R.cdSaid = false; goMove(); }
    return;
  }
  if(R.phase === 'rest'){ var r = $('restNum'); if(r) r.textContent = Math.max(0, Math.ceil((R.until - now) / 1000)); if(now >= R.until) nextMove(); return; }
  if(R.mode === 'cam'){ var lm = detect(); drawSkel($('skel'), lm); }
  if(R.mode === 'cam' && !R.moveBeat){
    var res = R.counter.update(E.pick(lm, aspect()), now / 1000);
    var h = $('camHint'); if(h) h.textContent = res.hint || '';
    if(res.rep){ R.count = R.counter.count - 1; addRep(); }
    if(!R) return;
    // 鏡頭一直看不到這個動作需要的部位（例如坐很近看不到膝蓋）→ 這個動作改跟節拍數
    R.missMs = res.miss ? R.missMs + dt : Math.max(0, R.missMs - dt);
    if(R.missMs > 4000){ R.moveBeat = true; R.beatAt = now; R.stall = false; say('鏡頭看不清楚這個動作，這個動作改成跟著節拍做。', true); render(); return; }
    if(!R.stall && now - R.lastRep > 20000){ R.stall = true; render(); say('鏡頭好像沒有數到，可以按加一，或換成跟著節拍做。'); }
  } else {
    var per = m.tempo * 1000, b = $('beatBar'); if(b) b.style.width = Math.min(100, (now - R.beatAt) / per * 100) + '%';
    if(now - R.beatAt >= per){ R.beatAt = now; addRep(); }
  }
}

/* ---------- 畫面 ---------- */
function topBar(){
  return '<div class="top"><h1>🪑 坐姿健康操</h1>' + (V.scr !== 'home' && V.scr !== 'run' ? '<button class="ibtn" data-act="home">🏠 首頁</button>' : '') +
    '<a class="ibtn" href="manual.html">📖 手冊</a><button class="ibtn" data-act="settings" aria-label="設定">⚙ 設定</button></div>' +
    '<p class="warn-line">這是活動身體的小幫手，不是醫療或復健工具；不舒服就停下來。<button data-act="warn">⚠ 使用警語</button></p>';
}
function footer(){
  return '<footer class="foot">👤 創作者 Mark Tsai（蔡豐全）<a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a><br><a href="manual.html">📖 操作手冊</a><a href="#" data-act="warn">⚠ 使用警語</a>' + (standalone ? '' : '<a href="#" data-act="install">📲 加入主畫面</a>') +
    '<a href="https://m255525.github.io/ai-senior-learning-coach/" target="_blank" rel="noopener">👵 樂齡學習教練</a><br><img src="' + BADGE + '" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle;margin-top:.4rem"></footer>';
}
function homeView(){
  var log = lsJson('log', {}), today = E.dayKey(), done = !!log[today], sk = E.streak(log, today), plan = planOf(SET.course);
  return topBar() +
    '<section class="card hello"><div><h2>' + (done ? '今天做過了，真棒！' : '今天來動一動吧！') + '</h2><p class="lead">坐在椅子上，跟著示範做。鏡頭會幫你數次數，也可以不開鏡頭，跟著語音口令做。</p>' +
    '<div class="today">' + (done ? '<span class="stamp">今日<br>完成</span>' : '') + '<div><b style="font-size:1.6rem;color:var(--leaf)">' + sk + '</b> 天<br><span class="small">連續做操</span></div></div></div><canvas class="fig" id="fig" style="width:100%;aspect-ratio:1"></canvas></section>' +
    '<section class="card"><div class="small">今天的課程</div><h2 style="font-size:1.4rem">' + (SET.course === 'custom' ? '⭐' : E.courseById[SET.course].ic) + ' ' + esc(courseName(SET.course)) + '</h2><p class="lead">' + plan.length + ' 個動作・約 ' + E.courseMinutes(plan.map(function(p){ return [p.id, p.n]; }), SET.rest) + ' 分鐘：' + plan.map(function(p){ return E.moveById[p.id].n; }).join('、') + '</p>' +
    '<button class="big" data-act="ready">▶ 開始做操</button><div class="row" style="margin-top:.8rem"><button class="big alt" data-act="pick">🔄 換課程</button><button class="big alt" data-act="log">📅 我的紀錄</button></div></section>' + footer();
}
function pickView(){
  return topBar() + '<section class="card"><h2>選一個課程</h2>' +
    E.COURSES.map(function(c){ var pl = planOf(c.id); return '<button class="course" data-course="' + c.id + '" aria-pressed="' + (SET.course === c.id) + '"><span class="ic">' + c.ic + '</span><b>' + esc(c.n) + '・約 ' + E.courseMinutes(pl.map(function(p){ return [p.id, p.n]; }), SET.rest) + ' 分鐘</b><span>' + esc(c.d) + '</span></button>'; }).join('') +
    '<button class="course" data-course="custom" aria-pressed="' + (SET.course === 'custom') + '"><span class="ic">⭐</span><b>我的課程</b><span>自己挑動作和次數</span></button>' +
    '<button class="big alt" data-act="demos" style="margin-top:.9rem">🎬 先看 7 個動作的 3D 示範</button></section>' +
    (SET.course === 'custom' ? '<section class="card"><h2 style="font-size:1.2rem">我的課程：要做哪些動作？</h2>' + CUSTOM.map(function(c, i){ var m = E.moveById[c[0]]; return '<div class="mv"><label><input type="checkbox" data-cus="' + i + '"' + (c[1] > 0 ? ' checked' : '') + '>' + m.ic + ' ' + esc(m.n) + '</label><select data-cusn="' + i + '" aria-label="次數">' + [5, 8, 10, 15, 20].map(function(n){ return '<option value="' + n + '"' + ((c[1] || 8) === n ? ' selected' : '') + '>' + n + ' 次</option>'; }).join('') + '</select></div>'; }).join('') + '</section>' : '') +
    '<button class="big" data-act="home">✓ 好，就這個</button>' + footer();
}
function readyView(){
  return topBar() + '<section class="card"><h2>要怎麼做？</h2><div class="modes">' +
    '<button class="mode" data-mode="cam" aria-pressed="' + (V.mode === 'cam') + '"><b>📷 用鏡頭幫我數</b><span>電腦或手機鏡頭看你做，做到了自動數一次。影像只在這台裝置上分析，不錄影、不上傳。</span></button>' +
    '<button class="mode" data-mode="beat" aria-pressed="' + (V.mode === 'beat') + '"><b>🎵 跟著節拍做</b><span>不開鏡頭，跟著語音「一、二、三…」做。沒有鏡頭、或很多人一起做時用這個。</span></button></div></section>' +
    (V.mode === 'cam' ? '<section class="card"><h2 style="font-size:1.2rem">先讓鏡頭看到你</h2><p class="lead">坐近坐遠都可以：<b>坐在桌前（約 60 公分）</b>看得到頭和肩膀就能用；<b>坐遠一點（1.5～2 公尺）</b>連雙手、膝蓋都看得到，能自動數的動作最多。鏡頭看不清楚的動作，會自動改成跟著節拍做。</p>' +
      '<div class="stage" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)"><div class="pane"><div class="cambox" id="camBox"><canvas id="skel"></canvas>' + (V.camErr ? '<div class="camhint">' + esc(V.camErr) + '</div>' : V.camReady ? '' : '<div class="camhint">正在開啟鏡頭…第一次會問你能不能用鏡頭，請按「允許」</div>') + '</div></div>' +
      '<div><div class="checks" id="checks"></div><div id="camSel"></div></div></div></section>' : '') +
    '<button class="big sun" data-act="go">' + (V.mode === 'cam' ? '✅ 看到了，開始！' : '▶ 開始') + '</button>' + footer();
}
function paintCheck(lm){
  var el = $('checks'); if(!el) return;
  var f = E.pick(lm, aspect()), okp = function(k){ return f && f[k] && (f[k].v == null || f[k].v > .5); };
  var key = !lm ? 'none' : [okp('nose'), okp('ls') && okp('rs'), (okp('lw') && okp('rw')) || (okp('le') && okp('re')), okp('lk') && okp('rk')].join();
  if(el.dataset.k === key) return; el.dataset.k = key;
  el.innerHTML = !lm ? '<div class="n">還沒看到人，請坐到鏡頭前面</div>' :
    '<div class="' + (okp('nose') ? 'y' : 'n') + '">看得到頭</div><div class="' + (okp('ls') && okp('rs') ? 'y' : 'n') + '">看得到兩邊肩膀</div><div class="' + ((okp('lw') && okp('rw')) || (okp('le') && okp('re')) ? 'y' : 'n') + '">看得到雙手或手肘（擴胸、拍手要看得到手）</div><div class="' + (okp('lk') && okp('rk') ? 'y' : 'n') + '">看得到膝蓋（踏步才需要；坐近看不到沒關係）</div>';
}
function runView(){
  var m = cur(), st = R.plan[R.i];
  var h = '<div class="top"><h1>🪑 ' + esc(courseName(SET.course)) + '</h1><span class="small">第 ' + (R.i + 1) + ' / ' + R.plan.length + ' 個動作</span></div>' +
    '<div class="dots">' + R.plan.map(function(p, i){ return '<i class="' + (i < R.i ? 'done' : i === R.i ? 'cur' : '') + '" title="' + esc(E.moveById[p.id].n) + '"></i>'; }).join('') + '</div>' +
    '<div class="stage"><div class="pane"><div class="hd"><b>' + m.ic + ' ' + esc(m.n) + '</b><span>做 ' + st.n + ' 次</span></div><div class="figbox"><div class="d3" id="demoRun"></div><canvas id="fig"></canvas></div><div class="howto">' + esc(m.say) + '<span class="small">' + esc(m.how) + '　💡 ' + esc(m.tip) + '</span></div></div>';
  if(R.mode === 'cam') h += '<div class="pane"><div class="cambox" id="camBox"><canvas id="skel"></canvas><div class="counter" id="cnt"><b id="cntNum">' + R.count + '</b><span>/ ' + st.n + ' 次</span></div>' +
    (R.moveBeat ? '<div class="camhint">🎵 鏡頭看不清楚這個動作，改成跟著「一、二、三…」做<div class="ring" style="margin:.35rem auto 0"><i id="beatBar"></i></div></div>' : '<div class="camhint" id="camHint"></div>') + '</div></div>';
  else h += '<div class="pane"><div class="beat"><b id="cntNum">' + R.count + '</b><span>/ ' + st.n + ' 次</span><div class="ring"><i id="beatBar"></i></div><span class="small" style="margin-top:.4rem">跟著「一、二、三…」做</span></div></div>';
  h += '</div>' + (R.stall ? '<div class="stall">🤔 鏡頭好像沒有數到。確認上半身都在畫面裡；也可以按「＋1」自己數，或「改跟節拍做」。</div>' : '') +
    '<div class="ctl"><button class="big alt" data-act="pause">' + (R.paused ? '▶ 繼續' : '⏸ 暫停') + '</button><button class="big alt" data-act="plus">＋1</button><button class="big alt" data-act="' + (R.mode === 'cam' ? 'toBeat' : 'skip') + '">' + (R.mode === 'cam' ? '🎵 改跟節拍' : '⏭ 下一個') + '</button><button class="big red" data-act="quit">✖ 結束</button></div>';
  if(R.mode === 'cam') h += '<div class="ctl" style="grid-template-columns:1fr"><button class="big alt" data-act="skip">⏭ 跳過這個動作</button></div>';
  if(R.phase === 'intro') h += '<div class="overlay intro"><div class="small">第 ' + (R.i + 1) + ' / ' + R.plan.length + ' 個動作・先看示範</div><h2>' + m.ic + ' ' + esc(m.n) + '・做 ' + st.n + ' 次</h2>' +
    '<div class="vid"><div class="d3" id="demoIntro"></div><canvas id="figI"></canvas><span class="tag">🎬 示範</span><div class="vcd" id="cdNum" hidden></div><div class="vbar"><i id="vprog"></i></div></div>' +
    '<div class="vcap">' + esc(m.say) + '<br><span class="small">' + esc(m.how) + '　💡 ' + esc(m.tip) + '</span></div>' +
    '<div class="vbtns"><button class="big alt" data-act="replay">↻ 再看一次</button><button class="big sun" data-act="startNow">我會了，開始 ▶</button></div></div>';
  if(R.phase === 'rest'){ var nx = E.moveById[R.plan[R.i + 1].id]; h += '<div class="overlay"><h2>休息一下 😊</h2><p>慢慢吸氣、吐氣，喝口水。</p><div class="cd" id="restNum">' + SET.rest + '</div><p>下一個：' + nx.ic + ' ' + esc(nx.n) + '</p><button class="big" data-act="restSkip">我好了，繼續</button></div>'; }
  if(R.paused) h += '<div class="overlay"><h2>暫停中</h2><p>休息夠了再繼續。</p><button class="big" data-act="pause">▶ 繼續</button><button class="big red" data-act="quit">✖ 結束今天的操</button></div>';
  return h;
}
function paintRun(){ var n = $('cntNum'); if(n && R) n.textContent = R.count; }
function doneView(){
  var l = V.last || {sec:0, reps:0}, log = lsJson('log', {}), sk = E.streak(log, E.dayKey());
  return topBar() + '<section class="card" style="text-align:center"><span class="stamp" style="width:7rem;height:7rem;font-size:1.3rem">今日<br>完成</span><h2 style="margin-top:.8rem;font-size:2rem;color:var(--leaf)">全部做完了，你好棒！</h2>' +
    '<div class="stat"><div><b>' + Math.max(1, Math.round(l.sec / 60)) + '</b><span>分鐘</span></div><div><b>' + l.reps + '</b><span>次動作</span></div><div><b>' + sk + '</b><span>天連續</span></div></div>' +
    '<p class="lead">記得喝口水。明天再一起動一動！</p><button class="big" data-act="home">🏠 回首頁</button><button class="big alt" data-act="log">📅 看我的紀錄</button></section>' + footer();
}
function logView(){
  var log = lsJson('log', {}), now = new Date(), y = now.getFullYear(), mo = V.logMonth != null ? V.logMonth : now.getMonth();
  var first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate(), cells = '';
  '日一二三四五六'.split('').forEach(function(w){ cells += '<div class="wd">' + w + '</div>'; });
  for(var i = 0; i < first.getDay(); i++) cells += '<div class="blank"></div>';
  var mDays = 0, mSec = 0, mReps = 0;
  for(var d = 1; d <= days; d++){ var k = E.dayKey(new Date(y, mo, d)), e = log[k]; if(e){ mDays++; mSec += e.sec; mReps += e.reps; } cells += '<div class="' + (e ? 'on' : '') + '" title="' + (e ? Math.round(e.sec / 60) + ' 分鐘、' + e.reps + ' 次' : '') + '">' + d + '</div>'; }
  return topBar() + '<section class="card"><div style="display:flex;align-items:center;gap:.5rem"><button class="sbtn" data-act="mPrev" aria-label="上個月">◀</button><h2 style="flex:1;text-align:center">' + y + ' 年 ' + (mo + 1) + ' 月</h2><button class="sbtn" data-act="mNext" aria-label="下個月"' + (mo >= now.getMonth() ? ' disabled' : '') + '>▶</button></div>' +
    '<div class="stat"><div><b>' + mDays + '</b><span>天有做操</span></div><div><b>' + Math.round(mSec / 60) + '</b><span>分鐘</span></div><div><b>' + E.streak(log, E.dayKey()) + '</b><span>天連續</span></div></div><div class="cal">' + cells + '</div>' +
    '<p class="small">紀錄只存在這台裝置。</p></section><button class="big" data-act="home">🏠 回首頁</button>' + footer();
}
function demoView(){
  var m = E.moveById[V.demo];
  return topBar() + '<section class="card"><h2>🎬 動作示範</h2><p class="lead">點一個動作看 3D 示範。老師是照鏡子的方向：老師舉畫面左邊的手，你就舉你的左手。</p>' +
    '<div class="mlist">' + E.MOVES.map(function(x){ return '<button data-act="demoPick" data-id="' + x.id + '" aria-pressed="' + (x.id === V.demo) + '">' + x.ic + ' ' + esc(x.n) + '</button>'; }).join('') + '</div>' +
    '<div class="vid"><div class="d3" id="demoGal"></div><canvas id="figI"></canvas><span class="tag">🎬 ' + esc(m.n) + '</span></div>' +
    '<div class="vcap">' + esc(m.say) + '<br><span class="small">' + esc(m.how) + '　💡 ' + esc(m.tip) + '</span></div>' +
    '<div class="vbtns"><button class="big alt" data-act="demoSay">🔊 聽說明</button><button class="big" data-act="pick">✓ 回到課程</button></div></section>' + footer();
}
function render(){
  var h = V.scr === 'home' ? homeView() : V.scr === 'pick' ? pickView() : V.scr === 'demo' ? demoView() : V.scr === 'ready' ? readyView() : V.scr === 'run' ? runView() : V.scr === 'done' ? doneView() : logView();
  $('app').innerHTML = h;
  var box = $('camBox'); if(box){ video.hidden = false; box.insertBefore(video, box.firstChild); } else { video.hidden = true; document.body.appendChild(video); }
  if(V.scr === 'home') drawFigure($('fig'), 'armsUp', .5);
  if(V.scr === 'demo' && !demoTo('demoGal', E.moveById[V.demo])) startGal2D();
  if(V.scr === 'run' && R){ if(R.phase === 'intro') demoTo('demoIntro', cur()); else demoTo('demoRun', cur()); }
  if(V.scr === 'ready' && V.mode === 'cam') fillCamSel();
}
var galT = 0;
function startGal2D(){ cancelAnimationFrame(galT); (function f(){ if(V.scr !== 'demo' || (window.Demo3D && Demo3D.ready)) return; var m = E.moveById[V.demo]; drawFigure($('figI'), m.id, (1 - Math.cos(performance.now() / (m.tempo * 1000) * Math.PI * 2)) / 2); galT = requestAnimationFrame(f); })(); }
async function fillCamSel(){
  var cams = await listCams(), el = $('camSel'); if(!el || cams.length < 2) return;
  var curId = stream && stream.getVideoTracks()[0] ? stream.getVideoTracks()[0].getSettings().deviceId : '';
  el.innerHTML = '<label class="small" style="display:block;margin-top:.8rem">換一個鏡頭<select id="camPick" style="display:block;width:100%;min-height:2.8rem;border:2px solid var(--line);border-radius:.7rem;margin-top:.2rem">' + cams.map(function(c, i){ return '<option value="' + esc(c.deviceId) + '"' + (c.deviceId === curId ? ' selected' : '') + '>' + esc(c.label || '鏡頭 ' + (i + 1)) + '</option>'; }).join('') + '</select></label>';
}
async function openCam(){
  V.camErr = ''; V.camReady = false; render();
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ V.camErr = '這個瀏覽器不能用鏡頭，請改用「跟著節拍做」'; render(); return; }
  try{
    var cams = await listCams(); await initCamera(preferredCam(cams));
    V.camReady = true; render();
    await initLandmarker();
  }catch(e){ V.camErr = /Permission|NotAllowed/i.test(String(e && (e.name || e.message))) ? '鏡頭沒有被允許。可以在網址列旁邊打開鏡頭權限，或改用「跟著節拍做」' : '鏡頭或辨識元件開不起來（' + (e && e.message || e) + '），可以改用「跟著節拍做」'; stopCamera(); render(); }
}

/* ---------- 事件 ---------- */
var ACT = {
  home:function(){ if(R) quitRun(); stopCamera(); V.scr = 'home'; render(); window.scrollTo(0, 0); },
  pick:function(){ V.scr = 'pick'; render(); window.scrollTo(0, 0); },
  log:function(){ V.logMonth = null; V.scr = 'log'; render(); window.scrollTo(0, 0); },
  mPrev:function(){ V.logMonth = (V.logMonth != null ? V.logMonth : new Date().getMonth()) - 1; render(); },
  mNext:function(){ V.logMonth = Math.min(new Date().getMonth(), (V.logMonth != null ? V.logMonth : new Date().getMonth()) + 1); render(); },
  ready:function(){ V.scr = 'ready'; render(); window.scrollTo(0, 0); if(V.mode === 'cam') openCam(); },
  go:function(){ if(V.mode === 'cam' && (!stream || !landmarker)){ toast(V.camErr ? '鏡頭沒有開成功，改用跟著節拍做' : '鏡頭還在準備，請稍等一下'); if(V.camErr){ V.mode = 'beat'; lsSet('mode', 'beat'); render(); } return; } if(V.mode === 'beat') stopCamera(); startRun(); },
  plus:function(){ if(R && R.phase === 'go'){ if(R.counter) R.counter.count = R.count + 1; addRep(); } },
  skip:function(){ if(!R) return; if(R.phase === 'intro' || R.phase === 'go') finishMove(); },
  restSkip:function(){ if(R && R.phase === 'rest') nextMove(); },
  replay:function(){ if(!R || R.phase !== 'intro') return; var m = cur(); R.introAt = performance.now(); R.until = R.introAt + R.introMs; R.cdSaid = false; if(window.Demo3D && Demo3D.ready) Demo3D.restart(); say(m.say, true); },
  startNow:function(){ if(!R || R.phase !== 'intro') return; var now = performance.now(); if(R.until - now > 3000){ R.until = now + 3000; R.introAt = now - (R.introMs - 3000); } try{ speechSynthesis.cancel(); }catch(e){} },
  demos:function(){ V.scr = 'demo'; V.demo = V.demo || 'armsUp'; render(); window.scrollTo(0, 0); },
  demoPick:function(el){ V.demo = el.dataset.id; render(); },
  demoSay:function(){ var m = E.moveById[V.demo]; say(m.n + '。' + m.say + m.tip, true); if(window.Demo3D && Demo3D.ready) Demo3D.restart(); },
  toBeat:function(){ if(!R) return; R.mode = 'beat'; R.counter = null; R.beatAt = performance.now(); R.stall = false; stopCamera(); V.mode = 'beat'; lsSet('mode', 'beat'); say('好，改成跟著節拍做。', true); render(); },
  pause:function(){ if(!R) return; R.paused = !R.paused; if(!R.paused){ R.lastTick = performance.now(); R.beatAt = performance.now(); if(R.phase !== 'go') R.until = performance.now() + (R.phase === 'rest' ? SET.rest * 1000 : 4200); } else { try{ speechSynthesis.cancel(); }catch(e){} } render(); },
  quit:function(){ quitRun(); },
  warn:function(){ showWarn(); }, close:closeModal, settings:function(){ openSettings(); }, install:function(){ install(); },
  wipe:function(){ try{ Object.keys(localStorage).forEach(function(k){ if(k.indexOf(PFX) === 0) localStorage.removeItem(k); }); }catch(e){} closeModal(); toast('紀錄與設定已清除'); location.reload(); }
};
document.addEventListener('click', function(e){
  var el = e.target.closest('[data-act],[data-course],[data-mode],[data-set]'); if(!el) return;
  var ds = el.dataset;
  if(el.tagName === 'A' && ds.act) e.preventDefault();
  if(ds.course){ SET.course = ds.course; saveSet(); render(); return; }
  if(ds.mode){ V.mode = ds.mode; lsSet('mode', ds.mode); if(ds.mode === 'cam') openCam(); else { stopCamera(); render(); } return; }
  if(ds.set){ var v = ds.v === 'true' ? true : ds.v === 'false' ? false : /^\d+$/.test(ds.v) ? +ds.v : ds.v; SET[ds.set] = v; saveSet(); applyView(); openSettings(ds.set); if(ds.set === 'voice' && v) say('語音口令打開了'); return; }
  if(ACT[ds.act]) ACT[ds.act](el);
});
document.addEventListener('change', function(e){
  var t = e.target;
  if(t.dataset.cus != null){ var i = +t.dataset.cus; CUSTOM[i][1] = t.checked ? (+document.querySelector('[data-cusn="' + i + '"]').value || 8) : 0; lsSet('custom', JSON.stringify(CUSTOM)); }
  if(t.dataset.cusn != null){ var j = +t.dataset.cusn; if(CUSTOM[j][1] > 0){ CUSTOM[j][1] = +t.value; lsSet('custom', JSON.stringify(CUSTOM)); } }
  if(t.id === 'camPick'){ initCamera(t.value).then(function(){ toast('已換鏡頭'); }).catch(function(){ toast('這個鏡頭開不起來'); }); }
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeModal();
  if(V.scr === 'run' && R && !/INPUT|SELECT/.test(e.target.tagName)){ if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); ACT.plus(); } if(e.key === 'p') ACT.pause(); }
});
$('modal').addEventListener('click', function(e){ if(e.target.id === 'modal') closeModal(); });
document.addEventListener('visibilitychange', function(){ if(document.hidden && R && !R.paused) ACT.pause(); });

/* ---------- 警語與設定 ---------- */
var WARN = '<h2>⚠ 使用警語</h2><ul>' +
  '<li>這是<b>活動身體的小幫手</b>，不是醫療、復健或治療工具，不能取代醫師、物理治療師的建議；本工具不宣稱任何健康功效。</li>' +
  '<li>有心臟病、高血壓、骨質疏鬆、關節或脊椎問題、剛開過刀，或醫師交代要限制活動的人，<b>開始前請先問醫師</b>。</li>' +
  '<li>做的時候覺得<b>胸悶、頭暈、喘不過氣、疼痛</b>，請立刻停下來休息，必要時就醫或撥 119。</li>' +
  '<li>請坐在<b>穩固、有靠背、不會滑動</b>的椅子上（不要坐有輪子的椅子），周圍不要有雜物；動作慢慢做，量力而為，旁邊最好有家人陪伴。</li>' +
  '<li>鏡頭影像<b>只在這台裝置上即時分析</b>，不錄影、不上傳、不儲存；辨識需要從網路下載 Google MediaPipe 的辨識元件。</li>' +
  '<li>鏡頭數次數可能數多或數少（光線、衣服顏色、距離都有影響），可以按「＋1」自己補；次數只是參考。</li>' +
  '<li>做操紀錄只存在這台裝置的瀏覽器，清除瀏覽器資料就會不見。</li></ul>';
function showWarn(){ openModal(WARN + '<button class="big" data-act="close">我知道了</button>'); }
function seg(key, opts){ return '<div class="seg">' + opts.map(function(o){ return '<button data-set="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (String(SET[key]) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
function sec(id, title, val, body, open){ return '<details class="set-sec"' + (open ? ' open' : '') + '><summary><span class="sst">' + title + '</span><span class="ssv">' + esc(val) + '</span></summary><div class="set-body">' + body + '</div></details>'; }
function openSettings(openId){
  openModal('<h2>⚙ 設定</h2>' +
    sec('voice', '🔊 語音口令', SET.voice ? '開' : '關', seg('voice', [[true, '開'], [false, '關']]) + '<div style="margin-top:.5rem">' + seg('rate', [['slow', '說慢一點'], ['normal', '一般速度']]) + '</div>' + (window.speechSynthesis ? '' : '<p class="small">這個瀏覽器不支援語音。</p>'), openId === 'voice' || openId === 'rate') +
    sec('fs', '🔠 字的大小', SET.fs === 'xl' ? '特大' : '大', seg('fs', [['m', '大'], ['xl', '特大']]), openId === 'fs') +
    sec('rest', '☕ 動作之間休息', SET.rest + ' 秒', seg('rest', [[5, '5 秒'], [10, '10 秒'], [15, '15 秒'], [20, '20 秒']]), openId === 'rest') +
    sec('sens', '🎯 鏡頭數次數的靈敏度', {easy:'容易數', std:'標準', strict:'嚴格'}[SET.sens] || '標準', '<p class="small">動作幅度比較小（例如肩膀聳不高）選「容易數」；常常多數就選「嚴格」。</p>' + seg('sens', [['easy', '容易數'], ['std', '標準'], ['strict', '嚴格']]), openId === 'sens') +
    sec('demo', '🎬 每個動作先看示範影片', SET.demo ? '看完再做' : '只看一下', '<p class="small">「看完再做」：每個動作至少示範兩次才開始。「只看一下」：口令唸完就開始。</p>' + seg('demo', [[true, '看完再做'], [false, '只看一下']]), openId === 'demo') +
    sec('skel', '🦴 鏡頭畫面顯示骨架線', SET.skel ? '顯示' : '不顯示', seg('skel', [[true, '顯示'], [false, '不顯示']]), openId === 'skel') +
    sec('wipe', '🧹 清除紀錄與設定', '', '<p class="small">清掉這台裝置上的做操紀錄、我的課程與設定。</p><button class="sbtn" data-act="wipe">清除</button>') +
    sec('about', 'ℹ 關於本工具', '', '<p>👤 創作者 Mark Tsai（蔡豐全）<br><a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a></p><div class="seg"><a class="sbtn" href="manual.html" style="text-decoration:none;color:inherit">📖 操作手冊</a><a class="sbtn" href="manual.html#creator" style="text-decoration:none;color:inherit">👤 創作者資訊</a><button class="sbtn" data-act="warn">⚠ 使用警語</button>' + (standalone ? '' : '<button class="sbtn" data-act="install">📲 加入主畫面</button>') + '</div><p class="small">訪客數 <img src="' + BADGE + '" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle"></p>') +
    '<button class="big" data-act="close">關閉</button>');
}
function install(){
  closeModal();
  if(window._dp){ window._dp.prompt(); window._dp = null; return; }
  openModal('<h2>📲 加入主畫面</h2><ul><li><b>iPhone／iPad（Safari）</b>：按「分享」→「加入主畫面」。</li><li><b>Android（Chrome）</b>：右上角「⋮」→「安裝應用程式」。</li><li><b>電腦（Chrome／Edge）</b>：網址列右邊的安裝圖示。</li></ul><button class="big" data-act="close">知道了</button>');
}

/* ---------- 跑馬燈（工作區共用公告） ---------- */
function initMarquee(){
  var URL_ = "https://script.google.com/macros/s/AKfycbwKX0DNNbY8y4nf90BFTHtxgfqJcHHcZasRrgycl4QAe52_hkjMWSkYk4xOsqU-JPCROw/exec";
  var bar = $('marqueeBar'), track = $('marqueeTrack'), lastKey = null;
  function add(c, text){ var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, li = 0, m; while((m = re.exec(text))){ if(m.index > li) c.appendChild(document.createTextNode(text.slice(li, m.index))); var a = document.createElement('a'); a.href = m[2]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit'; c.appendChild(a); li = re.lastIndex; } if(li < text.length) c.appendChild(document.createTextNode(text.slice(li))); }
  function show(items){ if(!items || !items.length) return; var k = JSON.stringify(items); if(k === lastKey) return; lastKey = k; track.innerHTML = ''; var fr = document.createDocumentFragment(); function pass(){ items.forEach(function(it, i){ if(i) fr.appendChild(document.createTextNode('　★　')); add(fr, String(it)); }); } pass(); fr.appendChild(document.createTextNode('　★　')); pass(); track.appendChild(fr); bar.classList.add('show'); document.body.classList.add('has-marquee'); track.style.animationDuration = Math.max(track.scrollWidth / 2 / 60, 12) + 's'; }
  function fetchM(){ fetch(URL_, {method:'POST', body:JSON.stringify({serial:''})}).then(function(r){ return r.json(); }).then(function(d){ if(d && Array.isArray(d.marquee) && d.marquee.length){ lsSet('marquee', JSON.stringify(d.marquee)); show(d.marquee); } }).catch(function(){}); }
  show(lsJson('marquee', [])); fetchM(); setInterval(fetchM, 20 * 60 * 1000);
}

window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); window._dp = e; });
if('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('service-worker.js').catch(function(){});
applyView(); render(); loop();
if(window.Demo3D) setTimeout(function(){ Demo3D.load().then(function(){ if(V.scr === 'run' || V.scr === 'demo') render(); }).catch(function(e){ console.warn('3D 示範載入失敗，改用 2D', e); }); }, 300);
if(!lsGet('warnSeen', '')){ lsSet('warnSeen', '1'); showWarn(); }
initMarquee();
window._sex = {V:V, get R(){ return R; }, ACT:ACT, E:E, SET:SET, addRep:addRep, render:render};
})();
