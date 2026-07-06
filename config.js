// ============================================================
//  连接设置 —— 洋灵许愿树
//  （已填好 Supabase 连接信息，可直接使用）
//
//  ⚠️ 这两个值是「可以公开」的前端专用值，放在网页里是安全的。
//     真正保护数据的是 Supabase 的 RLS 规则（已在建表时设好）。
// ============================================================

window.CONFIG = {
  SUPABASE_URL: "https://rjuiclbzhdtgdofiszng.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_zQDKUItVGkvNyedZFOqA6w_gSna7j--",

  // 背景图（方案 1：只做氛围，树和信封画在上面）
  // 把背景图片文件（例如 bg.jpg）跟这些文件一起传上 GitHub，
  // 然后这里填 "./bg.jpg" 即可。留空则用内置的渐变夜空。
  BG_IMAGE: ""
};
