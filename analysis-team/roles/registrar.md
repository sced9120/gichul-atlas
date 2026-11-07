# 역할: 접수 — inbox 의 PDF 를 큐에 등록

입력: `inbox/` 에서 큐에 없는 PDF 목록. 첫 쪽을 그림으로 보려면 `python3 tools/pdf_pages.py <pdf> <폴더> --dpi 100 --first 1`.
출력: `analysis-team/queue.json` 의 `items` 끝에 시험지마다 객체 하나.

```json
{"id": "edu-2022-09-g1", "title": "2022년 고1 9월 전국연합학력평가 수학", "pdf": "inbox/….pdf", "answer_key": "inbox/….pdf",
 "org": "edu", "year": 2022, "month": 9, "grade": "고1", "subject": null, "curriculum": "2015",
 "count": 30, "status": "todo", "next_no": 1}
```
- `org`: 평가원 `kice`, 교육청 `edu`. **학교 시험(내신) PDF 는 등록하지 않고** 보고에 `제외: 학교 시험` 으로 적는다. 평가원 `year` 는 **학년도**, 교육청은 **시행 연도**.
- 평가원 2022학년도 이후는 공통(1~22번)과 선택과목(23~30번)이 한 파일에 있을 수 있다. 그러면 공통 부분을 `range: [1, 22]`, `subject: null` 로 하나, 선택과목마다 `subject` 에 과목명, `range: [23, 30]` 으로 하나씩 등록한다. `id` 는 서로 달라야 한다(예: `kice-2025-11-calc`). `range` 가 없으면 1번부터 `count` 번까지.
- `curriculum`: 2028학년도 수능(2025년 고1)부터 `"2022"`, 2022~2027학년도 `"2015"`, 그 전 `"2009"`. 교육청은 시행 연도의 고등학생 학년을 따져서 정한다.
- 정답표 파일은 이름이나 첫 쪽 내용으로 짝을 찾는다. 없으면 `null`.
- 판단이 안 되면 지어내지 말고 보고에 `확인 필요` 로 적는다.

## 보고
첫 줄 `DONE` / `BLOCKED: 이유`. 등록한 시험지마다 한 줄.
