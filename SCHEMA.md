# 数据库结构变更说明（洋灵许愿树 v2）

> 本文档只描述**需要在 Supabase 后台执行的结构变更**，不含迁移文件。
> 请在 Supabase → SQL Editor 手动执行下方 SQL。

## 变更总览

| 动作 | 对象 | 说明 |
|---|---|---|
| 保留 | `letters` | 增加 4 个字段：预告内容、视频、解锁槽位 |
| 新增 | `authors` | 作者（物料创作者），牵红线的右侧卡片 |
| 停用 | `messages` | 粉丝留言功能已砍掉，表保留不删（历史数据），前端不再读写 |

`messages` 表**不要删除** —— 824 之前的留言是客户资产。前端已移除所有读写，表留着即可。

---

## 1. 新增 `authors` 表

目前的用法是 **1 作者 = 1 作品**（52 位创作者 × 52 封信）。
表结构本身支持 1 对多（多封信指向同一作者），以后需要不用改表。

```sql
create table if not exists authors (
  id          bigserial primary key,
  name        text not null,              -- 作者名 / ID
  avatar      text default '',            -- 头像图片网址，空则用首字母圆牌
  bio         text default '',            -- 一句话介绍（连对后显示）
  sort_order  int  default 0,
  created_at  timestamptz default now()
);

alter table authors enable row level security;

-- 粉丝端只读
create policy "authors_public_read" on authors
  for select using (true);
```

## 2. `letters` 表增加字段

```sql
alter table letters add column if not exists author_id     bigint references authors(id) on delete set null;
alter table letters add column if not exists teaser_text   text default '';   -- 预告文字（未解锁时显示）
alter table letters add column if not exists teaser_image  text default '';   -- 预告图（前端会打码模糊）
alter table letters add column if not exists video         text default '';   -- 视频网址（mp4 直链 或 YouTube/Bilibili 嵌入链接）
alter table letters add column if not exists slot          int default 0;     -- 解锁槽位 0..51，对应 00:00 ~ 23:30

create index if not exists letters_slot_idx on letters(slot);
```

### 字段语义

| 字段 | 未解锁时 | 已解锁时 |
|---|---|---|
| `teaser_text` | ✅ 显示 | 不显示 |
| `teaser_image` | ✅ 显示（CSS 模糊处理） | 不显示 |
| `title` | ✅ 显示 | ✅ 显示 |
| `body` / `image` / `video` / `link` | ❌ 不下发 | ✅ 显示 |
| `author_id` | ❌ 不下发 | ✅ 用于牵红线 |

> **重要**：未解锁的完整内容**不会下发到前端**（见第 4 节的 RPC），
> 所以粉丝无法用开发者工具提前偷看。

### `slot` 与时间的对应

**`slot` = 当天第几分钟开启**（中国时区），不再是固定半小时序号。
时间表由客户提供、后台可改，无需加新 column —— 直接沿用 `slot` 这个 int 栏位。

| 时间 | slot | 时间 | slot |
|---|---|---|---|
| 00:24 | 24 | 13:14 | 794 |
| 01:09 | 69 | 20:24 | 1224 |
| 08:24 | 504 | 23:30 | 1410 |

## 3. 解锁规则（三个阶段，中国时区）

| 日期 | `max_slot` | 效果 |
|---|---|---|
| **823 及之前** | `-1` | 全部只有预告；牵红线只弹表情包，不解锁任何内容 |
| **824** | `小时×60 + 分钟` | 按客户时间表逐封开启（第 1 封 00:24） |
| **825 及之后** | `1441` | 52 封全开，永久保留 |

> ⚠️ 这一段要和前端 `app.js` 的 `currentPhase()` 保持一致。
> 前端控制「显示什么」，服务端控制「下发什么」，两边都要对。

**管理员预览**：`?preview=<管理密钥>` 可无视时间全部解锁（见 README）。

