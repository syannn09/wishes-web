/* =========================================================
   树信归期 v2 · 主逻辑
   - 52 封信，824 当天按客户时间表逐封解锁（首封 00:24）
   - 未解锁只显示预告，完整内容由服务端 RPC 控制不下发
   - 物料 × 作者 牵红线（不储存进度）
========================================================= */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const SVG_NS = "http://www.w3.org/2000/svg";
const CHINA_OFFSET = 8*60;

/* ---------- URL 参数 ---------- */
const QS = new URLSearchParams(location.search);
const PREVIEW_KEY  = QS.get("preview") || "";           // ?preview=<管理密钥> → 全解锁
const DEMO         = QS.has("demo");                     // ?demo=1  → 用本地假数据，不连后台
// ?slot=N（demo 专用）：假装「前 N+1 封已解锁」，例如 slot=0 → 1 封、slot=51 → 52 封全开
// 不写死上限，跟着实际信件数走（超出的在 loadLetters 里按实际数量夹住）
const FAKE_SLOT    = QS.has("slot") ? Math.max(-1, parseInt(QS.get("slot")) || 0) : null;
// ?phase=teaser|reveal|archive 强制某个阶段，给客户预览三天的样子
const FORCE_PHASE  = ["teaser","reveal","archive"].includes(QS.get("phase")) ? QS.get("phase") : null;
// 牵红线布局：默认左右（左作品右作者）；?layout=td 可切回上下布局
const GAME_LAYOUT  = QS.get("layout") === "td" ? "td" : "lr";

/* ---------- 时间工具 ---------- */
function nowChina(){
  const d = new Date();
  return new Date(d.getTime() + d.getTimezoneOffset()*60000 + CHINA_OFFSET*60000);
}
function isAug24China(){ const c = nowChina(); return c.getMonth()===7 && c.getDate()===24; }

/* ---------- 三个阶段 ----------
   823 及之前 = "teaser"  预告 + 牵红线，没有完整内容
   824        = "reveal"  按时间表逐封挂上树，不显示预告信封，没有牵红线
   825 及之后 = "archive" 52 封全开，没有牵红线
*/
function currentPhase(){
  if(FORCE_PHASE) return FORCE_PHASE;
  const c = nowChina(), m = c.getMonth(), d = c.getDate();
  if(m === 7 && d === 24) return "reveal";
  if(m > 7 || (m === 7 && d >= 25)) return "archive";
  return "teaser";
}
/* slot = 「当天第几分钟」开启（0:24 → 24，23:30 → 1410）。
   时间表由客户提供、管理员可在后台调整，不再是固定半小时。 */
