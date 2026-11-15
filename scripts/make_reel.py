"""원고 하나로 세로 릴스 영상(out/원고이름/reel.mp4)과 릴스 캡션(원고의 reel_caption)을 만든다.

카드뉴스 슬라이드를 그대로 이어 붙이지 않고 릴스 전용 장면으로 다시 짠다 (2026-10-28 결정).
v2 (2026-10-31): 인사이트상 조회는 전부 릴스·비팔로워에서 나오는데 반응이 0이라 릴스를 다시 설계.
  훅(1.9초, 0프레임부터 제목이 보임) → 품목 5개(각 2.6초, 위에 시리즈 제목 고정, 번호·핵심 숫자가 튀어나옴)
  → 마무리(3.2초, 5개 요약표 + 공유 버튼). 장면은 옆으로 밀려 넘어간다. 약 17초.
reel_template.html의 CSS 애니메이션을 window.seek(초)로 멈춰 가며 프레임마다 찍고 ffmpeg로 잇는다.
fetch_images.py 다음에 실행 (assets 사진과 cover_images 필요). ffmpeg 필요.
사용법: python3 scripts/make_reel.py posts/2026-10-28.json
"""
import json, re, sys, pathlib, subprocess
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FPS, W, H = 30, 1080, 1920


def reel_caption(post):
    """카드뉴스 캡션에서 첫 줄, 번호 목록, 해시태그를 가져와 짧은 릴스용 캡션을 만든다."""
    lines = post["caption"].strip().split("\n")
    first = lines[0].strip()
    items = [l for l in lines if re.match(r"^[1-5] ", l)]
    tags = next((l for l in reversed(lines) if l.strip().startswith("#")), "#다섯가지")
    return "\n".join([first, "", "5개 요약 👇", *items, "",
                      "가격·날짜·장소는 같은 날 카드뉴스에 정리해둠 📌",
                      f"매일 아침·저녁 5개씩 @{post.get('handle', 'daseot.5')}", "", tags])


def render(post, out):
    """템플릿에 장면을 깔고 프레임마다 찍어 ffmpeg로 바로 넘긴다. 무음 오디오 트랙을 붙인다
    (인스타는 오디오 트랙이 있는 영상을 더 잘 받음)."""
    with sync_playwright() as p:
        b = p.chromium.launch()
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
    # 템플릿이 assets/… 상대 경로로 사진을 읽으므로 저장소 루트 기준 경로 그대로 둔다.
    # 사진 크기는 템플릿이 사진 카드 높이와 그 아래 제목 위치를 정하는 데 씀 (원고에는 남기지 않음)
    shot = json.loads(json.dumps(post))
    for it in shot["items"]:
        it["w"], it["h"] = Image.open(ROOT / it["image"]).size
    total = render(shot, out / "reel.mp4")
    post["reel_caption"] = reel_caption(post)
    post_path.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out / "reel.mp4", f"{total:.1f}초")


if __name__ == "__main__":
    main(sys.argv[1])
