"""렌더링된 슬라이드(out/날짜/*.jpg)를 인스타그램 캐러셀로 게시한다.

필요한 GitHub Secrets
  IG_USER_ID       인스타 프로페셔널 계정 ID
  IG_ACCESS_TOKEN  게시 권한(instagram_business_content_publish)이 있는 토큰
선택
  IG_API_HOST      기본 graph.instagram.com (페이스북 로그인 토큰이면 graph.facebook.com)
  IG_API_VERSION   기본 v26.0
  IMAGE_BASE_URL   슬라이드 이미지의 공개 주소 앞부분. 기본값은 이 저장소의 raw 주소
                   (인스타가 이미지를 직접 가져가야 해서 공개 주소가 필요함)
사용법: python3 scripts/publish.py posts/2026-10-25.json
"""
import json, os, sys, time, pathlib, urllib.request, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent

def call(method, path, **params):
    host = os.environ.get("IG_API_HOST", "graph.instagram.com")
    ver = os.environ.get("IG_API_VERSION", "v26.0")
    params["access_token"] = os.environ["IG_ACCESS_TOKEN"]
    data = urllib.parse.urlencode(params).encode()
    url = f"https://{host}/{ver}/{path}"
    if method == "GET":
        req = urllib.request.Request(url + "?" + data.decode())
    else:
        req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"인스타 API 오류 {e.code}: {e.read().decode()[:500]}")

def wait_ready(cid):
    for _ in range(30):
        st = call("GET", cid, fields="status_code").get("status_code")
        if st == "FINISHED":
            return
        if st in ("ERROR", "EXPIRED"):
            raise SystemExit(f"컨테이너 {cid} 상태 {st}")
        time.sleep(5)
    raise SystemExit(f"컨테이너 {cid} 준비 시간 초과")

def main(post_path):
    post_path = pathlib.Path(post_path)
    post = json.loads(post_path.read_text(encoding="utf-8"))
    if not os.environ.get("IG_ACCESS_TOKEN") or not os.environ.get("IG_USER_ID"):
        print("인스타 토큰이 아직 없어서 게시는 건너뜀 (렌더링까지만 완료).")
        return
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    branch = os.environ.get("GITHUB_REF_NAME", "main")
    base = os.environ.get("IMAGE_BASE_URL") or f"https://raw.githubusercontent.com/{repo}/{branch}"
    slides = sorted((ROOT / "out" / post_path.stem).glob("*.jpg"))
    if not 2 <= len(slides) <= 10:
        raise SystemExit(f"슬라이드 수가 이상함: {len(slides)}장")
    uid = os.environ["IG_USER_ID"]
    children = []
    for s in slides:
        url = f"{base}/{s.relative_to(ROOT).as_posix()}"
        r = call("POST", f"{uid}/media", image_url=url, is_carousel_item="true")
        children.append(r["id"])
    for c in children:
        wait_ready(c)
    car = call("POST", f"{uid}/media", media_type="CAROUSEL",
               children=",".join(children), caption=post["caption"])
    wait_ready(car["id"])
    res = call("POST", f"{uid}/media_publish", creation_id=car["id"])
    print("게시 완료:", res.get("id"))
    post["published_id"] = res.get("id")
    post_path.write_text(json.dumps(post, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main(sys.argv[1])
