# EBSi 기출 수학 내려받기

선생님 컴퓨터에서 `tools/download_ebsi.py` 를 한 번 실행하면 EBSi 의 수학 문제지(PDF)와 정답(이미지)이 `inbox/ebsi/<학년>/<연도>/` 에 쌓인다.
(클라우드 작업 공간에서는 EBSi 가 막혀 있어 직접 받을 수 없다.)

1. 파이썬 3.10 이상 확인: 터미널에서 `python3 --version`
2. 저장소 받기(처음 한 번): `git clone https://github.com/sced9120/gichul-atlas` 후 `cd gichul-atlas`
3. 목록만 확인: `python3 tools/download_ebsi.py --dry-run`
4. 내려받기: `python3 tools/download_ebsi.py`
5. 저장소에 올리기: `git add inbox/ebsi && git commit -m "EBSi 기출 추가" && git push`

옵션: `--from 2020 --to 2022`, `--grades 고3`, `--explanations`(해설 PDF 포함), `--cookie "..."`(로그인이 필요할 때).
