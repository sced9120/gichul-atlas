# 기출 분석 팀 — 실행 절차 (오케스트레이터용)

예약 작업이 매일 밤 **만져보는 수학 00시·04시 실행이 끝난 직후** 이 문서를 따라 기출 문항을 분석해 넣는다.
(만져보는 수학 실행이 끝나면서 이 예약 작업을 바로 실행시키고, 그 신호가 없을 때를 대비해 02:40·06:40에 한 번 더 깨어난다.)
오케스트레이터(이 문서를 읽는 세션)는 직접 옮기거나 분류하지 않고 팀원에게 맡기고, 점검·판정·기록·커밋만 한다.
**밤 실행은 선생님께 메시지를 보내지 않는다.** 결과는 로그에 쌓고, 오르빗 아침 브리핑(math-platform `hands-on-team/MORNING.md`)이 함께 보고한다.

## 0. 준비
1. 저장소 루트에서 `git pull --rebase origin main`.
2. `pip install --break-system-packages -r requirements.txt pymupdf` (이미 있으면 넘어감), `npm ci`.
3. **겹침 방지**: `analysis-team/state.json` 의 `last_run_started_at` 이 3시간 안이면 `log/runs.md` 에 "건너뜀: 직전 실행 진행 중" 한 줄만 남기고 끝낸다. 아니면 지금 시각(+09:00)으로 바꾸고 커밋·푸시한 뒤 시작한다.
4. 팀원: 사용 가능한 에이전트에 `gichul-haiku` … `gichul-opus-max` 가 있으면 그 이름으로 부른다.
   없으면 `general-purpose` 에이전트에 `model` 을 지정하고, 지시 첫머리에 `.claude/agents/gichul-<모델>-<수준>.md` 본문을 붙인다.
   이때 effort 는 지정되지 않으므로 기록에 "(수준 지정 불가 — 모델만 적용)" 이라고 적는다.

## 1. 오늘 할 시험지 고르기 — `analysis-team/queue.json`
1. `inbox/` 에 큐에 없는 PDF 가 있으면 **접수**(roles/registrar.md, 사다리: 접수)를 맡겨 시험지 정보를 큐에 `todo` 로 등록한다.
   시험지와 정답표가 한 쌍이 되도록 묶는다. 정답표가 없으면 `answer_key: null`.
2. `doing` 항목이 있으면 그 시험지의 `next_no` 번부터 이어서 한다. 없으면 `todo` 첫 항목을 `doing` 으로, `next_no` 를 `range[0]`(없으면 1)로 바꾼다.
   마지막 번호는 `range[1]`(없으면 `count`)이다.
3. 할 것이 없으면 `log/runs.md` 에 "원본 없음 — inbox 에 시험지 PDF 필요" 를 남기고 끝낸다.

## 2. 수준 사다리 (선생님 지시: 가장 낮은 수준에서 시작, 개선이 필요할 때만 한 칸씩)

| 역할 | 파일 | 잘하는 모델 | 사다리 (왼쪽부터) |
|---|---|---|---|
| 접수 | roles/registrar.md | Haiku — 표지 읽고 칸 채우기 | haiku → sonnet-low |
| 전사 | roles/transcriber.md | Sonnet — 많은 양을 정확히 옮기기 | sonnet-low → sonnet-medium → sonnet-high → opus-medium → opus-high |
| 정답·출처 | roles/keyer.md | Haiku — 표에서 옮겨 적기 | haiku → sonnet-low |
| 분류 | roles/classifier.md | Opus — 교육과정 판단 | opus-low → opus-medium → opus-high → opus-max |
| 오르빗 | roles/orbit.md | Opus — 원본과 대조·판정 | opus-low → opus-medium → opus-high |

- 이번 실행에서 모든 역할은 **첫 칸에서 시작**한다.
- **한 칸 올리는 경우** (그 역할만):
  1. 팀원이 `BLOCKED` 로 보고
  2. 자동 점검(3-4번) 실패 — 오류가 난 칸을 맡은 역할
  3. 오르빗 `FIX` — 지적받은 역할. 특히 **글로 옮길 수 있는 내용(발문·선택지·조건·표)이 그림으로 저장된 경우**, 수식이 틀리거나 빠진 경우는 전사, 과목·단원·성취기준이 틀린 경우는 분류
  4. 오르빗 보고가 근거 없이 모호하거나 원본 대조를 하지 않음 → 오르빗
- 올릴 때는 이전 결과물·오류·지적 사항을 함께 넘기고 "지적된 것만 고쳐라" 라고 지시한다.
- 올릴 때마다 `log/<시험지 id>.md` 에 `역할: 이전 → 다음 (이유)` 한 줄을 남긴다.
- 사다리 끝에서도 실패한 문항은 `review/needs_teacher.json` 으로 보내고 나머지를 계속한다.

## 3. 한 번의 실행 = 한 묶음 (최대 15문항)
작업 폴더: `analysis-team/work/<시험지 id>/` (커밋하지 않음, .gitignore)

