// 引擎測試：node tools/test_engine.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const require = createRequire(import.meta.url);
const E = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'engine.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// 用示範小人的姿勢產生「攝影機座標」：小人座標（鏡像）→ 本人左右（未鏡像影像中本人左邊在右側，所以 x 取負）
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function frame(p, opt = {}) {
  const S = opt.S || .22, cx = opt.cx || .9, cy = opt.cy || .62, j = opt.jit == null ? .012 : opt.jit;
  // clip：超出畫面（寬 4/3、高 1）的點，MediaPipe 會給很低的 visibility
  const out = (x, y) => opt.clip && (x < 0 || x > 4 / 3 || y < 0 || y > 1);
  const off = { leye: ['head', -.08, -.04], reye: ['head', .08, -.04], lear: ['head', -.15, .03], rear: ['head', .15, .03], li: ['lha', .02, -.12], ri: ['rha', -.02, -.12] };   // 耳朵、食指指尖由頭與手推算
  const P = (k) => { const o = off[k], q = o ? [p[o[0]][0] + o[1], p[o[0]][1] + o[2]] : p[k]; const x = cx - q[0] * S + (rnd() - .5) * j * S * 4, y = cy + q[1] * S + (rnd() - .5) * j * S * 4; return { x, y, v: (opt.hide || []).includes(k) || out(x, y) ? .1 : .95 }; };
  const f = { nose: P('head'), leye: P('leye'), reye: P('reye'), lear: P('lear'), rear: P('rear'), ls: P('lsh'), rs: P('rsh'), le: P('lel'), re: P('rel'), lw: P('lha'), rw: P('rha'), li: P('li'), ri: P('ri'), lh: P('lhip'), rh: P('rhip'), lk: P('lkn'), rk: P('rkn') };
  // occl：兩手靠近時互相遮住，手腕可信度掉到 0.35～0.45（拍手的真實情況）
  if (opt.occl && Math.hypot(f.lw.x - f.rw.x, f.lw.y - f.rw.y) < .5 * Math.hypot(f.ls.x - f.rs.x, f.ls.y - f.rs.y)) { f.lw.v = .35 + rnd() * .1; f.rw.v = .35 + rnd() * .1; f.li.v = .4; f.ri.v = .4; }
  return f;
}
function lerp(a, b, t) { const o = {}; Object.keys(a).forEach(k => { o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t]; }); return o; }
// 模擬做 n 次：A→B→A 平滑來回，每次 period 秒，30fps
// opt：fps 每秒幾張畫面、amp 動作幅度（1＝示範小人的幅度）、period 每次幾秒、sens 靈敏度
function simulate(id, n, opt = {}) {
  const c = E.makeCounter(id, { sens: opt.sens }), [A, B] = E.FIG[id], period = opt.period || 2, fps = opt.fps || 30, amp = opt.amp == null ? 1 : opt.amp;
  let t = 0;
  for (let i = 0; i < fps * 2.0; i++, t += 1 / fps) c.update(frame(A, opt), t);    // 先靜止 2 秒（畫面上是動作說明與倒數，app 這時就在暖機學起始值）
  for (let k = 0; k < n; k++) for (let i = 0; i < period * fps; i++, t += 1 / fps) { const u = (1 - Math.cos(i / (period * fps) * Math.PI * 2)) / 2 * amp; c.update(frame(lerp(A, B, u), opt), t); }
  for (let i = 0; i < fps; i++, t += 1 / fps) c.update(frame(A, opt), t);
  return c.count;
}
// 1. 每個動作做 6 次要數 6 次（altArms／march／bend 一來一回是兩邊各一次＝2）
const perCycle = { altArms: 2, march: 2, bend: 2 };
E.MOVES.forEach(m => {
  [{}, { S: .12 }, { S: .4, cx: .8 }, { jit: m.id === 'shrug' ? .02 : .03 }].forEach((o, oi) => {
    const got = simulate(m.id, 6, o), want = 6 * (perCycle[m.id] || 1), tol = o.jit ? 1 : 0;   // 加大抖動的情境允許差 1 下
    ok(Math.abs(got - want) <= tol, m.n + ' 情況' + oi + '：數到 ' + got + '（應為 ' + want + (tol ? '，加大抖動允許差 1' : '') + '）');
  });
});
// 1b. 坐很近（筆電在桌上約 60 公分）：只看得到頭、肩膀、上胸；手放下會掉出畫面下方、舉高時手腕剛好在上緣
const NEAR = { S: .88, cx: .67, cy: 1.95, clip: true };
['armsUp', 'altArms', 'shrug', 'bend'].forEach(id => {
  [NEAR, Object.assign({}, NEAR, { jit: .02 }), Object.assign({}, NEAR, { cy: 1.85 })].forEach((o, oi) => {
    const got = simulate(id, 6, o), want = 6 * (perCycle[id] || 1);
    ok(got === want, E.moveById[id].n + ' 坐很近' + oi + '：數到 ' + got + '（應為 ' + want + '）');
  });
});
// 看不到的動作要回報 miss（畫面會自動改成跟著節拍數），而且不能亂數
['chest', 'clap', 'march'].forEach(id => {
  const c = E.makeCounter(id), [A, B] = E.FIG[id]; let t = 0, miss = 0;
  for (let i = 0; i < 180; i++, t += 1 / 30){ const r = c.update(frame(i % 60 < 30 ? A : B, NEAR), t); if (r.miss) miss++; }
  ok(miss > 150 && c.count === 0, E.moveById[id].n + ' 坐很近看不到 → miss ' + miss + '、不亂數 ' + c.count);
});
// 只露出頭肩、手放下（都在畫面下方）站著不動：舉手類不可計數
{ const c = E.makeCounter('armsUp'); let t = 0; for (let i = 0; i < 300; i++, t += 1 / 30) c.update(frame(E.FIG.armsUp[0], Object.assign({}, NEAR, { jit: .05 })), t); ok(c.count === 0, '坐很近手放下不動不計數 ' + c.count); }
// 1c. 聳肩、拍手：接近真人的情況（辨識每秒只有 10～15 張、聳得低、拍得快、拍手時手腕被遮住）
[
  ['shrug', { amp: .45, fps: 12 }, '聳得低（幅度 45%）＋每秒 12 張'], ['shrug', { amp: .45, fps: 12, jit: .02 }, '聳得低＋抖動'], ['shrug', { amp: .35, fps: 15, period: 1.6 }, '聳得更低、比較快'],
  ['shrug', { amp: .45, fps: 12, hide: ['lear', 'rear'] }, '耳朵被頭髮擋住（改看眼睛鼻子）'], ['shrug', Object.assign({}, NEAR, { amp: .5, fps: 12 }), '坐很近＋聳得低'],
  ['clap', { fps: 12, period: .7 }, '每秒 12 張、0.7 秒拍一下'], ['clap', { fps: 10, period: .6 }, '每秒 10 張、0.6 秒拍一下'], ['clap', { fps: 12, period: .8, occl: true }, '拍手時手腕被遮住'],
  ['clap', { fps: 15, period: .5, occl: true, jit: .02 }, '快拍＋遮住＋抖動'], ['clap', { fps: 12, period: .9, amp: .8 }, '手沒打很開']
].forEach(([id, o, name]) => { const got = simulate(id, 8, o), tol = o.jit ? 1 : 0; ok(Math.abs(got - 8) <= tol, E.moveById[id].n + '：' + name + '，數到 ' + got + '（應為 8' + (tol ? '，加大抖動允許差 1' : '') + '）'); });
// 靈敏度：幅度很小的聳肩，「容易數」數得到、「嚴格」不數
ok(simulate('shrug', 6, { amp: .3, fps: 15, sens: 'easy' }) === 6, '容易數：幅度只有 30% 的聳肩也算 ' + simulate('shrug', 6, { amp: .3, fps: 15, sens: 'easy' }));
ok(simulate('shrug', 6, { amp: .12, fps: 15, sens: 'strict' }) === 0, '嚴格：幾乎沒動的聳肩不算 ' + simulate('shrug', 6, { amp: .12, fps: 15, sens: 'strict' }));
// 手停在胸前合著（拍手準備姿勢）不動，不可以一直算
{ const c = E.makeCounter('clap'); let t = 0; for (let i = 0; i < 150; i++, t += 1 / 12) c.update(frame(E.FIG.clap[1], { occl: true, jit: .03 }), t); ok(c.count === 0, '手合著不動不計數 ' + c.count); }
// 2. 靜止不動、抖動很大也不會亂數
E.MOVES.forEach(m => {
  const c = E.makeCounter(m.id); let t = 0;
  // 聳肩的訊號只有肩寬 1 成左右，用 ±6% 肩寬的抖動測（真實攝影機約 ±2～4%）；其他動作用 ±15% 的極端抖動
  const jit = m.id === 'shrug' ? .02 : .05;
  for (let i = 0; i < 300; i++, t += 1 / 30) c.update(frame(E.FIG[m.id][0], { jit }), t);
  ok(c.count === 0, m.n + ' 靜止 10 秒（抖動 ' + jit + '）不該計數，卻數到 ' + c.count);
});
// 3. 太快的抖動（間隔 < MIN_GAP）不會連數
{ const c = E.makeCounter('clap'), [A, B] = E.FIG.clap; let t = 0;
  for (let k = 0; k < 20; k++){ c.update(frame(A, { jit: 0 }), t); t += .05; c.update(frame(B, { jit: 0 }), t); t += .05; }
  ok(c.count <= Math.ceil(2 / E.MIN_GAP) + 1, '快速抖動被限制，數到 ' + c.count); }
