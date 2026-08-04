/* =========================================================
   演示数据 —— 只在 ?demo=1 时加载
   1 作者 = 1 作品，共 48 对（和客户的真实结构一致）
   正式上线不影响：不带 ?demo=1 就完全不会用到
========================================================= */
(function(){
  // 48 位创作者（演示用昵称）
  const NAMES = [
    "小柚","阿澈","栗子","Mio","团团","柠七","以南","鹿鸣",
    "星野","茶白","知遥","奶油","蓝屿","一苇","九月","苏苏",
    "晚风","岛岛","汽水","三三","雾雾","半糖","西西","洛洛",
    "竹里","盐盐","南栀","北辞","泡芙","可可","多多","安安",
    "冉冉","阿禾","小满","青柠","叙叙","桃桃","杳杳","迟迟",
    "软软","荔枝","阿茶","气球","星屑","慢慢","一勺","初一"
  ];

  // 作品类型池：类型 → [作品名…]，颜色用于缩略图
  const TYPES = [
    { tag:"插画", c:"#f7b5cf", bio:"画手", works:[
      "主视觉 · 樱花树下的你们","应援色双子 · 角色设定","Q版贴纸一整套","四格日常 · 第824话",
      "水彩 · 初夏的舞台","像素画 · 打歌服","头像包 · 十二连发","封面图 · 星夜"] },
    { tag:"影片", c:"#32b5e1", bio:"剪辑", works:[
      "周年混剪 · 这一年的你们","824 倒数预告片","舞台合集 · 高光时刻","采访剪辑 · 笑点合集",
      "应援曲 MV","慢镜头 · 谢幕那一刻","vlog 混剪 · 日常","开场动画"] },
    { tag:"文字", c:"#ffd76b", bio:"写手", works:[
      "开篇信 · 写在 00:00","给未来的一封信","粉丝故事集 · 我们的相遇","短篇 · 平行世界的邂逅",
      "应援诗 · 致洋灵","年度回顾长文","歌词解读 · 逐句","采访文字实录"] },
    { tag:"摄影", c:"#c3b5f7", bio:"摄影", works:[
      "演唱会现场 · 灯海","后台抓拍 · 笑场瞬间","应援物开箱 · 全套实拍","街拍 · 应援色穿搭",
      "舞台定格 · 跳跃","粉丝合影墙","场馆外的日出","返图精选 · 九宫格"] },
    { tag:"手工", c:"#a8e6c8", bio:"手工", works:[
      "手作灯牌 · 制作全过程","亚克力立牌设计","应援手幅 · 设计稿","黏土小人 · 双子",
      "刺绣徽章","折纸樱花 · 一千朵","应援扇 · 手绘版","串珠手链 · 应援色"] },
    { tag:"音乐", c:"#f4a0c0", bio:"翻唱 / 音乐", works:[
      "应援曲翻唱","钢琴改编 · 主打歌","八音盒版 · 生日歌","合唱企划 · 百人版",
      "remix · 电子版","吉他弹唱 · 弹幕点歌","口哨版彩蛋","伴奏重编 · 管弦乐"] }
  ];

  // 缩略图：内嵌 SVG，不依赖外部图床
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

  // 组装 48 对：一位作者一个作品
  const authors = [], letters = [];
  for(let i = 0; i < 48; i++){
    const T = TYPES[i % TYPES.length];
    const work = T.works[Math.floor(i / TYPES.length) % T.works.length];
    const time = `${String(Math.floor(i/2)).padStart(2,"0")}:${(i%2)===0?"00":"30"}`;

    authors.push({ id:i+1, name:NAMES[i], avatar:"", bio:T.bio });
    letters.push({
      id: i+1,
      slot: i,
      title: work,
      tag: T.tag,                        // 连连看卡片上的类型 chip
      unlocked: false,                   // 由 app.js 按阶段覆盖
      teaser_text : TEASERS[i % TEASERS.length],
      teaser_image: "",
      body : `【${time} · ${T.tag}】\n\n` + SAMPLE_TEXT[i % SAMPLE_TEXT.length],
      image: thumb(T.tag, T.c),
      video: "",
      link : "",
      link_text: "",
      author_id: i+1,
      author_name: NAMES[i],
      author_avatar: "",
      author_bio: T.bio
    });
  }

  window.DEMO_DATA = { authors, letters };
})();
