# 기출 아틀라스

수능·평가원 모의평가·교육청 학력평가 수학 기출을 **2022 개정 교육과정 과목·단원**으로 분류해 두고,
누구나 골라서 **2단 한글 시험지(.hwpx)** 로 바로 받을 수 있는 무료 웹입니다.
[HSOrbit](https://hsorbit.uk)의 도구이며 [수학 학습 플랫폼](https://math.hsorbit.uk)과 연결됩니다.

## 이렇게 동작합니다

| 단계 | 어디서 | 비용 |
| --- | --- | --- |
| 관리자가 문항을 올리고 분류·승인 (`data/math/problems.src.json`) | 지금은 파일 직접 편집 · 관리자 화면(AI 분류)은 예정 | 관리자 AI 사용분만 |
| 수식을 한글 수식으로 바꾸고 출처 문구를 만듦 (`tools/build_problems.py`) | GitHub Actions | 0원 |
| 검색·선택·한글 시험지 만들기 (`site/js/exam-hwpx.mjs`) | 사용자 브라우저 | 0원, AI 토큰 없음 |

## 시험지 규칙

- 한 쪽 4문항(단마다 2문항), 위 문항 아래는 풀이 공간
- 담은 순서대로 싣고, 번호는 1번부터 다시 (자동 정렬 버튼: 배점 오름차순 → 정답률 내림차순)
- 수식은 한글 수식 객체(더블클릭하면 수식 편집기), 그림은 그림 부분만 이미지
- 문항마다 오른쪽 아래에 출처: `2022년 고1 9월 전국연합학력평가 21번`, `2025학년도 6월 모의평가 미적분 30번`
- 마지막 단에 정답 ('정답 포함'을 끄면 뺌)

## 직접 실행

```bash
pip install -r requirements.txt
npm install
npm run build     # data/math/problems.src.json → site/data/math/problems.json
npm test          # out/exam.hwpx 생성
npm run serve     # http://localhost:8765
```

시험지 양식을 바꾸려면 학교 시험지 .hwp를 템플릿으로 변환합니다.

```bash
python3 tools/prepare_template.py 시험지.hwp site/templates/exam-2col.hwpx
```

## 문서

- [AGENTS.md](AGENTS.md) — 모델별 역할(Opus·Sonnet·Haiku)과 작업 규칙
- [docs/spec.md](docs/spec.md) — 설계 요약
- [docs/data-format.md](docs/data-format.md) — 문항 데이터 형식

## 출처와 이용

문항의 저작권은 한국교육과정평가원과 각 시·도교육청에 있으며, 비영리 교육 목적으로 출처를 밝혀 제공합니다.
글꼴: 케리스 배움체(KERIS, OFL), Nunito(OFL). HWPX 변환: [python-hwpx](https://pypi.org/project/python-hwpx/).
