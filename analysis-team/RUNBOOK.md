# 기출 분석 팀 — 실행 절차 (오케스트레이터용)

예약 작업이 매일 **00:00·04:00(서울)에 만져보는 수학 밤 제작과 동시에** 시작해 이 문서를 따라 기출 문항을 분석해 넣는다.
(2026-11-08 선생님 결정: 두 작업은 저장소가 달라 동시에 해도 릴레이와 결과·토큰이 같으므로 동시에 시작한다. 한 실행은 **2시간**, 그 안에서 **시험지 4개 이상**, 시간이 남으면 큐에 있는 만큼 더.)
오케스트레이터(이 문서를 읽는 세션)는 직접 옮기거나 분류하지 않고 팀원에게 맡기고, 점검·판정·기록·커밋만 한다.
**밤 실행은 선생님께 메시지를 보내지 않는다.** 결과는 로그에 쌓고, 오르빗 아침 브리핑(math-platform `hands-on-team/MORNING.md`)이 함께 보고한다.

## 0. 준비
1. 저장소 루트에서 `git pull --rebase origin main`.
2. `pip install --break-system-packages -r requirements.txt pymupdf` (이미 있으면 넘어감), `npm ci`.
3. **시작 시각 기록**: `date` 로 지금 시각(서울)을 적어 두고, **마감 = 시작 + 1시간 50분** 으로 정한다(커밋·push 까지 2시간 안에 끝냄).
   04시 실행은 06:10 아침 브리핑 전에 끝나야 하므로 마감을 넘기지 않는다.
4. **겹침 방지**: `analysis-team/state.json` 의 `last_run_started_at` 이 3시간 안이면 `log/runs.md` 에 "건너뜀: 직전 실행 진행 중" 한 줄만 남기고 끝낸다. 아니면 지금 시각(+09:00)으로 바꾸고 커밋·푸시한 뒤 시작한다.
5. 팀원: 사용 가능한 에이전트에 `gichul-haiku` … `gichul-opus-max` 가 있으면 그 이름으로 부른다.
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

## 3. 한 번의 실행 = 2시간 · 시험지 4개 이상
**묶음** = 한 시험지의 15문항(1–15, 16–30). 팀원 하나가 맡는 단위는 지금처럼 최대 15문항이다(정확도 유지).
한 실행에서는 묶음 여러 개를 **동시에** 돌린다.

### 3-0. 계획
1. 큐에서 `doing` → `todo` 순서로 시험지를 고른다. 목표: 시험지 **4개 이상**(묶음 8개). 마감 전에 끝나면 다음 시험지를 더 잡는다.
2. 동시에 진행하는 묶음은 **최대 4개**(시험지 2개분). 한 묶음이 끝나면(반영까지) 다음 묶음을 시작한다.
3. **마감 30분 전**부터는 새 묶음을 시작하지 않고, 진행 중인 묶음의 검수·반영만 끝낸다. 끝내지 못한 묶음은 반영하지 않고 큐의 `next_no` 를 그 묶음 첫 번호로 둔다(다음 실행이 이어 함).
4. 검수를 줄여 속도를 내지 않는다. 오르빗은 모든 문항을 원본과 대조하고 정답을 직접 풀고, **성취기준 코드 문장을 기준 자료에서 찾아 문항과 맞춰 본다**.

### 3-1. 묶음 하나의 절차
작업 폴더: `analysis-team/work/<시험지 id>/` (커밋하지 않음, .gitignore). 묶음 파일: `work/<id>/batch-<시작번호>.json` (실행마다 새로 만든다. 이전 실행이 남긴 것은 지운다.)

1. **쪽 그림 만들기 (오케스트레이터, 시험지마다 한 번)** — `python3 tools/pdf_pages.py <큐의 pdf> analysis-team/work/<id>/pages --dpi 200`.
   `answer_key` 가 있으면 `python3 tools/pdf_pages.py <큐의 answer_key> analysis-team/work/<id>/key --dpi 150` 도 만들어 정답·출처 역할에 준다.
2. **전사** — 묶음 범위 15문항. 결과: `batch-<시작번호>.json`(문항 객체 배열, 형식은 roles/transcriber.md), 그림 조각은 `data/math/images/<문항 id>-fig.png`
3. **정답·출처** — 정답표에서 정답을, 큐의 시험지 정보로 `src` 를 채운다. 같은 파일을 고친다.
4. **분류** — 과목·단원·성취기준·개념·교육과정 외 여부를 채운다(중학교 문항은 classifier.md 규칙 6). 같은 파일을 고친다.
5. **자동 점검 (오케스트레이터)** — `python3 tools/check_problems.py analysis-team/work/<id>/batch-<시작번호>.json`, 그리고 각 성취기준 코드가 기준 자료에 있는지·첫 코드의 영역/단원이 문항 unit 과 맞는지 확인한다.
   실패하면 오류 칸의 역할을 한 칸 올려 고치게 하고 다시 점검한다.
