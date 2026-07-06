/* =========================================================
   洋灵许愿树 · 主逻辑
========================================================= */
const $ = (s)=>document.querySelector(s);
const CHINA_OFFSET = 8*60;

function nowChina(){
  const d=new Date(); const utc=d.getTime()+d.getTimezoneOffset()*60000;
  return new Date(utc+CHINA_OFFSET*60000);
}
function isAug24China(){ const c=nowChina(); return c.getMonth()===7 && c.getDate()===24; }
// 当天已经过了多少个半小时（0:00→0, 0:30→1, 1:00→2 ...），用来决定亮到第几封
function slotsPassed(){ const c=nowChina(); return c.getHours()*2 + (c.getMinutes()>=30?1:0); }

function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2400);
}
function escapeHtml(s){return (s||"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ---------- 星空 ---------- */
(function stars(){
  let html=""; for(let i=0;i<90;i++){ const s=Math.random()*2.2+0.8;
    html+=`<div class="star" style="left:${Math.random()*100}%;top:${Math.random()*68}%;width:${s}px;height:${s}px;animation-delay:${Math.random()*3}s"></div>`; }
  $("#stars").innerHTML=html;
})();

/* ---------- 飘落花瓣 ---------- */
function spawnPetal(){
  const p=document.createElement("div"); p.className="petal";
  const size=Math.random()*10+8;
  p.style.left=Math.random()*100+"vw";
  p.style.width=size+"px"; p.style.height=size+"px";
  p.style.background=Math.random()>0.5?"var(--pink)":"var(--pink-soft)";
  p.style.animationDuration=(7+Math.random()*7)+"s";
  p.style.setProperty("--x", (Math.random()*20-6)+"vw");
  $("#petals").appendChild(p);
  setTimeout(()=>p.remove(),15000);
}
setInterval(spawnPetal, 650);
for(let i=0;i<8;i++) setTimeout(spawnPetal, i*300);

/* ---------- 樱花树（更丰富）---------- */
// 递归画树枝
function buildBranches(){
  const g=$("#branches"); let paths="";
  function branch(x,y,angle,len,width,depth){
    if(depth<=0||len<8) return;
    const x2=x+Math.cos(angle)*len, y2=y+Math.sin(angle)*len;
    paths+=`<path d="M${x.toFixed(1)} ${y.toFixed(1)} Q ${((x+x2)/2+ (Math.random()*10-5)).toFixed(1)} ${((y+y2)/2).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"
      fill="none" stroke="url(#trunkG)" stroke-width="${width.toFixed(1)}" stroke-linecap="round"/>`;
    const n=depth>3?2: (Math.random()>0.35?2:1);
    for(let i=0;i<n;i++){
      const spread=(depth>4?0.35:0.6);
      branch(x2,y2, angle - spread + Math.random()*spread*2 - 0.15, len*(0.72+Math.random()*0.12), width*0.68, depth-1);
    }
  }
  // 主干从底部往上
  branch(280,610,-Math.PI/2, 120, 30, 7);
  g.innerHTML=paths;
}
buildBranches();

// 花冠：多层小圆点堆出饱满樱花，双色 + 少量高光
function buildBlossoms(){
  const g=$("#blossoms"); let s="";
  // 花冠中心与半径（心形略扁的一团）
  const cx=280, cy=235;
  function cluster(bx,by,count,spread){
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2, r=Math.random()*spread;
      const x=bx+Math.cos(a)*r, y=by+Math.sin(a)*r*0.82;
      const rad=Math.random()*8+3.5;
      const roll=Math.random();
      const fill = roll<0.5 ? "#ffc2dd" : (roll<0.85 ? "#fff6fb" : "#ff9dc4");
      s+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${fill}" opacity="${(0.5+Math.random()*0.45).toFixed(2)}"/>`;
    }
  }
  // 多个子团组成一大团花冠
  const spots=[[cx,cy,180],[cx-120,cy+10,110],[cx+120,cy+10,110],[cx-60,cy-70,110],[cx+60,cy-70,110],
               [cx,cy+90,140],[cx-150,cy+80,80],[cx+150,cy+80,80],[cx,cy-110,90]];
  spots.forEach(([x,y,sp])=> cluster(x,y, Math.round(sp*1.6), sp));
  // 少量金色花蕊高光点
  for(let i=0;i<40;i++){
    const a=Math.random()*Math.PI*2, r=Math.random()*200;
    s+=`<circle cx="${(cx+Math.cos(a)*r).toFixed(1)}" cy="${(cy+Math.sin(a)*r*0.82).toFixed(1)}" r="1.6" fill="#ffe9a8" opacity=".8"/>`;
  }
  g.innerHTML=s;
}
buildBlossoms();

/* ---------- 信封 SVG ---------- */
function envSVG(){
  return `<svg viewBox="0 0 40 30"><rect class="body" x="2" y="4" width="36" height="24" rx="3"/>
    <path class="flap" d="M2 6 L20 18 L38 6" fill="none" stroke-width="1.5"/>
    <circle cx="20" cy="16" r="2.2" fill="#ff7fb0"/></svg>`;
}
// 48 个挂点（落在花冠范围内，百分比坐标）
const HANG_SPOTS=(function(){
  const arr=[]; const cx=50, cy=40;
  for(let i=0;i<48;i++){
    const a=(i/48)*Math.PI*2 + (i%2?0.3:0);
    const r=12 + (i%4)*7 + Math.random()*4;
    arr.push([ cx+Math.cos(a)*r*1.1, cy+Math.sin(a)*r*0.75 ]);
  }
  return arr;
})();

/* ---------- Supabase ---------- */
let sb=null;
if(window.CONFIG && window.CONFIG.SUPABASE_URL && window.CONFIG.SUPABASE_URL.indexOf("你的")<0){
  sb=window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
}
if(window.CONFIG && window.CONFIG.BG_IMAGE){ $("#bg").style.backgroundImage=`url("${window.CONFIG.BG_IMAGE}")`; }

/* ---------- 敏感词 ---------- */
function hasSensitive(text){
  const t=text.toLowerCase();
  if((window.SENSITIVE_WORDS||[]).some(w=> w && t.includes(w.toLowerCase()))) return true;
  const compact=t.replace(/[\s\-_.·,，、]/g,"");
  if((window.SENSITIVE_PATTERNS||[]).some(re=> re.test(compact))) return true;
  return false;
}

/* ---------- 防刷 ---------- */
const SPAM={cooldownSec:60,maxTotal:20,lastKey:"yl_last",cntKey:"yl_cnt"};
function canPost(){
  const last=+localStorage.getItem(SPAM.lastKey)||0, cnt=+localStorage.getItem(SPAM.cntKey)||0, now=Date.now();
  if(now-last<SPAM.cooldownSec*1000) return {ok:false,msg:`发得太快啦，请 ${Math.ceil((SPAM.cooldownSec*1000-(now-last))/1000)} 秒后再试`};
  if(cnt>=SPAM.maxTotal) return {ok:false,msg:"你今天已经送出很多祝福啦 🌸"};
  return {ok:true};
}
function markPosted(){ localStorage.setItem(SPAM.lastKey,Date.now()); localStorage.setItem(SPAM.cntKey,(+localStorage.getItem(SPAM.cntKey)||0)+1); }

/* ---------- 预设信封（48 封，半小时逐亮，只看不写）---------- */
function renderPresetEnvelopes(){
  const wrap=$("#tree-wrap");
  wrap.querySelectorAll(".env").forEach(e=>e.remove());
  const letters=window.PRESET_LETTERS||[];
  const passed=slotsPassed();
  letters.forEach((L,i)=>{
    const spot=HANG_SPOTS[i%HANG_SPOTS.length];
    const lit = isAug24China() && i<=passed;   // 当天且已到该封的时间点（第i封在第i个半小时点亮起）
    const el=document.createElement("div");
    el.className="env "+(lit?"lit":"locked");
    el.style.left=spot[0]+"%"; el.style.top=spot[1]+"%";
    el.style.animationDelay=(Math.random()*4)+"s";
    el.innerHTML=envSVG();
    const h=Math.floor(i/2), m=(i%2===0)?"00":"30";
    el.title = lit ? L.title : `将在 ${String(h).padStart(2,"0")}:${m}（中国时间）开启`;
    el.onclick=()=>{
      if(!isAug24China()){ toast("信件将在 8/24 当天逐封开启 ✨"); return; }
      if(i>passed){ toast(`这封信将在 ${String(h).padStart(2,"0")}:${m} 开启`); return; }
      openLetter(L);
    };
    wrap.appendChild(el);
  });
}

/* ---------- 读信弹窗（支持图/文/链接）---------- */
function openLetter(L){
  $("#letter-title").textContent=L.title||"信";
  $("#letter-body").textContent=L.text||"";
  $("#letter-body").style.display = L.text ? "block" : "none";
  const extra=$("#letter-extra"); extra.innerHTML="";
  if(L.image){ const img=document.createElement("img"); img.className="letter-img"; img.src=L.image; img.alt=""; img.loading="lazy"; extra.appendChild(img); }
  if(L.link){ const a=document.createElement("a"); a.className="letter-link"; a.href=L.link; a.target="_blank"; a.rel="noopener"; a.textContent=L.linkText||"点击查看"; extra.appendChild(a); }
  $("#letter-meta").textContent="洋灵许愿树 · 824";
  $("#letter-modal").classList.add("show");
}

/* ---------- 弹幕（留言只飘，不挂树）---------- */
function flyDanmaku(text,name){
  const d=document.createElement("div"); d.className="dm";
  d.innerHTML=(name?`<b>${escapeHtml(name)}</b>`:"")+escapeHtml(text);
  d.style.top=(12+Math.random()*50)+"%";
  d.style.animationDuration=(10+Math.random()*7)+"s";
  $("#danmaku").appendChild(d);
  setTimeout(()=>d.remove(),18000);
}
async function loadDanmaku(){
  if(!sb) return;
  const {data,error}=await sb.from("messages").select("*").order("created_at",{ascending:false}).limit(30);
  if(error){console.warn(error);return;}
  (data||[]).forEach((m,i)=> setTimeout(()=>flyDanmaku(m.content,m.name), i*1800));
}

/* ---------- 弹窗关闭 ---------- */
document.querySelectorAll("[data-close]").forEach(b=> b.onclick=()=>b.closest(".overlay").classList.remove("show"));
document.querySelectorAll(".overlay").forEach(o=> o.onclick=(e)=>{ if(e.target===o) o.classList.remove("show"); });
$("#btn-wish").onclick=()=>$("#wish-modal").classList.add("show");

/* ---------- 提交祝福 ---------- */
$("#wish-submit").onclick=async ()=>{
  const name=$("#wish-name").value.trim().slice(0,16);
  const text=$("#wish-text").value.trim();
  const hint=$("#wish-hint"); hint.className="hint";
  if(!text){ hint.textContent="请先写点什么呀 🌸"; hint.classList.add("err"); return; }
  if(hasSensitive(name+" "+text)){ hint.textContent="留言包含不适当内容，请修改"; hint.classList.add("err"); return; }
  const gate=canPost(); if(!gate.ok){ hint.textContent=gate.msg; hint.classList.add("err"); return; }
  if(!sb){ toast("（演示模式）后台未连接，留言未保存"); $("#wish-modal").classList.remove("show"); return; }
  $("#wish-submit").disabled=true;
  const {data,error}=await sb.from("messages").insert({name:name||"匿名",content:text}).select().single();
  $("#wish-submit").disabled=false;
  if(error){ hint.textContent="提交失败，请稍后再试"; hint.classList.add("err"); return; }
  markPosted(); flyDanmaku(text, data.name);
  $("#wish-text").value=""; $("#wish-name").value="";
  $("#wish-modal").classList.remove("show");
  toast("你的祝福已飘上星空 🌸");
};

/* ---------- 查看更多 ---------- */
const PAGE_SIZE=10; let page=0, totalCount=0;
$("#btn-more").onclick=async ()=>{ page=0; await loadPage(); $("#list-modal").classList.add("show"); };
$("#prev-page").onclick=async ()=>{ if(page>0){page--; await loadPage();} };
$("#next-page").onclick=async ()=>{ if((page+1)*PAGE_SIZE<totalCount){page++; await loadPage();} };
async function loadPage(){
  const body=$("#list-body");
  if(!sb){ body.innerHTML="<p style='color:#b98'>演示模式：后台未连接。</p>"; return; }
  const from=page*PAGE_SIZE, to=from+PAGE_SIZE-1;
  const {data,count,error}=await sb.from("messages").select("*",{count:"exact"}).order("created_at",{ascending:false}).range(from,to);
  if(error){ body.innerHTML="<p style='color:#b98'>加载失败。</p>"; return; }
  totalCount=count||0;
  body.innerHTML=(data||[]).map(m=>`<div class="item"><div class="n">${escapeHtml(m.name||"匿名")}</div>
    <div class="t">${escapeHtml(m.content)}</div><div class="d">${new Date(m.created_at).toLocaleString("zh-CN")}</div></div>`).join("")
    || "<p style='color:#b98'>还没有祝福，快来写第一条吧 🌸</p>";
  $("#page-info").textContent=`第 ${page+1} / ${Math.max(1,Math.ceil(totalCount/PAGE_SIZE))} 页`;
  $("#prev-page").disabled=page===0; $("#next-page").disabled=(page+1)*PAGE_SIZE>=totalCount;
}

/* ---------- 倒计时 ---------- */
function updateCountdown(){
  const c=nowChina();
  if(isAug24China()){ $("#countdown").textContent="🎉 824 快乐 · 今天属于洋灵"; return; }
  const target=new Date(Date.UTC(c.getFullYear(),7,24,-8,0,0));
  let t=target-new Date(); if(t<0){ target.setUTCFullYear(c.getFullYear()+1); t=target-new Date(); }
  const d=Math.floor(t/864e5),h=Math.floor(t%864e5/36e5),m=Math.floor(t%36e5/6e4);
  $("#countdown").textContent=`距离 824 还有 ${d} 天 ${h} 小时 ${m} 分`;
}

/* ---------- 烟花 ---------- */
let fwRunning=false;
function startFireworks(){
  if(fwRunning) return; fwRunning=true;
  const cv=$("#fireworks"); cv.style.display="block"; const ctx=cv.getContext("2d");
  function resize(){cv.width=innerWidth;cv.height=innerHeight;} resize(); addEventListener("resize",resize);
  const parts=[], colors=["#ff7fb0","#ffd76b","#ffc2dd","#a0e7ff","#fff6fb"];
  function boom(x,y){ const col=colors[Math.floor(Math.random()*colors.length)];
    for(let i=0;i<54;i++){ const a=Math.PI*2*i/54, sp=Math.random()*4+2; parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:60,col}); } }
  function loop(){ ctx.fillStyle="rgba(26,16,40,.2)"; ctx.fillRect(0,0,cv.width,cv.height);
    if(Math.random()<0.05) boom(Math.random()*cv.width,Math.random()*cv.height*0.6);
    parts.forEach((p,i)=>{ p.x+=p.vx;p.y+=p.vy;p.vy+=0.04;p.life--; ctx.globalAlpha=Math.max(0,p.life/60);
      ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,2.4,0,7);ctx.fill(); if(p.life<=0)parts.splice(i,1); });
    ctx.globalAlpha=1; if(fwRunning)requestAnimationFrame(loop); }
  loop();
}

/* ---------- 启动 ---------- */
renderPresetEnvelopes();
loadDanmaku();
updateCountdown();
setInterval(updateCountdown,30000);
if(isAug24China()) startFireworks();
// 每分钟检查：进入 824 放烟花；当天则刷新信封亮起进度（每半小时会多亮一封）
setInterval(()=>{ if(isAug24China()){ startFireworks(); renderPresetEnvelopes(); } }, 60000);
