"""원고 하나로 세로 릴스 영상(out/원고이름/reel.mp4)과 릴스 캡션(원고의 reel_caption)을 만든다.

v3 (2026-11-16, ZOOM-IN 충주): 인사이트상 조회는 릴스에서 나와서 릴스를 다시 한다 (사용자 결정).
카드뉴스와 같은 잡지 디자인. 훅 2.3초(0프레임부터 제목) → 품목마다 3초(초점 맞추기 줌인 + 천천히 움직이는 사진,
번호·핵심 정보 칩) → 마무리 3.6초(정리표 + 공유 버튼). 품목 3개면 약 15초, 5개면 약 21초.
reel_template.html 을 window.seek(초)로 멈춰 가며 프레임마다 찍고 ffmpeg로 잇는다. 무음 오디오 트랙을 붙인다.
fetch_images.py 다음에 실행 (assets 사진과 cover_images 필요). ffmpeg 필요.
사용법: python3 scripts/make_reel.py posts/2026-11-19.json
"""
import json, os, re, sys, pathlib, subprocess
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FPS, W, H = 30, 1080, 1920


def reel_caption(post):
    """카드뉴스 캡션에서 첫 줄, 번호 목록, 해시태그를 가져와 릴스용 캡션을 만든다."""
    lines = post["caption"].strip().split("\n")
    first = lines[0].strip()
    items = [l for l in lines if re.match(r"^[1-9] ", l)]
    tags = next((l for l in reversed(lines) if l.strip().startswith("#")), "#줌인충주 #충주")
    return "\n".join([first, "", *items, "",
                      "날짜·장소·가격은 카드뉴스에 정리해둠 📌",
                      f"충주에서 뭐 하지? @{post.get('handle', 'zoomin.chungju')}", "", tags])


def render(post, out):
    with sync_playwright() as p:
        kw = {}
        exe = os.environ.get("CHROMIUM_PATH")  # 클라우드 세션처럼 브라우저가 따로 깔린 곳
        if exe:
            kw["executable_path"] = exe
        b = p.chromium.launch(**kw)
        page = b.new_page(viewport={"width": W, "height": H})
        page.goto((ROOT / "reel_template.html").as_uri())
        total = page.evaluate("p => window.build(p)", post)
        page.evaluate("window.ready()")
        n = int(round(total * FPS))
        ff = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error",
             "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
             "-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=r=44100:cl=stereo",
             "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(out)],
            stdin=subprocess.PIPE)
        for k in range(n):
            page.evaluate("t => window.seek(t)", k / FPS)
            ff.stdin.write(page.screenshot(type="jpeg", quality=93))
        ff.stdin.close()
        if ff.wait():
            raise SystemExit("ffmpeg 실패")
        b.close()
    return total


def main(post_path):
    post_path = pathlib.Path(post_path)
    post = json.loads(post_path.read_text(encoding="utf-8"))
    if not all(it.get("image") for it in post["items"]):
        raise SystemExit("사진이 아직 없음: fetch_images.py 먼저 실행")
    out = ROOT / "out" / post_path.stem
    out.mkdir(parents=True, exist_ok=True)
    # 사진 크기는 템플릿이 꽉 채울지 통째로 넣을지 정하는 데 씀 (원고에는 남기지 않음)
    shot = json.loads(json.dumps(post))
    for it in shot["items"] + shot.get("cover_images", []):
        if it.get("image") and (ROOT / it["image"]).exists():
            it["w"], it["h"] = Image.open(ROOT / it["image"]).size
    total = render(shot, out / "reel.mp4")
    post["reel_caption"] = reel_caption(post)
    post_path.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out / "reel.mp4", f"{total:.1f}초")


if __name__ == "__main__":
    main(sys.argv[1])
