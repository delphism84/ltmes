# LTMES FE/BE v2 — WSS·배치·기록·설정 구현 계획

> 목적: 요구사항을 단계적으로 구현하기 위한 **설계·범위·의존성** 정의.  
> **코드 이전**에 이 문서를 기준으로 검토·수정(반복) 후 착수한다.

---

## 0. 용어·전제

| 항목 | 전제 |
|------|------|
| 배포 | 브라우저는 `https://lt.lunarsystem.co.kr` — API·WSS는 nginx 동일 오리진 (`/api`, `/ws/ingest`, `/ws/app`). |
| 인증 | 관리 UI는 JWT(기존). **장비→서버** 수신 WSS는 인바운드용(필요 시 API 키/별도 경로). |
| DB | MongoDB (Mongoose). `systemConfig`·`recordLogs` 등 **컬렉션명·스키마**는 이 문서 확정 후 고정. |

---

## 1. 요구사항 맵(추적용)

- [1.1] **WSS**: BE에서 **라우팅(메시지 `type`/`op`)** — 일부 UI 흐름을 **REST 대신 WSS**로(실시간성).
- [1.2] **FE**: `Gateway 통신 포트` **패널 삭제**.
- [1.3] **BE**: datalog 수신(WSS) 시 DB 기록 + **`eqList` 생성·갱신** — 키 `(userid, eqid)` → `마지막 데이터`, `시각` 등.
- [1.4] **FE**: `센서 연결 상태` = **eqList(및 tag 메타) 실시간 표시** (WSS push 또는 폴링·구독).
- [1.5] **tagList 기본 폴백** (5행) — `userid=ltmes` 고정, `eqid` 10/20/30… 매핑(표는 아래 §4).
- [1.6] **작동 순서·가중/완료 판정 = BE** — FE는 **렌더링** + WSS/REST로 명령 전달만.
- [1.7] **무게 완료 조건**: **§8** — [1] 절댓값 +측/−측(기본), [2] **백분율 ±5%**; 연속 안정 **3.5s**; `systemConfig` + **「무게 자동 인식 설정」**.
- [1.8] **규격**별 **자재 사용 여부** 체크 — 미사용 **skip**; UI는 규격 선택 후 **미체크 30% 투명도**.
- [1.9] **체크된 자재 모두 완료** → `무게측정` → `무게 측정 완료` → **`WeightCompleteDraft` 삽입(§3.4b)**.
- [1.10] **수동 조정** 후 `저장` → **`recordLogs`** 저장 (G1, S2, … 필드).
- [1.11] **기록 조회** / **데이터 목록** — **기간(날짜) UI 동일**; 기록조회: 엑셀·PDF; 데이터목록: **수정/삭제** 모달.
- [1.12] (선택) **a1** 배치 흐름에 맞게 **1자재씩 glow** → 완료 시 **녹색 + ‘측정완료’** → 다음 자재.

---

## 2. BE 아키텍처: WSS **2채널(확정)**

### 2.1 경로(구현됨)

| URL | 용도 | 인증 |
|-----|------|------|
| **`/ws/ingest`** | 장비/게이트웨이 **텍스트 JSON** → `Datalog`/`RxLog` + **eqList** 갱신 | (선택) 추후 API 키/화이트리스트 |
| **`/ws/app`** | 관리 UI — **eqList 푸시**, `ping`/`pong`, 추후 배치 `op` | **쿼리 `?token=JWT`** (필수) |

- nginx: `^~ /ws` 로 `/ws/ingest`·`/ws/app` 모두 48998 프록시.  
- **구 `/ws` 단일 경로 폐지** — 송신기는 `wss://…/ws/ingest` 로 변경 (`WSS_SENDER.md` 참고).

### 2.2 REST vs WSS — **확정(2026-04-22)**

