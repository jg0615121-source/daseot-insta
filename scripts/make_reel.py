"""원고 하나로 세로 릴스 영상(out/원고이름/reel.mp4)과 릴스 캡션(원고의 reel_caption)을 만든다.

카드뉴스 슬라이드를 그대로 이어 붙이지 않고 릴스 전용 장면으로 다시 짠다 (2026-10-28 결정).
  훅(2.2초): 표지 사진을 화면 가득 + 표지 제목 → 품목 5개(각 2.6초): 사진 + 큰 제목 + 핵심 숫자 → 마무리(2.6초): 공유·저장 유도
사진 층만 천천히 확대하고 글자 층은 고정해서 글씨가 흐려지지 않게 한다. 장면 사이는 0.25초 겹쳐 넘김.
fetch_images.py 다음에 실행 (assets 사진과 cover_images 필요). ffmpeg 필요.
사용법: python3 scripts/make_reel.py posts/2026-10-28.json
"""
import json, re, sys, pathlib, subprocess, tempfile
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FPS, W, H, XF = 30, 1080, 1920, 0.25
DUR = {"hook": 2.2, "item": 2.6, "outro": 2.6}


def reel_caption(post):
    """카드뉴스 캡션에서 첫 줄, 번호 목록, 해시태그를 가져와 짧은 릴스용 캡션을 만든다."""
    lines = post["caption"].strip().split("\n")
    first = lines[0].strip()
    items = [l for l in lines if re.match(r"^[1-5] ", l)]
    tags = next((l for l in reversed(lines) if l.strip().startswith("#")), "#다섯가지")
    return "\n".join([first, "", "15초 요약 👇", *items, "",
                      "가격·날짜·장소는 같은 날 카드뉴스에 정리해둠 📌",
                      f"매일 아침·저녁 5개씩 @{post.get('handle', 'daseot.5')}", "", tags])


def shoot(post, tmp):
    """장면마다 사진 층(photo)과 글자 층(text) PNG를 찍는다."""
    scenes = [("hook", 0)] + [("item", i) for i in range(len(post["items"]))] + [("outro", 0)]
    shots = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": W, "height": H})
        page.goto((ROOT / "reel_template.html").as_uri())
        for k, (kind, i) in enumerate(scenes):
            files = {}
            for layer in ("photo", "text"):
                page.evaluate("([p,k,i,l]) => window.scene(p,k,i,l)", [post, kind, i, layer])
                page.evaluate("document.fonts.ready")
                page.wait_for_load_state("networkidle"); page.wait_for_timeout(200)
                f = tmp / f"{k:02d}_{layer}.png"
                page.screenshot(path=str(f), omit_background=(layer == "text"))
                files[layer] = f
            shots.append((kind, files))
        b.close()
    return shots


def clip(kind, files, out):
    """사진 층을 1.00→1.05로 천천히 확대하고 글자 층을 얹어 장면 영상 하나를 만든다."""
    d = DUR[kind]; n = int(d * FPS)
    zoom = (f"scale={W*2}:{H*2},zoompan=z='1+0.05*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d=1:s={W}x{H}:fps={FPS}")
    text = "[1:v]format=rgba" + (",fade=in:st=0.15:d=0.35:alpha=1" if kind != "item" else "") + "[t]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
                    "-loop", "1", "-t", str(d), "-i", str(files["photo"]),
                    "-loop", "1", "-t", str(d), "-i", str(files["text"]),
                    "-filter_complex", f"[0:v]{zoom}[z];{text};[z][t]overlay=0:0:format=auto,format=yuv420p[v]",
                    "-map", "[v]", "-r", str(FPS), "-frames:v", str(n),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", str(out)], check=True)
    return d


def main(post_path):
    post_path = pathlib.Path(post_path)
    post = json.loads(post_path.read_text(encoding="utf-8"))
    if not all(it.get("image") for it in post["items"]):
        raise SystemExit("사진이 아직 없음: fetch_images.py 먼저 실행")
    out = ROOT / "out" / post_path.stem
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t)
        # 템플릿이 assets/… 상대 경로로 사진을 읽으므로 저장소 루트 기준 경로 그대로 둔다
        from PIL import Image
        for it in post["items"]:  # 사진 크기: 템플릿이 사진 바로 아래에 제목을 두는 데 씀
            it["w"], it["h"] = Image.open(ROOT / it["image"]).size
        shots = shoot(post, tmp)
        for it in post["items"]:
            it.pop("w", None); it.pop("h", None)
        clips, durs = [], []
        for k, (kind, files) in enumerate(shots):
            c = tmp / f"c{k:02d}.mp4"
            durs.append(clip(kind, files, c)); clips.append(c)
        # 장면 잇기: xfade 사슬 + 무음 오디오(인스타는 오디오 트랙이 있는 영상을 더 잘 받음)
        args = ["ffmpeg", "-y", "-loglevel", "error"]
        for c in clips:
            args += ["-i", str(c)]
        total = sum(durs) - XF * (len(clips) - 1)
        args += ["-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=r=44100:cl=stereo"]
        chain, prev, off = [], "[0:v]", 0.0
        for k in range(1, len(clips)):
            off += durs[k - 1] - XF
            lab = f"[x{k}]"
            chain.append(f"{prev}[{k}:v]xfade=transition=fade:duration={XF}:offset={off:.2f}{lab}")
            prev = lab
        args += ["-filter_complex", ";".join(chain), "-map", prev, "-map", f"{len(clips)}:a",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(out / "reel.mp4")]
        subprocess.run(args, check=True)
    post["reel_caption"] = reel_caption(post)
    post_path.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out / "reel.mp4", f"{total:.1f}초")


if __name__ == "__main__":
    main(sys.argv[1])
