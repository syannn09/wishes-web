// ============================================================
//  连接设置 —— 洋灵许愿树 v2
//
//  ⚠️ 这两个值是「可以公开」的前端专用值，放在网页里是安全的。
//     真正保护数据的是 Supabase 的 RLS 规则和管理密钥。
//     未解锁的信件内容由服务端 RPC 控制，不会下发到前端。
// ============================================================

window.CONFIG = {
  SUPABASE_URL: "https://rjuiclbzhdtgdofiszng.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_zQDKUItVGkvNyedZFOqA6w_gSna7j--",

  // 背景图：樱花树（客户提供）
  // 旧的比心图还在 assets/bg.jpg，留作备份
  BG_IMAGE: "./assets/sakura-bg.jpg",

  // 作者统一头像：所有作者都用这一张（客户提供）
  // 换图直接覆盖 assets/author-avatar.jpg 即可
  AUTHOR_AVATAR: "./assets/author-avatar.jpg",

  // 牵红线表情包（客户提供，A 份答对用 / B 份答错用）
  // 支持 mp4 / gif / png / jpg。加新表情包：把文件放进对应文件夹，再把路径加进清单。
  // 每次弹出随机抽一个，抽完一轮才会重复。
  STICKERS_CORRECT: [
    "./assets/stickers/correct/1.mp4",
    "./assets/stickers/correct/2.mp4",
    "./assets/stickers/correct/3.mp4",
    "./assets/stickers/correct/4.mp4",
    "./assets/stickers/correct/5.mp4",
    "./assets/stickers/correct/6.mp4",
    "./assets/stickers/correct/7.mp4",
    "./assets/stickers/correct/8.mp4",
    "./assets/stickers/correct/9.mp4",
    "./assets/stickers/correct/10.mp4",
    "./assets/stickers/correct/11.mp4",
    "./assets/stickers/correct/12.mp4",
    "./assets/stickers/correct/13.mp4"
  ],
  STICKERS_WRONG: [
    "./assets/stickers/wrong/1.mp4",
    "./assets/stickers/wrong/2.mp4",
    "./assets/stickers/wrong/3.mp4",
    "./assets/stickers/wrong/4.mp4",
    "./assets/stickers/wrong/5.mp4",
    "./assets/stickers/wrong/6.mp4",
    "./assets/stickers/wrong/7.mp4",
    "./assets/stickers/wrong/8.mp4",
    "./assets/stickers/wrong/9.mp4",
    "./assets/stickers/wrong/10.mp4",
    "./assets/stickers/wrong/11.mp4",
    "./assets/stickers/wrong/12.mp4",
    "./assets/stickers/wrong/13.mp4"
  ]
};