| 채널 | 용도 |
|------|------|
| **REST** | **조회 성격**만: 목록/기간 조회, 엑셀·PDF **다운로드(서버 응답)**, `system-config` 읽기, (필요 시) auth |
| **WSS** | **실시간**, **인바운드 수신(ingest)**, `eqList`/앱 **푸시**, 이후 **자동 측정·배치** `op` (예정) |
| **REST** + **recordLog** | **조회** + **`recordLog` POST/PUT/DELETE** (확정) — “데이터 **수정·삭제**”는 **REST** |

- **정리**: 목록/기간/내보내기/ **recordLog CRUD** = REST. 실시간·ingest = WSS 2채널.

---

## 3. 데이터 모델(제안)

### 3.1 `eqList` (런타임 + 영속)

- **핫 패스(메모리)**: `Map<`${userid}|${eqid}`, EqEntry>`  
  - `lastPayload`: 마지막 datalog의 `W`, `ST`, `NT`, `msg` 등  
  - `lastAt: Date`  
- **옵션 영속** Mongo `EqLastSnapshot` (서버 재시작 후 복원용) — v1는 메모리만 + 재시작 시 datalog **최신 N건**으로 재빌드해도 됨.  
- **WSS**로 구독 클라이언트에 `broadcast: { op: "eqList", data: [...] }` (50ms~200ms coalesce 권장).

### 3.2 `SystemConfig` (단일 doc 또는 key-value)

- `key: "weightAuto"` (nested) — **§8 확정**  
- `key: "specs"` (규격 정의, 자재 사용 여부 + 목표·허용오차)  
- **seed**: FE 기본 5 tag + `userid=ltmes` 폴백

### 3.3 `TagList` (또는 `EquipmentTag`)

- 컬렉션에 **편집 가능한 태그** + **시드 폴백**  
- 기본 5행(§4) — DB에 없을 때 **코드에 폴백** (요구 “기본 폴백”).

### 3.4 `RecordLog` (`recordLogs`)

- 필드(요구): `G1, S2, S1, W, M3, C1, C2, Ad1, Ad2` (숫자, 단위 `kg` 등)  
- 메타: `specId`, `batchId?`, `createdBy`, `createdAt`, (선택) `rawEqSnapshot`  
- **인덱스**: `createdAt` (기록조회/데이터목록 기간)  
- **기록조회 / 데이터목록**은 **동일 `recordLogs` 사용**. 차이는 **UI/권한**만: 기록조회 = **엑셀·PDF 출력**; 데이터목록 = **수정·삭제**(모달).

### 3.4b `WeightCompleteDraft` (확정)

- 자동 배치 완료 후 “**무게측정** → **무게 측정 완료**” 단계에 삽입하는 **초안** (작업자 수동 조정 전).  
- 최종 **저장** 시 `recordLogs`로 확정(또는 draft 삭제/연결). 스키마는 P0에서 정의.

### 3.5 배치 FSM(서버)

- `batchState`: `idle` | `selectingSpec` | `running` | `completed` | `failed`  
- `currentMaterialIndex` (G1→S2→S1→W→M3 중 **enabled만**)  
- `perMaterial: { state: pending|inProgress|ok|skip, lastStableWeight, stableSince }`  
- **안정도 판정**은 datalog(해당 `eqid`) 스트림을 **FSM에 주입**해 BE에서만 계산.

---

## 4. tagList 기본 폴백(확정본)

`userid=ltmes` 고정(문자열). `eqid`는 숫자 문자열 `"10"`, `"20"`, … (요구: 10,20,30이 eqid 매핑)

| 태그 코드 | 태그명 | 장비 ID | 디바이스명 | 입력 방식 | 상태 |
|-----------|--------|---------|------------|-----------|------|
| G1 | 자갈 | 10 | lt.ww01 | 자동 | 활성 |
| S2 | 석분 | 20 | lt.ww02 | 자동 | 활성 |
| S1 | 모래 | 30 | lt.ww03 | 자동 | 활성 |
| W | 물 | 40 | lt.ww04 | 자동 | 활성 |
| M3 | 혼화제 | 50 | lt.ww05 | 자동 | 활성 |

