# Live Miniature Indoor Map MVP

도면 업로드 → OpenCV 후보 추출 → 관리자 보정 → 공통 MapData → SVG/2.5D 지도 → QR 진입점으로 확장하기 위한 해커톤용 초기 코드입니다.

## 실행

```powershell
npm run dev
```

기본 포트는 `4317`입니다. 다른 프로젝트와 충돌하면 `PORT=4318 npm run dev`처럼 바꿔 실행할 수 있습니다.

## 현재 포함된 범위

- 관리자용 도면 업로드/분석 시작 화면
- 벽, 공간, 노드 후보를 JSON으로 다루는 공통 모델
- SVG 기반 2D 지도와 CSS/SVG 방식의 2.5D 미리보기
- 공간 선택, 혼잡도 칩, 목적지/QR 미리보기 UI
- `analyzer/analyze_floorplan.py` OpenCV 전처리 샘플
- 캔버스 클릭 기반 공간·벽·노드 후보 추가
- 선택 공간 이름 변경 및 Delete 삭제
- MapData JSON 저장/불러오기와 브라우저 자동 저장
- 데모 노드 그래프 기반 추천 경로 계산
- 사용자용 `/map/:mapId?start=:nodeId` 길 안내 화면
- 관리자 발행/QR 미리보기에서 사용자 지도 화면으로 연결
- 파일 기반 지도 저장 API: `GET/PUT /api/maps/:mapId`
- 관리자 발행 시 `data/maps/:mapId.json`에 확정 MapData 저장
- 도면 업로드 분석 API: `POST /api/analyze`
- 업로드 파일 저장 위치: `data/uploads/`
- 이미지 후보 추출 어댑터와 PDF 업로드 제한 상태 분리
- 분석 후보 전체 적용: 주황색 벽·공간 후보를 확정 MapData로 변환
- 노드 추가 시 가장 가까운 노드와 양방향 Edge 자동 생성
- 출입구 지정 도구와 MapData 기반 추천 경로 갱신
- 사용자 페이지에서 저장된 nodes/edges 기반 경로·거리·시간 계산
- 3D 프로토타입 모드: 공간 polygon 돌출면·벽면·라벨 렌더링
- `3D SVG 추출` 버튼으로 프로토타입 결과 다운로드

길찾기 알고리즘은 이번 범위의 핵심에서 제외했습니다. 현재 MapData의 nodes/edges는 다른 내비게이션 프로젝트가 연결할 수 있도록 호환용으로 유지합니다.

현재 `/api/analyze`는 Sharp 기반 이미지(JPG, JPEG, PNG, WebP) 분석으로 연결되어 있으며, PDF는 이미지로 변환한 뒤 업로드해야 합니다. 브라우저 화면은 분석 전에도 데모 맵으로 확인할 수 있습니다.
