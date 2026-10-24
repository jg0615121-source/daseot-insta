"""원고(posts/날짜.json)의 품목마다 실제 사진을 내려받는다. GitHub Actions에서 실행.

품목에 image_url이 있으면 그 주소를, 없으면 source_url(기사·보도자료 페이지)의
대표 이미지(og:image)를 받는다. 받은 파일은 assets/날짜/ 에 저장하고
원고의 image 칸에 경로를 채워 넣는다.
사용법: python3 scripts/fetch_images.py posts/2026-10-25.json
"""
import json, re, sys, pathlib, urllib.request, urllib.parse
from io import BytesIO
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/140.0 Safari/537.36"}

def get(url, referer=None):
    h = dict(UA)
    if referer:
        h["Referer"] = referer
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
        return r.read()

def og_image(page_url):
    html = get(page_url).decode("utf-8", "ignore")
    for pat in (r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image'):
        m = re.search(pat, html, re.I)
        if m:
            return urllib.parse.urljoin(page_url, m.group(1).replace("&amp;", "&"))
    raise ValueError(f"대표 이미지를 못 찾음: {page_url}")

def save(url, dest, referer=None):
    im = Image.open(BytesIO(get(url, referer))).convert("RGB")
    if min(im.size) < 400:
        raise ValueError(f"사진이 너무 작음 {im.size}: {url}")
    im.save(dest, "JPEG", quality=92)
    return im.size

def pick_cover(post):
    scores = [it.get("cover_score") for it in post["items"]]
    if not all(scores):
        return int(post.get("cover_item", 1))
    ok = [i for i, sc in enumerate(scores, 1) if sc.get("photo", 0) > 0]
    if not ok:
        raise SystemExit("표지로 쓸 사진이 없음 (모든 품목 photo 0점). 이 게시물은 올리지 않음.")
    total = lambda sc: sum(sc.get(k, 0) for k in ("subject", "photo", "timely", "swipe"))
    best = max(ok, key=lambda i: (total(scores[i-1]), scores[i-1]["photo"], -i))
    chosen = int(post.get("cover_item", best))
    if chosen not in ok:
        print(f"경고: cover_item {chosen}번은 사진 표지감 0점이라 {best}번으로 바꿈")
        chosen = best
    elif chosen != best:
        print(f"참고: cover_item {chosen}번 (점수 최고는 {best}번)")
    post["cover_item"] = chosen
    return chosen

def main(post_path):
    post_path = pathlib.Path(post_path)
    post = json.loads(post_path.read_text(encoding="utf-8"))
    folder = ROOT / "assets" / post_path.stem
    folder.mkdir(parents=True, exist_ok=True)
    for i, it in enumerate(post["items"], 1):
        dest = folder / f"{i:02d}.jpg"
        if it.get("image") and (ROOT / it["image"]).exists():
            continue
        candidates = [u for u in [it.get("image_url")] if u]
        if it.get("source_url"):
            try:
                candidates.append(og_image(it["source_url"]))
            except Exception as e:
                print("경고:", e)
        for url in candidates:
            try:
                size = save(url, dest, referer=it.get("source_url"))
                it["image"] = str(dest.relative_to(ROOT)).replace("\\", "/")
                print(f"{i}번 사진 {size} {url}")
                break
            except Exception as e:
                print(f"경고: {i}번 사진 실패 {e}")
        if not it.get("image"):
            raise SystemExit(f"{i}번 품목 사진을 못 받음. 이 게시물은 올리지 않음.")
    # 표지: cover_item(1~5)으로 고른 품목 사진 1장. 없으면 cover_score 최고점, 그것도 없으면 1번 품목
    if not post.get("cover_images"):
        it = post["items"][pick_cover(post) - 1]
        post["cover_images"] = [{k: it[k] for k in ("image", "focus", "zoom") if k in it}]
    post_path.write_text(json.dumps(post, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main(sys.argv[1])
