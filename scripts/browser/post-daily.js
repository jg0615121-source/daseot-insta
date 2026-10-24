// API 받기 전 임시: 오늘 슬라이드를 사용자 PC의 Edge(전용 프로필)로 인스타에 게시한다.
// PC 작업 스케줄러 '다섯가지 인스타 게시'가 07:30부터 매시간 실행. 위치: %LOCALAPPDATA%\daseot-browser\post-daily.js
// 해시태그 줄은 캡션에서 빼서 첫 댓글로 단다. REEL_DAYS 요일에는 같은 내용 릴스도 올린다.
// 시험: set DRY=1 && node post-daily.js 2026-10-24  (공유 직전까지만)
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const { chromium } = require('playwright-core');
const HOME = __dirname, LOG = path.join(HOME, 'post.log'), DRY = process.env.DRY === '1';
const REEL_DAYS = (process.env.REEL_DAYS || '').split(',').filter(Boolean).map(Number); // 릴스 올릴 요일(0=일). 지금은 끔: 같은 내용 슬라이드쇼는 의미 없음
const log = m => { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); console.log(m); };
const day = process.argv[2] || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const mark = k => path.join(HOME, 'posted', day + k + '.done');
const RAW = `https://raw.githubusercontent.com/jg0615121-source/daseot-images/main/${day}/`;

async function grab(name, dir) {
  const r = await fetch(RAW + name);
  if (!r.ok) return null;
  const f = path.join(dir, name);
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return f;
}

function split(caption) {
  const lines = caption.split('\n'), tag = l => /^\s*(#\S+\s*)+$/.test(l);
  return {
    text: lines.filter(l => !tag(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    tags: lines.filter(tag).join(' ').trim(),
  };
}

async function publish(page, files, text, video) {
  const d = () => page.locator('[role=dialog]').last();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  await page.locator('svg[aria-label="새로운 게시물"]').first().click(); await page.waitForTimeout(2500);
  await page.getByText('게시물', { exact: true }).first().click(); await page.waitForTimeout(3000);
  await page.locator('[role=dialog] input[type=file]').first().setInputFiles(files); await page.waitForTimeout(video ? 15000 : 7000);
  const ok = d().getByRole('button', { name: '확인' });  // "동영상은 릴스로 공유됩니다" 안내
  if (await ok.count()) { await ok.first().click(); await page.waitForTimeout(1500); }
  await d().locator('svg[aria-label="자르기 선택"]').click(); await page.waitForTimeout(1500);
  await d().getByText(video ? '원본' : '4:5', { exact: true }).click(); await page.waitForTimeout(1500);
  await d().getByText('다음', { exact: true }).click(); await page.waitForTimeout(video ? 6000 : 3000);
  await d().getByText('다음', { exact: true }).click(); await page.waitForTimeout(3000);
  await page.locator('[role=dialog] div[contenteditable=true]').last().click();
  await page.keyboard.insertText(text); await page.waitForTimeout(1500);
  if (DRY) { log(`${day} DRY: 공유 직전까지 성공 (${video ? '릴스' : '게시물'})`); return true; }
  await d().getByText('공유하기', { exact: true }).click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000);
    if (/공유되었습니다/.test(await d().innerText().catch(() => ''))) return true;
  }
  return false;
}

async function firstComment(page, tags) {
  if (!tags || DRY) return;
  await page.goto('https://www.instagram.com/daseot.today/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  await page.locator('a[href*="/p/"], a[href*="/reel/"]').first().click(); await page.waitForTimeout(4000);
  await page.locator('textarea[aria-label^="댓글 달기"]').first().click();
  await page.keyboard.insertText(tags); await page.waitForTimeout(800);
  await page.keyboard.press('Enter'); await page.waitForTimeout(4000);
  log(`${day} 해시태그 첫 댓글 달기`);
}

(async () => {
  const wantReel = REEL_DAYS.includes(new Date(day + 'T12:00:00+09:00').getUTCDay());
  if (fs.existsSync(mark('')) && (!wantReel || fs.existsSync(mark('.reel')))) return;
  const tok = execSync('gh auth token').toString().trim();
  const r = await fetch(`https://api.github.com/repos/jg0615121-source/daseot-insta/contents/posts/${day}.json`,
    { headers: { Authorization: 'token ' + tok, Accept: 'application/vnd.github.raw' } });
  if (!r.ok) { log(day + ' 원고 없음'); return; }
  const post = await r.json();
  fs.mkdirSync(path.join(HOME, 'posted'), { recursive: true });
  if (post.published_id) { fs.writeFileSync(mark(''), 'api'); return; }
  const dir = path.join(HOME, 'slides', day); fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let i = 1; i <= 10; i++) { const f = await grab(String(i).padStart(2, '0') + '.jpg', dir); if (!f) break; files.push(f); }
  if (files.length < 2) { log(day + ' 슬라이드 아직 없음'); return; }
  const { text, tags } = split(post.caption);
  const ctx = await chromium.launchPersistentContext(path.join(HOME, 'profile'), {
    channel: 'msedge', headless: false, viewport: null, locale: 'ko-KR',
    ignoreDefaultArgs: ['--enable-automation'], args: ['--disable-blink-features=AutomationControlled'] });
  try {
    const page = ctx.pages()[0] || await ctx.newPage();
    if (!fs.existsSync(mark(''))) {
      if (await publish(page, files, text, false)) {
        if (!DRY) fs.writeFileSync(mark(''), 'browser');
        log(`${day} 게시 완료 ${files.length}장`);
        await page.waitForTimeout(5000); await firstComment(page, tags);
      } else log(day + ' 게시 확인 시간 초과');
    }
    if (wantReel && !fs.existsSync(mark('.reel'))) {
      const v = await grab('reel.mp4', dir);
      if (!v) log(day + ' 릴스 영상 없음');
      else if (await publish(page, [v], text, true)) {
        if (!DRY) fs.writeFileSync(mark('.reel'), 'browser');
        log(day + ' 릴스 게시 완료');
        await page.waitForTimeout(5000); await firstComment(page, tags);
      } else log(day + ' 릴스 확인 시간 초과');
    }
  } catch (e) { log(day + ' 오류 ' + e.message.split('\n')[0]); }
  finally { await ctx.close(); }
})().catch(e => log(day + ' 오류 ' + e.message));
