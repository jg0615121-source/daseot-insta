// 매주 참고 계정 수집: refs.js로 충주 계정들을 모으고, 최근 14일 게시물 요약을 저장소 docs/refs/latest.md 에 올린다.
// 원고를 쓰는 Claude가 이 파일을 보고 다른 계정이 이미 올린 소식을 거르거나 차별 정보를 붙인다 (STYLE_GUIDE '겹치지 않기').
// PC 작업 스케줄러 '줌인 참고계정 수집'이 매주 월요일 04:10 실행. 위치: %LOCALAPPDATA%\daseot-browser\refs-weekly.js
// 저장소 올리기는 PC에 로그인된 gh 로 한다.
const fs = require('fs'), path = require('path'), { spawnSync, execFileSync } = require('child_process');
const HOME = __dirname, REPO = 'jg0615121-source/daseot-insta', FILE = 'docs/refs/latest.md';
const TARGETS = ['cj_yoyak', 'hotchungju', 'cj___insta', 'chungju_gajago', 'foo_foodit', 'date.in.chungcheongdo',
  'chungsta', 'cj_hoit', 'chungju_mohip', 'cjtaste_', 'zoomin._center', 'q:충주가볼만한곳', 'q:충주축제'];
const log = m => fs.appendFileSync(path.join(HOME, 'post.log'), new Date().toISOString() + ' [refs] ' + m + '\n');

const r = spawnSync(process.execPath, [path.join(HOME, 'refs.js'), ...TARGETS], { cwd: HOME, encoding: 'utf8', timeout: 90 * 60e3 });
if (!/OK \d+/.test(r.stdout || '')) { log('수집 실패 ' + (r.stdout || '').slice(-200)); process.exit(1); }
const data = JSON.parse(fs.readFileSync(path.join(HOME, 'refs.json'), 'utf8'));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);

const out = [`# 충주 참고 계정 최근 14일 (${today} 수집)`, '',
  '자동 생성 (scripts/browser/refs-weekly.js). 원고 쓸 때 여기 나온 소식은 이미 다른 계정이 다룬 것: 빼거나 그들이 안 쓴 정보를 붙인다.', '',
  '형식: 날짜 · 계정 · 형식 · 좋아요/댓글 · 캡션 첫 두 줄', ''];
const seen = new Set(), rows = [];
for (const x of data) for (const m of x.media) {
  if (!m.t || m.t < since || seen.has(m.sc)) continue;
  seen.add(m.sc);
  const lines = (m.cap || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 2).join(' / ').slice(0, 140);
  rows.push({ t: m.t, who: m.owner || x.user || x.q, kind: m.product === 'clips' ? '릴스' : m.type === 'carousel' ? `캐러셀${m.n}장` : '사진', l: m.likes || 0, c: m.comments || 0, lines });
}
rows.sort((a, b) => b.t.localeCompare(a.t) || b.l - a.l);
for (const z of rows) out.push(`- ${z.t} · @${z.who} · ${z.kind} · ${z.l}/${z.c} · ${z.lines.replace(/\|/g, '/')}`);
out.push('', '## 계정 정보', '');
for (const x of data) if (x.info) out.push(`- @${x.user} ${x.info.n || ''} · 팔로워 ${x.info.f} · 게시물 ${x.info.posts}`);
const body = out.join('\n') + '\n';
fs.writeFileSync(path.join(HOME, 'refs-latest.md'), body);

// 저장소에 올리기 (있으면 sha 붙여 덮어쓰기)
let sha = '';
try { sha = execFileSync('gh', ['api', `repos/${REPO}/contents/${FILE}`, '--jq', '.sha'], { windowsHide: true }).toString().trim(); } catch {}
const args = ['api', '-X', 'PUT', `repos/${REPO}/contents/${FILE}`, '-f', `message=참고 계정 수집 ${today}`,
  '-f', 'content=' + Buffer.from(body).toString('base64'),
  '-f', 'committer[name]=daseot-bot', '-f', 'committer[email]=daseot-bot@users.noreply.github.com'];
if (sha) args.push('-f', 'sha=' + sha);
try { execFileSync('gh', args, { windowsHide: true }); log(`올림 ${rows.length}건`); }
catch (e) { log('올리기 실패 ' + String(e.message).slice(0, 200)); process.exit(1); }
