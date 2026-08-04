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
   连连看 · 分关消除式（不储存进度）
   1 作者 = 1 作品，48 对拆成每关 6 对。
   点一个作品 → 点它的作者：对了两张卡化成樱花瓣飘走，
   错了抖一下。全程没有连线，一屏永远只有 12 张卡。
========================================================= */
const PAIRS_PER_ROUND = 6;
const GAME = { rounds:[], round:0, matchedInRound:0, picked:null };

function shuffle(a){
  const r = a.slice();
  for(let i=r.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [r[i],r[j]] = [r[j],r[i]]; }
  return r;
}

function buildGameData(){
  // 连连看只在 823 预告期出现，那时一封都还没解锁，
  // 所以不看解锁状态，只要绑了作者就能玩（作者本身不是秘密）
  const pool = shuffle(LETTERS.filter(L => L.author_id));
  GAME.rounds = [];
  for(let i = 0; i < pool.length; i += PAIRS_PER_ROUND){
    GAME.rounds.push(pool.slice(i, i + PAIRS_PER_ROUND));
  }
  // 最后一关不足 2 对就并进前一关
  if(GAME.rounds.length > 1 && GAME.rounds[GAME.rounds.length-1].length < 2){
    GAME.rounds[GAME.rounds.length-2].push(...GAME.rounds.pop());
  }
  GAME.round = 0;
  GAME.matchedInRound = 0;
  GAME.picked = null;
}

function renderGame(){
  $("#game-done").classList.remove("show");
  renderRound();
}

function renderRound(){
  const ci = $("#col-items"), ca = $("#col-authors");
  const list = GAME.rounds[GAME.round] || [];
  GAME.matchedInRound = 0;
  GAME.picked = null;

  if(!GAME.rounds.length || list.length < 2){
    ci.innerHTML = `<div class="empty" style="color:var(--ink-soft);text-shadow:none">
      作品还在准备中<br>晚点再来玩 🌸</div>`;
    ca.innerHTML = "";
    $("#game-score").textContent = "";
    return;
  }

  // 左：作品（类型 chip + 作品名）；右：作者（头像 + 名字 + 身份）
  // 两列各自打乱，顺序对不上才有得玩
  ci.innerHTML = `<div class="col-head">作品</div>` + shuffle(list).map(L => `
    <div class="node node-item" data-author="${L.author_id}">
      ${L.tag ? `<span class="tag">${escapeHtml(L.tag)}</span>` : ""}
      <div class="nm">${escapeHtml(L.title || "作品")}</div>
    </div>`).join("");

  ca.innerHTML = `<div class="col-head">作者</div>` + shuffle(list).map(L => `
    <div class="node node-author" data-author="${L.author_id}">
      ${L.author_avatar ? `<img class="av" src="${escapeHtml(L.author_avatar)}" alt="">`
                        : `<div class="av">${escapeHtml(initial(L.author_name))}</div>`}
      <div style="min-width:0">
        <div class="nm">${escapeHtml(L.author_name)}</div>
        ${L.author_bio ? `<div class="sub">${escapeHtml(L.author_bio)}</div>` : ""}
      </div>
    </div>`).join("");

  updateScore();

  $$("#game-cols .node").forEach(node => {
    node.addEventListener("click", ()=> onCardTap(node));
  });
}

function updateScore(){
  $("#game-score").textContent =
    `第 ${GAME.round+1} / ${GAME.rounds.length} 关 · 本关 ${GAME.matchedInRound} / ${(GAME.rounds[GAME.round]||[]).length} 对`;
}

/* ---- 点选：两列都能先点，点另一列的卡就判定 ---- */
function onCardTap(node){
  if(node.classList.contains("gone")) return;

  if(GAME.picked === node){                       // 再点一次 = 取消
    node.classList.remove("picked");
    GAME.picked = null;
    return;
  }
  if(!GAME.picked){                               // 第一张
    GAME.picked = node;
    node.classList.add("picked");
    return;
  }
  const a = GAME.picked, b = node;
  const sameSide = a.classList.contains("node-item") === b.classList.contains("node-item");
  if(sameSide){                                   // 同一列 → 换选
    a.classList.remove("picked");
    GAME.picked = b;
    b.classList.add("picked");
    return;
  }
  // 一作品一作者 → 判定
  a.classList.remove("picked");
  GAME.picked = null;
  if(a.dataset.author === b.dataset.author){
    matchPair(a, b);
  }else{
    a.classList.add("shake"); b.classList.add("shake");
    setTimeout(()=>{ a.classList.remove("shake"); b.classList.remove("shake"); }, 420);
  }
}

/* ---- 配对成功：樱花瓣飘走，卡片淡出 ---- */
function matchPair(a, b){
  [a, b].forEach(el => { burstPetals(el); el.classList.add("gone"); });
  GAME.matchedInRound++;
  updateScore();

  if(GAME.matchedInRound >= (GAME.rounds[GAME.round]||[]).length){
    if(GAME.round + 1 < GAME.rounds.length){
      showRoundBanner(`第 ${GAME.round+1} 关完成 🌸`);
      setTimeout(()=>{ GAME.round++; renderRound(); }, 950);
    }else{
      setTimeout(()=>{ $("#game-done").classList.add("show"); startFireworks(); }, 500);
    }
  }
}

// 在卡片位置撒一把樱花瓣
function burstPetals(el){
  const area = $("#game-area");
  const ar = area.getBoundingClientRect(), r = el.getBoundingClientRect();
  for(let i = 0; i < 6; i++){
    const p = document.createElement("div");
    p.className = "pburst";
    p.style.left = (r.left - ar.left + r.width/2 + (Math.random()*30-15)) + "px";
    p.style.top  = (r.top  - ar.top  + r.height/2 + (Math.random()*16-8) + area.scrollTop) + "px";
    p.style.background = Math.random() > 0.5 ? "var(--sakura)" : "var(--sakura-deep)";
    p.style.setProperty("--dx", (Math.random()*90-45) + "px");
    p.style.setProperty("--dy", (-30 - Math.random()*60) + "px");
    area.appendChild(p);
    setTimeout(()=>p.remove(), 900);
  }
}

function showRoundBanner(text){
  const b = $("#round-banner");
  b.querySelector("span").textContent = text;
  b.classList.add("show");
  setTimeout(()=> b.classList.remove("show"), 900);
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
  renderGame();
  openOverlay("#match-modal");
};
$("#game-restart").onclick = ()=>{ buildGameData(); renderGame(); };

$("#btn-sakura").onclick = ()=>{
  if(sakuraTimer){ stopSakura(); toast("樱花已停 🌿"); }
  else{ startSakura(); toast("樱花飘落中 🌸"); }
};

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
// #play：直接打开连连看（demo.html 的「直接玩连连看」按钮用）
if(location.hash === "#play" && currentPhase() === "teaser"){
  setTimeout(()=>{ if(LETTERS.length) $("#btn-match").click(); }, 400);
}
setInterval(loadLetters, 30000);      // 每 30 秒刷新解锁状态 / 新上线的信

updateCountdown();
setInterval(updateCountdown, 30000);
// 跨日自动切换阶段（00:00 一过，页面自己变，不用粉丝刷新）
setInterval(applyPhase, 30000);

// 樱花：824 当天自动飘；?sakura=1 / ?test=1 强制开启（给客户预览）
if(isAug24China() || FORCE_SAKURA || PREVIEW_KEY || DEMO) startSakura();
setInterval(()=>{ if(isAug24China()) startSakura(); }, 60000);
