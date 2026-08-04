/* =========================================================
   洋灵许愿树 v2 · 主逻辑
   - 48 封信，每半小时解锁一封（中国时间 824 当天）
   - 未解锁只显示预告，完整内容由服务端 RPC 控制不下发
   - 物料 × 作者 连连看（不储存进度）
========================================================= */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const SVG_NS = "http://www.w3.org/2000/svg";
const CHINA_OFFSET = 8*60;

/* ---------- URL 参数 ---------- */
const QS = new URLSearchParams(location.search);
const PREVIEW_KEY  = QS.get("preview") || "";           // ?preview=<管理密钥> → 全解锁
const FORCE_SAKURA = QS.has("sakura") || QS.has("test"); // ?sakura=1 → 强制樱花雨
const DEMO         = QS.has("demo");                     // ?demo=1  → 用本地假数据，不连后台
// ?slot=N 假装现在是第 N 个时段（只在 demo 下生效，用来测解锁效果）
const FAKE_SLOT    = QS.has("slot") ? Math.max(-1, Math.min(47, parseInt(QS.get("slot")))) : null;
// ?phase=teaser|reveal|archive 强制某个阶段，给客户预览三天的样子
const FORCE_PHASE  = ["teaser","reveal","archive"].includes(QS.get("phase")) ? QS.get("phase") : null;

/* ---------- 时间工具 ---------- */
function nowChina(){
  const d = new Date();
  return new Date(d.getTime() + d.getTimezoneOffset()*60000 + CHINA_OFFSET*60000);
}
function isAug24China(){ const c = nowChina(); return c.getMonth()===7 && c.getDate()===24; }

/* ---------- 三个阶段 ----------
   823 及之前 = "teaser"  预告 + 连连看，没有完整内容
   824        = "reveal"  每半小时挂一封上树，不显示预告信封，没有连连看
   825 及之后 = "archive" 48 封全开，没有连连看
*/
function currentPhase(){
  if(FORCE_PHASE) return FORCE_PHASE;
  const c = nowChina(), m = c.getMonth(), d = c.getDate();
  if(m === 7 && d === 24) return "reveal";
  if(m > 7 || (m === 7 && d >= 25)) return "archive";
  return "teaser";
}
// 当天已过的半小时数：00:00→0, 00:30→1 … 23:30→47
function currentSlot(){ const c = nowChina(); return c.getHours()*2 + (c.getMinutes()>=30 ? 1 : 0); }
function slotLabel(i){
  return `${String(Math.floor(i/2)).padStart(2,"0")}:${(i%2)===0 ? "00" : "30"}`;
}
// 距离某个 slot 解锁还有多久（毫秒）；已过则返回 0
function msUntilSlot(slot){
  const c = nowChina();
  const target = new Date(c); target.setHours(Math.floor(slot/2), (slot%2)*30, 0, 0);
  const diff = target - c;
  return diff > 0 ? diff : 0;
}

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove("show"), 2400);
}
function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initial(name){ return (name||"?").trim().charAt(0).toUpperCase(); }

/* =========================================================
   樱花雨
========================================================= */
const SAKURA_COLORS = ["#f9c6d9","#f7b5cf","#fbd9e6","#f4a0c0","#ffe3ee"];
function petalSVG(color){
  // 单片花瓣：一端圆一端尖
  return `<svg width="100%" height="100%" viewBox="0 0 20 20" style="animation-duration:${(2+Math.random()*2).toFixed(1)}s">
    <path d="M10 1 C15 5, 18 11, 10 19 C2 11, 5 5, 10 1 Z" fill="${color}" opacity="${(0.65+Math.random()*0.35).toFixed(2)}"/>
    <path d="M10 4 C12 8, 12 13, 10 17" stroke="rgba(255,255,255,.55)" stroke-width=".8" fill="none"/>
  </svg>`;
}
function spawnPetal(){
  const p = document.createElement("div");
  p.className = "petal";
  const size = 9 + Math.random()*14;
  p.style.left  = (Math.random()*104 - 2) + "vw";
  p.style.width = size + "px";
  p.style.height= size + "px";
  p.style.setProperty("--drift", (Math.random()*30 - 12) + "vw");
  p.style.animationDuration = (8 + Math.random()*8) + "s";
  p.innerHTML = petalSVG(SAKURA_COLORS[Math.floor(Math.random()*SAKURA_COLORS.length)]);
  $("#petals").appendChild(p);
  setTimeout(()=>p.remove(), 17000);
}
let sakuraTimer = null;
function startSakura(){
  if(sakuraTimer) return;
  sakuraTimer = setInterval(spawnPetal, 420);
  for(let i=0;i<14;i++) setTimeout(spawnPetal, i*200);
}
function stopSakura(){
  if(!sakuraTimer) return;
  clearInterval(sakuraTimer); sakuraTimer = null;
}