// 4. 缺點提示
const A = E.FIG.march[0];
ok(/膝蓋/.test(E.makeCounter('march').update(frame(A, { hide: ['lkn', 'rkn'] }), 0).hint), '看不到膝蓋要提示');
ok(/雙手/.test(E.makeCounter('clap').update(frame(A, { hide: ['lha'] }), 0).hint), '看不到手要提示（拍手）');
ok(/肩膀/.test(E.makeCounter('shrug').update(frame(A, { hide: ['lsh'] }), 0).hint), '看不到肩膀要提示');
ok(/太遠/.test(E.makeCounter('clap').update(frame(A, { S: .04 }), 0).hint), '太遠要提示');
ok(/沒看到人/.test(E.makeCounter('clap').update(null, 0).hint), '沒人要提示');
// 5. 課程與紀錄
E.COURSES.forEach(c => { c.steps.forEach(s => ok(E.moveById[s[0]] && s[1] > 0, c.n + ' 步驟合法')); ok(E.courseMinutes(c.steps) >= 1 && E.courseMinutes(c.steps) <= 15, c.n + ' 時間 ' + E.courseMinutes(c.steps) + ' 分'); });
let log = E.addLog({}, '2026-11-13', 300, 40); log = E.addLog(log, '2026-11-14', 200, 30); log = E.addLog(log, '2026-11-14', 100, 5);
ok(log['2026-11-14'].sec === 300 && log['2026-11-14'].n === 2, '同一天累加');
ok(E.streak(log, '2026-11-15') === 2 && E.streak(log, '2026-11-14') === 2 && E.streak(log, '2026-11-17') === 0, '連續天數 ' + E.streak(log, '2026-11-15'));
ok(E.zhNum(1) === '一' && E.zhNum(10) === '十' && E.zhNum(16) === '十六' && E.zhNum(20) === '二十' && E.zhNum(35) === '三十五', '中文數字');
ok(E.pick([{ x: .5, y: .5, visibility: .9 }], 16 / 9).nose.x > .88, 'pick 乘上寬高比');

