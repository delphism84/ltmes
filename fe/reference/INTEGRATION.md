# 다른 Next 앱(Materio 셸 등)에 AdminConsole 끼워 넣기

`rc-niuniu-api-fe-next`와 **동일 UI**를 쓰려면 아래만 맞추면 됩니다.

## 1. 복사할 파일

```
src/components/admin/AdminConsole.tsx
src/components/admin/AdminDateTimeFilter.tsx
```

## 2. npm 의존성 (원본과 동일)

`package.json`에 다음이 있어야 합니다 (버전은 이 레포의 `package.json` 참고).

- `bootstrap`, `date-fns`, `lucide-react`, `next`, `react`, `react-datepicker`, `react-dom`
- dev: `tailwindcss`, `postcss`, `typescript`, `@types/*`, `eslint`, `eslint-config-next`

## 3. 스타일

루트 레이아웃에서:

1. `import 'bootstrap/dist/css/bootstrap.min.css'`
2. 앱 전역 CSS에 `src/app/globals.css` 내용을 합치거나 import (Tailwind `@tailwind` 지시문 포함 구간 유지)

`tailwind.config.ts`의 `content`에 `./src/components/**/*` 경로가 포함되어야 AdminConsole 클래스가 purge 되지 않습니다.

## 4. 경로 별칭

`tsconfig.json`:

```json
"paths": { "@/*": ["./src/*"] }
```

컴포넌트에서 `@/components/admin/AdminConsole` 로 import 하도록 바꿀 수 있습니다.

## 5. 페이지 예시

```tsx
// app/niuniu/page.tsx (또는 원하는 경로)
import AdminConsole from '@/components/admin/AdminConsole'
export default function Page() {
  return <AdminConsole />
}
```

## 6. 환경 변수

- `NEXT_PUBLIC_API_BASE_URL` — seamless API 베이스 URL (AdminConsole 내부 기본값과 맞출 것)

## 7. 주의

- `AdminConsole` / `AdminDateTimeFilter`는 **클라이언트 컴포넌트**(`'use client'`)입니다. Server Component 트리에 넣을 때는 그대로 자식으로 두면 됩니다.
- 레이아웃에 Materio 사이드바·헤더를 두고 **본문 영역만** `<AdminConsole />`만 두는 구성이 일반적입니다.