/* =========================================================
   Supabase
========================================================= */
let sb = null;
if(window.CONFIG && window.CONFIG.SUPABASE_URL && window.CONFIG.SUPABASE_URL.indexOf("你的") < 0){
  sb = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
}
if(window.CONFIG && window.CONFIG.BG_IMAGE){
  $("#bg").style.backgroundImage = `url("${window.CONFIG.BG_IMAGE}")`;
}
if(PREVIEW_KEY) document.body.classList.add("is-preview");

/* =========================================================
   信封网格
========================================================= */
let LETTERS = [];   // 服务端返回的 48 封（含解锁状态）

function envelopeSVG(){
  return `<svg viewBox="0 0 80 60" xmlns="${SVG_NS}">
    <rect x="2" y="8" width="76" height="50" rx="5" fill="var(--envelope)" stroke="var(--envelope-dark)" stroke-width="1.2"/>
    <path d="M2 13 L40 40 L78 13" fill="none" stroke="rgba(120,140,170,.55)" stroke-width="1.2"/>
    <path class="flap" d="M2 12 L40 38 L78 12 L78 8 L2 8 Z" fill="#dde7f3" stroke="var(--envelope-dark)" stroke-width="1.2"/>
    <circle class="seal" cx="40" cy="30" r="7" fill="var(--sakura)" opacity=".9"/>
    <circle class="seal" cx="40" cy="30" r="3" fill="#fff" opacity=".75"/>
  </svg>`;
}

