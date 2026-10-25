// API 받기 전 임시: 오늘 슬라이드를 사용자 PC의 엣지 게시 전용 프로필 창으로 인스타에 게시한다.
// 엣지 전용 프로필 창(profile 폴더, 디버깅 포트 9333)은 늘 띄워 두고 이 스크립트는 거기에 붙어 탭 하나만 쓰고 닫는다.
// 창이 꺼져 있으면 새로 띄우고, 다 써도 창은 닫지 않는다 (로그인 유지, 사람이 바로 볼 수 있게).
// PC 작업 스케줄러 '다섯가지 인스타 게시'가 07:30부터 매시간 실행. 위치: %LOCALAPPDATA%\daseot-browser\post-daily.js
// 초반엔 하루 두 번: 아침 편 posts/날짜.json(07시~), 저녁 편 posts/날짜-2.json(EVENING_HOUR시~, 기본 19).
// 해시태그는 캡션 맨 끝에 그대로 둔다 (인스타 검색이 캡션을 읽음, 게시물당 최대 5개).
// 시험: set DRY=1 && node post-daily.js 2026-10-24  (공유 직전까지만)
const fs = require('fs'), path = require('path'), { execSync, spawn } = require('child_process');
const { chromium } = require('playwright-core');
const HOME = __dirname, LOG = path.join(HOME, 'post.log'), DRY = process.env.DRY === '1';
const EVENING_HOUR = +(process.env.EVENING_HOUR || 19);
const PORT = 9333, EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const log = m => { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); console.log(m); };
const now = new Date(Date.now() + 9 * 3600e3), day = process.argv[2] || now.toISOString().slice(0, 10);
// 날짜를 직접 주면 시간 상관없이 두 편 다 시도
const slots = [day, ...(process.argv[2] || now.getUTCHours() >= EVENING_HOUR ? [day + '-2'] : [])];
const mark = id => path.join(HOME, 'posted', id + '.done');
const RAW = id => `https://raw.githubusercontent.com/jg0615121-source/daseot-images/main/${id}/`;

async function grab(id, name, dir) {
  const r = await fetch(RAW(id) + name);
  if (!r.ok) return null;
  const f = path.join(dir, name);
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return f;
}

async function publish(page, files, text) {
  const d = () => page.locator('[role=dialog]').last();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  await page.locator('svg[aria-label="새로운 게시물"]').first().click(); await page.waitForTimeout(2500);
  await page.getByText('게시물', { exact: true }).first().click(); await page.waitForTimeout(3000);
  await page.locator('[role=dialog] input[type=file]').first().setInputFiles(files); await page.waitForTimeout(7000);
  await d().locator('svg[aria-label="자르기 선택"]').click(); await page.waitForTimeout(1500);
  await d().getByText('4:5', { exact: true }).click(); await page.waitForTimeout(1500);
  await d().getByText('다음', { exact: true }).click(); await page.waitForTimeout(3000);
  await d().getByText('다음', { exact: true }).click(); await page.waitForTimeout(3000);
  await page.locator('[role=dialog] div[contenteditable=true]').last().click();
  await page.keyboard.insertText(text); await page.waitForTimeout(1500);
  if (DRY) { log('DRY: 공유 직전까지 성공'); return true; }
  await d().getByText('공유하기', { exact: true }).click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000);
    if (/공유되었습니다/.test(await d().innerText().catch(() => ''))) return true;
  }
  return false;
}

// 원고 하나(id = 날짜 또는 날짜-2)의 슬라이드를 받아둔다. 이미 올렸거나 아직 준비 안 됐으면 null
async function prepare(tok, id) {
  if (fs.existsSync(mark(id))) return null;
  const r = await fetch(`https://api.github.com/repos/jg0615121-source/daseot-insta/contents/posts/${id}.json`,
    { headers: { Authorization: 'token ' + tok, Accept: 'application/vnd.github.raw' } });
  if (!r.ok) { log(id + ' 원고 없음'); return null; }
  const p = await r.json();
  if (p.published_id) { fs.writeFileSync(mark(id), 'api'); return null; }
  const dir = path.join(HOME, 'slides', id); fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let i = 1; i <= 10; i++) { const f = await grab(id, String(i).padStart(2, '0') + '.jpg', dir); if (!f) break; files.push(f); }
  if (files.length < 2) { log(id + ' 슬라이드 아직 없음'); return null; }
  return { id, files, caption: p.caption.trim() };
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
  if (slots.every(id => fs.existsSync(mark(id)))) return;
  fs.mkdirSync(path.join(HOME, 'posted'), { recursive: true });
  const tok = execSync('gh auth token').toString().trim();
  const todo = [];
  for (const id of slots) { const t = await prepare(tok, id); if (t) todo.push(t); }
  if (!todo.length) return;
  const browser = await openEdge();
  const page = await browser.contexts()[0].newPage();
  try {
    for (const { id, files, caption } of todo) {
      if (await publish(page, files, caption)) {
        if (!DRY) fs.writeFileSync(mark(id), 'browser');
        log(`${id} 게시 완료 ${files.length}장`);
        await page.waitForTimeout(5000);
      } else log(id + ' 게시 확인 시간 초과');
    }
  } catch (e) { log(day + ' 오류 ' + e.message.split('\n')[0]); }
  finally { await page.close().catch(() => {}); process.exit(0); }  // 창은 닫지 않고 연결만 끊음
})().catch(e => log(day + ' 오류 ' + e.message));
