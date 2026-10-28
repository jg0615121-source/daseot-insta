// API 받기 전 임시: 오늘 슬라이드와 릴스를 사용자 PC의 엣지 게시 전용 프로필 창으로 인스타에 게시한다.
// 엣지 전용 프로필 창(profile 폴더, 디버깅 포트 9333)은 늘 띄워 두고 이 스크립트는 거기에 붙어 탭 하나만 쓰고 닫는다.
// 창이 꺼져 있으면 새로 띄우고, 다 써도 창은 닫지 않는다 (로그인 유지, 사람이 바로 볼 수 있게).
// PC 작업 스케줄러 '다섯가지 인스타 게시'가 07:30부터 21:30까지 매시간 실행. 위치: %LOCALAPPDATA%\daseot-browser\post-daily.js
// 하루 4개 (2026-10-28부터): 아침 카드뉴스 posts/날짜.json(07시~) → 아침 릴스(12시~) → 저녁 카드뉴스 날짜-2(19시~) → 저녁 릴스(21시~)
// 릴스는 Actions가 만든 reel.mp4(이미지 저장소)와 원고의 reel_caption을 쓴다. 같은 편 카드뉴스가 올라간 뒤에만 올린다.
// 해시태그는 캡션 맨 끝에 그대로 둔다 (인스타 검색이 캡션을 읽음, 게시물당 최대 5개).
// 시험: set DRY=1 && node post-daily.js 2026-10-24  (공유 직전까지만, 날짜를 주면 시간 상관없이 전부 시도)
const fs = require('fs'), path = require('path'), { execFileSync, spawn } = require('child_process');
const { chromium } = require('playwright-core');
const HOME = __dirname, LOG = path.join(HOME, 'post.log'), DRY = process.env.DRY === '1';
const EVENING_HOUR = +(process.env.EVENING_HOUR || 19), NOON_REEL = 12, NIGHT_REEL = 21;
const PORT = 9333, EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const log = m => { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); console.log(m); };
const now = new Date(Date.now() + 9 * 3600e3), day = process.argv[2] || now.toISOString().slice(0, 10);
const hour = process.argv[2] ? 99 : now.getUTCHours();
// 순서대로 시도: 카드뉴스가 릴스보다 먼저
const jobs = [
  { id: day, reel: false },
  ...(hour >= NOON_REEL ? [{ id: day, reel: true }] : []),
  ...(hour >= EVENING_HOUR ? [{ id: day + '-2', reel: false }] : []),
  ...(hour >= NIGHT_REEL ? [{ id: day + '-2', reel: true }] : []),
];
const mark = (id, reel) => path.join(HOME, 'posted', id + (reel ? '.reel' : '') + '.done');
const RAW = id => `https://raw.githubusercontent.com/jg0615121-source/daseot-images/main/${id}/`;

async function grab(id, name, dir) {
  const r = await fetch(RAW(id) + name);
  if (!r.ok) return null;
  const f = path.join(dir, name);
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return f;
}

async function publish(page, files, text, video) {
  const d = () => page.locator('[role=dialog]').last();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  await page.locator('svg[aria-label="새로운 게시물"]').first().click(); await page.waitForTimeout(2500);
  await page.getByText('게시물', { exact: true }).first().click(); await page.waitForTimeout(3000);
  await page.locator('[role=dialog] input[type=file]').first().setInputFiles(files); await page.waitForTimeout(video ? 15000 : 7000);
  const ok = d().getByRole('button', { name: '확인' });  // "동영상 게시물은 릴스로 공유됩니다" 안내
  if (await ok.count()) { await ok.first().click(); await page.waitForTimeout(1500); }
  await d().locator('svg[aria-label="자르기 선택"]').click(); await page.waitForTimeout(1500);
  await d().getByText(video ? '원본' : '4:5', { exact: true }).click(); await page.waitForTimeout(1500);
  await d().getByText('다음', { exact: true }).click(); await page.waitForTimeout(video ? 6000 : 3000);
  await d().getByText('다음', { exact: true }).click(); await page.waitForTimeout(3000);
  await page.locator('[role=dialog] div[contenteditable=true]').last().click();
  await page.keyboard.insertText(text); await page.waitForTimeout(1500);
  if (DRY) { log(`DRY: 공유 직전까지 성공 (${video ? '릴스' : '카드뉴스'})`); return true; }
  await d().getByText('공유하기', { exact: true }).click();
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(3000);
    if (/공유되었습니다/.test(await d().innerText().catch(() => ''))) return true;
  }
  return false;
}

