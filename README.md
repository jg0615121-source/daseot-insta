# 다섯가지 (@daseot.today)

매일 20대가 알아야 할 것 다섯 가지를 카드뉴스로 만들어 인스타그램에 자동 게시하는 저장소.

## 매일 돌아가는 순서

1. 매일 오전 Claude 예약 작업이 주제를 조사해 `posts/날짜.json` 원고를 올린다 (STYLE_GUIDE.md 기준).
2. 원고가 올라오면 GitHub Actions(`.github/workflows/daily.yml`)가
   - `scripts/fetch_images.py`: 기사·보도자료에서 실제 사진을 받아 `assets/날짜/`에 저장
   - `render.py`: `template.html`로 1080x1350 슬라이드 7장을 `out/날짜/`에 생성
   - 완성 슬라이드를 공개 저장소 `jg0615121-source/daseot-images`의 `날짜/`에 올림
   - `scripts/publish.py`: 그 raw 주소로 인스타그램에 캐러셀 게시 (토큰이 없으면 이 단계만 건너뜀, 이미 게시된 원고는 다시 안 올림)

코드 저장소(이곳)는 비공개로 두고, 인스타가 가져갈 이미지 파일만 공개 저장소에 둔다.

## 인스타 게시를 켜려면

Settings > Secrets and variables > Actions 의 Secrets:
- `IMAGES_DEPLOY_KEY`: daseot-images 저장소에 쓰기 권한 배포 키로 등록된 SSH 개인 키 (등록 완료)
- `IG_USER_ID`, `IG_ACCESS_TOKEN`: 인스타 프로페셔널 계정 ID와 게시 권한 토큰 (60일마다 갱신)

선택 Variables: `IMAGES_REPO`(기본 jg0615121-source/daseot-images), `IG_API_HOST`

## 손으로 돌려보기

```
pip install playwright pillow && python -m playwright install chromium
python scripts/fetch_images.py posts/2026-10-24.json
python render.py posts/2026-10-24.json
```