- **센서 연결** 표시: `eqList[(userid,eqid)]` + 위 메타(미수신/수신) 조합.  
- **`userid` — 확정(옵션 C)**: **실제 datalog의 `userid` 라인**과 **`ltmes` 기본 라인**을 **둘 다 표시**.  
  - **`ltmes`는 “기본 라인”** 역할(태그/폴백과 정합).  
  - 다른 `userid`는 eq별로 **추가 행/그룹**으로 병행 표시(시각적 구분 권장).

---

## 5. FE (실시간·배치) 렌더링

- **Gateway 패널** 삭제.  
- **센서 연결 상태**: `eqList` + tag 폴백 row 병합.  
- **규격 선택 + 체크**: 스펙 API 또는 `SystemConfig`에서 로드; 미체크 행 30% opacity.  
- **배치 흐름**: WSS `batchState` 수신  
  - 현재 **활성** 자재 카드: `animate` glow (CSS, `ring-2` pulse 등)  
  - 완료: 녹색 + “측정완료”  
- **무게측정** → 자동 완료 시 **`WeightCompleteDraft` 삽입** (예정).  
- **recordLogs 확정·수정·삭제** → **REST** `POST/PUT/DELETE /api/record-logs` (확정).

---

## 6. 기록조회 / 데이터목록

- **데이터**: **동일 `recordLogs`**. **차이**만:  
  - **기록조회**: 엑셀·PDF = **서버가 파일로 내려줌** (REST `GET` + `Content-Disposition` / 별도 export 경로).  
  - **데이터목록**: 행 **수정·삭제** → 모달 — 조회·삭제·수정은 **REST(조회 성격)**에 맞게 유지 가능(사용자 확정: 조회=REST, 다만 `recordLog` 쓰기는 WSS로 통일할지는 구현 시 §2.2와 정합; **최소한 내보내기는 서버**).  
- **UI**: 날짜(기간) 필터·테이블 **동일 모듈** 권장.  
- **엑셀/PDF — 확정**: **서버에서 생성·다운로드 응답** (§6, 사용자 답 6).

---

## 7. 남는 세부

1. datalog `W` **단위** — **kg** 통일 권장.  
2. WSS **동시** 다중 관리자: 현재 **eqList 브로드캐스트**; 추후 per-admin 큐 검토.  
3. **`recordLog` 수정/삭제** — **REST** (`PUT/DELETE /api/record-logs/:id`) **확정(2026-04-22)**.

---

## 8. 파라미터(무게 자동 인식) — **확정(2026-04-22)**

**완료 조건** = (허용 범위 내만) + (연속 안정 **3.5초**, 소수점 유지).

**허용 범위 모드(택1, 설정 UI에 라디오/체크):**

| 모드 | 설명 | 파라미터(예) |
|------|------|----------------|
| **[1] 절댓값(기본 체크)** | 목표 대비 **+측**, **-측**을 **각각** 숫자(kg)로 둔 허용 구간. (구 “+10, −15”류는 이 필드 2개로 표현) | `absPlus`, `absMinus` |
| **[2] 백분율** | **±5%** (기본 5% 가정, 설정에서 변경 가능) | `percentHalfWidth` = 5 |

- **연속 안정**: `stabilityWindowSec` = **3.5** (기본, 설정에서 변경)  
- **저장**: `SystemConfig` / `systemConfig` 컬렉션.  
- **UI**: `설정` > 규격관리 위 **「무게 자동 인식 설정」** (구현됨)  
- **API**: `GET` / **`PUT /api/system-config/weight-auto`** (구현됨)

---

## 9. 구현 페이징(권장 순서)

