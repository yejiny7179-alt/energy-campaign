// ⚡ 에너지 절약 캠페인
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, onSnapshot, query, where, orderBy, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Firebase 설정 ──
const firebaseConfig = {
  apiKey:            "AIzaSyBMrmO62QoplKN0YMjhInpP6IlhnfeSQuU",
  authDomain:        "phs-99da7.firebaseapp.com",
  projectId:         "phs-99da7",
  storageBucket:     "phs-99da7.firebasestorage.app",
  messagingSenderId: "1031889630203",
  appId:             "1:1031889630203:web:3a5c55bd17b9b056f3915e"
};

const ADMIN_PASSWORD = "admin1234";
const GRADES         = [1, 2];
const CLASSES        = 11;

// 캠페인 기간 표시용 (화면에만 표시)
const PERIOD_TEXT = "7월 8일(수) ~ 7월 14일(화)";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

let loggedIn  = false;
let admCurTab = "pending";
let selG = "", selC = "";
let scores   = {};
let todayMap = {};
let unsub    = null;
let settings = {};

for (const g of GRADES)
  for (let c = 1; c <= CLASSES; c++)
    scores[g + "-" + c] = { g, c, cnt: 0 };

// ── KST 날짜 ──
function toDateStr() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

// ── 부팅 ──
async function boot() {
  showLoading(true);
  try {
    await loadSettings();
    await rebuildScores();
    await checkTodayApproved();
    renderHero();
    renderLB();
    renderExampleImg();
    startRealtimeFeed();
  } catch (e) {
    console.error(e);
    showToast("Firebase 연결 실패. firebaseConfig를 확인하세요.", "err");
  }
  showLoading(false);
}

async function loadSettings() {
  const snap = await getDoc(doc(db, "settings", "main"));
  if (snap.exists()) settings = snap.data();
}

async function saveSettings(data) {
  settings = Object.assign({}, settings, data);
  await setDoc(doc(db, "settings", "main"), settings);
}

async function rebuildScores() {
  for (const k in scores) scores[k].cnt = 0;
  const snap = await getDocs(query(collection(db, "posts"), where("status", "==", "approved")));
  snap.forEach(function(d) {
    const p = d.data();
    const k = p.grade + "-" + p.class;
    if (scores[k]) scores[k].cnt++;
  });
}

async function checkTodayApproved() {
  todayMap = {};
  const snap = await getDocs(query(
    collection(db, "posts"),
    where("status", "==", "approved"),
    where("dateStr", "==", toDateStr())
  ));
  snap.forEach(function(d) {
    const p = d.data();
    todayMap[p.grade + "-" + p.class] = true;
  });
}

function renderExampleImg() {
  const link = settings.exampleLink;
  const wrap = document.getElementById("example-ok-link");
  const a    = document.getElementById("example-ok-url");
  if (!wrap || !a) return;
  if (link) { wrap.style.display = "block"; a.href = link; }
  else { wrap.style.display = "none"; }
}

// ── 헤로 ──
function renderHero() {
  const total     = Object.values(scores).reduce(function(a, s) { return a + s.cnt; }, 0);
  const activeCls = Object.values(scores).filter(function(s) { return s.cnt > 0; }).length;
  const sorted    = Object.values(scores).filter(function(s) { return s.cnt > 0; }).sort(function(a, b) { return b.cnt - a.cnt; });
  const top       = sorted[0];

  document.getElementById("st-total").textContent = total;
  document.getElementById("st-pts").textContent   = activeCls;
  document.getElementById("st-top").textContent   = top ? top.g + "학년\n" + top.c + "반" : "-";

  const pb = document.getElementById("pbadge");
  if (pb) { pb.textContent = "진행중"; pb.className = "pbadge active"; }
}

