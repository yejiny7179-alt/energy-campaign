// ════════════════════════════════════════════
//  ⚡ 에너지 절약 캠페인 v2
//  - 1·2학년 / 11반
//  - 실천 인증만 (챌린지 없음)
//  - 하루 1회 중복 체크
//  - 학년별 1위 추가 보상 표시
//  - 관리자: 예시 사진 링크 등록 가능
// ════════════════════════════════════════════

import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, onSnapshot, query, where, orderBy, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── ★ 여기만 수정 ★ ────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBMrmO62QoplKN0YMjhInpP6IlhnfeSQuU",
  authDomain:        "phs-99da7.firebaseapp.com",
  projectId:         "phs-99da7",
  storageBucket:     "phs-99da7.firebasestorage.app",
  messagingSenderId: "1031889630203",
  appId:             "1:1031889630203:web:3a5c55bd17b9b056f3915e"
};
const ADMIN_PASSWORD = "admin1234";  // ← 반드시 변경!
// ────────────────────────────────────────────

const CAMPAIGN_START = "2025-06-10";
const CAMPAIGN_END   = "2025-06-17";
const GRADES         = [1, 2];
const CLASSES        = 11;

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

let loggedIn  = false;
let admCurTab = 'pending';
let selG = '', selC = '';
let scores    = {};   // { "1-3": {g,c,cnt} }
let todayMap  = {};   // { "1-3": true } 오늘 승인된 학급
let unsub     = null;
let settings  = {};   // exampleLink 등

for (const g of GRADES)
  for (let c = 1; c <= CLASSES; c++)
    scores[`${g}-${c}`] = { g, c, cnt: 0 };

// ══════════════════════════════════════════
//  부팅
// ══════════════════════════════════════════
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
    showToast('Firebase 연결 실패. app.js의 firebaseConfig를 확인하세요.', 'err');
  }
  showLoading(false);
}

async function loadSettings() {
  const snap = await getDoc(doc(db, 'settings', 'main'));
  if (snap.exists()) settings = snap.data();
}

async function saveSettings(data) {
  settings = { ...settings, ...data };
  await setDoc(doc(db, 'settings', 'main'), settings);
}

// ══════════════════════════════════════════
//  점수 집계 & 오늘 중복 체크
// ══════════════════════════════════════════
async function rebuildScores() {
  for (const k in scores) scores[k].cnt = 0;
  const snap = await getDocs(query(collection(db, 'posts'), where('status', '==', 'approved')));
  snap.forEach(d => {
    const p = d.data(), k = `${p.grade}-${p.class}`;
    if (scores[k]) scores[k].cnt += 1;
  });
}

async function checkTodayApproved() {
  todayMap = {};
  const todayStr = toDateStr(new Date());
  const snap = await getDocs(query(
    collection(db, 'posts'),
    where('status', '==', 'approved'),
    where('dateStr', '==', todayStr)
  ));
  snap.forEach(d => {
    const p = d.data();
    todayMap[`${p.grade}-${p.class}`] = true;
  });
}

function toDateStr(date) {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
}

// ══════════════════════════════════════════
//  예시 사진
// ══════════════════════════════════════════
function renderExampleImg() {
  const link = settings.exampleLink;
  const okLink = document.getElementById('example-ok-link');
  const okUrl  = document.getElementById('example-ok-url');
  if (link) {
    okLink.style.display = 'block';
    okUrl.href = link;
  } else {
    okLink.style.display = 'none';
  }
}

// ══════════════════════════════════════════
//  헤로
// ══════════════════════════════════════════
function renderHero() {
  const total     = Object.values(scores).reduce((a, s) => a + s.cnt, 0);
  const activeCls = Object.values(scores).filter(s => s.cnt > 0).length;
  const top       = Object.values(scores).filter(s => s.cnt > 0).sort((a, b) => b.cnt - a.cnt)[0];

  document.getElementById('st-total').textContent = total;
  document.getElementById('st-pts').textContent   = activeCls;
  document.getElementById('st-top').textContent   = top ? `${top.g}학년\n${top.c}반` : '-';

  const pb = document.getElementById('pbadge');
  const now = new Date(), s = new Date(CAMPAIGN_START), e = new Date(CAMPAIGN_END);
  e.setHours(23, 59, 59);
  if (now > e)         { pb.textContent = '종료';  pb.className = 'pbadge ended';  }
  else if (now >= s)   { pb.textContent = '진행중'; pb.className = 'pbadge active'; }
  else                 { pb.textContent = '예정';  pb.className = 'pbadge ready';  }

  document.getElementById('ended-bar').style.display   = isEnded() ? 'flex' : 'none';
  document.getElementById('upload-card').style.opacity = isEnded() ? '0.55' : '1';
}