## 4. 服务端 RPC（关键：防止提前偷看）

粉丝端**不再直接 select letters**，改走这个 RPC。
服务端按中国时间判断解锁，未解锁的信只返回预告字段。

```sql
create or replace function public_get_letters()
returns table (
  id bigint, slot int, title text,
  unlocked boolean,
  teaser_text text, teaser_image text,
  body text, image text, images jsonb, video text, videos jsonb,
  link text, link_text text,
  author_id bigint, author_name text, author_avatar text, author_bio text
)
language plpgsql
security definer
as $$
declare
  cn        timestamp := (now() at time zone 'Asia/Shanghai');
  m         int;
  d         int;
  max_slot  int;
begin
  m := extract(month from cn)::int;
  d := extract(day   from cn)::int;

  -- 三个阶段（slot = 当天第几分钟开启）：
  --   823 及之前 → -1（到点解锁全关，只有预告）
  --   824        → 当前分钟数，按客户时间表逐封开
  --   825 及之后 → 1441（52 封全开）
  max_slot := case
    when m = 8 and d = 24 then (extract(hour from cn)::int * 60
                                + extract(minute from cn)::int)
    when m > 8 or (m = 8 and d >= 25) then 1441
    else -1
  end;

  return query
  select
    L.id, L.slot, L.title,
    (L.slot <= max_slot)                                   as unlocked,
    L.teaser_text, L.teaser_image,
    case when L.slot <= max_slot then L.body      else '' end,
    case when L.slot <= max_slot then L.image     else '' end,
    case when L.slot <= max_slot then coalesce(L.images,'[]'::jsonb) else '[]'::jsonb end,
    case when L.slot <= max_slot then L.video     else '' end,
    case when L.slot <= max_slot then coalesce(L.videos,'[]'::jsonb) else '[]'::jsonb end,
    case when L.slot <= max_slot then L.link      else '' end,
    case when L.slot <= max_slot then L.link_text else '' end,
    -- 作者信息「永远下发」：823 的牵红线要靠它配对，
    -- 而且作者是谁本来就不是秘密；真正保密的是上面的正文/影片/图片。
    L.author_id, coalesce(A.name,''), coalesce(A.avatar,''), coalesce(A.bio,'')
  from letters L
  left join authors A on A.id = L.author_id
  where L.is_live = true
  order by L.slot asc;
end;
$$;

grant execute on function public_get_letters() to anon;
```

### 管理员预览版（带密钥，全解锁）

```sql
create or replace function preview_get_letters(p_key text)
returns table (
  id bigint, slot int, title text,
  unlocked boolean,
  teaser_text text, teaser_image text,
  body text, image text, images jsonb, video text, videos jsonb,
  link text, link_text text,
  author_id bigint, author_name text, author_avatar text, author_bio text
)
language plpgsql
security definer
as $$
begin
  if p_key is distinct from current_setting('app.admin_key', true) then
    raise exception 'bad key';
  end if;

  return query
  select L.id, L.slot, L.title, true,
         L.teaser_text, L.teaser_image,
         L.body, L.image, coalesce(L.images,'[]'::jsonb),
         L.video, coalesce(L.videos,'[]'::jsonb),
         L.link, L.link_text,
         L.author_id, A.name, A.avatar, A.bio
  from letters L
  left join authors A on A.id = L.author_id
  where L.is_live = true
  order by L.slot asc;
end;
$$;

grant execute on function preview_get_letters(text) to anon;
```

> `app.admin_key` 沿用现有 admin RPC 的密钥设置方式。
> 若现有 `admin_list_letters` 用的是别的校验方式，请把上面的 `if` 改成一致的写法。

## 5. 作者管理 RPC（后台用）

沿用现有 `admin_*` 系列的密钥校验风格：