// 8. 3D 示範的姿勢（demo3d.js 的關鍵影格；不需要 Three.js）
{
  globalThis.window = globalThis.window || {};
  require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo3d.js'));
  const D = globalThis.window.Demo3D;
  let p2 = 0, f2 = 0;
  E.MOVES.forEach(m => {
    const kf = D.KF[m.id]; ok(kf && (kf.length === 2 || kf.length === 4), '3D 示範有 ' + m.n);
    let prev = D.poseAt(m.id, 0), maxJump = 0;
    for (let i = 1; i <= 200; i++) { const q = D.poseAt(m.id, i / 200); Object.keys(q).forEach(k => { const a = [].concat(q[k]), b = [].concat(prev[k]); a.forEach((v, j) => { maxJump = Math.max(maxJump, Math.abs(v - b[j])); }); }); prev = q; }
    ok(maxJump < .2, m.n + ' 3D 示範動作連續（每格最大變化 ' + maxJump.toFixed(3) + '）');
    ok(D.cycles(m.id) === (kf.length === 4 ? 2 : 1), m.n + ' 一循環次數');
  });
  // 鏡像：口令先說「左」→ 老師先動畫面左邊（R 手／R 腳；側彎 sp 為正＝往畫面左邊）
  ok(D.poseAt('altArms', .25).shR[1] < -2 && D.poseAt('altArms', .25).shL[1] < 1, '輪流舉手：先舉畫面左邊的手');
  ok(D.poseAt('bend', .25).sp > .2 && D.poseAt('bend', .75).sp < -.2, '側彎：先往畫面左邊');
  ok(D.poseAt('march', .25).hipR > .4 && D.poseAt('march', .75).hipL > .4, '踏步：先抬畫面左邊的腳');
  ok(D.poseAt('armsUp', .5).shL[1] > 2.5 && D.poseAt('armsUp', 0).shL[1] < .3, '雙手舉高：半循環時舉到頭頂');
  ok(D.poseAt('shrug', .5).up > .06 && D.poseAt('shrug', 0).up === 0, '聳肩：肩膀上下');
}
console.log(`（含 3D 示範）通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