function currentSlot(){ const c = nowChina(); return c.getHours()*60 + c.getMinutes(); }
function slotLabel(mins){
  return `${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;
}
// 距离某个 slot 解锁还有多久（毫秒）；已过则返回 0
function msUntilSlot(slot){
  const c = nowChina();
  const target = new Date(c); target.setHours(Math.floor(slot/60), slot%60, 0, 0);
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
// 上限交给后台把关（时间表就 52 个时段，占满就不能再新增），
// 前台不截断：后台有多少封就显示多少封。
let LETTERS = [];   // 服务端返回的信（按 slot 升序，含解锁状态）

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
        ? "第一封信 00:24 开启<br>再等一会儿 🌸"
        : "信件还在准备中…<br>824 当天按时间表逐封开启 🌸"
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
    // 预告期一封都不开；825 全开；824 按时间表开（?slot=N 假装前 N+1 封已开）
    const sorted = window.DEMO_DATA.letters.slice().sort((a,b)=>a.slot-b.slot);
    let unlockedCount;
    if(phase === "teaser")       unlockedCount = 0;
    else if(phase === "archive") unlockedCount = sorted.length;
    else if(FAKE_SLOT !== null)  unlockedCount = Math.min(FAKE_SLOT + 1, sorted.length);
    else                         unlockedCount = sorted.filter(L => L.slot <= currentSlot()).length;
    LETTERS = sorted.map((L,i) => ({ ...L, unlocked: i < unlockedCount }));
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
// 作者头像：统一用 CONFIG.AUTHOR_AVATAR（客户提供的同一张图）；
// 没配置时退回单人头像/首字母
function avatarSrc(L){
  return (window.CONFIG && window.CONFIG.AUTHOR_AVATAR) || L.author_avatar || "";
}
function authorBlock(L){
  if(!L.author_name) return "";
  const src = avatarSrc(L);
  const av = src
    ? `<img class="av" src="${escapeHtml(src)}" alt="">`
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
// 一封信的图片：新的 images 阵列优先，没有就退回旧的单图 image
function letterImages(L){
  let arr = [];
  if(L.images){
    try{ arr = typeof L.images === "string" ? JSON.parse(L.images) : L.images; }catch(_){ arr = []; }
  }
  if(!Array.isArray(arr)) arr = [];
  if(!arr.length && L.image) arr = [L.image];
  return arr.filter(Boolean);
}

// 一封信的影片：新的 videos 阵列优先，没有就退回旧的单支 video（和图片同一套路）
function letterVideos(L){
  let arr = [];
  if(L.videos){
    try{ arr = typeof L.videos === "string" ? JSON.parse(L.videos) : L.videos; }catch(_){ arr = []; }
  }
  if(!Array.isArray(arr)) arr = [];
  if(!arr.length && L.video) arr = [L.video];
  return arr.filter(Boolean);
}

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
    <h2 class="sheet-title">${escapeHtml(L.title || "未命名")}</h2>
    <div class="sheet-club">2026</div>
    <div class="sheet-rule"></div>`;

  if(L.unlocked){
    paper.innerHTML = head
      + (L.body  ? `<div class="sheet-body">${escapeHtml(L.body)}</div>` : "")
      + letterVideos(L).map(u => videoBlock(u)).join("")
      + letterImages(L).map(u=>`<img class="sheet-media" src="${escapeHtml(u)}" alt="" loading="lazy">`).join("")
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
   牵红线 · 分关消除式（不储存进度）
   1 作者 = 1 作品，52 对拆成每关 4 对。
   点一个作品 → 点它的作者：对了两张卡化成樱花瓣飘走，
   错了红线绷断、弹一下「牵错啦」，两张卡放回去继续牵 ——
   答错不结束本局，也不用把错的重新连回对的，直到牵完为止。
========================================================= */
const PAIRS_PER_ROUND = 4;
const GAME = { rounds:[], round:0, matchedInRound:0, picked:null, tied:[], lock:false,
               totalTied:0 };

function shuffle(a){
  const r = a.slice();
  for(let i=r.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [r[i],r[j]] = [r[j],r[i]]; }
  return r;
}

/* ---- 进度存档（sessionStorage）----
   只存在玩家自己的浏览器、不上传服务器；关掉分页就清空。
   存的是「这一局的信件顺序 + 打到第几关 + 总共牵好几根」——
   关卡是随机分的，不把顺序一起存下来，下次重开「第 3 关」会是另一批信。
   本关已牵好的那几对不恢复，重开本关从头牵（总数不会倒退）。 */
const SAVE_KEY = "wishes.match.v1";

function saveGame(){
  try{
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({
      order:     GAME.rounds.flat().map(L => L.id),  // 本局的信件顺序
      round:     GAME.round,
      totalTied: GAME.totalTied
    }));
  }catch(e){ /* 隐私模式下 sessionStorage 可能不可用，存不了就算了 */ }
}
function clearSave(){
  try{ sessionStorage.removeItem(SAVE_KEY); }catch(e){}
}
function loadSave(){
  try{
    const raw = sessionStorage.getItem(SAVE_KEY);
    if(!raw) return null;
    const s = JSON.parse(raw);
    if(!s || !Array.isArray(s.order) || typeof s.round !== "number") return null;
    return s;
  }catch(e){ return null; }
}

// 把一串信件按每关 PAIRS_PER_ROUND 对切成关卡
function splitRounds(pool){
  const rounds = [];
  for(let i = 0; i < pool.length; i += PAIRS_PER_ROUND){
    rounds.push(pool.slice(i, i + PAIRS_PER_ROUND));
  }
  // 最后一关不足 2 对就并进前一关
  if(rounds.length > 1 && rounds[rounds.length-1].length < 2){
    rounds[rounds.length-2].push(...rounds.pop());
  }
  return rounds;
}

function buildGameData(){
  // 牵红线只在 823 预告期出现，那时一封都还没解锁，
  // 所以不看解锁状态，只要绑了作者就能玩（作者本身不是秘密）
  const pool = shuffle(LETTERS.filter(L => L.author_id));
  GAME.rounds = splitRounds(pool);
  GAME.round = 0;
  GAME.matchedInRound = 0;
  GAME.picked = null;
  GAME.totalTied = 0;   // 本局累计牵好的红线
  clearSave();          // 新的一局：旧存档作废
}

/* 按存档恢复上一局；存档不可用（没有 / 信件对不上 / 已通关）就返回 false */
function restoreGameData(){
  const s = loadSave();
  if(!s) return false;

  const playable = LETTERS.filter(L => L.author_id);
  const byId = new Map(playable.map(L => [L.id, L]));
  // 后台改过信件（删了、换了作者）就别硬套，重新开一局更保险
  if(s.order.length !== playable.length) return false;
  const pool = s.order.map(id => byId.get(id));
  if(pool.some(L => !L)) return false;

  const rounds = splitRounds(pool);
  if(s.round < 0 || s.round >= rounds.length) return false;   // 已通关或越界

  GAME.rounds = rounds;
  GAME.round = s.round;
  GAME.matchedInRound = 0;
  GAME.picked = null;
  GAME.totalTied = Number(s.totalTied) || 0;
  return true;
}

function renderGame(){
  $("#game-done").classList.remove("show");
  $("#oops").classList.remove("show");
  $("#congrats").classList.remove("show");
  renderRound();
}

// 樱花枝：一条微弯的枝干 + 几簇花
function branchSVG(){
  return `<svg class="branch-svg" viewBox="0 0 100 14" preserveAspectRatio="none">
    <path d="M-2 8 Q 20 4, 44 7 T 102 6" fill="none" stroke="#a5765c" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M-2 8 Q 20 4, 44 7 T 102 6" fill="none" stroke="#c79a80" stroke-width="1" stroke-linecap="round" opacity=".6"/>
  </svg>
  <span style="position:absolute;top:1px;left:12%;width:7px;height:7px;border-radius:50%;background:var(--sakura);opacity:.9"></span>
  <span style="position:absolute;top:6px;left:36%;width:5px;height:5px;border-radius:50%;background:var(--sakura-deep);opacity:.75"></span>
  <span style="position:absolute;top:0;left:62%;width:6px;height:6px;border-radius:50%;background:var(--sakura);opacity:.85"></span>
  <span style="position:absolute;top:5px;left:86%;width:5px;height:5px;border-radius:50%;background:#fbd9e6;opacity:.9"></span>`;
}

// 左右布局用：一根竖着的樱花枝
function trunkSVG(){
  return `<svg class="trunk-svg" viewBox="0 0 14 100" preserveAspectRatio="none">
    <path d="M7 -2 Q 3 26, 7 52 T 7 102" fill="none" stroke="#a5765c" stroke-width="3" stroke-linecap="round"/>
    <path d="M7 -2 Q 3 26, 7 52 T 7 102" fill="none" stroke="#c79a80" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>
  </svg>
  <span style="position:absolute;left:1px;top:9%;width:7px;height:7px;border-radius:50%;background:var(--sakura);opacity:.9"></span>
  <span style="position:absolute;left:8px;top:30%;width:5px;height:5px;border-radius:50%;background:var(--sakura-deep);opacity:.75"></span>
  <span style="position:absolute;left:0;top:53%;width:6px;height:6px;border-radius:50%;background:var(--sakura);opacity:.85"></span>
  <span style="position:absolute;left:7px;top:76%;width:5px;height:5px;border-radius:50%;background:#fbd9e6;opacity:.9"></span>`;
}

function tagCardHTML(L){
  return `<div class="tag-card">
    ${L.tag ? `<div class="tag-band">${escapeHtml(L.tag)}</div>` : `<div class="tag-band">作品</div>`}
    <div class="tag-title">${escapeHtml(L.title || "作品")}</div>
  </div>`;
}
function plaqueHTML(L){
  const src = avatarSrc(L);
  return `<div class="plaque" data-author="${L.author_id}">
    ${src ? `<img class="pav" src="${escapeHtml(src)}" alt="">` : ""}
    <div class="ptext">
      <div class="pname">${escapeHtml(L.author_name)}</div>
      ${L.author_bio ? `<div class="pbio">${escapeHtml(L.author_bio)}</div>` : ""}
    </div>
  </div>`;
}

function renderRound(){
  const scene = $("#scene");
  const list = GAME.rounds[GAME.round] || [];
  GAME.matchedInRound = 0;
  GAME.picked = null;
  GAME.lock = false;
  GAME.tied = [];        // 本关已牵好的红线（换关时随场景一起清掉）

  if(!GAME.rounds.length || list.length < 2){
    scene.innerHTML = `<div class="empty" style="color:var(--ink-soft);text-shadow:none">
      作品还在准备中<br>晚点再来玩 🌸</div>`;
    $("#game-score").textContent = "";
    $("#round-dots").innerHTML = "";
    return;
  }

  const works   = shuffle(list);
  const authors = shuffle(list);

  if(GAME_LAYOUT === "lr"){
    // 左：作品挂牌系在竖枝上；右：作者名牌。红线水平牵过去。
    scene.innerHTML =
      `<svg id="string-svg"></svg>
       <div class="lr-scene">${trunkSVG()}
         <div class="lr-rows">${works.map((L,i)=>`
           <div class="lr-row">
             <div class="tag-wrap lr" data-author="${L.author_id}" data-id="${L.id}">${tagCardHTML(L)}</div>
             ${plaqueHTML(authors[i])}
           </div>`).join("")}
         </div>
       </div>`;
  }else{
    // 上：作品短册挂在横枝上（每枝最多 3 个）；下：作者名牌
    const rows = [];
    for(let i = 0; i < works.length; i += 3) rows.push(works.slice(i, i+3));
    scene.innerHTML =
      `<svg id="string-svg"></svg>` +
      rows.map(row => `
        <div class="branch-row">${branchSVG()}
          <div class="tags">${row.map(L => `
            <div class="tag-wrap" data-author="${L.author_id}" data-id="${L.id}">
              <div class="tag-string"></div>
              ${tagCardHTML(L)}
            </div>`).join("")}
          </div>
        </div>`).join("") +
      `<div class="ag-label">—— 出自谁之手？——</div>
       <div id="author-grid">${authors.map(plaqueHTML).join("")}</div>`;
  }

  updateScore();

  $$("#scene .tag-wrap, #scene .plaque").forEach(el => {
    el.addEventListener("click", ()=> onCardTap(el));
  });
}

function updateScore(){
  $("#game-score").textContent =
    `第 ${GAME.round+1} / ${GAME.rounds.length} 关 · 本关 ${GAME.matchedInRound} / ${(GAME.rounds[GAME.round]||[]).length} 对`;
  $("#round-dots").innerHTML = GAME.rounds.map((_,i)=>
    `<span class="rdot ${i < GAME.round ? "done" : i === GAME.round ? "now" : ""}"></span>`).join("");
}

/* ---- 点选：短册和名牌都能先点，点另一边就判定 ---- */
function onCardTap(el){
  if(GAME.lock) return;
  if(el.classList.contains("tied")) return;   // 已经牵好的不再响应

  if(GAME.picked === el){                         // 再点一次 = 收回红线
    el.classList.remove("picked");
    GAME.picked = null;
    return;
  }
  if(!GAME.picked){                               // 第一下
    GAME.picked = el;
    el.classList.add("picked");
    return;
  }
  const a = GAME.picked, b = el;
  const sameSide = a.classList.contains("tag-wrap") === b.classList.contains("tag-wrap");
  if(sameSide){                                   // 同一边 → 换选
    a.classList.remove("picked");
    GAME.picked = b;
    b.classList.add("picked");
    return;
  }
  a.classList.remove("picked");
  GAME.picked = null;
  const tag    = a.classList.contains("tag-wrap") ? a : b;
  const plaque = tag === a ? b : a;
  if(tag.dataset.author === plaque.dataset.author){
    tieString(tag, plaque);      // 牵对：红线打结
  }else{
    snapString(tag, plaque);     // 牵错：红线绷断
  }
}

/* ---- 红线几何 ----
   上下布局：短册底部中点 → 名牌顶部中点
   左右布局：挂牌右缘中点 → 名牌左缘中点（弧线往下坠，更像真的红线） */
function scenePoint(el, edge){
  const base = $("#scene").getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if(edge === "left" || edge === "right"){
    return { x: (edge === "right" ? r.right : r.left) - base.left,
             y: r.top + r.height/2 - base.top };
  }
  return { x: r.left + r.width/2 - base.left,
           y: (edge === "bottom" ? r.bottom : r.top) - base.top };
}
function drawRedString(tag, plaque){
  const svg = $("#string-svg");
  let p1, p2, sag;
  if(GAME_LAYOUT === "lr"){
    p1 = scenePoint(tag.querySelector(".tag-card"), "right");
    p2 = scenePoint(plaque, "left");
    sag = Math.max(p1.y, p2.y) + 14 + Math.abs(p1.x - p2.x) * 0.10;
  }else{
    p1 = scenePoint(tag.querySelector(".tag-card"), "bottom");
    p2 = scenePoint(plaque, "top");
    sag = Math.max(p1.y, p2.y) + 26 + Math.abs(p1.x - p2.x) * 0.08;
  }
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", `M${p1.x} ${p1.y} Q ${(p1.x+p2.x)/2} ${sag}, ${p2.x} ${p2.y}`);
  path.setAttribute("class", "rstring");
  svg.appendChild(path);
  const len = path.getTotalLength();
  path.style.strokeDasharray  = len;
  path.style.strokeDashoffset = len;
  path.style.transition = "stroke-dashoffset .38s ease-out";
  requestAnimationFrame(()=>{ path.style.strokeDashoffset = "0"; });
  return { svg, path, len };
}

// 在线中点打一个同心结。
// 注意：外层 g 负责定位（attribute transform），内层 g 跑弹出动画 ——
// CSS 动画的 transform 会覆盖同元素的 SVG transform 属性，必须分开两层
function makeKnot(svg, path, len){
  const mid = path.getPointAtLength(len/2);
  const holder = document.createElementNS(SVG_NS, "g");
  holder.setAttribute("class", "rknot-holder");
  holder.setAttribute("transform", `translate(${mid.x},${mid.y})`);
  holder.innerHTML = `<g class="rknot">
    <ellipse cx="-4.5" cy="0" rx="4.5" ry="3" fill="none" stroke="#e8404f" stroke-width="2" transform="rotate(-24)"/>
    <ellipse cx="4.5"  cy="0" rx="4.5" ry="3" fill="none" stroke="#e8404f" stroke-width="2" transform="rotate(24)"/>
    <circle cx="0" cy="0" r="2.4" fill="#e8404f"/>
  </g>`;
  svg.appendChild(holder);
  return holder;
}

/* ---- 牵对：画线 → 打结 → 弹表情包 ----
   完整内容一律留到 824 按时间表解锁，823 只玩游戏、看表情包。 */
function tieString(tag, plaque){
  GAME.lock = true;
  const { svg, path, len } = drawRedString(tag, plaque);
  const rec = { tag, plaque, path, holder:null };
  GAME.tied.push(rec);

  setTimeout(()=>{ rec.holder = makeKnot(svg, path, len); }, 400);

  setTimeout(()=>{
    burstPetals(tag); burstPetals(plaque);
    // 牵好的一对安定下来：停止摇晃、变柔和、不再响应点击
    tag.classList.add("tied"); plaque.classList.add("tied");
    GAME.matchedInRound++;
    GAME.totalTied++;
    updateScore();
    saveGame();               // 中途关掉弹窗也不丢这根
    showCongrats(tag);        // GAME.lock 保持，直到玩家关掉表情包
  }, 750);                    // 红线 .38s + 打结 .35s ≈ 730ms，刚好接上
}

/* ---- 表情包：答对抽 A 份、答错抽 B 份 ----
   抽签袋式随机：一轮抽完才重复，52 题不会连着看到同一个。 */
function makeStickerBag(list){
  let bag = [];
  let last = null;
  let peeked = null;          // 预抽好的下一张（供预载用）

  function draw(){
    if(!list || !list.length) return null;
    if(!bag.length){
      bag = shuffle(list);
      // 新一袋的最后一张（下次先抽的）若和上一张相同，跟前面换一下，
      // 避免跨袋边界连着看到同一个表情包
      if(list.length > 1 && bag[bag.length-1] === last){
        [bag[0], bag[bag.length-1]] = [bag[bag.length-1], bag[0]];
      }
    }
    last = bag.pop();
    return last;
  }

  const next = ()=>{
    const v = peeked !== null ? peeked : draw();
    peeked = null;
    return v;
  };
  // 先把下一张抽出来并开始下载，等真的要弹时已经在快取里
  next.warm = ()=>{
    if(peeked === null) peeked = draw();
    preloadSticker(peeked);
    return peeked;
  };
  return next;
}

/* 表情包档案不小（平均 800KB、最大 2MB+），等要弹的那一刻才下载会卡 1~2 秒。
   提前把下一张塞进浏览器快取：图片用 Image()，影片用 <link rel=preload>。 */
const _preloaded = new Set();
function preloadSticker(src){
  if(!src || _preloaded.has(src)) return;
  _preloaded.add(src);
  if(/\.(mp4|webm)$/i.test(src)){
    // link preload + 隐藏 video 双保险：部分内核（微信 X5）会忽略 as=video 的 preload
    const l = document.createElement("link");
    l.rel = "preload"; l.as = "video"; l.href = src;
    document.head.appendChild(l);
    const v = document.createElement("video");
    v.preload = "auto"; v.muted = true; v.src = src;
  }else{
    const im = new Image();
    im.decoding = "async";
    im.src = src;
  }
}

const nextCorrectSticker = makeStickerBag((window.CONFIG||{}).STICKERS_CORRECT);
const nextWrongSticker   = makeStickerBag((window.CONFIG||{}).STICKERS_WRONG);

// 开局先各暖一张，之后每弹完一张就暖下一张
function warmStickers(){
  try{ nextCorrectSticker.warm(); nextWrongSticker.warm(); }catch(e){}
}

// mp4/webm 用静音自动播放的 video（手机上要 muted+playsinline 才能自动播），其余当图片
function stickerHTML(src){
  if(!src) return "";
  if(/\.(mp4|webm)$/i.test(src)){
    // webkit-playsinline / x5-playsinline：旧 iOS 微信、安卓微信 X5 内核的内联播放
    return `<video class="sticker" src="${escapeHtml(src)}" autoplay muted loop playsinline webkit-playsinline x5-playsinline preload="auto"></video>`;
  }
  return `<img class="sticker" src="${escapeHtml(src)}" alt="">`;
}
// 插进 DOM 后补一次 play()：某些浏览器/切后台回来时 autoplay 会被挡住
function kickSticker(box){
  const v = box.querySelector("video.sticker");
  if(!v) return;
  v.currentTime = 0;
  const tryPlay = ()=> v.play().catch(()=>{});
  tryPlay();
  v.addEventListener("canplay", tryPlay, { once:true });
}

/* ---- 答对弹窗：只弹表情包，不给完整版（完整版留到 824） ---- */
function showCongrats(tag){
  const title = (tag.querySelector(".tag-title")||{}).textContent || "";
  $("#congrats .cg-work").textContent = title;
  // 有表情包就放表情包，没有就退回 🎈
  const sticker = nextCorrectSticker();
  $("#congrats .cg-big").innerHTML = sticker ? stickerHTML(sticker) : "🎈";
  const box = $("#congrats");
  box.classList.add("show");
  kickSticker(box);
  warmStickers();             // 这张已经在看了，先把下一张下载好
  $("#cg-next").onclick = ()=>{
    box.classList.remove("show");
    afterCongrats();
  };
}
function afterCongrats(){
  GAME.lock = false;
  if(GAME.matchedInRound >= (GAME.rounds[GAME.round]||[]).length){
    if(GAME.round + 1 < GAME.rounds.length){
      setTimeout(()=> showRoundBanner(`第 ${GAME.round+1} 关 · 红线已牵好 🎈`), 300);
      setTimeout(()=>{ GAME.round++; renderRound(); saveGame(); }, 1450);
    }else{
      clearSave();   // 通关了，存档作废；再点「再玩一次」重新随机
      setTimeout(()=>{ $("#game-done").classList.add("show"); startFireworks(); }, 600);
    }
  }
}

// 窗口尺寸变化时，把已牵好的红线按新位置重画
function redrawTied(){
  if(!GAME.tied.length) return;
  GAME.tied.forEach(rec=>{
    if(!rec.path.isConnected) return;
    const lr = GAME_LAYOUT === "lr";
    const p1 = lr ? scenePoint(rec.tag.querySelector(".tag-card"), "right")
                  : scenePoint(rec.tag.querySelector(".tag-card"), "bottom");
    const p2 = lr ? scenePoint(rec.plaque, "left") : scenePoint(rec.plaque, "top");
    const sag = lr ? Math.max(p1.y,p2.y) + 14 + Math.abs(p1.x-p2.x)*0.10
                   : Math.max(p1.y,p2.y) + 26 + Math.abs(p1.x-p2.x)*0.08;
    rec.path.style.transition = "none";
    rec.path.style.strokeDasharray = "none";
    rec.path.setAttribute("d", `M${p1.x} ${p1.y} Q ${(p1.x+p2.x)/2} ${sag}, ${p2.x} ${p2.y}`);
    if(rec.holder){
      const len = rec.path.getTotalLength();
      const mid = rec.path.getPointAtLength(len/2);
      rec.holder.setAttribute("transform", `translate(${mid.x},${mid.y})`);
    }
  });
}
addEventListener("resize", redrawTied);

/* ---- 牵错：线绷断 → 弹「牵错啦」表情包 → 两张卡放回去，继续牵 ----
   答错不结束本局，也不锁定这两张卡：玩家可以随便再挑别的组合，
   一直牵到本关 4 对全对为止。 */
function snapString(tag, plaque){
  GAME.lock = true;
  const { path } = drawRedString(tag, plaque);
  setTimeout(()=>{
    path.classList.add("falls");                 // 整条线松脱下坠
    tag.classList.add("shakeit"); plaque.classList.add("shakeit");
  }, 320);
  setTimeout(()=>{
    path.remove();
    tag.classList.remove("shakeit"); plaque.classList.remove("shakeit");
    showOops();                                  // GAME.lock 保持，直到玩家关掉表情包
  }, 750);
}

/* ---- 答错弹窗：只弹表情包，关掉就继续牵 ---- */
function showOops(){
  const box = $("#oops");
  // 有 B 份表情包就放表情包，没有就退回 🥀
  const sticker = nextWrongSticker();
  $("#oops .cg-big").innerHTML = sticker ? stickerHTML(sticker) : "🥀";
  $("#go-count").textContent = GAME.totalTied;   // 本局累计牵好的红线
  box.classList.add("show");
  kickSticker(box);
  warmStickers();             // 这张已经在看了，先把下一张下载好
  $("#oops-next").onclick = ()=>{
    box.classList.remove("show");
    GAME.lock = false;      // 解锁继续玩，本关进度、已牵好的红线都保留
  };
}

// 在卡片位置撒一把樱花瓣
function burstPetals(el){
  const scene = $("#scene");
  const ar = scene.getBoundingClientRect(), r = el.getBoundingClientRect();
  for(let i = 0; i < 6; i++){
    const p = document.createElement("div");
    p.className = "pburst";
    p.style.left = (r.left - ar.left + r.width/2 + (Math.random()*30-15)) + "px";
    p.style.top  = (r.top  - ar.top  + r.height/2 + (Math.random()*16-8)) + "px";
    p.style.background = Math.random() > 0.5 ? "var(--sakura)" : "var(--sakura-deep)";
    p.style.setProperty("--dx", (Math.random()*90-45) + "px");
    p.style.setProperty("--dy", (-30 - Math.random()*60) + "px");
    scene.appendChild(p);
    setTimeout(()=>p.remove(), 900);
  }
}

function showRoundBanner(text){
  const b = $("#round-banner");
  b.querySelector("span").textContent = text;
  b.classList.add("show");
  setTimeout(()=> b.classList.remove("show"), 950);
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
  // 关掉弹窗再打开，接着上次的关卡继续；没有存档才开新的一局
  if(!restoreGameData()) buildGameData();
  renderGame();
  openOverlay("#match-modal");
  warmStickers();           // 开局就把第一张答对/答错的表情包下载好
};
$("#game-restart").onclick = ()=>{ buildGameData(); renderGame(); };


/* =========================================================
   阶段切换：控制牵红线按钮 / 副标题
========================================================= */
function applyPhase(){
  const phase = currentPhase();
  document.body.dataset.phase = phase;
  // 牵红线只在 823（预告期）出现
  $("#btn-match").style.display = (phase === "teaser") ? "" : "none";
  $("#subtitle").textContent =
    phase === "teaser"  ? "点击信封 开启洋灵的平行时空" :
    phase === "reveal"  ? "信封按时间表，一封一封挂上树" :
                          "52 封信，全部在这里了";
}

/* =========================================================
   计天：从 2016-08-24（中国时间）数到现在
========================================================= */
function daysSinceMet(){
  // nowChina() 和这里的 met 都是「中国墙上时间」同一坐标系，直接相减
  const met = new Date(2016, 7, 24);
  return Math.floor((nowChina() - met) / 864e5);
}

function updateCountdown(){
  const phase = currentPhase();

  if(phase === "archive"){
    $("#countdown").textContent = `🌸 背后的故事绝对完美的第 ${daysSinceMet()} 天 · 感谢每一位创作者`;
    return;
  }
  if(phase === "reveal"){
    const opened = LETTERS.filter(L => L.unlocked).length;
    const total  = LETTERS.length || 52;
    $("#countdown").textContent = `🎉 824 快乐 · 已开启 ${opened} / ${total} 封`;
    return;
  }
  // teaser：不倒数了，改成从 2016.8.24 数天数
  $("#countdown").textContent = `背后的故事绝对完美的第 ${daysSinceMet()} 天 🌸`;
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
// #play：直接打开牵红线（demo.html 的「直接玩牵红线」按钮用）
if(location.hash === "#play" && currentPhase() === "teaser"){
  setTimeout(()=>{ if(LETTERS.length) $("#btn-match").click(); }, 400);
}
/* ---- 智能刷新：把请求量压到最低（流量额度友好）----
   823/825：内容基本不变，10 分钟兜底一次（管理员改信也等得到）
   824    ：按「下一封解锁时间」精准抓，加 5~20 秒随机抖动 ——
            1000 个人不会在同一秒齐刷刷打服务器；封与封之间
            5 分钟兜底一次。比原来的 30 秒盲轮询省 ~10 倍流量 */
function nextRefreshDelay(){
  if(!LETTERS.length) return 30000;              // 首抓失败/还没数据：30 秒重试
  const phase = currentPhase();
  if(phase !== "reveal") return 10*60*1000;
  const FALLBACK = 5*60*1000;
  const now = currentSlot();
  const next = LETTERS.map(L=>L.slot).filter(sl=>sl>now).sort((a,b)=>a-b)[0];
  if(next === undefined) return FALLBACK;        // 今天的全开完了
  const jitter = 5000 + Math.random()*15000;
  return Math.min(msUntilSlot(next) + jitter, FALLBACK);
}
let refreshTimer = null;
function scheduleRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async ()=>{
    try{ await loadLetters(); }catch(e){}
    scheduleRefresh();
  }, nextRefreshDelay());
}
scheduleRefresh();

updateCountdown();
setInterval(updateCountdown, 30000);
// 跨日自动切换阶段（00:00 一过，页面自己变，不用粉丝刷新）
setInterval(applyPhase, 30000);

// 樱花：默认一直飘，不再需要按钮开关
startSakura();