```sql
create or replace function admin_list_authors(p_key text)
returns setof authors
language plpgsql security definer as $$
begin
  if p_key is distinct from current_setting('app.admin_key', true) then
    raise exception 'bad key';
  end if;
  return query select * from authors order by sort_order asc, id asc;
end; $$;

create or replace function admin_add_author(p_key text)
returns bigint
language plpgsql security definer as $$
declare new_id bigint;
begin
  if p_key is distinct from current_setting('app.admin_key', true) then
    raise exception 'bad key';
  end if;
  insert into authors(name) values('新作者') returning id into new_id;
  return new_id;
end; $$;

create or replace function admin_update_author(
  p_key text, p_id bigint, p_name text, p_avatar text, p_bio text, p_sort int)
returns void
language plpgsql security definer as $$
begin
  if p_key is distinct from current_setting('app.admin_key', true) then
    raise exception 'bad key';
  end if;
  update authors set name=p_name, avatar=p_avatar, bio=p_bio, sort_order=p_sort
  where id=p_id;
end; $$;

create or replace function admin_delete_author(p_key text, p_id bigint)
returns void
language plpgsql security definer as $$
begin
  if p_key is distinct from current_setting('app.admin_key', true) then
    raise exception 'bad key';
  end if;
  delete from authors where id=p_id;
end; $$;

grant execute on function admin_list_authors(text)  to anon;
grant execute on function admin_add_author(text)    to anon;
grant execute on function admin_update_author(text,bigint,text,text,text,int) to anon;
grant execute on function admin_delete_author(text,bigint) to anon;
```

## 6. `admin_update_letter`（多图 + 多影片）

一封信可以放**多张图**和**多支影片**：存进 `letters.images` / `letters.videos`
两个 JSON 阵列；旧的单张 `image` / 单支 `video` 仍保留、仍相容
（前台读阵列，阵列空就退回旧栏位）。

先加两个栏位：

```sql
alter table letters add column if not exists images  jsonb default '[]'::jsonb;
alter table letters add column if not exists videos  jsonb default '[]'::jsonb;
```

改签名要先 drop 旧的（参数个数变了）：

```sql
-- 旧签名（14 参，无 p_images/p_videos）
drop function if exists admin_update_letter(text,bigint,text,text,text,text,text,text,text,text,bigint,int,boolean,int);
-- 加过多图之后的签名（15 参，有 p_images 无 p_videos）
drop function if exists admin_update_letter(text,bigint,text,text,text,text,text,text,text,text,text,bigint,int,boolean,int);

create or replace function admin_update_letter(
  p_key text, p_id bigint,
  p_title text, p_body text,
  p_image text, p_images text,
  p_video text, p_videos text,
  p_link text, p_link_text text,
  p_teaser_text text, p_teaser_image text,
  p_author_id bigint, p_slot int,
  p_is_live boolean, p_sort int)
returns void
language plpgsql security definer as $$
begin
  if p_key is distinct from current_setting('app.admin_key', true) then
    raise exception 'bad key';
  end if;
  update letters set
    title=p_title, body=p_body,
    image=p_image,  images=coalesce(nullif(p_images,'')::jsonb, '[]'::jsonb),
    video=p_video,  videos=coalesce(nullif(p_videos,'')::jsonb, '[]'::jsonb),
    link=p_link, link_text=p_link_text,
    teaser_text=p_teaser_text, teaser_image=p_teaser_image,
    author_id=p_author_id, slot=p_slot,
    is_live=p_is_live, sort_order=p_sort
  where id=p_id;
end; $$;

grant execute on function admin_update_letter(text,bigint,text,text,text,text,text,text,text,text,text,text,bigint,int,boolean,int) to anon;
```

⚠️ `public_get_letters` / `preview_get_letters` 的 returns table 也要加
`images jsonb, videos jsonb` 两栏并一起 select，否则前台读不到阵列。

## 7. 槽位管理 RPC（初始化 / 新增一封）

后台「初始化 52 封」按钮会调用这个 RPC（只补缺，不动已有的信）：

