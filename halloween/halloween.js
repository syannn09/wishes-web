/* =========================================================
   万圣之夜 · 主逻辑
   - 一扇门 = 一个作品，每扇门在后台各自设开启时间（unlock_at）
   - 横向滑动找门，时间没到门上挂锁 + 倒计时
   - 时间到了点门：吱呀开门声 → 门转开 → 蝙蝠飞出 → 弹出内容
   - 未解锁的内容由服务端 RPC 控制不下发（见 SCHEMA.md 第 10 节）
========================================================= */
const $  = (s,r)=>(r||document).querySelector(s);
const $$ = (s,r)=>Array.from((r||document).querySelectorAll(s));
const H  = (window.CONFIG && window.CONFIG.HALLOWEEN) || {};

/* ---------- URL 参数 ---------- */
const QS = new URLSearchParams(location.search);
const PREVIEW_KEY = QS.get("preview") || "";   // ?preview=<管理密钥> → 全解锁
const DEMO        = QS.has("demo");             // ?demo=1 → 用本地假数据，不连后台

/* ---------- 时间 ----------
   服务端每次回传 server_now，用它校正手机时钟：倒计时才准，
   而且真正的解锁判定在服务端，改手机时间也没用 */
let clockOffset = 0;
const now = ()=> Date.now() + clockOffset;
// 中国时间自己算（+8 小时再读 UTC 栏位），不用 Intl 时区：旧内核（X5 / 百度）不一定支援
function whenLabel(iso){
  const c = new Date(Date.parse(iso) + 8*3600e3);
  return `${c.getUTCMonth()+1}月${c.getUTCDate()}日 ${pad2(c.getUTCHours())}:${pad2(c.getUTCMinutes())} 开启`;
}
function pad2(n){ return ("0" + n).slice(-2); }
function fmtCountdown(ms){
  const s = Math.floor(ms/1000);
  const d = Math.floor(s/86400), h = Math.floor(s%86400/3600), m = Math.floor(s%3600/60), sec = s%60;
  const hms = `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  return d > 0 ? `${d} 天 ${hms}` : hms;
}

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove("show"), 2600);
}
function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initial(name){ return (name||"?").trim().charAt(0).toUpperCase(); }

/* =========================================================
   Supabase：直接用 fetch 打 RPC，不载 supabase-js ——
   新版 supabase-js 用了 ?. / ?? 语法，旧版微信 X5、百度 T7 内核解析不了，
   整个库载入失败页面就空了。粉丝页只要读资料，一个 POST 就够。
========================================================= */
const CFG = window.CONFIG || {};
const HAS_DB = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
function rpc(fn, args){
  return fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "apikey": CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args || {})
  }).then(r => r.json().then(data => {
    if(!r.ok) throw data;
    return data;
  }));
}

/* =========================================================
   占位画：门框 / 门板 / 挂锁 / 蝙蝠
   设计稿到了：门框填 CONFIG.HALLOWEEN.FRAME_IMAGE，
   每扇门的外观在后台上传（doors.door_image），这些就不会用到
========================================================= */
const BAT_SVG = `<svg viewBox="0 0 64 30"><path fill="currentColor" d="M32 9c1.6-3.2 3.4-4.4 5-4.6-.8 1.8-.7 3.4.2 4.6C43 3.6 53 3.2 64 11c-6.2-.2-9.4 2.6-10.4 6.6-2.8-2.8-6.8-3-9.2-.2-2.2-2.8-5.6-3-8.4-.8C35 19.4 33.6 22 32 24c-1.6-2-3-4.6-4-7.4-2.8-2.2-6.2-2-8.4.8-2.4-2.8-6.4-2.6-9.2.2C9.4 13.6 6.2 10.8 0 11c11-7.8 21-7.4 26.8-2 .9-1.2 1-2.8.2-4.6 1.6.2 3.4 1.4 5 4.6z"/></svg>`;

const LOCK_SVG = `<svg viewBox="0 0 40 48">
  <path d="M11 21v-7a9 9 0 0118 0v7" fill="none" stroke="#b9b1c6" stroke-width="5" stroke-linecap="round"/>
  <rect x="4" y="20" width="32" height="26" rx="5" fill="#d9a441" stroke="#5e3f0c" stroke-width="2"/>
  <rect x="7" y="23" width="26" height="4" rx="2" fill="#f3cf7a" opacity=".7"/>
  <circle cx="20" cy="32" r="3.6" fill="#3a2508"/><rect x="18.4" y="33" width="3.2" height="8" rx="1.6" fill="#3a2508"/>
</svg>`;

// 石头拱门框：viewBox 200×300，门洞 = x30~170、拱顶 y40（和 CSS 的 .door-hole 对齐）
const FRAME_SVG = (()=>{
  const joints = [];
  [28, 62, 118, 152].forEach(deg=>{
    const r = deg*Math.PI/180, c = Math.cos(r), s = Math.sin(r);
    joints.push(`M${(100+70*c).toFixed(1)} ${(110-70*s).toFixed(1)} L${(100+96*c).toFixed(1)} ${(104-96*s).toFixed(1)}`);
  });
  [150, 200, 250].forEach((y,k)=>{
    joints.push(`M4 ${y} L30 ${y}`, `M170 ${y+ (k%2?8:-8)} L196 ${y+(k%2?8:-8)}`);
  });
  return `<svg viewBox="0 0 200 300" preserveAspectRatio="none">
    <path fill-rule="evenodd" fill="#8a8196" stroke="#231a2c" stroke-width="3"
      d="M4 300 L4 104 A96 96 0 0 1 196 104 L196 300 Z M30 300 L30 110 A70 70 0 0 1 170 110 L170 300 Z"/>
    <path d="M12 300 L12 108 A88 88 0 0 1 60 30" fill="none" stroke="#a9a1b5" stroke-width="3" opacity=".5"/>
    <path d="${joints.join(" ")}" stroke="#4d4358" stroke-width="2" fill="none" opacity=".8"/>
    <path d="M86 8 L114 8 L110 40 L90 40 Z" fill="#9c93a8" stroke="#231a2c" stroke-width="3"/>
    <rect x="0" y="288" width="200" height="12" rx="3" fill="#6f6680" stroke="#231a2c" stroke-width="3"/>
  </svg>`;
})();

// 每扇门的配色 + 门上的小图案，按顺序轮流用，看起来「每扇门都不一样」
const DOOR_LOOKS = [
  { wood:"#6b3f22", dark:"#4a2a15", emblem:"pumpkin" },
  { wood:"#4b2a6b", dark:"#321a4a", emblem:"ghost" },
  { wood:"#2f5a3a", dark:"#1e3d26", emblem:"cat" },
  { wood:"#6e1f2a", dark:"#4a121b", emblem:"skull" },
  { wood:"#243a6b", dark:"#16264a", emblem:"moon" },
  { wood:"#3a2e36", dark:"#241b21", emblem:"web" }
];
const EMBLEMS = {
  pumpkin:`<ellipse cx="70" cy="100" rx="24" ry="19" fill="#ff7a1a" stroke="#1a1020" stroke-width="2.5"/>
    <path d="M70 81 q2-8 8-9" stroke="#2f5a3a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M58 95 l6-5 3 6z M76 96 l6-6 3 6z" fill="#1a1020"/><path d="M58 106 q12 9 24 0 l-4 3-4-3-4 3-4-3-4 3z" fill="#1a1020"/>`,
  ghost:`<path d="M52 118 V96 a18 18 0 0 1 36 0 V118 l-6-5-6 5-6-5-6 5-6-5z" fill="#f4f0ff" stroke="#1a1020" stroke-width="2.5"/>
    <ellipse cx="63" cy="97" rx="3" ry="4.5" fill="#1a1020"/><ellipse cx="77" cy="97" rx="3" ry="4.5" fill="#1a1020"/>`,
  cat:`<path d="M50 112 V86 l8 8 h24 l8-8 V112 a20 16 0 0 1 -40 0z" fill="#15101c" stroke="#000" stroke-width="2"/>
    <ellipse cx="62" cy="104" rx="4" ry="5" fill="#ffc861"/><ellipse cx="78" cy="104" rx="4" ry="5" fill="#ffc861"/>
    <path d="M62 101 v6 M78 101 v6" stroke="#15101c" stroke-width="1.6"/>`,
  skull:`<path d="M54 100 a16 16 0 0 1 32 0 v8 h-6 v7 h-20 v-7 h-6z" fill="#f4f0ff" stroke="#1a1020" stroke-width="2.5"/>
    <circle cx="63" cy="100" r="4.5" fill="#1a1020"/><circle cx="77" cy="100" r="4.5" fill="#1a1020"/>
    <path d="M65 115 v-5 M70 115 v-5 M75 115 v-5" stroke="#1a1020" stroke-width="1.6"/>`,
  moon:`<path d="M80 80 a22 22 0 1 0 0 40 a17 17 0 1 1 0 -40z" fill="#ffe9a8" stroke="#1a1020" stroke-width="2"/>
    <path d="M86 88 l2 5 5 .5 -4 3 1.5 5 -4.5-3 -4.5 3 1.5-5 -4-3 5-.5z" fill="#ffc861"/>`,
  web:`<g stroke="#d9d2e6" stroke-width="1.4" fill="none" opacity=".85">
    <path d="M70 76 V124 M46 100 H94 M53 83 L87 117 M87 83 L53 117"/>
    <path d="M70 84 L80 90 L86 100 L80 110 L70 116 L60 110 L54 100 L60 90 Z"/>
    <path d="M70 92 L76 95 L79 100 L76 105 L70 108 L64 105 L61 100 L64 95 Z"/></g>
    <circle cx="80" cy="112" r="4" fill="#15101c"/><path d="M80 116 v8" stroke="#d9d2e6" stroke-width="1"/>`
};

// 门板：viewBox 140×260，拱顶半径 70；铰链在左、门把在右（门往左边、往里转开）
function doorLeafSVG(i){
  const look = DOOR_LOOKS[i % DOOR_LOOKS.length];
  const clip = `leaf-clip-${i}`;
  const arch = "M0 260 L0 70 A70 70 0 0 1 140 70 L140 260 Z";
  return `<svg viewBox="0 0 140 260" preserveAspectRatio="none">
    <defs><clipPath id="${clip}"><path d="${arch}"/></clipPath></defs>
    <path d="${arch}" fill="${look.wood}"/>
    <g clip-path="url(#${clip})">
      <path d="M35 0 V260 M70 0 V260 M105 0 V260" stroke="${look.dark}" stroke-width="2.5"/>
      <path d="M12 40 q6 60 -2 120 M52 30 q-6 70 4 150 M88 50 q6 60 -2 140 M122 30 q-5 90 3 190"
        stroke="rgba(255,255,255,.08)" stroke-width="2" fill="none"/>
      <rect x="16" y="150" width="108" height="92" rx="6" fill="none" stroke="${look.dark}" stroke-width="4"/>
      <rect x="0" y="136" width="140" height="7" fill="${look.dark}" opacity=".7"/>
    </g>
    <path d="${arch}" fill="none" stroke="#1a1020" stroke-width="5"/>
    ${EMBLEMS[look.emblem]}
    <rect x="2" y="78" width="10" height="16" rx="2" fill="#c9a24a" stroke="#5e3f0c" stroke-width="1.2"/>
    <rect x="2" y="206" width="10" height="16" rx="2" fill="#c9a24a" stroke="#5e3f0c" stroke-width="1.2"/>
    <rect x="114" y="150" width="14" height="24" rx="3" fill="#c9a24a" stroke="#5e3f0c" stroke-width="1.2"/>
    <circle cx="121" cy="166" r="6" fill="#e3bd5e" stroke="#5e3f0c" stroke-width="1.5"/>
  </svg>`;
}

/* =========================================================
   背景：星星 + 偶尔飞过的蝙蝠
========================================================= */
function setupSky(){
  const title = H.TITLE || "万圣之夜";
  $("#title").textContent = title;
  document.title = title;
  $("#subtitle").textContent = H.SUBTITLE || "";
  if(H.BG_IMAGE){
    $("#sky").classList.add("has-img");
    $("#sky").style.backgroundImage = `url("${H.BG_IMAGE}")`;
    document.documentElement.style.background = `var(--night) url("${H.BG_IMAGE}") center bottom / cover no-repeat`;
  }
  const stars = $("#stars");
  for(let i = 0; i < 55; i++){
    const s = document.createElement("span");
    s.className = "star";
    s.style.left = (Math.random()*100) + "vw";
    s.style.top  = (Math.random()*62) + "vh";
    const size = Math.random() < .2 ? 3 : 2;
    s.style.width = s.style.height = size + "px";
    s.style.animationDuration = (1.6 + Math.random()*2.6) + "s";
    s.style.animationDelay = (-Math.random()*4) + "s";
    stars.appendChild(s);
  }
}
function spawnBat(){
  if(document.hidden) return;
  const b = document.createElement("div");
  b.className = "bat";
  b.style.top = (8 + Math.random()*36) + "vh";
  b.style.width = (22 + Math.random()*18) + "px";
  b.style.setProperty("--dip",  (Math.random()*10 - 6) + "vh");
  b.style.setProperty("--rise", (-Math.random()*16) + "vh");
  const dur = 9 + Math.random()*6;
  b.style.animationDuration = dur + "s";
  b.innerHTML = BAT_SVG;
  $("#bats").appendChild(b);
  setTimeout(()=>b.remove(), dur*1000 + 200);
}

/* =========================================================
   音效：吱呀开门声（可静音，记在本机）
========================================================= */
const MUTE_KEY = "halloween.muted";
let muted = false;
try{ muted = localStorage.getItem(MUTE_KEY) === "1"; }catch(e){}
document.body.classList.toggle("muted", muted);
let creak = null;
if(H.DOOR_SOUND){
  creak = new Audio(H.DOOR_SOUND);
  creak.preload = "auto";
}
function playCreak(){
  if(muted || !creak) return;
  try{ creak.currentTime = 0; }catch(e){}
  const p = creak.play();                 // 旧浏览器的 play() 不回 Promise
  if(p && p.catch) p.catch(()=>{});
}
/* iOS / 微信不会预先下载音档，第一次点门才下载会慢半拍：
   手指第一次碰到画面就先 load()；微信另外等 WeixinJSBridgeReady */
let audioWarm = false;   // 旧浏览器不认 {once:true}，自己记，免得每次触碰都 load() 打断正在播的声音
function warmAudio(){
  if(audioWarm || !creak) return;
  audioWarm = true;
  try{ creak.load(); }catch(e){}
}
document.addEventListener("touchstart", warmAudio, { passive:true });
document.addEventListener("WeixinJSBridgeReady", warmAudio, false);
$("#btn-sound").onclick = ()=>{
  muted = !muted;
  document.body.classList.toggle("muted", muted);
  try{ localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); }catch(e){}
  toast(muted ? "已静音" : "音效已开启");
};

/* =========================================================
   门的资料
========================================================= */
let DOORS = [];              // 按开启时间排好（服务端已排序）
const opened = new Set();    // 这次打开过的门（刷新就忘，只用来让门保持虚掩）
let curIdx = 0;              // 目前停在第几扇
let busy = false;            // 开门动画进行中

// 演示模式：内容全在前端，按时间现算；正式 / 预览：以服务端判定为准
function isUnlocked(D){
  if(DEMO) return !!D.unlock_at && Date.parse(D.unlock_at) <= now();
  return !!D.unlocked;
}
function stateOf(D){
  if(!isUnlocked(D)) return "locked";
  return opened.has(D.id) ? "opened" : "ready";
}

async function loadDoors(){
  let list = [];
  if(DEMO && window.DEMO_DOORS){
    list = window.DEMO_DOORS();
  }else if(HAS_DB){
    try{
      const fn   = PREVIEW_KEY ? "preview_get_doors" : "public_get_doors";
      const args = PREVIEW_KEY ? { p_key: PREVIEW_KEY } : {};
      const data = await rpc(fn, args);
      list = Array.isArray(data) ? data : [];
      if(list[0] && list[0].server_now) clockOffset = Date.parse(list[0].server_now) - Date.now();
    }catch(e){
      console.warn("loadDoors", e);
      if(PREVIEW_KEY) toast("预览密钥错误");
      if(DOORS.length) return;          // 刷新失败：保留画面上已有的门
    }
  }
  applyDoors(list);
}

function applyDoors(list){
  // 门的数量 / 顺序 / 外观没变 → 只更新状态，不重画（不打断正在看的那扇）
  const same = railRendered && list.length === DOORS.length &&
    list.every((D,i)=> D.id === DOORS[i].id && (D.door_image||"") === (DOORS[i].door_image||""));
  const keepId = DOORS[curIdx] && DOORS[curIdx].id;
  DOORS = list;
  if(same) refreshStates();
  else     renderRail(keepId);
}

/* =========================================================
   画门
========================================================= */
function slideHTML(D, i){
  const leaf  = D.door_image
    ? `<img src="${escapeHtml(D.door_image)}" alt="">`
    : doorLeafSVG(i);
  const frame = H.FRAME_IMAGE ? `<img src="${escapeHtml(H.FRAME_IMAGE)}" alt="">` : FRAME_SVG;
  return `<div class="slide" data-i="${i}">
    <button class="door ${stateOf(D)}" aria-label="第 ${i+1} 扇门">
      <div class="door-frame">${frame}</div>
      <div class="door-hole door-inside"></div>
      <div class="door-hole door-leaf">${leaf}</div>
      <div class="door-lock">${LOCK_SVG}</div>
    </button>
    <div class="door-meta">
      <div class="door-no">NO.${pad2(i+1)}</div>
      <div class="door-title"></div>
      <div class="door-cd"></div>
    </div>
  </div>`;
}

let railRendered = false;
function renderRail(keepId){
  const rail = $("#rail");
  railRendered = true;
  if(!DOORS.length){
    rail.innerHTML = `<div class="empty">门还在布置中……<br>过几天再来敲门 🎃</div>`;
    $("#pager").style.visibility = "hidden";
    updateProgress();
    return;
  }
  $("#pager").style.visibility = "";
  rail.innerHTML = DOORS.map(slideHTML).join("");
  $$(".slide", rail).forEach(s=>{
    const i = +s.dataset.i;
    $(".door", s).addEventListener("click", ()=> onDoorTap(i));
  });

  // 停在哪扇：刚才看的那扇 > 最新开的那扇 > 第一扇
  let start = DOORS.findIndex(D => D.id === keepId);
  if(start < 0){
    start = 0;
    DOORS.forEach((D,i)=>{ if(isUnlocked(D)) start = i; });
  }
  refreshStates();
  curIdx = -1;
  jumpTo(start, false);
  onRailScroll();
  showSwipeHint();
}

/* 每秒跑一次：倒计时、锁的状态、已开启数 */
function refreshStates(){
  $$("#rail .slide").forEach(s=>{
    const i = +s.dataset.i, D = DOORS[i];
    if(!D) return;
    const door = $(".door", s);
    const st = stateOf(D);
    const wasLocked = door.classList.contains("locked");
    if(!door.classList.contains(st)){
      door.classList.remove("locked","ready","opened");
      door.classList.add(st);
      if(wasLocked && st !== "locked"){
        // 刚好到时间：锁弹开 + 一圈光
        door.classList.add("just-unlocked");
        setTimeout(()=>door.classList.remove("just-unlocked"), 3300);
        toast(`第 ${i+1} 扇门可以推开了！`);
      }
    }
    $(".door-title", s).textContent = D.title || "";
    const cd = $(".door-cd", s);
    cd.classList.toggle("go", st === "ready");
    cd.innerHTML = countdownHTML(D, st);
  });
  updateProgress();
  refreshTeaserCountdown();
}

function countdownHTML(D, st){
  if(st === "ready")  return "✨ 可以推门了";
  if(st === "opened") return "已开启 · 点门再看一次";
  if(!D.unlock_at)    return "🔒 开启时间待定";
  const ms = Date.parse(D.unlock_at) - now();
  if(ms <= 0){
    requestRefresh();                 // 时间到了但服务端还没回新资料 → 去抓
    return "🔓 正在开锁……";
  }
  return `🔒 ${fmtCountdown(ms)}<span class="when">${whenLabel(D.unlock_at)}</span>`;
}

function updateProgress(){
  if(!DOORS.length){ $("#progress").textContent = ""; return; }
  const n = DOORS.filter(isUnlocked).length;
  $("#progress").textContent = `已开启 ${n} / ${DOORS.length} 扇门`;
}

/* ---------- 到点就去抓新资料 ----------
   加 1.5~7.5 秒随机抖动：一堆人同时在等同一扇门，不会同一秒打服务器 */
let refreshPending = false, lastRefresh = 0;
function requestRefresh(){
  if(DEMO || refreshPending) return;
  refreshPending = true;
  const wait = Math.max(0, lastRefresh + 5000 - Date.now()) + 1500 + Math.random()*6000;
  setTimeout(async ()=>{
    try{ await loadDoors(); }catch(e){}
    lastRefresh = Date.now();
    refreshPending = false;
  }, wait);
}

/* =========================================================
   门的尺寸：按屏幕宽 / 高取小的，矮屏（微信顶栏、横屏）也塞得下
   用 JS 算成 px 写进 --door-w，不靠 CSS min()（旧内核不支援）
========================================================= */
function sizeDoors(){
  const w = innerWidth;
  // 门高 = 1.5 倍门宽，下面还要放编号 / 标题 / 倒计时（约 92px）——
  // 按长廊实际高度倒推门宽，微信顶栏、iPhone SE 这种矮屏也不会挤在一起
  const railH = $("#rail").clientHeight || innerHeight*0.7;
  const byH = (railH - 92) / 1.5;
  const door = Math.max(120, Math.min(w*0.66, 300, byH));
  document.documentElement.style.setProperty("--door-w", Math.round(door) + "px");
}
sizeDoors();

/* =========================================================
   滑动 / 翻页
   平滑滚动自己做：scrollTo({behavior:"smooth"}) 旧 iOS / X5 不支援；
   scroll-snap 不支援的内核，手指放开后也会自己吸到最近那扇
========================================================= */
function slideEls(){ return $$("#rail .slide"); }
function slideTarget(i){
  const s = slideEls()[i]; if(!s) return null;
  const rail = $("#rail");
  return Math.max(0, s.offsetLeft - (rail.clientWidth - s.offsetWidth)/2);
}
let anim = null;
function jumpTo(i, smooth){
  const to = slideTarget(i); if(to === null) return;
  const rail = $("#rail");
  cancelAnimationFrame(anim);
  if(!smooth){ rail.scrollLeft = to; return; }
  const from = rail.scrollLeft, t0 = Date.now(), dur = 380;
  rail.style.scrollSnapType = "none";          // 动画中关掉吸附，不然每一帧都被吸回去
  rail.style.webkitScrollSnapType = "none";
  (function step(){
    const k = Math.min(1, (Date.now() - t0)/dur), e = 1 - Math.pow(1-k, 3);
    rail.scrollLeft = from + (to - from)*e;
    if(k < 1){ anim = requestAnimationFrame(step); return; }
    rail.style.scrollSnapType = "";
    rail.style.webkitScrollSnapType = "";
  })();
}
// 滚动停下 150ms 还没对准 → 补吸一下（给不支援 scroll-snap 的内核）
let idleTimer = null;
function snapWhenIdle(){
  clearTimeout(idleTimer);
  idleTimer = setTimeout(()=>{
    const to = slideTarget(curIdx);
    if(to !== null && Math.abs($("#rail").scrollLeft - to) > 3) jumpTo(curIdx, true);
  }, 150);
}
let scrollRaf = 0;
function onRailScroll(){
  cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(()=>{
    const rail = $("#rail");
    const center = rail.scrollLeft + rail.clientWidth/2;
    let best = 0, bestD = Infinity;
    slideEls().forEach((s,i)=>{
      const d = Math.abs(s.offsetLeft + s.offsetWidth/2 - center);
      if(d < bestD){ bestD = d; best = i; }
    });
    if(best === curIdx) return;
    if(curIdx >= 0) hideSwipeHint();
    curIdx = best;
    slideEls().forEach((s,i)=> s.classList.toggle("current", i === curIdx));
    $("#page-no").textContent = `${curIdx+1} / ${DOORS.length}`;
    $("#prev").disabled = curIdx <= 0;
    $("#next").disabled = curIdx >= DOORS.length - 1;
  });
}
$("#rail").addEventListener("scroll", ()=>{ onRailScroll(); snapWhenIdle(); }, { passive:true });
addEventListener("resize", ()=>{ sizeDoors(); jumpTo(curIdx, false); });
$("#prev").onclick = ()=> jumpTo(curIdx - 1, true);
$("#next").onclick = ()=> jumpTo(curIdx + 1, true);
addEventListener("keydown", e=>{
  if($("#door-modal").classList.contains("show")){
    if(e.key === "Escape") closeModal();
    return;
  }
  if(e.key === "ArrowLeft")  jumpTo(curIdx - 1, true);
  if(e.key === "ArrowRight") jumpTo(curIdx + 1, true);
});

let hintTimer = null;
function showSwipeHint(){
  if(DOORS.length < 2 || curIdx >= DOORS.length - 1) return;
  $("#swipe-hint").classList.remove("hide");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideSwipeHint, 6000);
}
function hideSwipeHint(){ $("#swipe-hint").classList.add("hide"); }

/* =========================================================
   点门
========================================================= */
function onDoorTap(i){
  if(busy) return;
  if(i !== curIdx){ jumpTo(i, true); return; }   // 点旁边露出来的门 = 滑过去
  const D = DOORS[i];
  const door = $(".door", slideEls()[i]);
  if(!isUnlocked(D)){
    door.classList.remove("rattle"); void door.offsetWidth;
    door.classList.add("rattle");
    setTimeout(()=>{ door.classList.remove("rattle"); showTeaser(D, i); }, 420);
    return;
  }
  openDoor(D, i, door);
}

function openDoor(D, i, door){
  busy = true;
  playCreak();
  door.classList.add("opening");
  const f = $("#flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
  burstFX($(".door-inside", door));
  setTimeout(()=>{
    opened.add(D.id);
    showContent(D, i);
    busy = false;
  }, 950);
}

// 门里飞出蝙蝠 + 火花
function burstFX(fromEl){
  const r = fromEl.getBoundingClientRect();
  const x = r.left + r.width/2, y = r.top + r.height*0.55;
  const fx = $("#fx");
  for(let k = 0; k < 7; k++){
    const b = document.createElement("div");
    b.className = "fx-bat";
    b.style.left = x + "px"; b.style.top = y + "px";
    b.style.width = (22 + Math.random()*16) + "px";
    b.style.setProperty("--dx", ((Math.random()*2-1) * 48) + "vw");
    b.style.setProperty("--dy", (-(12 + Math.random()*40)) + "vh");
    b.style.animationDelay = (Math.random()*0.25) + "s";
    b.innerHTML = BAT_SVG;
    fx.appendChild(b);
    setTimeout(()=>b.remove(), 1500);
  }
  const colors = ["#ff7a1a","#ffc861","#9be15d","#c58bff","#fff4c8"];
  for(let k = 0; k < 18; k++){
    const s = document.createElement("div");
    s.className = "fx-spark";
    const a = Math.random()*Math.PI*2, d = 60 + Math.random()*110;
    s.style.left = x + "px"; s.style.top = y + "px";
    s.style.background = colors[k % colors.length];
    s.style.boxShadow = `0 0 8px ${colors[k % colors.length]}`;
    s.style.setProperty("--dx", Math.cos(a)*d + "px");
    s.style.setProperty("--dy", Math.sin(a)*d + "px");
    fx.appendChild(s);
    setTimeout(()=>s.remove(), 1000);
  }
}

/* =========================================================
   门后的内容（和 824 的信同一套：文字 / 影片 / 图片 / 链接 / 作者）
========================================================= */
function parseList(v, fallback){
  let arr = [];
  if(v){ try{ arr = typeof v === "string" ? JSON.parse(v) : v; }catch(_){ arr = []; } }
  if(!Array.isArray(arr)) arr = [];
  if(!arr.length && fallback) arr = [fallback];
  return arr.filter(Boolean);
}
function videoBlock(url){
  const u = (url||"").trim();
  if(!u) return "";
  if(/\.(mp4|webm|mov)(\?|$)/i.test(u)){
    return `<video class="sheet-video" src="${escapeHtml(u)}" controls playsinline webkit-playsinline x5-playsinline preload="metadata"></video>`;
  }
  let embed = u;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if(yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
  const bv = u.match(/bilibili\.com\/video\/(BV[\w]+)/);
  if(bv) embed = `https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0`;
  return `<iframe class="sheet-video" src="${escapeHtml(embed)}"
    allow="accelerometer;encrypted-media;picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
}
function authorBlock(D){
  if(!D.author_name) return "";
  // CONFIG 里的路径是写给根目录 824 页的「./assets/…」，这页在 /halloween/ 底下要改成「/assets/…」
  const src = ((window.CONFIG && window.CONFIG.AUTHOR_AVATAR) || "").replace(/^\.\//, "/");
  const av = src
    ? `<img class="av" src="${escapeHtml(src)}" alt="">`
    : `<div class="av">${escapeHtml(initial(D.author_name))}</div>`;
  return `<div class="sheet-author">${av}
    <div><div class="n">${escapeHtml(D.author_name)}</div>
      ${D.author_bio ? `<div class="b">${escapeHtml(D.author_bio)}</div>` : ""}</div>
  </div>`;
}
function sheetHead(D, i){
  return `<div class="sheet-no">NO.${pad2(i+1)}</div>
    <h2 class="sheet-title">${escapeHtml(D.title || "未命名")}</h2>
    <div class="sheet-rule"></div>`;
}

let modalIdx = -1;
function showContent(D, i){
  $("#sheet-paper").innerHTML = sheetHead(D, i)
    + (D.body ? `<div class="sheet-body">${escapeHtml(D.body)}</div>` : "")
    + parseList(D.videos, D.video).map(videoBlock).join("")
    + parseList(D.images, D.image).map(u=>`<img class="sheet-media" src="${escapeHtml(u)}" alt="" loading="lazy">`).join("")
    + (D.link ? `<a class="sheet-link" href="${escapeHtml(D.link)}" target="_blank" rel="noopener">${escapeHtml(D.link_text || "点击查看")}</a>` : "")
    + authorBlock(D);
  openModal(i);
}
function showTeaser(D, i){
  $("#sheet-paper").innerHTML = sheetHead(D, i)
    + (D.teaser_text ? `<div class="sheet-body">${escapeHtml(D.teaser_text)}</div>` : "")
    + (D.teaser_image ? `<div class="teaser-img-wrap"><img src="${escapeHtml(D.teaser_image)}" alt="" loading="lazy"></div>` : "")
    + `<div class="teaser-note">这扇门还锁着</div>
       <div class="teaser-countdown" data-teaser></div>`;
  openModal(i);
  refreshTeaserCountdown();
}
// 预告弹窗开着时，倒计时也跟着走
function refreshTeaserCountdown(){
  const el = $("[data-teaser]");
  if(!el || modalIdx < 0 || !DOORS[modalIdx]) return;
  const D = DOORS[modalIdx];
  if(isUnlocked(D)){ el.textContent = "时间到了！关掉去推门吧"; return; }
  if(!D.unlock_at){ el.textContent = "开启时间待定"; return; }
  const ms = Date.parse(D.unlock_at) - now();
  el.textContent = ms > 0 ? `还有 ${fmtCountdown(ms)}` : "正在开锁……";
}

function openModal(i){
  modalIdx = i;
  $("#sheet-paper").scrollTop = 0;
  $("#door-modal").classList.add("show");
}
function closeModal(){
  $("#door-modal").classList.remove("show");
  // 停掉还在播的影片
  $$("#sheet-paper video").forEach(v=>{ try{ v.pause(); }catch(e){} });
  $("#sheet-paper").innerHTML = "";
  // 门从大开退回虚掩
  const s = slideEls()[modalIdx];
  if(s) $(".door", s).classList.remove("opening");
  modalIdx = -1;
  refreshStates();
}
$$("[data-close]").forEach(b => b.onclick = closeModal);
$("#door-modal").onclick = (e)=>{ if(e.target === e.currentTarget) closeModal(); };

/* =========================================================
   启动
========================================================= */
if(PREVIEW_KEY){ document.body.classList.add("is-preview"); $("#preview-flag").textContent = "预览模式 · 全部解锁"; }
if(DEMO){ document.body.classList.add("is-demo"); $("#preview-flag").textContent = "演示模式 · 假资料"; }
setupSky();
loadDoors();
setInterval(refreshStates, 1000);
// 兜底：10 分钟抓一次（管理员改了内容、新增了门也等得到）
if(!DEMO) setInterval(()=>{ if(!document.hidden) loadDoors(); }, 10*60*1000);
setInterval(spawnBat, 6500);
setTimeout(spawnBat, 1200);