6. **오르빗 검수** — 쪽 그림, 그림 조각, 묶음 파일을 주고 문항마다 `PASS`/`FIX`/`NEEDS_TEACHER` 판정을 받는다.
   `FIX` 문항만 해당 역할을 한 칸 올려 고치고 5번부터 다시. **오르빗 검수는 묶음당 최대 3회.** 3회째도 FIX 인 문항은 `needs_teacher`.
7. **반영 (오케스트레이터만, 한 번에 한 묶음씩 차례로)** — 여러 묶음이 같은 파일을 동시에 고치지 않도록 반영은 오케스트레이터가 순서대로 한다.
   - `PASS` 문항을 `data/math/problems.src.json` 에 추가(같은 id 가 있으면 바꿔 넣기).
   - `NEEDS_TEACHER` 문항은 `review/needs_teacher.json` 에 이유와 함께 추가. 그 문항의 그림 조각은 남겨 둔다.
   - `npm run build && npm test` (실패하면 그 묶음 반영을 되돌리고 그 문항들을 needs_teacher 로).
   - 큐 갱신: `next_no` 를 다음 번호로. 시험지 끝까지 했으면 `status: done`, `finished_at`.
   - 오르빗 보고 전문을 `log/<id>.md` 끝에 붙인다.
   - **시험지 하나가 끝날 때마다 커밋·push** 한다(4절 방식). 실행이 중간에 끊겨도 끝난 시험지는 남는다.

## 4. 기록·커밋 (메시지 보내지 않음)
- `log/runs.md` 끝에 시험지(또는 묶음)마다 한 줄:
  `- 2026-11-08T00:52+09:00 · <시험지 id> <시작번호>–<끝번호> · 추가 <n> · 확인 필요 <m> · 수준: 전사 sonnet-low→sonnet-medium, 분류 opus-low, 오르빗 opus-low`
  실행 끝에 요약 한 줄: `- <시각> · 실행 요약 · 시험지 <k>개 · 추가 <n> · 확인 필요 <m> · 걸린 시간 <분>`
  실패·중단도 이유와 함께 한 줄 남긴다.
- `git add -A data site/data analysis-team review` (analysis-team/work 와 inbox 의 PDF 는 이미 저장소에 있거나 무시됨)
- 커밋 메시지: `기출 분석: <시험지 이름> <시작>–<끝>번` + 빈 줄 + 오르빗 판정 한 줄 + 빈 줄 + `Co-Authored-By: Claude <noreply@anthropic.com>`
- `git fetch origin main && git rebase origin/main && git push origin HEAD:main`. 충돌이면 한 번만 다시, 그래도 안 되면 `analysis/<id>` 브랜치로 푸시하고 runs.md 에 적는다.
- `SendUserMessage`·`SendUserFile` 은 쓰지 않는다.

## 5. 금지
- 사이트 화면(`site/*.html`, `site/js/app.js`, `site/assets/`)과 엔진(`site/js/exam-hwpx.mjs`, `tools/build_problems.py`)은 고치지 않는다. 엔진이 막으면 needs_teacher 로 남긴다.
- 문항 내용을 지어내지 않는다. 원본에서 읽을 수 없으면 needs_teacher.
- 출처 문구는 `src` 필드로만 쓴다(`format_source`). `source` 칸을 직접 쓰지 않는다.
- 팀원 한 명에게 한 번에 15문항을 넘겨 맡기지 않는다(묶음 단위). 실행 전체는 2시간 마감을 넘기지 않는다.

## 6. 기준 자료가 없을 때
- `analysis-team/reference/standards-2022-math.md` (2022 개정 수학 성취기준 코드·문장, 공식 원문 출처 포함)가 없으면
  분류 전에 `gichul-opus-high` 에게 공식 원문(교육부 고시 수학과 교육과정)을 조사해 이 파일을 만들게 한다. 출처를 반드시 적는다.
- 2015·2009 개정 문항이면 `reference/legacy-map.md` 를 쓰고, 없거나 해당 단원이 없으면 같은 방식으로 추가한다.
- 기준 자료를 처음 만든 실행에서는, `data/math/problems.src.json` 에 `standards` 가 비어 있는 기존 문항도 분류 역할에게 맡겨 채우고 오르빗 검수를 거쳐 반영한다(묶음 하나로 친다).