```sql
create or replace function admin_init_slots(p_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  -- 客户提供的 52 个开启时间：0:24, 0:30, 1:00, 1:09 … 23:30（存为当天第几分钟）
  schedule int[] := array[
      24,   30,   60,   69,   90,  120,  150,  180,
     210,  240,  261,  300,  320,  360,  390,  420,
     450,  480,  504,  510,  540,  570,  600,  630,
     660,  690,  720,  750,  794,  810,  840,  870,
     900,  930,  960,  990, 1020, 1040, 1050, 1080,
    1110, 1140, 1170, 1200, 1224, 1260, 1290, 1320,
    1350, 1364, 1380, 1410];
  t int;
begin
  perform _check_key(p_key);
  foreach t in array schedule loop
    if not exists (select 1 from letters where slot = t) then
      insert into letters (title, slot, sort_order, is_live, teaser_text)
      values (lpad((t/60)::text,2,'0') || ':' || lpad((t%60)::text,2,'0'),
              t, t, false, '还没到时候…');
    end if;
  end loop;
end; $$;

grant execute on function admin_init_slots(text) to anon;
```

### `admin_add_letter`：后台「新增一封信」

后台那颗「＋ 新增一封信」按钮调这个 RPC。它在时间表里找**第一个还没被占用的时段**，
用那个时段建一封空信；全部用完就报错。

⚠️ 这个函数里的时间表数组**必须和上面 `admin_init_slots` 保持一致**。
48 → 52 时如果只改了 `admin_init_slots`，这里还是 48 个，
新增到第 48 封就会报「48 个时段都用完了」。

```sql
create or replace function admin_add_letter(p_key text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  -- 和 admin_init_slots 同一份时间表（52 个）
  schedule int[] := array[
      24,   30,   60,   69,   90,  120,  150,  180,
     210,  240,  261,  300,  320,  360,  390,  420,
     450,  480,  504,  510,  540,  570,  600,  630,
     660,  690,  720,  750,  794,  810,  840,  870,
     900,  930,  960,  990, 1020, 1040, 1050, 1080,
    1110, 1140, 1170, 1200, 1224, 1260, 1290, 1320,
    1350, 1364, 1380, 1410];
  t int; new_id bigint; pick int := null;
begin
  perform _check_key(p_key);
  foreach t in array schedule loop
    if not exists (select 1 from letters where slot = t) then
      pick := t; exit;
    end if;
  end loop;
  if pick is null then raise exception '52 个时段都用完了'; end if;
  insert into letters (title, slot, sort_order, is_live, teaser_text)
  values ('（未命名）', pick, pick, false, '')
  returning id into new_id;
  return new_id;
end; $$;

grant execute on function admin_add_letter(text) to anon;
```

### 旧数据迁移（只需一次）

之前建的信 slot 是「半小时序号」（0、1、3…），要映射到新时间表：
按原顺序排好，依次套上时间表的前几个时间。

```sql
with sched as (
  select t, row_number() over () as rn
  from unnest(array[
      24,   30,   60,   69,   90,  120,  150,  180,
     210,  240,  261,  300,  320,  360,  390,  420,
     450,  480,  504,  510,  540,  570,  600,  630,
     660,  690,  720,  750,  794,  810,  840,  870,
     900,  930,  960,  990, 1020, 1040, 1050, 1080,
    1110, 1140, 1170, 1200, 1224, 1260, 1290, 1320,
    1350, 1364, 1380, 1410]) as t
),
ordered as (
  select id, row_number() over (order by slot, id) as rn from letters
)
update letters L
   set slot = s.t, sort_order = s.t
  from ordered o join sched s using (rn)
 where L.id = o.id;
```

## 8. `messages` 表：停用但保留

粉丝留言功能已移除，前端不再读写 `messages`。
表**不要删**（历史留言是客户资产）。若想彻底关闭写入：

```sql
drop policy if exists "messages_public_insert" on messages;
```