function renderGrid(){
  const grid  = $("#grid");
  const phase = currentPhase();

  // 824 / 825 只挂已解锁的信；823 挂全部（都是预告态）
  const list = (phase === "teaser") ? LETTERS : LETTERS.filter(L => L.unlocked);

  if(!list.length){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${
      phase === "reveal"
        ? "第一封信 00:00 开启<br>再等一会儿 🌸"
        : "信件还在准备中…<br>824 当天每半小时开启一封 🌸"
    }</div>`;
    return;
  }

  grid.innerHTML = "";
  list.forEach(L => {
    const btn = document.createElement("button");
    btn.className = "env " + (L.unlocked ? "unlocked" : "locked");
    btn.innerHTML = envelopeSVG() + `<span class="slot-label">${slotLabel(L.slot)}</span>`;
    btn.addEventListener("click", ()=>{
      if(L.unlocked) btn.classList.add("open");
      openLetter(L);
    });
    grid.appendChild(btn);
  });
}

async function loadLetters(){
  // 演示模式：用本地假数据，可用 ?slot=N 指定「现在是第几个时段」
  if(DEMO && window.DEMO_DATA){
    const phase = currentPhase();
    // 预告期一封都不开；824 按时段开；825 全开
    const max = phase === "teaser"  ? -1
              : phase === "archive" ? 47
              : (FAKE_SLOT !== null ? FAKE_SLOT : currentSlot());
    LETTERS = window.DEMO_DATA.letters.map(L => ({ ...L, unlocked: L.slot <= max }));
    renderGrid();
    return;
  }
  if(!sb){ renderGrid(); return; }
  try{
    const fn   = PREVIEW_KEY ? "preview_get_letters" : "public_get_letters";
    const args = PREVIEW_KEY ? { p_key: PREVIEW_KEY } : {};
    const { data, error } = await sb.rpc(fn, args);
    if(error) throw error;
    LETTERS = data || [];
  }catch(e){
    console.warn("loadLetters", e);
    if(PREVIEW_KEY) toast("预览密钥错误");
  }
  renderGrid();
}

/* =========================================================
   信件弹窗
========================================================= */
function authorBlock(L){
  if(!L.author_name) return "";
  const av = L.author_avatar
    ? `<img class="av" src="${escapeHtml(L.author_avatar)}" alt="">`
    : `<div class="av">${escapeHtml(initial(L.author_name))}</div>`;
  return `<div class="sheet-author">
    ${av}
    <div class="meta">
      <div class="n">${escapeHtml(L.author_name)}</div>
      ${L.author_bio ? `<div class="b">${escapeHtml(L.author_bio)}</div>` : ""}
    </div>
  </div>`;
}

// 视频：mp4 直链用 <video>，YouTube/Bilibili 用 iframe
function videoBlock(url){
  if(!url) return "";
  const u = url.trim();
  if(/\.(mp4|webm|mov)(\?|$)/i.test(u)){
    return `<video class="sheet-video" src="${escapeHtml(u)}" controls playsinline preload="metadata"></video>`;
  }
  let embed = u;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if(yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
  const bv = u.match(/bilibili\.com\/video\/(BV[\w]+)/);
  if(bv) embed = `https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0`;
  return `<iframe class="sheet-video" src="${escapeHtml(embed)}"
    allow="accelerometer;encrypted-media;picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
}

function openLetter(L){
  const paper = $("#sheet-paper");
  const head = `
    <div class="sheet-slot">${slotLabel(L.slot)}</div>
    <h2 class="sheet-title">${escapeHtml(L.title || "第 " + (L.slot+1) + " 封")}</h2>
    <div class="sheet-club">2026</div>
    <div class="sheet-rule"></div>`;

  if(L.unlocked){
    paper.innerHTML = head
      + (L.body  ? `<div class="sheet-body">${escapeHtml(L.body)}</div>` : "")
      + videoBlock(L.video)
      + (L.image ? `<img class="sheet-media" src="${escapeHtml(L.image)}" alt="" loading="lazy">` : "")
      + (L.link  ? `<a class="sheet-link" href="${escapeHtml(L.link)}" target="_blank" rel="noopener">${escapeHtml(L.link_text || "点击查看")}</a>` : "")
      + authorBlock(L);
  }else{
    const wait = msUntilSlot(L.slot);
    const isToday = isAug24China() || DEMO;
    let cd;
    if(!isToday){
      cd = "824 当天开启";
    }else if(DEMO){
      cd = `${slotLabel(L.slot)} 开启`;
    }else if(wait > 0){
      const h = Math.floor(wait/36e5), m = Math.floor(wait%36e5/6e4);
      cd = h > 0 ? `还有 ${h} 小时 ${m} 分` : `还有 ${m} 分钟`;
    }else{
      cd = "即将开启…";
    }
    paper.innerHTML = head
      + (L.teaser_text ? `<div class="sheet-body">${escapeHtml(L.teaser_text)}</div>` : "")
      + (L.teaser_image ? `<div class="teaser-img-wrap"><img src="${escapeHtml(L.teaser_image)}" alt="" loading="lazy"></div>` : "")
      + `<div class="teaser-note">这封信还没到开启的时候</div>
         <div class="teaser-countdown">${cd}</div>`;
  }

  paper.scrollTop = 0;
  openOverlay("#letter-modal");
}

/* =========================================================
   连连看：左物料 → 右作者，拖线配对（不储存）
========================================================= */
const GAME = { items:[], authors:[], matched:new Set(), drag:null, picked:null, suppressClick:false };

function buildGameData(){
  // 只用已解锁、且绑定了作者的信
  const pool = LETTERS.filter(L => L.unlocked && L.author_id);
  // 每位作者最多取 3 个物料，避免一位作者刷屏
  const perAuthor = {};
  const items = [];
  pool.forEach(L => {
    perAuthor[L.author_id] = (perAuthor[L.author_id]||0) + 1;
    if(perAuthor[L.author_id] <= 3) items.push(L);
  });

  const authorMap = new Map();
  items.forEach(L => {
    if(!authorMap.has(L.author_id)){
      authorMap.set(L.author_id, {
        id:L.author_id, name:L.author_name, avatar:L.author_avatar, bio:L.author_bio, count:0
      });
    }
    authorMap.get(L.author_id).count++;
  });

  GAME.items   = shuffle(items.slice(0, 12));   // 一局最多 12 个物料
  GAME.authors = shuffle(Array.from(authorMap.values()));
  GAME.matched = new Set();
  GAME.picked  = null;
  GAME.drag    = null;
}
function shuffle(a){
  const r = a.slice();
  for(let i=r.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [r[i],r[j]] = [r[j],r[i]]; }
  return r;
}

function renderGame(){
  const ci = $("#col-items"), ca = $("#col-authors");
  $("#game-done").classList.remove("show");
  clearWires();

  if(GAME.items.length < 2 || GAME.authors.length < 2){
    ci.innerHTML = `<div class="empty" style="color:var(--ink-soft);text-shadow:none">
      还没有足够的物料<br>等信件解锁后再来玩 🌸</div>`;
    ca.innerHTML = "";
    $("#game-score").textContent = "";
    return;
  }

  ci.innerHTML = `<div class="col-head">物料</div>` + GAME.items.map(L => `
    <div class="node node-item" data-id="${L.id}" data-author="${L.author_id}">
      ${L.image ? `<img class="thumb" src="${escapeHtml(L.image)}" alt="" loading="lazy">` : ""}
      <div class="nm">${escapeHtml(L.title || "物料")}</div>
      <div class="sub">${slotLabel(L.slot)}</div>
      <div class="port"></div>
    </div>`).join("");

  ca.innerHTML = `<div class="col-head">作者</div>` + GAME.authors.map(A => `
    <div class="node node-author" data-author="${A.id}">
      <div class="port"></div>
      ${A.avatar ? `<img class="av" src="${escapeHtml(A.avatar)}" alt="">`
                 : `<div class="av">${escapeHtml(initial(A.name))}</div>`}
      <div style="min-width:0">
        <div class="nm">${escapeHtml(A.name)}</div>
        ${A.bio ? `<div class="sub">${escapeHtml(A.bio)}</div>` : ""}
      </div>
      <div class="cnt">${A.count} 个</div>
    </div>`).join("");

  updateScore();
  bindDrag();
}

function updateScore(){
  $("#game-score").textContent = `已连对 ${GAME.matched.size} / ${GAME.items.length}`;
}

/* ---------- 连线画布 ----------
   坐标系 = #game-cols（会跟着一起滚动），所以线不会和卡片错位 */
function clearWires(){ $("#wires").innerHTML = ""; ensureDefs(); }
function syncWireCanvas(){
  const cols = $("#game-cols");
  $("#wires").style.height = cols.scrollHeight + "px";
}
function areaPoint(el, side){
  const base = $("#game-cols").getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    x: (side === "right" ? r.right : r.left) - base.left,
    y: r.top + r.height/2 - base.top
  };
}
// 把屏幕坐标换算到画布坐标
function toCanvas(clientX, clientY){
  const base = $("#game-cols").getBoundingClientRect();
  return { x: clientX - base.left, y: clientY - base.top };
}
function drawWire(p1, p2, cls){
  const path = document.createElementNS(SVG_NS, "path");
  const dx = Math.abs(p2.x - p1.x) * 0.45;
  path.setAttribute("d", `M${p1.x} ${p1.y} C${p1.x+dx} ${p1.y}, ${p2.x-dx} ${p2.y}, ${p2.x} ${p2.y}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", "3.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke", cls === "ok" ? "url(#goldG)" : "#f90092");
  if(cls !== "ok") path.setAttribute("opacity", ".7");
  path.dataset.kind = cls;
  $("#wires").appendChild(path);
  return path;
}
function ensureDefs(){
  if($("#goldG")) return;
  const defs = document.createElementNS(SVG_NS, "defs");
  defs.innerHTML = `<linearGradient id="goldG" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffd76b"/><stop offset="1" stop-color="#f5b942"/>
    </linearGradient>`;
  $("#wires").appendChild(defs);
}
// 重画所有已连对的线（布局变化后位置会变）
function redrawMatched(){
  syncWireCanvas();
  $$("#wires path").forEach(p => { if(p.dataset.kind === "ok") p.remove(); });
  GAME.matched.forEach(id => {
    const item = document.querySelector(`.node-item[data-id="${id}"]`);
    if(!item) return;
    const au = document.querySelector(`.node-author[data-author="${item.dataset.author}"]`);
    if(!au) return;
    drawWire(areaPoint(item,"right"), areaPoint(au,"left"), "ok");
  });
}

/* ---------- 交互：点选 + 拖拽 两种都支持 ----------
   手机上「点物料 → 点作者」比拖拽可靠得多，所以两种并存。 */
function bindDrag(){
  ensureDefs();
  syncWireCanvas();
  $$("#col-items .node-item").forEach(node => {
    node.addEventListener("pointerdown", onDragStart);
    node.addEventListener("click", ()=> pickItem(node));
  });
  $$("#col-authors .node-author").forEach(node => {
    node.addEventListener("click", ()=> pickAuthor(node));
  });
  $("#game-area").addEventListener("scroll", redrawMatched);
}

/* ---- 点选 ---- */
function clearPick(){
  GAME.picked = null;
  $$(".node").forEach(n => n.classList.remove("picked","dimmed-node"));
}
function pickItem(node){
  if(GAME.suppressClick){ GAME.suppressClick = false; return; }   // 刚拖完，别再当点击
  if(GAME.matched.has(+node.dataset.id)) return;
  if(GAME.picked === node){ clearPick(); return; }
  clearPick();
  GAME.picked = node;
  node.classList.add("picked");
  // 把其他物料压暗，提示「现在去点作者」
  $$("#col-items .node-item").forEach(n => { if(n !== node && !n.classList.contains("matched")) n.classList.add("dimmed-node"); });
}
function pickAuthor(node){
  if(GAME.suppressClick){ GAME.suppressClick = false; return; }
  if(!GAME.picked){ toast("先点左边一个物料 🌸"); return; }
  const item = GAME.picked;
  clearPick();
  resolveMatch(item, node);
}

/* ---- 判定（点选和拖拽共用） ---- */
function resolveMatch(item, author){
  if(author.dataset.author === item.dataset.author){
    GAME.matched.add(+item.dataset.id);
    item.classList.add("matched");
    author.classList.add("matched");
    drawWire(areaPoint(item,"right"), areaPoint(author,"left"), "ok");
    updateScore();
    if(GAME.matched.size === GAME.items.length){
      setTimeout(()=>{ $("#game-done").classList.add("show"); startFireworks(); }, 450);
    }
    return true;
  }
  item.classList.add("shake");
  author.classList.add("shake");
  setTimeout(()=>{ item.classList.remove("shake"); author.classList.remove("shake"); }, 420);
  return false;
}

/* ---- 拖拽 ---- */
function onDragStart(e){
  const node = e.currentTarget;
  if(GAME.matched.has(+node.dataset.id)) return;
  node.classList.add("active");

  const start = areaPoint(node, "right");
  GAME.drag = { node, start, temp:null, moved:false, pointerId:e.pointerId };

  // 注意：不要在这里 setPointerCapture —— 会让后续的 click 事件改道，
  // 导致「点选」模式失效。等真正拖起来了再捕获。
  node.addEventListener("pointermove", onDragMove);
  node.addEventListener("pointerup",   onDragEnd);
  node.addEventListener("pointercancel", onDragEnd);
}

function onDragMove(e){
  if(!GAME.drag) return;
  const d = GAME.drag;
  // 移动超过阈值才算拖拽（否则当作点击，不阻止页面滚动）
  const p = toCanvas(e.clientX, e.clientY);
  if(!d.moved){
    if(Math.hypot(p.x - d.start.x, p.y - d.start.y) < 12) return;
    d.moved = true;
    try{ d.node.setPointerCapture(d.pointerId); }catch(_){}   // 确认是拖拽后才捕获
  }
  e.preventDefault();
  if(d.temp) d.temp.remove();
  d.temp = drawWire(d.start, p, "temp");
  $$("#col-authors .node-author").forEach(a => a.classList.remove("active"));
  const hit = authorAt(e.clientX, e.clientY);
  if(hit) hit.classList.add("active");
}

function onDragEnd(e){
  if(!GAME.drag) return;
  const { node, temp, moved } = GAME.drag;
  if(temp) temp.remove();
  node.classList.remove("active");
  node.removeEventListener("pointermove", onDragMove);
  node.removeEventListener("pointerup",   onDragEnd);
  node.removeEventListener("pointercancel", onDragEnd);
  $$("#col-authors .node-author").forEach(a => a.classList.remove("active"));
  GAME.drag = null;

  if(!moved) return;                 // 没拖动 → 交给 click 走点选逻辑
  GAME.suppressClick = true;         // 拖过了 → 别再触发点选
  setTimeout(()=>{ GAME.suppressClick = false; }, 350);

  const target = authorAt(e.clientX, e.clientY);
  if(target) resolveMatch(node, target);
}

// 手指/鼠标落点下的作者卡
function authorAt(x, y){
  const el = document.elementFromPoint(x, y);
  return el ? el.closest(".node-author") : null;
}

/* =========================================================
   弹窗开关
========================================================= */
function openOverlay(sel){
  $(sel).classList.add("show");
  document.body.classList.add("dimmed");
}
function closeOverlay(el){
  el.classList.remove("show");
  if(!$$(".overlay.show").length) document.body.classList.remove("dimmed");
  $$(".env.open").forEach(e => e.classList.remove("open"));
}
$$("[data-close]").forEach(b => b.onclick = ()=> closeOverlay(b.closest(".overlay")));
$$(".overlay").forEach(o => o.onclick = (e)=>{ if(e.target === o) closeOverlay(o); });

$("#btn-match").onclick = ()=>{
  buildGameData();
  openOverlay("#match-modal");
  requestAnimationFrame(renderGame);   // 等布局稳定再算坐标
};
$("#game-restart").onclick = ()=>{ buildGameData(); renderGame(); };

$("#btn-sakura").onclick = ()=>{
  if(sakuraTimer){ stopSakura(); toast("樱花已停 🌿"); }
  else{ startSakura(); toast("樱花飘落中 🌸"); }
};

addEventListener("resize", ()=>{ if($("#match-modal").classList.contains("show")) redrawMatched(); });

/* =========================================================
   阶段切换：控制连连看按钮 / 副标题
========================================================= */
function applyPhase(){
  const phase = currentPhase();
  document.body.dataset.phase = phase;
  // 连连看只在 823（预告期）出现
  $("#btn-match").style.display = (phase === "teaser") ? "" : "none";
  $("#subtitle").textContent =
    phase === "teaser"  ? "先玩连连看，认识每一位创作者 🌸" :
    phase === "reveal"  ? "每半小时，一封信挂上树" :
                          "48 封信，全部在这里了";
}

/* =========================================================
   倒计时
========================================================= */
function updateCountdown(){
  const c = nowChina();
  const phase = currentPhase();

  if(phase === "archive"){
    $("#countdown").textContent = "🌸 824 已过 · 感谢每一位创作者";
    return;
  }
  if(phase === "reveal"){
    const s = (DEMO && FAKE_SLOT !== null) ? FAKE_SLOT : currentSlot();
    $("#countdown").textContent = `🎉 824 快乐 · 已开启 ${Math.max(0,s+1)} / 48 封`;
    return;
  }
  // teaser：倒数到 824 00:00
  if(DEMO){ $("#countdown").textContent = "演示模式 · 预告期"; return; }
  const target = new Date(Date.UTC(c.getFullYear(), 7, 24, -8, 0, 0));
  let t = target - new Date();
  if(t < 0){ target.setUTCFullYear(c.getFullYear()+1); t = target - new Date(); }
  const d = Math.floor(t/864e5), h = Math.floor(t%864e5/36e5), m = Math.floor(t%36e5/6e4);
  $("#countdown").textContent = `距离 824 还有 ${d} 天 ${h} 小时 ${m} 分`;
}

/* =========================================================
   烟花
========================================================= */
let fwRunning = false;
function startFireworks(){
  if(fwRunning) return; fwRunning = true;
  const cv = $("#fireworks"); cv.style.display = "block";
  const ctx = cv.getContext("2d");
  function resize(){ cv.width = innerWidth; cv.height = innerHeight; }
  resize(); addEventListener("resize", resize);
  const parts = [], colors = ["#f7b5cf","#ffd76b","#ffc2dd","#a0e7ff","#fff6fb"];
  function boom(x,y){
    const col = colors[Math.floor(Math.random()*colors.length)];
    for(let i=0;i<54;i++){
      const a = Math.PI*2*i/54, sp = Math.random()*4+2;
      parts.push({x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:60, col});
    }
  }
  function loop(){
    ctx.clearRect(0,0,cv.width,cv.height);
    if(Math.random() < 0.05) boom(Math.random()*cv.width, Math.random()*cv.height*0.6);
    parts.forEach((p,i)=>{
      p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life--;
      ctx.globalAlpha = Math.max(0, p.life/60);
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, 7); ctx.fill();
      if(p.life <= 0) parts.splice(i,1);
    });
    ctx.globalAlpha = 1;
    if(fwRunning) requestAnimationFrame(loop);
  }
  loop();
  setTimeout(()=>{ fwRunning = false; cv.style.display = "none"; }, 9000);
}

/* =========================================================
   启动
========================================================= */
applyPhase();
loadLetters();
setInterval(loadLetters, 30000);      // 每 30 秒刷新解锁状态 / 新上线的信

updateCountdown();
setInterval(updateCountdown, 30000);
// 跨日自动切换阶段（00:00 一过，页面自己变，不用粉丝刷新）
setInterval(applyPhase, 30000);

// 樱花：824 当天自动飘；?sakura=1 / ?test=1 强制开启（给客户预览）
if(isAug24China() || FORCE_SAKURA || PREVIEW_KEY || DEMO) startSakura();
setInterval(()=>{ if(isAug24China()) startSakura(); }, 60000);
