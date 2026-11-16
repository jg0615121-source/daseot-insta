// refs.js 로 모은 계정 데이터(refs.json) 요약: 계정별 형식 비율, 게시 간격, 반응 상위·하위 게시물 첫 줄과 해시태그
// node refs_summary.js refs.json > 요약.txt   (PowerShell 대신 cmd에서 돌려야 한글이 안 깨짐)
const r = require(require('path').resolve(process.argv[2]));
for (const x of r) {
  const m = x.media.filter(z => z.t);
  if (!m.length) continue;
  const f = (x.info && x.info.f) || 0;
  const types = {};
  m.forEach(z => { const k = z.product === 'clips' ? 'reel' : z.type; types[k] = (types[k] || 0) + 1; });
  const ds = m.map(z => z.t).sort();
  const days = (new Date(ds[ds.length - 1]) - new Date(ds[0])) / 864e5 + 1;
  const eng = z => (z.likes || 0) + 3 * (z.comments || 0);
  const avg = Math.round(m.reduce((s, z) => s + eng(z), 0) / m.length);
  console.log(`\n### ${x.user} | ${x.info && x.info.n} | 팔로워 ${f} | 최근${m.length}개 ${days.toFixed(0)}일 (하루 ${(m.length / days).toFixed(1)}개) | ${JSON.stringify(types)} | 평균 좋아요+댓글x3 ${avg}`);
  for (const z of m.slice().sort((a, b) => eng(b) - eng(a)).slice(0, 6)) {
    const lines = (z.cap || '').split('\n').map(s => s.trim()).filter(Boolean);
    const tags = (z.cap.match(/#[^\s#]+/g) || []);
    console.log(`- ${z.t} ${z.product === 'clips' ? 'reel' : z.type}${z.n > 1 ? '(' + z.n + '장)' : ''} L${z.likes} C${z.comments} | ${lines.slice(0, 2).join(' / ').slice(0, 110)} | 태그${tags.length} ${tags.slice(0, 6).join(' ')}`);
  }
  for (const z of m.slice().sort((a, b) => eng(a) - eng(b)).slice(0, 2))
    console.log(`  (하위) ${z.product === 'clips' ? 'reel' : z.type} L${z.likes} | ${(z.cap || '').split('\n')[0].slice(0, 70)}`);
}
