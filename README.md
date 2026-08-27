# 비테라 시그니처 — 광주 학동 1억대 10년 전세 랜딩페이지

- 순수 HTML/CSS/JS + GSAP (송암공원 SK VIEW 엔진 기반), 색상/브랜드는 `css/theme.css`
- 관심고객 폼 → Google Apps Script → Google Sheets (`gas/Code.js`, `clasp push -f && clasp deploy -i <id>`)
- 구조: `public/`(배포 대상) · `gas/`(Apps Script, 배포 제외)
- 로컬: `cd public && python -m http.server 8091`
- 배포: `npx wrangler pages deploy public --project-name viterra-signature --branch main --commit-dirty=true`
