// 게시 전용 엣지 창(9333)에 탭 하나 열어, 참고 계정 화면을 열 때 인스타가 받아오는 데이터를 가로채 refs.json 으로 저장한다.
// (2026-11 부터 /api/v1/users/web_profile_info 가 404 라서 화면 열기 방식으로 바꿈)
// PC 위치: %LOCALAPPDATA%\daseot-browser\refs.js (원본은 이 파일, 고치면 PC에 다시 내려받기)
// node refs.js 아이디 아이디 ...   또는  node refs.js q:검색어
// 하나 여는 데 1~2분. 한 번에 15개 안쪽으로 (많이 돌리면 429로 막힘). 요약은 refs_summary.js
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', URL = 'http://127.0.0.1:9333';
async function openEdge() {
  try { return await chromium.connectOverCDP(URL); } catch {}
  spawn(EDGE, [`--user-data-dir=${path.join(__dirname, 'profile')}`, '--remote-debugging-port=9333', '--no-first-run'],
    { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try { return await chromium.connectOverCDP(URL); } catch {}
  }
  throw new Error('게시 전용 창에 연결 못 함');
}
// 받은 JSON 안을 뒤져 게시물(code 있는 것)과 사용자(follower_count 있는 것)를 모은다
function walk(o, posts, users) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach(x => walk(x, posts, users)); return; }
  if (typeof o.code === 'string' && (o.taken_at || o.like_count !== undefined)) {
    const c = o.caption && o.caption.text || '';
    const iv = o.image_versions2 && o.image_versions2.candidates && o.image_versions2.candidates[0];
    const car = o.carousel_media && o.carousel_media[0] && o.carousel_media[0].image_versions2;
    posts.set(o.code, {
      sc: o.code, owner: o.user && o.user.username, t: o.taken_at ? new Date(o.taken_at * 1000).toISOString().slice(0, 10) : '',
      type: { 1: 'photo', 2: 'video', 8: 'carousel' }[o.media_type] || o.media_type, product: o.product_type,
      n: o.carousel_media_count || 1, likes: o.like_count, comments: o.comment_count, views: o.play_count || o.view_count || o.ig_play_count,
      img: (iv || (car && car.candidates[0]) || {}).url, cap: c.slice(0, 900),
    });
  }
  if (typeof o.username === 'string' && (o.follower_count !== undefined || o.full_name !== undefined)) {
    const u = users.get(o.username) || {};
    users.set(o.username, { ...u, u: o.username, n: o.full_name ?? u.n, f: o.follower_count ?? u.f, bio: o.biography ?? u.bio, posts: o.media_count ?? u.posts });
  }
  for (const k in o) walk(o[k], posts, users);
}
(async () => {
  const b = await openEdge();
  const p = await b.contexts()[0].newPage();
  let bag = [];
  p.on('response', async r => {
    const u = r.url();
    if (!/graphql|\/api\/v1\//.test(u)) return;
    try { bag.push(await r.json()); } catch {}
  });
  const out = [];
  try {
    for (const a of process.argv.slice(2)) {
      bag = [];
      const q = a.startsWith('q:') ? a.slice(2) : null;
      const url = q ? 'https://www.instagram.com/explore/search/keyword/?q=' + encodeURIComponent(q) : `https://www.instagram.com/${a}/`;
      await p.goto(url, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(7000);
      for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 2500); await p.waitForTimeout(2500); }
      // 페이지에 처음부터 박혀 오는 데이터도 뒤진다
      const inl = await p.$$eval('script[type="application/json"]', ss => ss.map(s => s.textContent)).catch(() => []);
      for (const s of inl) { if (/"code"|follower_count/.test(s)) { try { bag.push(JSON.parse(s)); } catch {} } }
      const posts = new Map(), users = new Map();
      walk(bag, posts, users);
      const meta = await p.$eval('meta[property="og:description"]', m => m.content).catch(() => '');
      const links = await p.$$eval('a[href*="/p/"], a[href*="/reel/"]', as => [...new Set(as.map(a => a.getAttribute('href')))]).catch(() => []);
      if (q) {
        out.push({ q, users: [...users.values()].sort((x, y) => (y.f || 0) - (x.f || 0)), media: [...posts.values()], links });
      } else {
        out.push({ user: a, info: users.get(a) || null, meta, media: [...posts.values()].filter(m => !m.owner || m.owner === a), links });
      }
      console.log(a, 'posts', posts.size, 'links', links.length);
      await p.waitForTimeout(4000 + Math.random() * 3000);
    }
  } finally { await p.close().catch(() => {}); }
  fs.writeFileSync(path.join(__dirname, 'refs.json'), JSON.stringify(out, null, 1));
  console.log('OK ' + out.length);
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