// ── 점수판 ──
function renderLB() {
  GRADES.forEach(function(g) {
    const list   = Object.values(scores).filter(function(s) { return s.g === g; }).sort(function(a, b) { return b.cnt - a.cnt; });
    const max    = (list[0] && list[0].cnt) ? list[0].cnt : 1;
    const topCnt = (list[0] && list[0].cnt) ? list[0].cnt : 0;
    const el     = document.getElementById("lb-" + g);
    if (!el) return;

    const hasAny = list.some(function(s) { return s.cnt > 0; });
    if (!hasAny) {
      el.innerHTML = "<div class=\"empty\" style=\"padding:16px\">아직 참여한 학급이 없습니다</div>";
      return;
    }

    el.innerHTML = list.map(function(s, i) {
      const rc    = i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "rn";
      const rl    = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
      const bp    = Math.round(s.cnt / max * 100);
      const isTop = s.cnt === topCnt && topCnt > 0;
      const qual  = s.cnt >= 3;
      const topBadge  = isTop ? " <span class=\"lb-reward\">추가 상품</span>" : "";
      const qualBadge = qual  ? " <span style=\"font-size:10px;background:#E1F5EE;color:#085041;padding:1px 6px;border-radius:20px;font-weight:700;margin-left:4px\">🎁 상품 대상</span>" : "";
      return "<div class=\"lb-row\">" +
        "<div class=\"lb-rank " + rc + "\">" + rl + "</div>" +
        "<div class=\"lb-info\">" +
          "<div class=\"lb-name\"><span>" + s.g + "학년 " + s.c + "반" + topBadge + "</span><span class=\"lb-pt\">" + s.cnt + "회</span></div>" +
          "<div class=\"lb-bar-wrap\"><div class=\"lb-bar\" style=\"width:" + bp + "%\"></div></div>" +
          "<div class=\"lb-cnt\">" + s.cnt + "회 참여" + qualBadge + "</div>" +
        "</div>" +
      "</div>";
    }).join("");
  });
}

// ── 실시간 피드 ──
function startRealtimeFeed() {
  if (unsub) unsub();
  const q = query(collection(db, "posts"), where("status", "==", "approved"), orderBy("createdAt", "desc"));
  unsub = onSnapshot(q, async function(snap) {
    await rebuildScores();
    await checkTodayApproved();
    renderHero();
    renderLB();
    renderFeedFromSnap(snap);
    chkReady();
  });
}

function renderFeedFromSnap(snap) {
  const el = document.getElementById("feed-body");
  if (!el) return;
  if (snap.empty) {
    el.innerHTML = "<div class=\"empty\">승인된 인증 게시물이 없습니다<br><span style=\"font-size:11px\">관리자 승인 후 표시됩니다</span></div>";
    return;
  }
  const items = [];
  snap.forEach(function(d) { items.push(Object.assign({ id: d.id }, d.data())); });
  el.innerHTML = items.map(function(p) {
    const dt = p.createdAt && p.createdAt.toDate
      ? p.createdAt.toDate().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "";
    return "<div class=\"feed-link-card\" onclick=\"window.open('" + p.mediaLink + "','_blank')\">" +
      "<div class=\"flc-icon\" style=\"background:#E1F5EE\">💡</div>" +
      "<div class=\"flc-info\">" +
        "<div class=\"flc-class\">" + p.grade + "학년 " + p.class + "반</div>" +
        "<div class=\"flc-meta\">" +
          "<span class=\"fi-badge bp\">실천 인증</span>" +
          "<span>" + (p.dateStr || "") + "</span>" +
          "<span>" + dt + "</span>" +
        "</div>" +
      "</div>" +
      "<div class=\"flc-arrow\">→</div>" +
    "</div>";
  }).join("");
}

// ── 페이지 이동 ──
window.goPage = function(p, btn) {
  document.querySelectorAll(".page").forEach(function(el) { el.classList.remove("active"); });
  document.getElementById("page-" + p).classList.add("active");
  document.querySelectorAll(".bn-btn").forEach(function(b) { b.classList.remove("active"); });
  if (btn) btn.classList.add("active");
  if (p === "board") renderLB();
  if (p === "admin" && loggedIn) renderAdm();
};

// ── 폼 조작 ──
function buildClassOptions() {
  selG = document.getElementById("sel-g").value;
  const cs = document.getElementById("sel-c");
  cs.innerHTML = "<option value=\"\">반 선택</option>";
  if (!selG) { chkReady(); return; }
  for (let c = 1; c <= CLASSES; c++) {
    const o = document.createElement("option");
    o.value = String(c);
    o.textContent = c + "반";
    cs.appendChild(o);
  }
  selC = "";
  chkReady();
}

document.getElementById("sel-g").addEventListener("change", buildClassOptions);
document.getElementById("sel-c").addEventListener("change", function() {
  selC = this.value;
  chkReady();
  checkDupWarn();
});

function getLink() {
  return document.getElementById("media-link").value.trim();
}

function checkDupWarn() {
  const warn = document.getElementById("dup-warn");
  if (warn) warn.style.display = (selG && selC && todayMap[selG + "-" + selC]) ? "block" : "none";
}

function chkReady() {
  const link  = getLink();
  const isDup = !!(selG && selC && todayMap[selG + "-" + selC]);
  const prev  = document.getElementById("link-preview");
  if (prev) prev.style.display = link ? "flex" : "none";
  const btn = document.getElementById("sub-btn");
  if (btn) btn.disabled = !(selG && selC && link && !isDup);
}

window.clearLink = function() {
  document.getElementById("media-link").value = "";
  chkReady();
};
document.getElementById("media-link").addEventListener("input", chkReady);

