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
  const P = (k) => { const q = p[k]; return { x: cx - q[0] * S + (rnd() - .5) * j * S * 4, y: cy + q[1] * S + (rnd() - .5) * j * S * 4, v: (opt.hide || []).includes(k) ? .1 : .95 }; };
  return { nose: P('head'), ls: P('lsh'), rs: P('rsh'), lw: P('lha'), rw: P('rha'), lh: P('lhip'), rh: P('rhip'), lk: P('lkn'), rk: P('rkn') };
}
function lerp(a, b, t) { const o = {}; Object.keys(a).forEach(k => { o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t]; }); return o; }
// 模擬做 n 次：A→B→A 平滑來回，每次 period 秒，30fps
function simulate(id, n, opt = {}) {
  const c = E.makeCounter(id), [A, B] = E.FIG[id], period = opt.period || 2, fps = 30;
  let t = 0;
  for (let i = 0; i < fps * 1.0; i++, t += 1 / fps) c.update(frame(A, opt), t);    // 先靜止 1 秒（學起始值）
  for (let k = 0; k < n; k++) for (let i = 0; i < period * fps; i++, t += 1 / fps) { const u = (1 - Math.cos(i / (period * fps) * Math.PI * 2)) / 2; c.update(frame(lerp(A, B, u), opt), t); }
  for (let i = 0; i < fps; i++, t += 1 / fps) c.update(frame(A, opt), t);
  return c.count;
}
// 1. 每個動作做 6 次要數 6 次（altArms／march／bend 一來一回是兩邊各一次＝2）
const perCycle = { altArms: 2, march: 2, bend: 2 };
E.MOVES.forEach(m => {
  [{}, { S: .12 }, { S: .4, cx: .8 }, { jit: .03 }].forEach((o, oi) => {
    const got = simulate(m.id, 6, o), want = 6 * (perCycle[m.id] || 1);
    ok(got === want, m.n + ' 情況' + oi + '：數到 ' + got + '（應為 ' + want + '）');
  });
});
// 2. 靜止不動、抖動很大也不會亂數
E.MOVES.forEach(m => {
  const c = E.makeCounter(m.id); let t = 0;
  for (let i = 0; i < 300; i++, t += 1 / 30) c.update(frame(E.FIG[m.id][0], { jit: .05 }), t);
  ok(c.count === 0, m.n + ' 靜止 10 秒不該計數，卻數到 ' + c.count);
});
// 3. 太快的抖動（間隔 < MIN_GAP）不會連數
{ const c = E.makeCounter('clap'), [A, B] = E.FIG.clap; let t = 0;
  for (let k = 0; k < 20; k++){ c.update(frame(A, { jit: 0 }), t); t += .05; c.update(frame(B, { jit: 0 }), t); t += .05; }
  ok(c.count <= Math.ceil(2 / E.MIN_GAP) + 1, '快速抖動被限制，數到 ' + c.count); }
// 4. 缺點提示
const A = E.FIG.march[0];
ok(/膝蓋/.test(E.makeCounter('march').update(frame(A, { hide: ['lkn', 'rkn'] }), 0).hint), '看不到膝蓋要提示');
ok(/雙手/.test(E.makeCounter('armsUp').update(frame(A, { hide: ['lha'] }), 0).hint), '看不到手要提示');
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
console.log(`通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