0. 이전 실행이 남긴 `work/<id>/batch.json` 이 있으면 지운다 (묶음은 실행마다 새로 만든다).
1. **쪽 그림 만들기 (오케스트레이터)** — `python3 tools/pdf_pages.py <큐의 pdf> analysis-team/work/<id>/pages --dpi 200`.
   `answer_key` 가 있으면 `python3 tools/pdf_pages.py <큐의 answer_key> analysis-team/work/<id>/key --dpi 150` 도 만들어 정답·출처 역할에 준다.
2. **전사** — `next_no` 부터 15문항(시험지 끝까지면 거기까지). 결과: `work/<id>/batch.json`(전사가 새로 만드는 문항 객체 배열, 형식은 roles/transcriber.md), 그림 조각은 `data/math/images/<문항 id>-fig.png`
3. **정답·출처** — 정답표에서 정답을, 큐의 시험지 정보로 `src` 를 채운다. 같은 `batch.json` 을 고친다.
4. **분류** — (먼저 6번 '기준 자료' 확인) 과목·단원·성취기준·개념·교육과정 외 여부를 채운다. 같은 `batch.json` 을 고친다.
5. **자동 점검 (오케스트레이터)** — `python3 tools/check_problems.py analysis-team/work/<id>/batch.json`
   실패하면 오류 칸의 역할을 한 칸 올려 고치게 하고 다시 점검한다.
6. **오르빗 검수** — 쪽 그림, 그림 조각, `batch.json` 을 주고 문항마다 `PASS`/`FIX`/`NEEDS_TEACHER` 판정을 받는다.
   `FIX` 문항만 해당 역할을 한 칸 올려 고치고 5번부터 다시. **오르빗 검수는 묶음당 최대 3회.** 3회째도 FIX 인 문항은 `needs_teacher`.
7. **반영**
   - `PASS` 문항을 `data/math/problems.src.json` 끝에 추가(같은 id 가 있으면 바꿔 넣기).
   - `NEEDS_TEACHER` 문항은 `review/needs_teacher.json` 에 이유와 함께 추가. 그 문항의 그림 조각은 남겨 둔다.
   - `npm run build && npm test` 로 사이트 데이터 다시 만들기 (실패하면 반영을 되돌리고 그 문항들을 needs_teacher 로).
   - 큐 갱신: `next_no` 를 다음 번호로. 시험지 끝까지 했으면 `status: done`, `finished_at`.
   - 오르빗 보고 전문을 `log/<id>.md` 끝에 붙인다.

## 4. 기록·커밋 (메시지 보내지 않음)
- `log/runs.md` 끝에 한 줄:
  `- 2026-11-08T00:52+09:00 · <시험지 id> <시작번호>–<끝번호> · 추가 <n> · 확인 필요 <m> · 수준: 전사 sonnet-low→sonnet-medium, 분류 opus-low, 오르빗 opus-low`
  실패·중단도 이유와 함께 한 줄 남긴다.
- `git add -A data site/data analysis-team review` (analysis-team/work 와 inbox 의 PDF 는 이미 저장소에 있거나 무시됨)
- 커밋 메시지: `기출 분석: <시험지 이름> <시작>–<끝>번` + 빈 줄 + 오르빗 판정 한 줄 + 빈 줄 + `Co-Authored-By: Claude <noreply@anthropic.com>`
- `git fetch origin main && git rebase origin/main && git push origin HEAD:main`. 충돌이면 한 번만 다시, 그래도 안 되면 `analysis/<id>` 브랜치로 푸시하고 runs.md 에 적는다.
- `SendUserMessage`·`SendUserFile` 은 쓰지 않는다.

## 5. 금지
- 사이트 화면(`site/*.html`, `site/js/app.js`, `site/assets/`)과 엔진(`site/js/exam-hwpx.mjs`, `tools/build_problems.py`)은 고치지 않는다. 엔진이 막으면 needs_teacher 로 남긴다.
- 문항 내용을 지어내지 않는다. 원본에서 읽을 수 없으면 needs_teacher.
- 출처 문구는 `src` 필드로만 쓴다(`format_source`). `source` 칸을 직접 쓰지 않는다.
- 한 실행에서 15문항을 넘기지 않는다.

## 6. 기준 자료가 없을 때
- `analysis-team/reference/standards-2022-math.md` (2022 개정 수학 성취기준 코드·문장, 공식 원문 출처 포함)가 없으면
  분류 전에 `gichul-opus-high` 에게 공식 원문(교육부 고시 수학과 교육과정)을 조사해 이 파일을 만들게 한다. 출처를 반드시 적는다.
- 2015·2009 개정 문항이면 `reference/legacy-map.md` 를 쓰고, 없거나 해당 단원이 없으면 같은 방식으로 추가한다.
- 기준 자료를 처음 만든 실행에서는, `data/math/problems.src.json` 에 `standards` 가 비어 있는 기존 문항도 분류 역할에게 맡겨 채우고 오르빗 검수를 거쳐 반영한다(이번 묶음 15문항 한도에 포함).
