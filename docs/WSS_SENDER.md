# LTMES 송신 측 참고 — WSS 연결·메시지

## 엔드포인트 (2채널, 확정)

| 용도 | WebSocket URL (운영 TLS) | 비고 |
|------|--------------------------|------|
| **인바운드(장비/게이트웨이)** | `wss://lt.lunarsystem.co.kr/ws/ingest` | Datalog / RxLog 수신, **eqList** 갱신 |
| **앱(관리자 UI)** | `wss://lt.lunarsystem.co.kr/ws/app?token=<JWT>` | `eqList` 푸시, 추후 `op` 확장 |

| 환경 | 인바운드 (ingest) | 비고 |
|------|-------------------|------|
| 로컬 BE | `ws://127.0.0.1:48998/ws/ingest` | |
| 운영 직접(비권장) | `ws://<호스트>:48998/ws/ingest` | 평문. **권장은 443 + wss** |

### 기존 `/ws` 단일 경로

- v2부터 **`/ws/ingest`** 로 이전. 송신 측 설정의 `wssUrl`을 반드시 갱신하세요.

**주의:** `wss://` 는 **443** (nginx TLS 종료)만 사용. `wss://...:48998` 는 BE가 TLS가 아니면 실패합니다.

### 환경 변수 (BE)

- `WS_PATH_INGEST` 기본 `/ws/ingest`
- `WS_PATH_APP` 기본 `/ws/app`

## `datalog` 컬렉션 (저울/시리얼 구조화)

`isDatalogPayload` 를 만족하는 JSON이 오면 `datalog`에 저장되고 **eqList** `(userid,eqid)` 가 갱신됩니다.

필수: `userid`, `eqid`, `msg`, `ST`, `NT` — 예는 이전과 동일.

## 메시지 형식 (rxLogs 일반)

- UTF-8 텍스트; JSON 권장. `/ws/ingest` 로 전송. (내용은 기존 문서와 동일)

## 관리자 REST (조회·CRUD)

- `GET /api/eq-list` — eqList 스냅샷(동일 데이터는 WSS 푸시)
- `GET/POST/PUT/DELETE /api/record-logs` — **recordLog** 확정(수정·삭제 **REST**)
- `GET /api/system-config/weight-auto` — 무게 자동 인식 기본

관리 UI: `https://lt.lunarsystem.co.kr/` — API `https://` 동일 오리진.

## 관리자 FE — 로컬 `next dev` 시 WSS

- 브라우저 origin이 `localhost:3000`이면 `wss://localhost:3000/ws/app` 은 **Next**로 가서 BE에 안 닿을 수 있음.
- `fe/.env.local` 에 예: `NEXT_PUBLIC_BE_WS_ORIGIN=wss://lt.lunarsystem.co.kr` 또는 `ws://127.0.0.1:48998` (개발용).

## 운영 nginx에서 `wss://…/ws/app` 연결 실패 시

1. **BE: 두 개의 `WebSocketServer`를 같은 `http.Server`에 `path` 옵션으로 붙이면 안 됨** — `ws` 패키지는 **먼저 등록된** 서버가 경로가 안 맞을 때 `400`으로 업그레이드를 끊어, `/ws/app` 이 `/ws/ingest` 쪽에 걸려 실패할 수 있습니다. BE는 `noServer: true` 로 두 WSS를 만들고 `index.ts`에서 `upgrade` 이벤트로 경로만 분기합니다.
2. **이 vhost에서 HTTP/2 끄기** — 같은 443 소켓에 다른 사이트가 `http2 on` 이면 ALPN으로 h2가 켜질 수 있습니다. `lt` 서버 블록에 `http2 off;` 를 두었습니다. 적용 후 `sudo nginx -t && sudo systemctl reload nginx`.
3. **`location ^~ /ws`** — `Upgrade` / `Connection: upgrade`, `proxy_http_version 1.1`, `proxy_read_timeout` 충분히. 필요 시 `proxy_buffering off` (저장소 설정에 반영됨).
4. **BE는 nginx 뒤에서 평문 HTTP** — `/etc/ltmes/be.env` 에 `SSL_CERT_PATH` / `SSL_KEY_PATH` 를 켜면 48998이 HTTPS가 되어, nginx가 `http://127.0.0.1:48998` 로 프록시할 때 **WSS가 실패**합니다. TLS는 nginx만 담당하고 BE는 HTTP로 둡니다.
