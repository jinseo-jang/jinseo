# Instagram Restaurant Archive MVP Backend

이 저장소는 인스타그램 맛집 포스팅 공유를 받아 **저장 → 후보 추출 → 사용자 확인 → 재조회**까지 이어지는, 조금 더 실제 서비스에 가까운 V1 백엔드입니다.

## 이번 단계에서 강화한 점

- 인메모리 프로토타입에서 **JSON 파일 영속 저장소**로 전환했습니다.
- 동일 사용자가 같은 `sourceUrl`을 다시 보내면 **중복 저장을 막고 기존 레코드**를 반환합니다.
- `PATCH /api/v1/places/:id`로 사용자가 상호명/주소/태그/상태를 **수정·확정**할 수 있습니다.
- `GET /api/v1/saved-posts/:id`로 원본 저장 레코드와 분석 결과를 따로 확인할 수 있습니다.

## API 개요

### `POST /api/v1/intake/shared-post`
인스타그램 공유 payload를 받아 저장합니다.

#### 요청 예시

```bash
curl -X POST http://localhost:3000/api/v1/intake/shared-post \
  -H 'content-type: application/json' \
  -d '{
    "userId": "user_123",
    "sourceUrl": "https://www.instagram.com/p/example",
    "sharedText": "상호: 성수브런치랩\n서울 성동구 연무장길 12\n브런치 맛집",
    "tags": ["성수", "브런치"],
    "userNote": "주말 브런치 후보"
  }'
```

### `GET /api/v1/places`
저장된 장소 목록을 조회합니다.

지원 필터:
- `query`
- `status`
- `region`

### `GET /api/v1/places/:id`
저장된 장소 상세와 연결된 원본 저장 레코드를 함께 반환합니다.

### `PATCH /api/v1/places/:id`
자동 추출 결과를 사용자가 확정/수정합니다.

#### 요청 예시

```bash
curl -X PATCH http://localhost:3000/api/v1/places/place_2 \
  -H 'content-type: application/json' \
  -d '{
    "finalName": "성수 브런치 랩",
    "finalAddress": "서울 성동구 연무장길 12",
    "tags": ["성수", "브런치", "데이트"],
    "reviewState": "confirmed",
    "selectedCandidateIndex": 0
  }'
```

### `GET /api/v1/saved-posts/:id`
원본 저장 payload와 분석 결과를 조회합니다.

## 실행 방법

```bash
npm start
```

기본 데이터 파일 경로는 `data/app-data.json` 입니다.

## 테스트

```bash
npm test
```

## 다음 개발 우선순위

1. Share Extension / Android 공유 수신 앱 연결
2. OCR 공급자(ML Kit / Cloud Vision) 연결
3. LLM 구조화 추출 연결
4. 실제 Places API 연동
5. PostgreSQL/Supabase 영속 저장소로 교체
