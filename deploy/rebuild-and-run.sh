#!/usr/bin/env bash
# LTMES FE 소스 반영 후 서버에서 실행 (호스트 nginx; FE는 Docker 권장)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/3] fe: Docker 이미지 빌드 및 ltmes-fe 기동"
if command -v docker >/dev/null 2>&1; then
  docker compose -f "$ROOT/docker-compose.yml" build ltmes-fe
  docker compose -f "$ROOT/docker-compose.yml" up -d ltmes-fe
else
  echo "docker 없음 — fe는 수동: cd $ROOT/fe && npm run build && npx next start -H 127.0.0.1 -p 63105"
fi

echo "[2/3] nginx 설정 반영 (lt)"
if [[ -f "$ROOT/deploy/nginx/lt.lunarsystem.co.kr.conf" ]] && command -v sudo >/dev/null; then
  sudo cp "$ROOT/deploy/nginx/lt.lunarsystem.co.kr.conf" /etc/nginx/sites-available/lt.lunarsystem.co.kr
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "[3/3] 완료"
echo ""
echo "FE: docker compose -f $ROOT/docker-compose.yml ps ltmes-fe  (127.0.0.1:63105→컨테이너 3000)"
echo "BE 갱신: docker compose -f $ROOT/docker-compose.yml build ltmes-be && docker compose -f $ROOT/docker-compose.yml up -d ltmes-be"
echo "호스트에서 FE만 node로 띄울 때: deploy/ltmes-fe-host.service.example"
