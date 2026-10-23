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

## 실행

Node.js 22.13 이상이 필요합니다. `.env.example`을 `.env`로 복사해 Supabase 프로젝트 URL과 공개 키를 적습니다.

```bash
npm install
npm start
```

브라우저에서 http://localhost:3000 을 엽니다. 포트를 바꾸려면 `PORT` 환경 변수를 설정합니다.

## 방명록 API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/entries` | 최근 글 200개를 최신순으로 반환 |
| POST | `/api/entries` | `{ name, message }`로 글 작성. 응답의 `deleteToken`은 브라우저에 저장 |
| DELETE | `/api/entries/:id` | `X-Delete-Token` 헤더로 본인 글 삭제 |

이름은 20자, 메시지는 300자까지이며, 같은 IP에서는 10초에 한 번만 쓸 수 있습니다.