// ══════════════════════════════════════════
//  점수판 — 학년별 분리, 1위 강조
// ══════════════════════════════════════════
function renderLB() {
  for (const g of GRADES) {
    const list = Object.values(scores)
      .filter(s => s.g === g)
      .sort((a, b) => b.cnt - a.cnt);
    const max    = list.length && list[0].cnt > 0 ? list[0].cnt : 1;
    const topCnt = list[0]?.cnt || 0;
    const el     = document.getElementById(`lb-${g}`);

    if (!list.some(s => s.cnt > 0)) {
      el.innerHTML = '<div class="empty" style="padding:20px">아직 참여한 학급이 없습니다</div>';
      continue;
    }

    el.innerHTML = list.map((s, i) => {
      const rc = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
      const rl = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      const bp = Math.round(s.cnt / max * 100);
      const isQualified = s.cnt >= 3;
      const isTopGrade  = s.cnt === topCnt && topCnt > 0;
      const rewardBadge = isTopGrade ? `<span class="lb-reward">추가 상품</span>` : '';
      const qualBadge   = isQualified ? `<span style="font-size:10px;background:#E1F5EE;color:#085041;padding:1px 6px;border-radius:20px;font-weight:700;margin-left:4px">🎁 상품 대상</span>` : '';
      return `<div class="lb-row">
        <div class="lb-rank ${rc}">${rl}</div>
        <div class="lb-info">
          <div class="lb-name">
            <span>${s.g}학년 ${s.c}반 ${rewardBadge}</span>
            <span class="lb-pt">${s.cnt}회</span>
          </div>
          <div class="lb-bar-wrap"><div class="lb-bar" style="width:${bp}%"></div></div>
          <div class="lb-cnt">${s.cnt}회 참여 ${qualBadge}</div>
        </div>
      </div>`;
    }).join('');
  }
}

// ══════════════════════════════════════════
//  실시간 피드
// ══════════════════════════════════════════
function startRealtimeFeed() {
  if (unsub) unsub();
  const q = query(collection(db, 'posts'), where('status', '==', 'approved'), orderBy('createdAt', 'desc'));
  unsub = onSnapshot(q, async snap => {
    await rebuildScores();
    await checkTodayApproved();
    renderHero();
    renderLB();
    renderFeedFromSnap(snap);
    checkDupWarn();
  });
}

