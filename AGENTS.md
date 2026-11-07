# 기출 아틀라스 — 에이전트 작업 규칙

이 저장소는 여러 AI 모델이 역할을 나눠 작업한다. 작업을 맡기 전에 아래 표에서 담당 모델을 고른다.

## 모델별 역할

| 모델 | 맡는 일 | 이유 |
| --- | --- | --- |
| Opus | 구조 설계, HWPX 엔진(`site/js/exam-hwpx.mjs`, `tools/*.py`), 교육과정 분류 규칙, AI 분류 프롬프트, 최종 검토(오르빗) | 한 번 틀리면 모든 문항·파일이 틀어지는 부분 |
| Sonnet | 웹 화면(`site/index.html`, `site/js/app.js`, `site/assets/app.css`), 관리자 화면, 기능 추가 | 분량이 많지만 규칙이 분명한 구현 |
| Haiku | 배포·자동화 설정(`.github/workflows`, `wrangler.jsonc`), 문서 정리, 문항 데이터 입력 형식 검사 | 반복적이고 형식이 정해진 일 |

- effort는 가장 낮은 단계에서 시작하고, 오류·막힘이 생길 때만 한 단계씩 올린다.
- 오르빗(검토 담당, Opus)은 만든 사람과 다른 에이전트로 띄워 결과를 처음 보는 눈으로 확인한다.

## 기출 분석 팀 (매일 밤, 만져보는 수학 00시·04시 실행이 끝난 뒤)

`analysis-team/RUNBOOK.md` 를 따른다. 팀원은 `.claude/agents/gichul-<모델>-<수준>.md`, 역할은 `analysis-team/roles/`.

| 역할 | 모델 | 사다리 |
| --- | --- | --- |
| 접수 (inbox PDF → 큐) | Haiku | haiku → sonnet-low |
| 전사 (글·수식으로 옮기기, 그림만 자르기) | Sonnet | sonnet-low → medium → high → opus-medium → opus-high |
| 정답·출처 | Haiku | haiku → sonnet-low |
| 분류 (과목·단원·성취기준) | Opus | opus-low → medium → high → max |
| 오르빗 (원본 대조 판정) | Opus | opus-low → medium → high |

수준은 오류(BLOCKED, 자동 점검 실패)나 오르빗 FIX(예: 글로 쓸 수 있는데 그림으로 저장됨)가 나올 때만 그 역할을 한 칸 올린다.

## 지켜야 할 것

1. **일반 사용자는 AI·서버를 쓰지 않는다.** 검색·필터·한글 파일 생성은 모두 브라우저에서 끝난다. 사용자 경로에 API 호출을 넣지 않는다.
2. **수식 변환은 배포 단계에서만.** LaTeX → 한글 수식 변환과 크기 계산은 `tools/build_problems.py`(GitHub Actions)에서 한다. 브라우저는 이어 붙이기만 한다.
3. **디자인은 HSOrbit과 같은 톤.** 색·글꼴·간격은 `site/assets/app.css`의 토큰(hsorbit.uk의 `assets/site.css`와 같은 값)만 쓴다. 종이색 바탕, 먹색 글자, 강조는 시계 바늘 주황 하나.
4. **출처 문구는 필드로만 만든다.** `src` 필드 → `format_source()` 한 곳에서 문구 생성. 문항에 출처를 직접 쓰지 않는다.
5. 문항 원본은 `data/math/problems.src.json`, 배포용은 `site/data/math/problems.json`(자동 생성, 직접 고치지 않음).

## 폴더

```
inbox/                시험지·정답표 PDF 넣는 곳 (분석 팀이 가져감)
analysis-team/        기출 분석 팀: RUNBOOK, roles/, queue.json, log/, reference/
review/               선생님 확인이 필요한 문항 (needs_teacher.json)
data/<교과>/          문항 원본(LaTeX)과 그림 — 지금은 data/math/
tools/                배포·분석 스크립트 (build_problems, check_problems, pdf_pages, crop_pdf, prepare_template)
site/                 배포되는 정적 사이트 (Cloudflare)
  index.html          교과 고르는 홈 (site/data/areas.json)
  math/               수학 검색·다운로드 화면 (/math/)
  data/<교과>/        자동 생성: problems.json, images/ · 손으로 관리: curriculum.json
  js/exam-hwpx.mjs    한글 시험지 조립 엔진
  templates/          시험지 양식 HWPX + 스타일 번호
test/run.mjs          엔진 테스트 (Node)
docs/                 설계 문서
```