| Phase | 내용 | 산출물 |
|-------|------|--------|
| **P0** | 스키마: `SystemConfig`, `RecordLog`, `WeightCompleteDraft`, (옵) `EqLastSnapshot` | `models/`, seed |
| **P1** | Wss 라우터: `type` 분기, datalog→`eqList` 갱신, FE 구독 최소 + REST `GET /api/eq-snapshot` 폴백 | BE |
| **P2** | FE: Gateway 제거, 센서 패널 = eqList + tag 폴백 | FE |
| **P3** | 배치 FSM + BE 안정도 + glow 연동(동일 WSS) | BE+FE |
| **P4** | 설정 UI + `systemConfig` | FE+BE |
| **P5** | `RecordLog` 저장·목록·모달 | FE+BE |
| **P6** | 기록조회 export | **BE**: CSV·인쇄 HTML·**xlsx(exceljs)**·**pdf(pdfkit)** — `GET …/export/{csv,print,xlsx,pdf}` |

---

## 10. 리스크·완화

- **WSS + JWT** 만료: 재연결·403 시 로그인 유도.  
- **빈번한 broadcast**: throttle + patch diff.  
- **FSM/시뮬레이션** 장애: 서버 `batchState: failed` + 메시지.  
- **엑셀/PDF**: 서버 메모리 — 페이지 크기·스트리밍.

---

## 11. 검토 체크리스트

- [x] **REST vs WSS** (§2.2)  
- [x] **`userid`**: 둘 다 표시 + `ltmes` = 기본 라인 (§4)  
- [x] **완료 조건**: [1] 절댓값 +/−, [2] %±5% + 3.5s (§8)  
- [x] **무게 측정 완료** → `WeightCompleteDraft` (§3.4b)  
- [x] **기록조회/데이터목록** = 동일 `recordLogs`, UI 차이만 (§3.4, §6)  
- [x] **엑셀/PDF** = 서버 다운로드 (§6)  
- [x] **WSS 2채널**: `/ws/ingest` + `/ws/app` (§2.1)  
- [x] **`recordLog` PUT/DELETE** = **REST** (§7, §2.2)

---

## 12. 구현 현황 vs §1·§6·§8 (검토 2026-04-23)

| 구간 | 상태 | 비고 |
|------|------|------|
| §2 WSS 2채널·ingest·app | 완료 | `/ws/ingest`, `/ws/app?token=` |
| §1.2 Gateway 패널 제거 | 완료 | FE |
| §1.3–1.4 eqList·센서 패널 | 완료 | WSS `op: eqList` |
| §1.5 tagList DB | 완료 | `tagList` 컬렉션·시드·`GET/POST/PUT/DELETE /api/tags`·FE 태그 관리 |
| §1.6–1.7 배치 FSM·안정도 BE | 완료 | `batchEngine.ts`·datalog 후 `tickFromSnapshot`·`systemConfig` 무게자동 규칙 |
| §1.8 규격별 자재 체크·30% | 완료 | `ltmesSpecs`·`GET/PUT /api/specs`·실시간 UI opacity |
| §1.9 `WeightCompleteDraft` | 완료 | 배치 완료 시 삽입·`GET/POST/DELETE /api/weight-drafts` |
| §1.10 수동 저장 → recordLogs | 완료 | `POST /api/record-logs` + 실시간 화면 저장 버튼 |
| §1.11 기록조회·데이터목록 | 완료 | 동일 기간 필터·목록; 기록=CSV/HTML보내기; 데이터=PUT/DELETE 모달 |
| §1.12 glow·측정완료 카드 | 완료 | WSS `batchState`·ring pulse·측정완료 문구 |
| §6 보내기 서버 응답 | 완료 | CSV·HTML·xlsx·pdf 바이너리 |
| §8 무게 자동 설정 | 완료 | GET+PUT+설정 UI |

---

**문서 버전**: **1.2 (2026-04-23)** — P3 배치 FSM·WSS `batchState`/`startBatch`/`cancelBatch`·Draft 자동 저장; §1.5 `TagList`+REST; §1.8 `ltmesSpecs`+설정 UI; P6 **xlsx·pdf** 서버 생성. 남음: nginx 없이 로컬에서만 `/ws` 프록시(Next 미설정) 시 WSS는 `NEXT_PUBLIC_BE_WS_ORIGIN` 등 별도 오리진 권장; 배치 FSM 영속·per-admin 큐·eq 스냅샷 영속 등은 선택 과제.
