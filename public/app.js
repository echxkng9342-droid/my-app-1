// 방명록: 목록 불러오기, 글 남기기, 내가 쓴 글 삭제하기
const MAX_LEN = 300;
const TOKENS_KEY = "my-app-1:delete-tokens";
const NAME_KEY = "my-app-1:name";

const $ = (id) => document.getElementById(id);
const form = $("gb-form"), nameInput = $("gb-name"), text = $("gb-text"), submit = $("gb-submit");
const statusEl = $("gb-status"), list = $("gb-list"), empty = $("gb-empty");
const countEl = $("gb-count"), lenEl = $("gb-len");

const fmt = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

// 이 브라우저에서 쓴 글의 삭제 토큰 { [id]: token }
function loadTokens() {
  try { return JSON.parse(localStorage.getItem(TOKENS_KEY)) || {}; } catch { return {}; }
}
function saveTokens(tokens) {
  try { localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens)); } catch {}
}
let tokens = loadTokens();
let busy = false;
let newId = null;

try { nameInput.value = localStorage.getItem(NAME_KEY) || ""; } catch {}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function updateForm() {
  lenEl.textContent = `${text.value.length} / ${MAX_LEN}`;
  submit.disabled = busy || !nameInput.value.trim() || !text.value.trim();
}

function render(entries) {
  countEl.textContent = entries.length ? `${entries.length}개의 글` : "";
  empty.hidden = entries.length > 0;
  empty.textContent = "아직 남겨진 글이 없습니다. 위 칸에 첫 메시지를 적어 주세요.";
  list.hidden = entries.length === 0;

  list.replaceChildren(...entries.map((e) => {
    const li = document.createElement("li");
    li.className = "entry" + (e.id === newId ? " new" : "");

    const top = document.createElement("div");
    top.className = "entry-top";
    const name = document.createElement("span");
    name.className = "entry-name";
    name.textContent = e.name;
    const time = document.createElement("time");
    time.className = "entry-time";
    time.dateTime = e.createdAt;
    time.textContent = fmt.format(new Date(e.createdAt));
    top.append(name, time);

    if (tokens[e.id]) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.textContent = "삭제";
      del.addEventListener("click", () => removeEntry(e.id));
      top.append(del);
    }

    const body = document.createElement("p");
    body.className = "entry-text";
    body.textContent = e.message;

    li.append(top, body);
    return li;
  }));
}

async function load() {
  try {
    const res = await fetch("/api/entries");
    if (!res.ok) throw new Error();
    render(await res.json());
  } catch {
    empty.hidden = false;
    empty.textContent = "방명록을 불러오지 못했습니다. 서버가 실행 중인지 확인한 뒤 새로 고쳐 주세요.";
  }
}

async function removeEntry(id) {
  if (busy) return;
  busy = true; updateForm();
  try {
    const res = await fetch(`/api/entries/${id}`, {
      method: "DELETE",
      headers: { "X-Delete-Token": tokens[id] },
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "삭제하지 못했습니다.");
    }
    delete tokens[id];
    saveTokens(tokens);
    setStatus("글을 삭제했습니다.");
    await load();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    busy = false; updateForm();
  }
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = nameInput.value.trim();
  const message = text.value.trim();
  if (!name || !message || busy) return;

  busy = true; updateForm();
  setStatus("저장하는 중…");
  try {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, message }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");

    tokens[body.entry.id] = body.deleteToken;
    saveTokens(tokens);
    try { localStorage.setItem(NAME_KEY, name); } catch {}
    newId = body.entry.id;
    text.value = "";
    setStatus("방명록에 남겼습니다. 고맙습니다!");
    await load();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    busy = false; updateForm();
  }
});

nameInput.addEventListener("input", updateForm);
text.addEventListener("input", updateForm);
updateForm();
load();
