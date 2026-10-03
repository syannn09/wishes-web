/* =========================================================
   万圣节演示数据 —— 只在 ?demo=1 时用到
   开启时间按「现在」往前 / 往后推，打开就能看到：
   已开的门、快到时间的门（约 40 秒后当场解锁）、还要等几天的门
========================================================= */
(function(){
  const MIN = 60e3, HOUR = 60*MIN, DAY = 24*HOUR;

  function thumb(bg, emoji, label){
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280">
      <rect width="400" height="280" fill="${bg}"/>
      <text x="200" y="150" font-size="96" text-anchor="middle">${emoji}</text>
      <text x="200" y="232" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  const DOORS = [
    { off:-3*DAY,   title:"第一声敲门",       author:"小柚", bio:"写手",  emoji:"👻", bg:"#1b2c4a" },
    { off:-1*DAY,   title:"南瓜灯下的约定",   author:"阿澈", bio:"画手",  emoji:"🎃", bg:"#e2560b" },
    { off:-2*HOUR,  title:"黑猫送来的信",     author:"栗子", bio:"剪辑",  emoji:"🐈‍⬛", bg:"#0e1a30", video:true },
    { off:-10*MIN,  title:"不给糖就捣蛋",     author:"Mio",  bio:"摄影",  emoji:"🍬", bg:"#1f5a5c" },
    { off:40e3,     title:"午夜十二点的舞会", author:"团团", bio:"手工",  emoji:"🦇", bg:"#060b16" },
    { off:25*MIN,   title:"月亮上的扫帚",     author:"柠七", bio:"画手",  emoji:"🧹", bg:"#1b2c4a" },
    { off:3*HOUR,   title:"幽灵合唱团",       author:"以南", bio:"音乐",  emoji:"🎤", bg:"#0e1a30" },
    { off:1*DAY,    title:"蜘蛛网里的秘密",   author:"鹿鸣", bio:"写手",  emoji:"🕸️", bg:"#2b2620" },
    { off:2*DAY,    title:"魔药课作业",       author:"星野", bio:"画手",  emoji:"🧪", bg:"#2f5a3a" },
    { off:4*DAY,    title:"古堡的钥匙",       author:"茶白", bio:"剪辑",  emoji:"🗝️", bg:"#6e1f2a" },
    { off:6*DAY,    title:"最后一颗糖",       author:"知遥", bio:"摄影",  emoji:"🍭", bg:"#e2560b" },
    { off:null,     title:"神秘嘉宾",         author:"奶油", bio:"？？？", emoji:"❓", bg:"#060b16" }
  ];

  // 每次调用都按「现在」重新算时间，所以演示时倒计时是真的在走
  const T0 = Date.now();
  window.DEMO_DOORS = function(){
    return DOORS.map((d, i) => ({
      id: i + 1,
      title: d.title,
      unlock_at: d.off === null ? null : new Date(T0 + d.off).toISOString(),
      door_image: "",
      teaser_text: "门后传来一阵窸窸窣窣的声音……\n到时间再来敲门吧。",
      teaser_image: thumb(d.bg, d.emoji, "？？？"),
      body: `这是「${d.title}」的演示内容。\n\n正式版这里会放创作者的文字、图片或影片，和 824 的信一样，由后台填写。`,
      images: [thumb(d.bg, d.emoji, d.title)],
      videos: d.video ? ["https://www.w3schools.com/html/mov_bbb.mp4"] : [],
      link: i === 1 ? "https://www.yanglingforever.space/" : "",
      link_text: i === 1 ? "点击查看" : "",
      author_id: i + 1,
      author_name: d.author,
      author_bio: d.bio
    }));
  };
})();
