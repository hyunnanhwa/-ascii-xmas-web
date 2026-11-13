# ASCII Christmas Tree (Python / pygame)

웹 버전과 같은 연출을 pygame 창으로 보여주는 버전입니다.
아래 에디터에 빌드 코드가 타이핑되고, `scene.phase("...")` 줄이 끝날 때마다 해당 단계가 재생됩니다.
마지막에는 선물상자 하나가 열리면서 개구리가 튀어나옵니다.

파이썬은 웹보다 느려서 트리 점 수를 5,200개로 줄였습니다. 실시간 창은 PC에 따라 15~20fps 정도로 웹보다 덜 부드럽습니다. 영상 저장(`--video`)은 프레임을 하나씩 그려서 만들기 때문에 결과 영상은 항상 30fps로 부드럽습니다.

## 실행

```bash
pip install pygame
```

```bash
python christmas_tree.py
```

## 조작

| 키 | 동작 |
| --- | --- |
| `Space` | 일시정지 / 재생 |
| `R` | 처음부터 다시 |
| `2` | 2배속 전환 |
| `S` | 현재 화면 PNG 저장 |
| `Esc` | 종료 |

## 영상(MP4)으로 뽑기

처음부터 마지막 말풍선까지 전체를 1080×1920(9:16, 릴스 비율) 30fps MP4로 저장합니다. ffmpeg가 필요합니다.

```bash
python christmas_tree.py --video ascii_xmas_nana.mp4
```

## 정지 화면만 뽑기

창 없이 원하는 시간(초)의 장면을 `christmas_tree.png`로 저장합니다.

```bash
python christmas_tree.py --shot 50
```
