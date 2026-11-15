/* 坐姿健康操：動作、課程、計次狀態機、紀錄（瀏覽器 window.SEX；node 可 require）
 * 動作判定只用 MediaPipe PoseLandmarker 的關鍵點座標；輸入 f 是「已乘上畫面寬高比的座標」：
 *   f = {nose, ls, rs, lw, rw, lh, rh, lk, rk}，每個 {x, y, v}（y 往下變大；ls＝本人左肩，在未鏡像影像的右邊）。
 * 尺度一律用肩寬 S，所以坐遠坐近都能用。數值為本工具自訂，不是復健或醫療標準。 */
(function(root){
'use strict';

var LM = {nose:0, ls:11, rs:12, le:13, re:14, lw:15, rw:16, lh:23, rh:24, lk:25, rk:26};

/* ---------- 動作 ---------- */
var MOVES = [
  {id:'armsUp', n:'雙手舉高', ic:'🙌', need:['nose', 'ls', 'rs', 'lw', 'rw'], tempo:3,
   say:'雙手慢慢往上舉高，舉到頭頂，再慢慢放下來。', how:'手舉到頭頂上方算一次，放下來再舉下一次。', tip:'肩膀不舒服就舉到自己舒服的高度就好。'},
  {id:'altArms', n:'左右手輪流舉高', ic:'🙋', need:['nose', 'ls', 'rs', 'lw', 'rw'], tempo:2.5,
   say:'先舉左手，放下，再舉右手，左右輪流。', how:'每舉一隻手算一次。', tip:'舉手時背可以靠著椅背，不要駝背。'},
  {id:'chest', n:'擴胸運動', ic:'🫁', need:['ls', 'rs', 'lw', 'rw'], tempo:3,
   say:'雙手在胸前合起來，再往兩邊打開，像在抱一棵大樹。', how:'手往兩邊打開算一次。', tip:'打開時慢慢吸氣，合起來時慢慢吐氣。'},
  {id:'clap', n:'拍拍手', ic:'👏', need:['ls', 'rs', 'lw', 'rw'], tempo:1.5,
   say:'雙手打開，再在胸前拍一下手。', how:'兩手碰在一起算一次。', tip:'輕輕拍就好，不用拍很大聲。'},
  {id:'shrug', n:'聳聳肩', ic:'🤷', need:['nose', 'ls', 'rs'], tempo:3,
   say:'肩膀慢慢往上聳到耳朵旁邊，再慢慢放鬆下來。', how:'肩膀聳起來算一次。', tip:'脖子放輕鬆，不要用力縮脖子。'},
  {id:'bend', n:'身體左右側彎', ic:'🌾', need:['ls', 'rs'], tempo:3.5,
   say:'坐穩，身體慢慢往左邊彎，回到中間，再往右邊彎。', how:'往一邊彎再回到中間算一次。', tip:'彎到微微拉到側腰就好，手可以扶著椅子。'},
  {id:'march', n:'坐著踏步（抬膝）', ic:'🦵', need:['ls', 'rs', 'lk', 'rk'], tempo:2,
   say:'坐在椅子前半段，左右腳輪流把膝蓋抬起來，像在原地踏步。', how:'每抬一次膝蓋算一次。', tip:'鏡頭要看得到膝蓋；看不到可以改成「跟著節拍做」。'}
];
var moveById = {}; MOVES.forEach(function(m){ moveById[m.id] = m; });

/* ---------- 課程（每個動作的次數） ---------- */
var COURSES = [
  {id:'warm', n:'全身暖身', ic:'🌅', d:'早上起床活動一下：手、肩、腰、腳都動到。', steps:[['armsUp', 8], ['chest', 8], ['shrug', 8], ['bend', 8], ['clap', 10], ['march', 16]]},
  {id:'shoulder', n:'肩頸放鬆', ic:'💆', d:'看電視、滑手機久了，鬆一鬆肩膀。', steps:[['shrug', 10], ['armsUp', 8], ['bend', 10], ['chest', 8]]},
  {id:'arm', n:'手臂伸展', ic:'💪', d:'手臂舉高、打開、拍手。', steps:[['armsUp', 10], ['altArms', 10], ['chest', 10], ['clap', 15]]},
  {id:'leg', n:'腿部活動', ic:'🚶', d:'坐著踏步，鏡頭要看得到膝蓋。', steps:[['march', 20], ['clap', 10], ['march', 20]]}
];
var courseById = {}; COURSES.forEach(function(c){ courseById[c.id] = c; });
function courseMinutes(steps, rest){ var s = 0; steps.forEach(function(st){ s += moveById[st[0]].tempo * st[1] + 6; }); s += (steps.length - 1) * (rest || 10); return Math.max(1, Math.round(s / 60)); }

/* ---------- 共用 ---------- */
function ok(p){ return !!p && (p.v == null || p.v > .5); }
function d2(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }
function shoulderY(f){ return (f.ls.y + f.rs.y) / 2; }
// 從 MediaPipe 的 landmarks 陣列取出需要的點，x 乘上寬高比（避免 16:9 畫面把水平距離算小）
function pick(lms, aspect){
  if(!lms) return null;
  var f = {}; aspect = aspect || 1;
  Object.keys(LM).forEach(function(k){ var p = lms[LM[k]]; if(p) f[k] = {x:p.x * aspect, y:p.y, v:p.visibility}; });
  return f;
}
// 檢查畫面：缺哪些點、太遠太近
function check(f, need){
  if(!f) return {ok:false, hint:'沒看到人，請坐到鏡頭正前方'};
  if(!ok(f.ls) || !ok(f.rs)) return {ok:false, hint:'請讓兩邊肩膀都在畫面裡'};
  var S = d2(f.ls, f.rs);
  if(S < .07) return {ok:false, hint:'離鏡頭太遠了，請坐近一點'};
  if(S > .75) return {ok:false, hint:'離鏡頭太近了，請坐遠一點'};
  var miss = (need || []).filter(function(k){ return !ok(f[k]); });
  if(miss.indexOf('lk') >= 0 || miss.indexOf('rk') >= 0) return {ok:false, hint:'看不到膝蓋：把鏡頭放低一點，或改用「跟著節拍做」'};
  if(miss.indexOf('lw') >= 0 || miss.indexOf('rw') >= 0) return {ok:false, hint:'看不到雙手：請坐遠一點，讓手也在畫面裡'};
  if(miss.indexOf('nose') >= 0) return {ok:false, hint:'請讓頭也在畫面裡'};
  return {ok:true, S:S, hint:''};
}

/* ---------- 計次狀態機 ----------
 * makeCounter(id) → {count, update(f, t秒) → {count, rep:布林, hint, phase}}
 * 每一次都要「回到起始姿勢」才會數下一次；兩次之間至少 MIN_GAP 秒，避免抖動多算。 */
var MIN_GAP = .6, ALPHA = .35, HOLD = 3;
function makeCounter(id){
  var m = moveById[id], st = {count:0, last:-9, phase:'', side:{}, base:null, baseN:0, baseArr:[], lastOk:0, sm:null, hold:{}};
  function rep(t){ if(t - st.last < MIN_GAP) return false; st.last = t; st.count++; return true; }
  // 平滑：座標做指數移動平均（ALPHA 越小越穩、反應越慢）
  function smooth(f){
    if(!st.sm){ st.sm = {}; Object.keys(f).forEach(function(k){ st.sm[k] = Object.assign({}, f[k]); }); return st.sm; }
    Object.keys(f).forEach(function(k){ var a = st.sm[k], b = f[k]; if(!a){ st.sm[k] = Object.assign({}, b); return; } a.x += (b.x - a.x) * ALPHA; a.y += (b.y - a.y) * ALPHA; a.v = b.v; });
    return st.sm;
  }
  // 防彈跳：條件要連續 HOLD 個畫面成立才算
  function held(key, cond){ st.hold[key] = cond ? (st.hold[key] || 0) + 1 : 0; return st.hold[key] >= HOLD; }
  function learnBase(v, key){ // 用前 12 個畫面的中位數當起始值，之後在放鬆時慢慢跟著調整
    key = key || 'base';
    st[key + 'Arr'] = st[key + 'Arr'] || [];
    if(st[key] == null){ st[key + 'Arr'].push(v); if(st[key + 'Arr'].length >= 12){ var a = st[key + 'Arr'].slice().sort(function(x, y){ return x - y; }); st[key] = a[6]; } return false; }
    return true;
  }
  var api = {id:id, get count(){ return st.count; }, set count(v){ st.count = v; }, state:st,
    update:function(f, t){
      var c = check(f, m.need), out = {count:st.count, rep:false, hint:c.hint, phase:st.phase};
      if(!c.ok){ st.hold = {}; return out; }
      f = smooth(f);
      var S = c.S, sy = shoulderY(f), r = false;
      if(id === 'armsUp'){
        var up = f.lw.y < f.nose.y - .15 * S && f.rw.y < f.nose.y - .15 * S, down = f.lw.y > sy + .25 * S && f.rw.y > sy + .25 * S;
        if(held('d', down)) st.phase = 'down';
        else if(held('u', up) && st.phase === 'down'){ st.phase = 'up'; r = rep(t); }
        out.hint = st.phase === 'up' ? '放下來' : st.phase === 'down' ? '舉高！' : '先把手放下來準備';
      } else if(id === 'altArms'){
        [['l', f.lw], ['r', f.rw]].forEach(function(s){
          var u = s[1].y < f.nose.y - .1 * S, dn = s[1].y > sy + .2 * S;
          if(held('d' + s[0], dn)) st.side[s[0]] = 'down';
          else if(held('u' + s[0], u) && st.side[s[0]] === 'down'){ st.side[s[0]] = 'up'; if(rep(t)) r = true; }
        });
        out.hint = st.side.l === 'up' ? '換右手' : st.side.r === 'up' ? '換左手' : '舉一隻手';
      } else if(id === 'chest'){
        var dx = Math.abs(f.lw.x - f.rw.x), wy = (f.lw.y + f.rw.y) / 2;
        var near = dx < 1.0 * S, open = dx > 2.1 * S && Math.abs(wy - sy) < 1.3 * S;
        if(held('n', near)) st.phase = 'close';
        else if(held('o', open) && st.phase === 'close'){ st.phase = 'open'; r = rep(t); }
        out.hint = st.phase === 'open' ? '合起來' : st.phase === 'close' ? '往兩邊打開' : '雙手先在胸前合起來';
      } else if(id === 'clap'){
        var dd = d2(f.lw, f.rw);
        if(held('a', dd > 1.1 * S)) st.phase = 'apart';
        else if(held('c', dd < .45 * S) && st.phase === 'apart'){ st.phase = 'clap'; r = rep(t); }
        out.hint = st.phase === 'clap' ? '打開' : '拍手！';
      } else if(id === 'shrug'){
        var v = (sy - f.nose.y) / S;
        if(!learnBase(v)){ out.hint = '肩膀放鬆，先別動…'; return out; }
        if(held('d', v > st.base * .9)){ st.phase = 'down'; st.base = st.base * .98 + v * .02; }
        else if(held('u', v < st.base * .75) && st.phase === 'down'){ st.phase = 'up'; r = rep(t); }
        out.hint = st.phase === 'up' ? '放鬆下來' : '肩膀往上聳';
      } else if(id === 'bend'){
        var deg = Math.atan2(f.ls.y - f.rs.y, f.ls.x - f.rs.x) * 180 / Math.PI;  // 往本人左邊彎→左肩下降→正
        if(held('m', Math.abs(deg) < 5)) st.phase = 'mid';
        else if(st.phase === 'mid' && held('l', deg > 11)){ st.phase = 'left'; r = rep(t); }
        else if(st.phase === 'mid' && held('r', deg < -11)){ st.phase = 'right'; r = rep(t); }
        out.deg = deg;
        out.hint = st.phase === 'left' || st.phase === 'right' ? '回到中間' : '往一邊彎';
      } else if(id === 'march'){
        [['l', f.lk], ['r', f.rk]].forEach(function(s){
          var key = 'b' + s[0];
          if(!learnBase(s[1].y, key)) return;
          var b = st[key];
          if(held('d' + s[0], s[1].y > b - .08 * S)){ st.side[s[0]] = 'down'; st[key] = b * .97 + s[1].y * .03; }
          else if(held('u' + s[0], s[1].y < b - .22 * S) && st.side[s[0]] === 'down'){ st.side[s[0]] = 'up'; if(rep(t)) r = true; }
        });
        out.hint = st.bl == null || st.br == null ? '腳先放好，別動…' : '抬膝蓋！';
      }
      out.count = st.count; out.rep = r; out.phase = st.phase;
      return out;
    }};
  return api;
}

/* ---------- 示範小人（坐姿，鏡像：畫面左邊＝你的左手） ----------
 * 座標以臀部中心為原點，y 往下為正，單位約一個「肩寬」。回傳 A、B 兩個姿勢，畫面在兩者間來回。 */
var BASE_POSE = {head:[0, -1.62], neck:[0, -1.32], lsh:[-.34, -1.25], rsh:[.34, -1.25], lel:[-.42, -.85], rel:[.42, -.85], lha:[-.42, -.47], rha:[.42, -.47],
  lhip:[-.2, -.32], rhip:[.2, -.32], lkn:[-.24, -.24], rkn:[.24, -.24], lft:[-.26, .55], rft:[.26, .55]};
function pose(over){ var p = {}; Object.keys(BASE_POSE).forEach(function(k){ p[k] = (over[k] || BASE_POSE[k]).slice(); }); return p; }
function tilt(p, deg){ var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); ['head', 'neck', 'lsh', 'rsh', 'lel', 'rel', 'lha', 'rha'].forEach(function(k){ var x = p[k][0], y = p[k][1] + .32; p[k] = [x * c - y * s, x * s + y * c - .32]; }); return p; }
var FIG = {
  armsUp:[pose({}), pose({lel:[-.44, -1.72], rel:[.44, -1.72], lha:[-.36, -2.15], rha:[.36, -2.15]})],
  altArms:[pose({lel:[-.44, -1.72], lha:[-.36, -2.15]}), pose({rel:[.44, -1.72], rha:[.36, -2.15]})],
  chest:[pose({lel:[-.36, -.98], rel:[.36, -.98], lha:[-.07, -1.05], rha:[.07, -1.05]}), pose({lel:[-.72, -1.15], rel:[.72, -1.15], lha:[-1.08, -1.2], rha:[1.08, -1.2]})],
  clap:[pose({lel:[-.5, -.95], rel:[.5, -.95], lha:[-.5, -1.05], rha:[.5, -1.05]}), pose({lel:[-.36, -.95], rel:[.36, -.95], lha:[-.04, -1.05], rha:[.04, -1.05]})],
  shrug:[pose({}), pose({lsh:[-.34, -1.44], rsh:[.34, -1.44], lel:[-.42, -1.04], rel:[.42, -1.04], lha:[-.42, -.66], rha:[.42, -.66]})],
  bend:[tilt(pose({}), -16), tilt(pose({}), 16)],
  march:[pose({lkn:[-.24, -.62], lft:[-.26, .18]}), pose({rkn:[.24, -.62], rft:[.26, .18]})]
};

/* ---------- 紀錄與連續天數 ---------- */
function dayKey(d){ d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function addLog(log, key, sec, reps){
  log = Object.assign({}, log || {});
  var e = Object.assign({sec:0, reps:0, n:0}, log[key] || {});
  e.sec += Math.max(0, Math.round(sec)); e.reps += Math.max(0, reps | 0); e.n += 1;
  log[key] = e; return log;
}
function streak(log, today){
  var d = new Date(today + 'T00:00:00'), n = 0;
  if(!log[today]) d.setDate(d.getDate() - 1);    // 今天還沒做，從昨天往回算
  while(log[dayKey(d)]){ n++; d.setDate(d.getDate() - 1); }
  return n;
}
var ZH = '零一二三四五六七八九';
function zhNum(n){ n = n | 0; if(n < 10) return ZH[n]; if(n < 20) return '十' + (n % 10 ? ZH[n % 10] : ''); if(n < 100) return ZH[(n / 10) | 0] + '十' + (n % 10 ? ZH[n % 10] : ''); return String(n); }

var API = {LM:LM, MOVES:MOVES, moveById:moveById, COURSES:COURSES, courseById:courseById, courseMinutes:courseMinutes, MIN_GAP:MIN_GAP,
  pick:pick, check:check, makeCounter:makeCounter, FIG:FIG, dayKey:dayKey, addLog:addLog, streak:streak, zhNum:zhNum};
if(typeof module !== 'undefined' && module.exports) module.exports = API; else root.SEX = API;
})(typeof window !== 'undefined' ? window : globalThis);
