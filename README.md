# 다섯가지 (@daseot.today)

매일 20대가 알아야 할 것 다섯 가지를 카드뉴스로 만들어 인스타그램에 자동 게시하는 저장소.

## 매일 돌아가는 순서

1. 매일 오전 Claude 예약 작업이 주제를 조사해 `posts/날짜.json` 원고를 올린다 (STYLE_GUIDE.md 기준).
2. 원고가 올라오면 GitHub Actions(`.github/workflows/daily.yml`)가
   - `scripts/fetch_images.py`: 기사·보도자료에서 실제 사진을 받아 `assets/날짜/`에 저장
   - `render.py`: `template.html`로 1080x1350 슬라이드 7장을 `out/날짜/`에 생성
   - `scripts/publish.py`: 인스타그램에 캐러셀로 게시 (토큰이 없으면 이 단계만 건너뜀)

## 인스타 게시를 켜려면

저장소 Settings > Secrets and variables > Actions에 추가:
- `IG_USER_ID`, `IG_ACCESS_TOKEN` (Secrets)
- 저장소가 비공개면 인스타가 이미지를 가져갈 수 없으므로, 저장소를 공개로 바꾸거나 `IMAGE_BASE_URL`(Variables)에 공개 이미지 주소를 지정

## 손으로 돌려보기

```
pip install playwright pillow && python -m playwright install chromium
python scripts/fetch_images.py posts/2026-10-24.json
python render.py posts/2026-10-24.json
```
