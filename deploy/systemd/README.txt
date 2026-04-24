LTMES — npm run dev + systemd (리눅스, nginx 프록시 유지)
====================================================

전제
----
- 저장소(또는 배포 복사본) 경로가 서비스 파일의 WorkingDirectory 와 일치해야 함.
  기본값: /lunar/ltmes/be , /lunar/ltmes/fe
- nginx: deploy/nginx/lt.lunarsystem.co.kr.conf — FE 127.0.0.1:63105, BE 127.0.0.1:48998
- MongoDB가 127.0.0.1:48999 등에서 기동 중이어야 BE가 동작함.

1) Node / npm
   - 시스템 Node 20+ 권장: which node && which npm (보통 /usr/bin/npm)
   - nvm만 쓰는 경우: 서비스의 ExecStart 를 해당 node 절대경로로 바꾸거나, /usr/bin 에 심볼릭 링크를 둠.

2) 의존성 설치(최초 1회)
   cd /lunar/ltmes/be && npm ci
   cd /lunar/ltmes/fe && npm ci

3) BE 환경 변수
   sudo mkdir -p /etc/ltmes
   sudo cp /lunar/ltmes/deploy/systemd/ltmes-be.env.example /etc/ltmes/be.env
   sudo chmod 600 /etc/ltmes/be.env
   sudo nano /etc/ltmes/be.env   # MONGODB_URI, JWT_SECRET 등 수정

4) (선택) FE 환경
   sudo cp /lunar/ltmes/deploy/systemd/ltmes-fe.env.example /etc/ltmes/fe.env

5) systemd 유닛 설치
   경로가 /lunar/ltmes 가 아니면 .service 파일 안 WorkingDirectory 를 먼저 수정.
   sudo cp /lunar/ltmes/deploy/systemd/ltmes-be.service /etc/systemd/system/
   sudo cp /lunar/ltmes/deploy/systemd/ltmes-fe.service /etc/systemd/system/
   sudo cp /lunar/ltmes/deploy/systemd/ltmes.target /etc/systemd/system/
   sudo systemctl daemon-reload

6) 자동 시작 + 기동
   sudo systemctl enable --now ltmes-be.service
   sudo systemctl enable --now ltmes-fe.service
   또는 한 번에:
   sudo systemctl enable --now ltmes.target

7) 확인
   sudo systemctl status ltmes-be ltmes-fe
   curl -s http://127.0.0.1:48998/health
   curl -sI http://127.0.0.1:63105/ | head -n1
   sudo journalctl -u ltmes-be -u ltmes-fe -f

8) Docker 로 같은 포트를 쓰던 경우
   docker compose down (또는 ltmes 컨테이너 중지) 후 systemd 기동.

9) User= 지정 시
   서비스 파일에서 User=/Group= 주석을 해제하고, 해당 사용자에게 WorkingDirectory
   및 node_modules 에 대한 읽기(필요 시 쓰기) 권한을 부여.
