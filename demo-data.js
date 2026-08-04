/* =========================================================
   演示数据 —— 只在 ?demo=1 时加载
   用来在没有连 Supabase 的情况下预览效果（给客户看 / 本地调试）
   正式上线不影响：不带 ?demo=1 就完全不会用到
========================================================= */
(function(){
  const AUTHORS = [
    { id:1, name:"小柚", avatar:"", bio:"画手 · 主视觉与角色设定" },
    { id:2, name:"阿澈", avatar:"", bio:"剪辑 · 混剪与预告片" },
    { id:3, name:"栗子", avatar:"", bio:"写手 · 文案与信件正文" },
    { id:4, name:"Mio",  avatar:"", bio:"摄影 · 现场与物料拍摄" },
    { id:5, name:"团团", avatar:"", bio:"手工 · 应援物与周边设计" },
  ];

  /* 物料清单：标题写成真实作品名，连连看才看得出「这是谁的作品」。
     author 对应上面的 id —— 一位作者多个作品（1 对多）。
     thumb 用内嵌 SVG 生成，不依赖外部图床，离线也能看。         */
  const WORKS = [
    { t:"主视觉 · 樱花树下的你们",   author:1, tag:"插画", c:"#f7b5cf" },
    { t:"角色设定 · 应援色双子",     author:1, tag:"插画", c:"#f4a0c0" },
    { t:"Q版贴纸 · 一整套",          author:1, tag:"插画", c:"#fbd9e6" },
    { t:"周年混剪 · 这一年的你们",   author:2, tag:"影片", c:"#8fdcf3" },
    { t:"824 倒数预告片",            author:2, tag:"影片", c:"#32b5e1" },
    { t:"舞台合集 · 高光时刻",       author:2, tag:"影片", c:"#7fd0ea" },
    { t:"开篇信 · 写在 00:00",       author:3, tag:"文字", c:"#ffd76b" },
    { t:"给未来的一封信",            author:3, tag:"文字", c:"#f5b942" },
    { t:"粉丝故事集 · 我们的相遇",   author:3, tag:"文字", c:"#ffe6a8" },
    { t:"演唱会现场 · 灯海",         author:4, tag:"摄影", c:"#c3b5f7" },
    { t:"后台抓拍 · 笑场瞬间",       author:4, tag:"摄影", c:"#a99ae8" },
    { t:"应援物开箱 · 全套实拍",     author:4, tag:"摄影", c:"#d5cbff" },
    { t:"手作灯牌 · 制作全过程",     author:5, tag:"手工", c:"#a8e6c8" },
    { t:"周边设计 · 亚克力立牌",     author:5, tag:"手工", c:"#7fd6a8" },
    { t:"应援手幅 · 设计稿",         author:5, tag:"手工", c:"#c8f0dc" },
  ];

  // 生成一张带文字的缩略图（data URI，不用外部图床）
  function thumb(tag, color){
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${color}"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity=".55"/>
        </linearGradient></defs>
        <rect width="320" height="200" fill="url(#g)"/>
        <circle cx="256" cy="52" r="34" fill="#fff" opacity=".35"/>
        <circle cx="286" cy="96" r="18" fill="#fff" opacity=".25"/>
        <text x="26" y="112" font-family="PingFang SC,sans-serif" font-size="44"
              font-weight="700" fill="#fff" opacity=".92">${tag}</text>
        <text x="26" y="146" font-family="PingFang SC,sans-serif" font-size="15"
              fill="#fff" opacity=".75">演示素材</text>
      </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  const SAMPLE_TEXT = [
    "洋灵，824 快乐。\n新的一天从这一刻开始，\n第一句想说的话是——\n遇见你们，真好。",
    "还记得第一次看见你们同框的样子吗？\n就从那一刻起，我们决定一直走下去。",
    "这一年里，你们走过的每一个舞台，\n我们都在台下，举着灯牌。",
    "谢谢你们让我们相信，\n喜欢一件事可以这么久。",
  ];

  const TEASERS = [
    "有人为这一刻画了很久…",
    "一段还没公开的画面。",
    "下一封，是写给你的。",
    "快了，再等一会儿。",
  ];

  const letters = [];
  for(let i=0;i<48;i++){
    const w = WORKS[i % WORKS.length];
    const a = AUTHORS.find(x => x.id === w.author);
    const time = `${String(Math.floor(i/2)).padStart(2,"0")}:${(i%2)===0?"00":"30"}`;
    letters.push({
      id: i+1,
      slot: i,
      title: w.t,                       // 用作品名，连连看才认得出是谁的
      unlocked: false,                  // 由 app.js 按阶段覆盖
      teaser_text : TEASERS[i % TEASERS.length],
      teaser_image: "",
      body : `【${time} · ${w.tag}】\n\n` + SAMPLE_TEXT[i % SAMPLE_TEXT.length],
      image: thumb(w.tag, w.c),
      video: "",
      link : "",
      link_text: "",
      author_id: a.id,
      author_name: a.name,
      author_avatar: a.avatar,
      author_bio: a.bio
    });
  }

  window.DEMO_DATA = { authors: AUTHORS, letters };
})();