// ── 동의 팝업 ──
window.doSubmit = function() {
  if (!getLink()) return;
  document.getElementById("chk-consent").checked = false;
  document.getElementById("btn-consent-ok").disabled = true;
  document.getElementById("consent-overlay").style.display = "flex";
};

window.closeConsent = function() {
  document.getElementById("consent-overlay").style.display = "none";
};

window.confirmConsent = async function() {
  closeConsent();
  showLoading(true);
  try {
    const dateStr = toDateStr();
    const dupCheck = await getDocs(query(
      collection(db, "posts"),
      where("grade", "==", parseInt(selG)),
      where("class", "==", parseInt(selC)),
      where("dateStr", "==", dateStr),
      where("status", "==", "approved")
    ));
    if (!dupCheck.empty) {
      showToast("오늘 이미 승인된 인증이 있습니다 (하루 1회)", "err");
      showLoading(false);
      return;
    }
    await addDoc(collection(db, "posts"), {
      grade:     parseInt(selG),
      class:     parseInt(selC),
      type:      "practice",
      mediaLink: getLink(),
      dateStr:   dateStr,
      status:    "pending",
      createdAt: new Date()
    });
    selG = ""; selC = "";
    document.getElementById("sel-g").value = "";
    document.getElementById("sel-c").innerHTML = "<option value=\"\">반 선택</option>";
    document.getElementById("media-link").value = "";
    checkDupWarn();
    chkReady();
    showToast("✅ 등록 완료! 관리자 확인 후 점수에 반영됩니다.", "ok");
  } catch (e) {
    console.error(e);
    showToast("등록 실패. 다시 시도해 주세요.", "err");
  }
  showLoading(false);
};

// ── 관리자 로그인 ──
window.doLogin = function() {
  const pw = document.getElementById("adm-pw").value;
  if (pw === ADMIN_PASSWORD) {
    loggedIn = true;
    document.getElementById("adm-login").style.display = "none";
    document.getElementById("adm-panel").style.display = "block";
    renderAdm();
  } else {
    showToast("비밀번호가 올바르지 않습니다", "err");
  }
};

window.admTab = function(t, el) {
  admCurTab = t;
  document.querySelectorAll(".tab").forEach(function(b) { b.classList.remove("active"); });
  if (el) el.classList.add("active");
  renderAdm();
};

async function renderAdm() {
  const allSnap = await getDocs(collection(db, "posts"));
  let pend = 0, appr = 0, rej = 0;
  allSnap.forEach(function(d) {
    const s = d.data().status;
    if (s === "pending") pend++;
    else if (s === "approved") appr++;
    else rej++;
  });
  document.getElementById("adm-stats").innerHTML =
    "<div class=\"adm-sbox\"><div class=\"adm-sn\" style=\"color:#BA7517\">" + pend + "</div><div class=\"adm-sl\">대기중</div></div>" +
    "<div class=\"adm-sbox\"><div class=\"adm-sn\" style=\"color:#0F6E56\">" + appr + "</div><div class=\"adm-sl\">승인됨</div></div>" +
    "<div class=\"adm-sbox\"><div class=\"adm-sn\" style=\"color:#A32D2D\">" + rej + "</div><div class=\"adm-sl\">반려됨</div></div>" +
    "<div class=\"adm-sbox\"><div class=\"adm-sn\">" + allSnap.size + "</div><div class=\"adm-sl\">전체</div></div>";

  const el = document.getElementById("adm-content");
  if (admCurTab === "settings") { renderSettings(el); return; }

  const snap = await getDocs(query(
    collection(db, "posts"),
    where("status", "==", admCurTab),
    orderBy("createdAt", "desc")
  ));

  if (snap.empty) { el.innerHTML = "<div class=\"empty\">해당 상태의 게시물이 없습니다</div>"; return; }

  const items = [];
  snap.forEach(function(d) { items.push(Object.assign({ id: d.id }, d.data())); });

  el.innerHTML = "<div style=\"background:#fff\">" + items.map(function(p) {
    const bc = p.status === "pending" ? "bpend" : p.status === "approved" ? "bok" : "brej";
    const bl = p.status === "pending" ? "대기중" : p.status === "approved" ? "승인" : "반려";
    const dt = p.createdAt && p.createdAt.toDate
      ? p.createdAt.toDate().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "";
    const acts = p.status === "pending"
      ? "<button class=\"abtn ok\" onclick=\"admAct('" + p.id + "','approved')\">✓ 승인</button><button class=\"abtn rej\" onclick=\"admAct('" + p.id + "','rejected')\">✕ 반려</button>"
      : "<button class=\"abtn del\" onclick=\"admAct('" + p.id + "','delete')\">🗑 삭제</button>";
    return "<div class=\"post-card\">" +
      "<div class=\"post-thumb\" style=\"background:#E1F5EE\">💡</div>" +
      "<div class=\"post-info\">" +
        "<div class=\"post-meta\">" + p.grade + "학년 " + p.class + "반 <span class=\"badge " + bc + "\">" + bl + "</span></div>" +
        "<div class=\"post-time\">" + (p.dateStr || "") + " 등록 · " + dt + "</div>" +
        "<a href=\"" + p.mediaLink + "\" target=\"_blank\" style=\"font-size:12px;color:#0F6E56;display:block;margin-bottom:8px\">📎 사진 보기 →</a>" +
        "<div class=\"post-acts\">" + acts + "</div>" +
      "</div>" +
    "</div>";
  }).join("") + "</div>";
}