// 할 일 하나를 준비한다. 이미 올렸거나 아직 준비 안 됐으면 null
async function prepare(tok, { id, reel }) {
  if (fs.existsSync(mark(id, reel))) return null;
  if (reel && !fs.existsSync(mark(id, false))) return null;  // 같은 편 카드뉴스 먼저
  const r = await fetch(`https://api.github.com/repos/jg0615121-source/daseot-insta/contents/posts/${id}.json`,
    { headers: { ...(tok ? { Authorization: 'token ' + tok } : {}), Accept: 'application/vnd.github.raw' } });
  if (!r.ok) { if (!reel) log(id + ' 원고 없음'); return null; }
  const p = await r.json();
  if (!reel && p.published_id) { fs.writeFileSync(mark(id, false), 'api'); return null; }
  const dir = path.join(HOME, 'slides', id); fs.mkdirSync(dir, { recursive: true });
  if (reel) {
    if (!p.reel_caption) { log(id + ' 릴스 캡션 없음'); return null; }
    const v = await grab(id, 'reel.mp4', dir);
    if (!v) { log(id + ' 릴스 영상 아직 없음'); return null; }
    return { id, reel, files: [v], caption: p.reel_caption.trim() };
  }
  const files = [];
  for (let i = 1; i <= 10; i++) { const f = await grab(id, String(i).padStart(2, '0') + '.jpg', dir); if (!f) break; files.push(f); }
  if (files.length < 2) { log(id + ' 슬라이드 아직 없음'); return null; }
  return { id, reel, files, caption: p.caption.trim() };
}

// 떠 있는 엣지 게시 전용 창에 붙는다. 없으면 띄운다
async function openEdge() {
  const url = `http://127.0.0.1:${PORT}`;
  try { return await chromium.connectOverCDP(url); } catch {}
  spawn(EDGE, [`--user-data-dir=${path.join(HOME, 'profile')}`, `--remote-debugging-port=${PORT}`, '--no-first-run'],
    { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try { return await chromium.connectOverCDP(url); } catch {}
  }
  throw new Error('엣지 게시 창에 연결 못 함');
}

(async () => {
  if (jobs.every(j => fs.existsSync(mark(j.id, j.reel)))) return;
  fs.mkdirSync(path.join(HOME, 'posted'), { recursive: true });
  // 작업 스케줄러에서 cmd.exe 실행이 막혀(EPERM) 셸 없이 gh를 부르고, 실패해도 공개 저장소라 토큰 없이 진행
  let tok = '';
  try { tok = execFileSync('gh', ['auth', 'token'], { windowsHide: true }).toString().trim(); } catch {}
  let browser, page;
  try {
    for (const job of jobs) {
      const t = await prepare(tok, job);
      if (!t) continue;
      if (!page) { browser = await openEdge(); page = await browser.contexts()[0].newPage(); }
      const what = t.reel ? '릴스' : '카드뉴스';
      if (await publish(page, t.files, t.caption, t.reel)) {
        if (!DRY) fs.writeFileSync(mark(t.id, t.reel), 'browser');
        log(`${t.id} ${what} 게시 완료${t.reel ? '' : ' ' + t.files.length + '장'}`);
        await page.waitForTimeout(5000);
      } else log(`${t.id} ${what} 게시 확인 시간 초과`);
    }
  } catch (e) { log(day + ' 오류 ' + e.message.split('\n')[0]); }
  finally { if (page) await page.close().catch(() => {}); process.exit(0); }  // 창은 닫지 않고 연결만 끊음
})().catch(e => log(day + ' 오류 ' + e.message));
