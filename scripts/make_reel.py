"""슬라이드(out/날짜/*.jpg)를 9:16 릴스 영상 out/날짜/reel.mp4 로 만든다. ffmpeg 필요.
장마다 2.5초, 4:5 슬라이드를 가운데 두고 위아래는 같은 사진을 흐리게 깐다.
사용법: python3 scripts/make_reel.py posts/2026-10-25.json
"""
import sys, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEC = 2.5

def main(post_path):
    d = ROOT / "out" / pathlib.Path(post_path).stem
    slides = sorted(d.glob("[0-9][0-9].jpg"))
    if len(slides) < 2:
        raise SystemExit(f"슬라이드가 없음: {d}")
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for s in slides:
        args += ["-loop", "1", "-t", str(SEC), "-i", str(s)]
    args += ["-f", "lavfi", "-t", str(SEC * len(slides)), "-i", "anullsrc=r=44100:cl=stereo"]
    parts = [
        f"[{i}:v]split[a{i}][b{i}];"
        f"[a{i}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40,eq=brightness=-0.35[bg{i}];"
        f"[b{i}]scale=1080:-2[fg{i}];[bg{i}][fg{i}]overlay=0:(H-h)/2,setsar=1,fps=30[v{i}];"
        for i in range(len(slides))
    ]
    concat = "".join(f"[v{i}]" for i in range(len(slides))) + f"concat=n={len(slides)}:v=1:a=0[v]"
    args += ["-filter_complex", "".join(parts) + concat, "-map", "[v]", "-map", f"{len(slides)}:a",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
             "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(d / "reel.mp4")]
    subprocess.run(args, check=True)
    print(d / "reel.mp4")

if __name__ == "__main__":
    main(sys.argv[1])
