# my-app-1

my-app-1 소개 사이트와 방명록.

## 스택

- 언어: JavaScript
- 프론트엔드: HTML, CSS, 순수 JavaScript (`public/`)
- 백엔드: Node.js + Express (`server.js`)
- 저장소: Supabase (Postgres) — `@supabase/supabase-js`

## Supabase 구성

- 테이블 `public.guestbook_entries` (id, name, message, token_hash, created_at), RLS 사용
- 공개(anon) 키로는 `token_hash`를 뺀 열만 읽을 수 있고, 테이블에 직접 쓰거나 지울 수 없습니다.
- 작성은 `add_guestbook_entry(p_name, p_message)`, 삭제는 `delete_guestbook_entry(p_id, p_token)` 함수로만 합니다.
  삭제 토큰은 작성 시 한 번만 돌려주고 DB에는 SHA-256 해시만 저장합니다.

스키마는 [`supabase/migrations/`](supabase/migrations/)에 있습니다. 새 Supabase 프로젝트에 적용하려면
대시보드의 SQL Editor에 파일 내용을 붙여 넣어 실행하거나, Supabase CLI로 적용합니다.

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## 실행

Node.js 22.13 이상이 필요합니다. `.env.example`을 `.env`로 복사해 Supabase 프로젝트 URL과 공개 키를 적습니다.

```bash
npm install
npm start
```

브라우저에서 http://localhost:3000 을 엽니다. 포트를 바꾸려면 `PORT` 환경 변수를 설정합니다.

## Vercel 배포

`server.js`가 Express 앱을 내보내므로 Vercel이 서버리스 함수로 실행합니다. `.env`는 저장소에 없으니
Vercel 프로젝트의 **Settings → Environment Variables**에 `SUPABASE_URL`과 `SUPABASE_ANON_KEY`를 등록한 뒤
다시 배포합니다. 설정하지 않으면 페이지는 열리지만 방명록 API는 503을 돌려줍니다.

## 방명록 API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/entries` | 최근 글 200개를 최신순으로 반환 |
| POST | `/api/entries` | `{ name, message }`로 글 작성. 응답의 `deleteToken`은 브라우저에 저장 |
| DELETE | `/api/entries/:id` | `X-Delete-Token` 헤더로 본인 글 삭제 |

이름은 20자, 메시지는 300자까지이며, 같은 IP에서는 10초에 한 번만 쓸 수 있습니다.