window.admAct = async function(id, action) {
  showLoading(true);
  try {
    if (action === "delete") {
      if (!confirm("정말 삭제할까요?")) { showLoading(false); return; }
      await deleteDoc(doc(db, "posts", id));
    } else {
      await updateDoc(doc(db, "posts", id), { status: action });
    }
    await rebuildScores();
    await checkTodayApproved();
    renderHero();
    renderLB();
    renderAdm();
    showToast(
      action === "approved" ? "✅ 승인 완료. 점수에 반영됩니다." :
      action === "rejected" ? "반려 처리되었습니다." : "삭제되었습니다.",
      action === "approved" ? "ok" : ""
    );
  } catch (e) {
    showToast("오류가 발생했습니다.", "err");
  }
  showLoading(false);
};

// ── 설정 탭 ──
function renderSettings(el) {
  el.innerHTML =
    "<div class=\"settings-wrap\">" +
      "<div class=\"sec-lbl\" style=\"margin-bottom:8px\">인증 예시 사진 링크</div>" +
      "<p style=\"font-size:12px;color:#888;margin-bottom:10px;line-height:1.6\">구글 포토 공유 링크를 입력하면 학생 화면 예시 사진에 표시됩니다.</p>" +
      "<input type=\"url\" id=\"example-link-input\" placeholder=\"https://photos.app.goo.gl/...\" value=\"" + (settings.exampleLink || "") + "\" style=\"width:100%;padding:12px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;font-size:14px;font-family:inherit;margin-bottom:10px\">" +
      "<button class=\"big-btn\" onclick=\"saveExampleLink()\" style=\"margin-bottom:24px\">✓ 예시 사진 저장</button>" +
      "<div style=\"border-top:0.5px solid rgba(0,0,0,0.08);padding-top:20px\">" +
        "<div class=\"sec-lbl\" style=\"margin-bottom:14px\">데이터 관리</div>" +
        "<button class=\"abtn\" style=\"width:100%;padding:14px;margin-bottom:8px;text-align:left\" onclick=\"exportCSV()\">📥 게시물 내보내기 (CSV)</button>" +
        "<button class=\"danger-btn\" onclick=\"if(confirm('정말 모든 게시물을 삭제할까요?'))resetAll()\">🗑 전체 초기화</button>" +
      "</div>" +
    "</div>";
}

window.saveExampleLink = async function() {
  const link = document.getElementById("example-link-input").value.trim();
  showLoading(true);
  await saveSettings({ exampleLink: link });
  renderExampleImg();
  showLoading(false);
  showToast("✅ 예시 사진 링크가 저장되었습니다.", "ok");
};

window.exportCSV = async function() {
  const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
  const rows = [["학년", "반", "날짜", "상태", "링크", "등록시간"]];
  snap.forEach(function(d) {
    const p  = d.data();
    const dt = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate().toLocaleString("ko-KR") : "";
    rows.push([p.grade, p.class, p.dateStr || "", p.status, p.mediaLink, dt]);
  });
  const csv = rows.map(function(r) { return r.map(function(v) { return "\"" + v + "\""; }).join(","); }).join("\n");
  const a   = document.createElement("a");
  a.href    = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv);
  a.download = "campaign_posts.csv";
  a.click();
};

window.resetAll = async function() {
  showLoading(true);
  const snap = await getDocs(collection(db, "posts"));
  await Promise.all(snap.docs.map(function(d) { return deleteDoc(doc(db, "posts", d.id)); }));
  await rebuildScores();
  await checkTodayApproved();
  renderHero();
  renderLB();
  showLoading(false);
  showToast("초기화 완료");
};

// ── 유틸 ──
function showLoading(v) {
  document.getElementById("loading").style.display = v ? "flex" : "none";
}

function showToast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (type ? " " + type : "");
  t.style.display = "block";
  clearTimeout(t._t);
  t._t = setTimeout(function() { t.style.display = "none"; }, 3200);
}

boot();