function renderFeedFromSnap(snap) {
  const el = document.getElementById('feed-body');
  if (snap.empty) {
    el.innerHTML = '<div class="empty">승인된 인증 게시물이 없습니다<br><span style="font-size:11px">관리자 승인 후 표시됩니다</span></div>';
    return;
  }
  const items = [];
  snap.forEach(d => items.push({ id: d.id, ...d.data() }));
  el.innerHTML = items.map(p => {
    const dt = p.createdAt?.toDate
      ? p.createdAt.toDate().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '';
    return `<div class="feed-link-card" onclick="window.open('${p.mediaLink}','_blank')">
      <div class="flc-icon" style="background:#E1F5EE">💡</div>
      <div class="flc-info">
        <div class="flc-class">${p.grade}학년 ${p.class}반</div>
        <div class="flc-meta">
          <span class="fi-badge bp">실천 인증</span>
          <span>${p.dateStr || ''}</span>
          <span style="color:#888">${dt}</span>
        </div>
      </div>
      <div class="flc-arrow">→</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
//  페이지 이동
// ══════════════════════════════════════════
window.goPage = (p, btn) => {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (p === 'board') renderLB();
  if (p === 'admin' && loggedIn) renderAdm();
};

// ══════════════════════════════════════════
//  폼 조작
// ══════════════════════════════════════════
window.updateCls = () => {
  selG = document.getElementById('sel-g').value;
  const cs = document.getElementById('sel-c');
  cs.innerHTML = '<option value="">반 선택</option>';
  if (!selG) return;
  for (let c = 1; c <= CLASSES; c++) {
    const o = document.createElement('option');
    o.value = c; o.textContent = `${c}반`; cs.appendChild(o);
  }
  selC = ''; chkReady();
};

document.getElementById('sel-c').addEventListener('change', function () {
  selC = this.value; chkReady(); checkDupWarn();
});

function getLink() { return document.getElementById('media-link').value.trim(); }

function checkDupWarn() {
  const warn = document.getElementById('dup-warn');
  const key  = `${selG}-${selC}`;
  if (selG && selC && todayMap[key]) {
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

function chkReady() {
  const link = getLink();
  document.getElementById('link-preview').style.display = link ? 'flex' : 'none';
  const key  = `${selG}-${selC}`;
  const isDup = todayMap[key];
  document.getElementById('sub-btn').disabled = !(selG && selC && link && !isEnded() && !isDup);
}

window.clearLink = () => {
  document.getElementById('media-link').value = '';
  chkReady();
};

// ══════════════════════════════════════════
//  동의 팝업 → 등록
// ══════════════════════════════════════════
window.doSubmit = () => {
  if (!getLink() || isEnded()) return;
  document.getElementById('chk-consent').checked = false;
  document.getElementById('btn-consent-ok').disabled = true;
  document.getElementById('consent-overlay').style.display = 'flex';
};

window.closeConsent = () => { document.getElementById('consent-overlay').style.display = 'none'; };

window.confirmConsent = async () => {
  closeConsent();
  showLoading(true);
  try {
    const todayStr = toDateStr(new Date());
    // 중복 재확인 (동시 등록 방지)
    const dupCheck = await getDocs(query(
      collection(db, 'posts'),
      where('grade', '==', parseInt(selG)),
      where('class', '==', parseInt(selC)),
      where('dateStr', '==', todayStr),
      where('status', '==', 'approved')
    ));
    if (!dupCheck.empty) {
      showToast('오늘 이미 승인된 인증이 있습니다 (하루 1회 인정)', 'err');
      showLoading(false);
      return;
    }

    await addDoc(collection(db, 'posts'), {
      grade:     parseInt(selG),
      class:     parseInt(selC),
      type:      'practice',
      mediaLink: getLink(),
      dateStr:   todayStr,
      status:    'pending',
      createdAt: new Date()
    });

    selG = ''; selC = '';
    document.getElementById('sel-g').value = '';
    document.getElementById('sel-c').innerHTML = '<option value="">반 선택</option>';
    document.getElementById('media-link').value = '';
    document.getElementById('dup-warn').style.display = 'none';
    chkReady();
    showToast('✅ 등록 완료! 관리자 확인 후 점수에 반영됩니다.', 'ok');
  } catch (e) {
    console.error(e);
    showToast('등록 실패. 다시 시도해 주세요.', 'err');
  }
  showLoading(false);
};

// ══════════════════════════════════════════
//  관리자
// ══════════════════════════════════════════
window.doLogin = () => {
  if (document.getElementById('adm-pw').value === ADMIN_PASSWORD) {
    loggedIn = true;
    document.getElementById('adm-login').style.display = 'none';
    document.getElementById('adm-panel').style.display = 'block';
    renderAdm();
  } else {
    showToast('비밀번호가 올바르지 않습니다', 'err');
  }
};

window.admTab = (t, el) => {
  admCurTab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderAdm();
};

async function renderAdm() {
  const allSnap = await getDocs(collection(db, 'posts'));
  let pend = 0, appr = 0, rej = 0;
  allSnap.forEach(d => {
    const s = d.data().status;
    if (s === 'pending') pend++;
    else if (s === 'approved') appr++;
    else rej++;
  });
  document.getElementById('adm-stats').innerHTML =
    `<div class="adm-sbox"><div class="adm-sn" style="color:#BA7517">${pend}</div><div class="adm-sl">대기중</div></div>` +
    `<div class="adm-sbox"><div class="adm-sn" style="color:#0F6E56">${appr}</div><div class="adm-sl">승인됨</div></div>` +
    `<div class="adm-sbox"><div class="adm-sn" style="color:#A32D2D">${rej}</div><div class="adm-sl">반려됨</div></div>` +
    `<div class="adm-sbox"><div class="adm-sn">${allSnap.size}</div><div class="adm-sl">전체</div></div>`;

  const el = document.getElementById('adm-content');
  if (admCurTab === 'settings') { renderSettings(el); return; }

  const q    = query(collection(db, 'posts'), where('status', '==', admCurTab), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  if (snap.empty) { el.innerHTML = '<div class="empty">해당 상태의 게시물이 없습니다</div>'; return; }

  const items = [];
  snap.forEach(d => items.push({ id: d.id, ...d.data() }));

  el.innerHTML = '<div style="background:#fff">' + items.map(p => {
    const bc = p.status === 'pending' ? 'bpend' : p.status === 'approved' ? 'bok' : 'brej';
    const bl = p.status === 'pending' ? '대기중' : p.status === 'approved' ? '승인' : '반려';
    const dt = p.createdAt?.toDate
      ? p.createdAt.toDate().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '';
    let acts = '';
    if (p.status === 'pending')
      acts = `<button class="abtn ok" onclick="admAct('${p.id}','approved')">✓ 승인</button><button class="abtn rej" onclick="admAct('${p.id}','rejected')">✕ 반려</button>`;
    else
      acts = `<button class="abtn del" onclick="admAct('${p.id}','delete')">🗑 삭제</button>`;
    return `<div class="post-card">
      <div class="post-thumb" style="background:#E1F5EE">💡</div>
      <div class="post-info">
        <div class="post-meta">${p.grade}학년 ${p.class}반 <span class="badge ${bc}">${bl}</span></div>
        <div class="post-time">${p.dateStr || ''} 등록 · ${dt}</div>
        <a href="${p.mediaLink}" target="_blank" style="font-size:12px;color:#0F6E56;display:block;margin-bottom:8px">📎 사진 보기 →</a>
        <div class="post-acts">${acts}</div>
      </div>
    </div>`;
  }).join('') + '</div>';
}

window.admAct = async (id, action) => {
  showLoading(true);
  try {
    if (action === 'delete') {
      if (!confirm('정말 삭제할까요?')) { showLoading(false); return; }
      await deleteDoc(doc(db, 'posts', id));
    } else {
      await updateDoc(doc(db, 'posts', id), { status: action });
    }
    await rebuildScores();
    await checkTodayApproved();
    renderHero(); renderLB(); renderAdm();
    showToast(
      action === 'approved' ? '✅ 승인 완료. 점수에 반영됩니다.' :
      action === 'rejected' ? '반려 처리되었습니다.' : '삭제되었습니다.',
      action === 'approved' ? 'ok' : ''
    );
  } catch (e) {
    showToast('처리 중 오류가 발생했습니다.', 'err');
  }
  showLoading(false);
};

// ══════════════════════════════════════════
//  설정 탭
// ══════════════════════════════════════════
function renderSettings(el) {
  el.innerHTML = `<div class="settings-wrap">
    <div class="sec-lbl" style="margin-bottom:8px">인증 예시 사진 링크</div>
    <p style="font-size:12px;color:#888;margin-bottom:10px;line-height:1.6">
      구글 포토에서 예시 사진을 공유 링크로 만든 후 아래에 입력하면<br>학생 화면의 "올바른 인증 예시"에 링크가 표시됩니다.
    </p>
    <input type="url" id="example-link-input" placeholder="https://photos.app.goo.gl/..."
      value="${settings.exampleLink || ''}"
      style="width:100%;padding:12px;border:1px solid rgba(0,0,0,0.12);border-radius:10px;font-size:14px;font-family:inherit;margin-bottom:10px">
    <button class="big-btn" onclick="saveExampleLink()" style="margin-bottom:24px">✓ 예시 사진 저장</button>

    <div style="border-top:0.5px solid rgba(0,0,0,0.08);padding-top:20px">
      <div class="sec-lbl" style="margin-bottom:14px">데이터 관리</div>
      <button class="abtn" style="width:100%;padding:14px;margin-bottom:8px;text-align:left" onclick="exportCSV()">📥 게시물 내보내기 (CSV)</button>
      <button class="danger-btn" onclick="if(confirm('정말 모든 게시물을 삭제할까요?'))resetAll()">🗑 전체 초기화</button>
    </div>
  </div>`;
}

window.saveExampleLink = async () => {
  const link = document.getElementById('example-link-input').value.trim();
  showLoading(true);
  await saveSettings({ exampleLink: link });
  renderExampleImg();
  showLoading(false);
  showToast('✅ 예시 사진 링크가 저장되었습니다.', 'ok');
};

window.exportCSV = async () => {
  const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc')));
  const rows = [['학년', '반', '날짜', '상태', '링크', '등록시간']];
  snap.forEach(d => {
    const p  = d.data();
    const dt = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString('ko-KR') : '';
    rows.push([p.grade, p.class, p.dateStr || '', p.status, p.mediaLink, dt]);
  });
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = 'campaign_posts.csv'; a.click();
};

window.resetAll = async () => {
  showLoading(true);
  const snap = await getDocs(collection(db, 'posts'));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'posts', d.id))));
  await rebuildScores(); await checkTodayApproved();
  renderHero(); renderLB();
  showLoading(false);
  showToast('초기화 완료');
};

// ══════════════════════════════════════════
//  유틸
// ══════════════════════════════════════════
function isEnded() {
  const e = new Date(CAMPAIGN_END); e.setHours(23, 59, 59); return new Date() > e;
}
function showLoading(v) {
  document.getElementById('loading').style.display = v ? 'flex' : 'none';
}
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (type ? ' ' + type : '');
  t.style.display = 'block';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.display = 'none'; }, 3200);
}

boot();
