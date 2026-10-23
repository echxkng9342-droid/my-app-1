import express from "express";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env가 있으면 읽는다. 환경 변수로 직접 넘겨도 된다.
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {}

const PORT = Number(process.env.PORT) || 3000;
// 대시보드에 붙여 넣을 때 섞여 들어간 공백·줄바꿈·따옴표를 걷어 낸다.
const cleanEnv = (v) => (v ?? "").replace(/\s+/g, "").replace(/^["']|["']$/g, "");
const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL).replace(/\/+$/, "");
const SUPABASE_ANON_KEY = cleanEnv(process.env.SUPABASE_ANON_KEY);
const MAX_NAME = 20;
const MAX_MESSAGE = 300;
const POST_INTERVAL_MS = 10_000; // 같은 IP에서 연속 작성 간격

// --- Supabase ---
// 공개 키로 접속한다. 테이블은 읽기만 되고, 쓰기와 삭제는 DB 함수(add_/delete_guestbook_entry)로만 한다.
// 접속 정보가 없어도 서버는 뜨고, 방명록 API만 503으로 응답한다.
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    : null;
// 값은 비밀이 아니어도 노출하지 않고, 빠진 변수 이름과 배포 환경만 알려 준다.
const missingEnv = Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY })
  .filter(([, v]) => !v)
  .map(([k]) => k);
const envLabel = process.env.VERCEL_ENV ? ` (Vercel ${process.env.VERCEL_ENV} 환경)` : "";
if (!supabase) {
  console.error(`환경 변수가 없습니다: ${missingEnv.join(", ")}${envLabel}`);
}

const toEntry = (row) => ({ id: row.id, name: row.name, message: row.message, createdAt: row.created_at });

// --- 서버 ---
const app = express();
// Vercel 같은 프록시 뒤에서는 X-Forwarded-For로 실제 접속 IP를 얻는다.
if (process.env.VERCEL) app.set("trust proxy", true);
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api", (req, res, next) => {
  if (supabase) return next();
  res.status(503).json({
    error: `방명록 저장소가 아직 설정되지 않았습니다. 빠진 환경 변수: ${missingEnv.join(", ")}${envLabel}`,
  });
});

app.get("/api/entries", async (req, res) => {
  const { data, error } = await supabase
    .from("guestbook_entries")
    .select("id, name, message, created_at")
    .order("id", { ascending: false })
    .limit(200);
  if (error) {
    console.error("list entries:", error.message, error.details ?? "");
    // 연결 문제를 진단할 수 있게 실패 이유와 접속한 호스트만 알려 준다(키는 노출하지 않음).
    let host = "";
    try { host = new URL(SUPABASE_URL).host; } catch { host = "(URL 형식 오류)"; }
    return res.status(502).json({
      error: "방명록을 불러오지 못했습니다.",
      reason: String(error.message ?? "").slice(0, 200),
      details: String(error.details ?? "").slice(0, 300),
      host,
    });
  }
  res.json(data.map(toEntry));
});

const lastPostByIp = new Map();

app.post("/api/entries", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const message = String(req.body?.message ?? "").trim();

  if (!name || name.length > MAX_NAME) {
    return res.status(400).json({ error: `이름은 1~${MAX_NAME}자로 적어 주세요.` });
  }
  if (!message || message.length > MAX_MESSAGE) {
    return res.status(400).json({ error: `메시지는 1~${MAX_MESSAGE}자로 적어 주세요.` });
  }

  const now = Date.now();
  const last = lastPostByIp.get(req.ip) ?? 0;
  if (now - last < POST_INTERVAL_MS) {
    return res.status(429).json({ error: "너무 빨리 작성했습니다. 몇 초 뒤에 다시 시도해 주세요." });
  }
  lastPostByIp.set(req.ip, now);

  // 작성자에게만 돌려주는 삭제용 토큰은 DB 함수가 만들고, DB에는 해시만 저장된다.
  const { data, error } = await supabase
    .rpc("add_guestbook_entry", { p_name: name, p_message: message })
    .single();
  if (error) {
    if (error.code === "22023") return res.status(400).json({ error: error.message });
    console.error("add entry:", error.message);
    return res.status(502).json({ error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
  res.status(201).json({ entry: toEntry(data), deleteToken: data.delete_token });
});

app.delete("/api/entries/:id", async (req, res) => {
  const id = Number(req.params.id);
  const token = String(req.get("X-Delete-Token") ?? "");
  if (!Number.isInteger(id) || !token) {
    return res.status(403).json({ error: "이 브라우저에서 작성한 글만 삭제할 수 있습니다." });
  }

  const { data: deleted, error } = await supabase.rpc("delete_guestbook_entry", { p_id: id, p_token: token });
  if (error) {
    console.error("delete entry:", error.message);
    return res.status(502).json({ error: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
  if (!deleted) {
    return res.status(403).json({ error: "이 브라우저에서 작성한 글만 삭제할 수 있습니다." });
  }
  res.status(204).end();
});

// Vercel은 내보낸 app을 서버리스 함수로 실행한다. 로컬에서만 직접 포트를 연다.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`my-app-1 running at http://localhost:${PORT}`);
  });
}

export default app;
