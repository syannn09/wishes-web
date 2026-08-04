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
  BG_IMAGE: "./assets/sakura-bg.jpg"
};
