# ln_admin_fe_ref

**Niuniu seamless API 관리자 UI** 참조 레포입니다.  
내용은 `rc-niuniu-api-fe-next`와 동일한 **AdminConsole** 화면을 그대로 쓸 수 있도록 필요한 파일만 추출한 것입니다.

## 구성

| 구분 | 설명 |
|------|------|
| **UI 셸** | Next.js App Router + **Bootstrap 5** + **Tailwind** + **lucide-react** (Materio/MUI 아님) |
| **업무 화면** | `src/components/admin/AdminConsole.tsx`, `AdminDateTimeFilter.tsx` |
| **진입** | `/` → 전체 화면이 `AdminConsole` (`src/app/page.tsx`) |

다른 앱(예: Materio MUI 대시보드)에 **끼워 넣을 때**는 아래 `reference/INTEGRATION.md`를 따르면 됩니다.

## 스크립트

```bash
npm install --legacy-peer-deps
npm run dev
npm run build
```

## 환경 변수

`.env.example` 참고. 브라우저에서 호출할 API 베이스:

- `NEXT_PUBLIC_API_BASE_URL`

## Docker

```bash
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://your-api.example -t ln-admin-fe .
```

## 추출 범위 (동기화 시)

원본과 맞추려면 아래를 `rc-niuniu-api-fe-next`에서 다시 복사하면 됩니다.

- `src/components/admin/AdminConsole.tsx`
- `src/components/admin/AdminDateTimeFilter.tsx`
- `src/app/layout.tsx`, `page.tsx`, `globals.css`
- `package.json`, `package-lock.json`, `tailwind.config.ts`, `postcss.config.mjs`, `next.config.mjs`, `tsconfig.json`
- `Dockerfile`, `.env.example`

## 라이선스 참고

Materio 등 서드파티 템플릿과 합치는 경우 해당 템플릿 라이선스를 확인하세요.

## 원격 저장소

https://github.com/delphism84/ln_admin_fe_ref
