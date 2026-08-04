/* =========================================================
   演示数据 —— 只在 ?demo=1 时加载
   用来在没有连 Supabase 的情况下预览效果（给客户看 / 本地调试）
   正式上线不影响：不带 ?demo=1 就完全不会用到
========================================================= */
(function(){
  const AUTHORS = [
    { id:1, name:"小柚",   avatar:"", bio:"画手 · 主视觉与角色设定" },
    { id:2, name:"阿澈",   avatar:"", bio:"剪辑 · 混剪与预告片" },
    { id:3, name:"栗子",   avatar:"", bio:"写手 · 文案与信件正文" },
    { id:4, name:"Mio",    avatar:"", bio:"摄影 · 现场与物料拍摄" },
  ];

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
    const a = AUTHORS[i % AUTHORS.length];
    letters.push({
      id: i+1,
      slot: i,
      title: `${String(Math.floor(i/2)).padStart(2,"0")}:${(i%2)===0?"00":"30"} · 第${i+1}封`,
      unlocked: false,                       // 由下方 demo 逻辑覆盖
      teaser_text : TEASERS[i % TEASERS.length],
      teaser_image: "",
      body : SAMPLE_TEXT[i % SAMPLE_TEXT.length],
      image: "",
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
