/* 坐姿健康操：3D 示範老師（Three.js，全部程式繪製，無外部素材）
 * 一位坐在木椅上的長輩，用關節角度做動作。鏡像示範：口令說「左手」時，老師舉畫面左邊那隻手（照鏡子做就對）。
 * 對外：Demo3D.load() → Promise；Demo3D.attach(el)；Demo3D.show(moveId)；Demo3D.setPhase(u 0..1 一個循環內的位置) 或自己跑；Demo3D.stats()
 * 座標：人面向鏡頭（+z），x 正方向＝畫面右邊（老師本人的左手側），y 往上，單位約公尺。 */
(function(){
'use strict';
var D = window.Demo3D = {ready:false, failed:false};
var T, renderer, scene, camera, host = null, rig = {}, cur = 'armsUp', clock, t0 = 0, ext = null, frames = 0, raf = 0, visible = true;

/* ---------- 姿勢（各關節角度，弧度） ----------
 * sh：肩（x 前後舉、z 側舉；+z＝往畫面右邊外側）、el：手肘彎、hip：大腿（x 往上抬）、kn：膝蓋彎、sp：脊椎側彎（z）、up：聳肩高度 */
var REST = {shL:[-.35, .12], shR:[-.35, -.12], elL:-1.0, elR:-1.0, hipL:0, hipR:0, sp:0, up:0};
function P(o){ return Object.assign({}, REST, o); }
var ARM_UP = 2.85;
// 每個動作的關鍵影格：兩段（A↔B，一循環＝一次）或四段（休息→左→休息→右，一循環＝兩次）
// 鏡像：口令的「左」＝畫面左邊＝老師的 R 手（x 負側）
var KF = {
  armsUp:[P({shL:[0, .18], shR:[0, -.18], elL:-.15, elR:-.15}), P({shL:[0, ARM_UP], shR:[0, -ARM_UP], elL:-.1, elR:-.1})],
  altArms:[P({shL:[0, .18], shR:[0, -.18], elL:-.15, elR:-.15}), P({shL:[0, .18], shR:[0, -ARM_UP], elL:-.15, elR:-.1}), P({shL:[0, .18], shR:[0, -.18], elL:-.15, elR:-.15}), P({shL:[0, ARM_UP], shR:[0, -.18], elL:-.1, elR:-.15})],
  chest:[P({shL:[-1.5, -.18], shR:[-1.5, .18], elL:-.2, elR:-.2}), P({shL:[-.15, 1.45], shR:[-.15, -1.45], elL:-.15, elR:-.15})],
  clap:[P({shL:[-1.15, .55], shR:[-1.15, -.55], elL:-.6, elR:-.6}), P({shL:[-1.25, -.12], shR:[-1.25, .12], elL:-.45, elR:-.45})],
  shrug:[P({shL:[-.1, .14], shR:[-.1, -.14], elL:-.3, elR:-.3}), P({shL:[-.1, .14], shR:[-.1, -.14], elL:-.3, elR:-.3, up:.075})],
  // 側彎：sp 正＝往畫面左邊彎（先往「左」）
  bend:[P({shL:[0, .12], shR:[0, -.12], elL:-.15, elR:-.15}), P({shL:[0, .12], shR:[0, -.12], elL:-.15, elR:-.15, sp:.28}), P({shL:[0, .12], shR:[0, -.12], elL:-.15, elR:-.15}), P({shL:[0, .12], shR:[0, -.12], elL:-.15, elR:-.15, sp:-.28})],
  march:[P({}), P({hipR:.55}), P({}), P({hipL:.55})]
};
D.KF = KF;
D.cycles = function(id){ return (KF[id] || KF.armsUp).length === 4 ? 2 : 1; };   // 一個循環算幾次
function lerp(a, b, u){ return a + (b - a) * u; }
function mix(A, B, u){ var o = {}; Object.keys(A).forEach(function(k){ o[k] = Array.isArray(A[k]) ? [lerp(A[k][0], B[k][0], u), lerp(A[k][1], B[k][1], u)] : lerp(A[k], B[k], u); }); return o; }
function ease(x){ return (1 - Math.cos(x * Math.PI)) / 2; }
// u：一個循環內的位置 0..1
D.poseAt = function(id, u){
  var k = KF[id] || KF.armsUp, n = k.length, seg, f;
  u = ((u % 1) + 1) % 1;
  if(n === 2){ var w = (1 - Math.cos(u * Math.PI * 2)) / 2; return mix(k[0], k[1], w); }
  seg = Math.floor(u * n); f = ease(u * n - seg);
  return mix(k[seg], k[(seg + 1) % n], f);
};

/* ---------- 模型 ---------- */
function mat(c, o){ return new T.MeshStandardMaterial(Object.assign({color:c, roughness:.75, metalness:0}, o || {})); }
function cap(r, len, c){ var m = new T.Mesh(new T.CapsuleGeometry(r, len, 6, 12), mat(c)); m.position.y = -len / 2 - r * .4; return m; }
function joint(parent, x, y, z){ var g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function build(){
  var SHIRT = '#e8743b', SKIN = '#f1c9a0', PANTS = '#3c5a8a', HAIR = '#d9d9d9', WOOD = '#b77a45', WOOD2 = '#8f5a2e';
  var root = new T.Group(); scene.add(root);
  // 椅子
  var chair = new T.Group(); root.add(chair);
  var seat = new T.Mesh(new T.BoxGeometry(.5, .05, .46), mat(WOOD)); seat.position.set(0, .45, 0); chair.add(seat);
  [[-.22, -.2], [.22, -.2], [-.22, .2], [.22, .2]].forEach(function(p){ var l = new T.Mesh(new T.BoxGeometry(.04, .45, .04), mat(WOOD2)); l.position.set(p[0], .225, p[1]); chair.add(l); });
  [-.22, .22].forEach(function(x){ var p = new T.Mesh(new T.BoxGeometry(.04, .5, .04), mat(WOOD2)); p.position.set(x, .72, -.2); chair.add(p); });
  var back = new T.Mesh(new T.BoxGeometry(.48, .2, .03), mat(WOOD)); back.position.set(0, .88, -.21); chair.add(back);
  // 骨盆（坐在椅面上）
  var pelvis = joint(root, 0, .53, -.04);
  pelvis.add(Object.assign(new T.Mesh(new T.BoxGeometry(.34, .14, .24), mat(PANTS)), {}));
  // 脊椎（側彎繞 z）→ 胸
  var spine = joint(pelvis, 0, .05, 0);
  var torso = new T.Mesh(new T.CapsuleGeometry(.16, .26, 6, 14), mat(SHIRT)); torso.scale.set(1.12, 1, .78); torso.position.y = .24; spine.add(torso);
  var chest = joint(spine, 0, .44, 0);
  // 頭
  var neck = new T.Mesh(new T.CylinderGeometry(.045, .05, .08, 10), mat(SKIN)); neck.position.y = .05; chest.add(neck);
  var head = joint(chest, 0, .19, .01);
  head.add(new T.Mesh(new T.SphereGeometry(.12, 24, 18), mat(SKIN)));
  var hair = new T.Mesh(new T.SphereGeometry(.125, 24, 12, 0, Math.PI * 2, 0, Math.PI * .55), mat(HAIR)); hair.position.set(0, .012, -.01); hair.rotation.x = -.25; head.add(hair);
  [-.042, .042].forEach(function(x){ var e = new T.Mesh(new T.SphereGeometry(.013, 10, 8), mat('#3a2a20')); e.position.set(x, .015, .108); head.add(e); });
  var smile = new T.Mesh(new T.TorusGeometry(.035, .008, 6, 16, Math.PI), mat('#b5523a')); smile.position.set(0, -.035, .108); smile.rotation.z = Math.PI; head.add(smile);
  [-.12, .12].forEach(function(x){ var ear = new T.Mesh(new T.SphereGeometry(.025, 10, 8), mat(SKIN)); ear.position.set(x, 0, 0); ear.scale.set(.6, 1, .8); head.add(ear); });
  var glasses = new T.Mesh(new T.TorusGeometry(.03, .005, 6, 16), mat('#6b4a2f')); [-.045, .045].forEach(function(x){ var g = glasses.clone(); g.position.set(x, .015, .113); head.add(g); });
  // 手臂：肩（可聳）→ 上臂 → 手肘 → 前臂 → 手
  function arm(side){
    var sh = joint(chest, side * .2, -.02, 0);
    sh.add(new T.Mesh(new T.SphereGeometry(.065, 12, 10), mat(SHIRT)));
    var up = cap(.05, .2, SHIRT); sh.add(up);
    var el = joint(sh, 0, -.29, 0);
    var fo = cap(.042, .18, SKIN); el.add(fo);
    var hand = new T.Mesh(new T.SphereGeometry(.05, 12, 10), mat(SKIN)); hand.scale.set(.8, 1.1, .6); hand.position.y = -.28; el.add(hand);
    return {sh:sh, el:el, base:sh.position.y};
  }
  rig.L = arm(1); rig.R = arm(-1);   // L＝老師的左手（畫面右邊）
  // 腿：大腿往前平放（坐姿）→ 膝蓋 → 小腿往下 → 鞋
  function leg(side){
    var hip = joint(pelvis, side * .1, -.02, .02);
    var th = new T.Mesh(new T.CapsuleGeometry(.075, .3, 6, 12), mat(PANTS)); th.rotation.x = Math.PI / 2; th.position.z = .2; hip.add(th);
    var kn = joint(hip, 0, 0, .4);
    var sn = cap(.062, .34, PANTS); kn.add(sn);
    var shoe = new T.Mesh(new T.BoxGeometry(.1, .07, .2), mat('#5b3a24')); shoe.position.set(0, -.5, .05); kn.add(shoe);
    return {hip:hip, kn:kn};
  }
  rig.LL = leg(1); rig.RL = leg(-1);
  rig.spine = spine; rig.root = root;
  // 地面、樹、陰影
  var ground = new T.Mesh(new T.CircleGeometry(3.2, 48), mat('#bfe0a5')); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  var shadow = new T.Mesh(new T.CircleGeometry(.45, 32), new T.MeshBasicMaterial({color:'#7fa86a', transparent:true, opacity:.5})); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .003; shadow.scale.set(1.2, .8, 1); scene.add(shadow);
  [[-1.6, -1.6, 1.1], [1.7, -1.9, 1.3], [-2.4, -.6, .9], [2.3, -.4, .8]].forEach(function(p){
    var tr = new T.Group(); tr.position.set(p[0], 0, p[1]); scene.add(tr);
    var trunk = new T.Mesh(new T.CylinderGeometry(.06, .09, .7 * p[2], 8), mat('#8a5a35')); trunk.position.y = .35 * p[2]; tr.add(trunk);
    var crown = new T.Mesh(new T.IcosahedronGeometry(.45 * p[2], 1), mat('#6fae5a', {flatShading:true})); crown.position.y = .95 * p[2]; tr.add(crown);
  });
  // 地上的「左」「右」（鏡像：畫面左邊＝你的左邊）
  ['左', '右'].forEach(function(s, i){
    var cv = document.createElement('canvas'); cv.width = cv.height = 128; var x = cv.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill();
    x.fillStyle = '#2f6b3f'; x.font = '900 80px "Noto Sans TC",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, 64, 68);
    var m = new T.Mesh(new T.PlaneGeometry(.26, .26), new T.MeshBasicMaterial({map:new T.CanvasTexture(cv), transparent:true}));
    m.rotation.x = -Math.PI / 2.6; m.position.set(i ? .62 : -.62, .02, .55); scene.add(m);
  });
}
function apply(p){
  // 鏡像：老師的 R（x 負側）在畫面左邊
  [['L', p.shL, p.elL, 1], ['R', p.shR, p.elR, -1]].forEach(function(a){
    var g = rig[a[0]]; g.sh.rotation.set(a[1][0], 0, a[1][1]); g.el.rotation.set(a[2], 0, 0); g.sh.position.y = g.base + p.up;
  });
  rig.LL.hip.rotation.x = -p.hipL; rig.RL.hip.rotation.x = -p.hipR;
  rig.LL.kn.rotation.x = 0; rig.RL.kn.rotation.x = 0;
  rig.spine.rotation.z = p.sp;
}

/* ---------- 迴圈 ---------- */
var tempo = 3;
D.show = function(id, tmp){ if(KF[id]) cur = id; if(tmp) tempo = tmp; t0 = clock ? clock.getElapsedTime() : 0; ext = null; };
D.setPhase = function(u){ ext = u; };      // 外部指定進度（節拍模式同步）；null＝自己跑
D.restart = function(){ t0 = clock ? clock.getElapsedTime() : 0; };
D.elapsedCycles = function(){ return clock ? (clock.getElapsedTime() - t0) / (tempo * D.cycles(cur)) : 0; };
function size(){
  if(!host || !renderer) return;
  var w = host.clientWidth || 300, h = host.clientHeight || 225;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 46 : 34; camera.updateProjectionMatrix();
}
function loop(){
  raf = requestAnimationFrame(loop);
  if(!host || !host.isConnected || !visible) return;
  var t = clock.getElapsedTime(), u = ext != null ? ext : (t - t0) / (tempo * D.cycles(cur));
  apply(D.poseAt(cur, u));
  var a = Math.sin(t * .35) * .38, r = 2.35;   // 鏡頭慢慢左右繞，看得出立體
  camera.position.set(Math.sin(a) * r, 1.12, Math.cos(a) * r); camera.lookAt(0, .78, 0);
  renderer.render(scene, camera); frames++;
}
D.attach = function(el){
  if(!D.ready || !el) return false;
  host = el; el.appendChild(renderer.domElement); size(); return true;
};
D.load = function(){
  if(D._p) return D._p;
  D._p = import('three').then(function(mod){
    T = mod; clock = new T.Clock();
    renderer = new T.WebGLRenderer({antialias:true, alpha:false, preserveDrawingBuffer:false});
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    scene = new T.Scene(); scene.background = new T.Color('#fff4d6'); scene.fog = new T.Fog('#fff4d6', 4, 9);
    camera = new T.PerspectiveCamera(34, 4 / 3, .05, 30);
    scene.add(new T.HemisphereLight('#fffaf0', '#9cc88a', 1.6));
    var sun = new T.DirectionalLight('#ffe7b8', 1.6); sun.position.set(1.5, 3, 2.5); scene.add(sun);
    build(); apply(REST);
    window.addEventListener('resize', size);
    if(window.ResizeObserver) new ResizeObserver(size).observe(document.body);
    document.addEventListener('visibilitychange', function(){ visible = !document.hidden; });
    D.ready = true; loop();
  }).catch(function(e){ D.failed = true; throw e; });
  return D._p;
};
D.stats = function(){ return {ready:D.ready, frames:frames, move:cur, attached:!!(host && host.isConnected)}; };
})();
