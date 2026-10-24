"""게시물 JSON 하나를 1080x1350 카드뉴스 PNG들로 렌더링한다.
사용법: python3 render.py posts/2026-10-24.json  -> out/2026-10-24/01.jpg ...
"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent

def render(post_path):
    post_path = pathlib.Path(post_path)
    post = json.loads(post_path.read_text(encoding="utf-8"))
    out = HERE / "out" / post_path.stem
    out.mkdir(parents=True, exist_ok=True)
    total = len(post["items"]) + 2  # 표지 + 다섯 품목 + 마무리
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1080, "height": 1350})
        page.goto((HERE / "template.html").as_uri())
        page.evaluate("document.fonts.ready")
        files = []
        for i in range(total):
            page.evaluate("([p,i]) => window.render(p,i)", [post, i])
            page.evaluate("document.fonts.ready")
            page.wait_for_load_state("networkidle"); page.wait_for_timeout(250)
            fit = page.evaluate("([p,i]) => window.render(p,i)", [post, i])
            if not fit["fits"]:
                raise SystemExit(f"{i+1}번 슬라이드 글이 너무 길어요. 문구를 줄여주세요.")
            if fit["k"] < 1:
                print(f"참고: {i+1}번 슬라이드 글자 {int(fit['k']*100)}%로 축소")
            f = out / f"{i+1:02d}.jpg"  # 인스타 API는 JPEG만 받음
            page.screenshot(path=str(f), type="jpeg", quality=93)
            files.append(f)
        b.close()
    return files

if __name__ == "__main__":
    for f in render(sys.argv[1]):
        print(f)
