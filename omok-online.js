
/* 우리 반 성장 여행 - 2인 실시간 오목 */

import {getApps} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';

import {
  getAuth,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const app = getApps()[0];

if (!app) {
  console.error('미니게임: Firebase 초기화가 필요합니다.');
} else {

const auth = getAuth(app);
const db = getFirestore(app);

const rooms = collection(
  db, 'classrooms', 'main', 'omokRooms'
);

const $ = id => document.getElementById(id);

let me = null;
let uid = null;
let openRooms = [];
let myGames = [];
let room = null;
let roomId = null;

let stopOpen = null;
let stopMine = null;
let stopRoom = null;

const valid = n =>
  Number.isInteger(n) && n >= 1 && n <= 29 && n !== 17;

const isStudent = () =>
  me?.role === 'student' && Number.isInteger(me.no);

const nickname = n =>
  window.ClassStudentNames?.get(n) || `${n}번`;

// ===== 디자인 =====

const style = document.createElement('style');

style.textContent = `
  #omokOverlay {
    position: fixed;
    inset: 0;
    z-index: 100200;
    background: #0f172ad9;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 10px;
  }

  #omokWindow {
    width: min(800px,98vw);
    max-height: 94dvh;
    overflow: auto;
    padding: 20px;
    background: #f8fafc;
    border-radius: 20px;
    box-shadow: 0 24px 70px #0007;
    font: 14px/1.5 Pretendard,system-ui,sans-serif;
    color: #0f172a;
  }

  #omokWindow * {
    box-sizing: border-box;
  }

  #omokWindow .og-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  #omokWindow h2 {
    margin: 0;
    color: #0f172a;
    font-size: 22px;
  }

  #omokWindow .og-muted {
    color: #64748b;
    font-size: 12px;
  }

  #omokWindow .og-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 13px;
    padding: 14px;
    margin-top: 12px;
  }

  #omokWindow button {
    border: 0;
    border-radius: 9px;
    background: #2563eb;
    color: white;
    padding: 9px 12px;
    cursor: pointer;
    font: 700 13px Pretendard,system-ui,sans-serif;
  }

  #omokWindow button[disabled] {
    opacity: .5;
    cursor: not-allowed;
  }

  #omokWindow button.og-secondary {
    background: #e2e8f0;
    color: #334155;
  }

  #omokWindow .og-row {
    display: flex;
    gap: 9px;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    margin: 7px 0;
  }

  #omokWindow .og-board {
    width: min(540px,92vw);
    display: grid;
    grid-template-columns: repeat(15,minmax(0,1fr));
    border: 2px solid #a97a4e;
    background: #eac995;
    aspect-ratio: 1;
    margin: 15px auto;
    touch-action: manipulation;
  }

  #omokWindow .og-cell {
    padding: 0 !important;
    width: 100%;
    height: 100%;
    border: 1px solid #ab885e !important;
    border-radius: 0 !important;
    background: transparent !important;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 0 !important;
    box-shadow: none !important;
  }

  #omokWindow .og-cell span {
    display: block;
    border-radius: 50%;
    width: 78%;
    aspect-ratio: 1;
  }

  #omokWindow .og-black {
    background: radial-gradient(
      circle at 35% 30%,#555,#0f172a 70%
    );
    box-shadow: 1px 2px 3px #0007;
  }

  #omokWindow .og-white {
    background: radial-gradient(
      circle at 35% 30%,#fff,#cbd5e1 75%
    );
    box-shadow: 1px 2px 3px #0005;
    border: 1px solid #94a3b8;
  }

  #omokWindow .og-last {
    outline: 2px solid #dc2626;
    outline-offset: -2px;
  }

  #omokWindow .og-list button {
    margin: 4px;
  }

  #omokWindow .og-status {
    font-weight: 850;
    color: #1d4ed8;
    font-size: 16px;
  }

  #omokWindow .og-error {
    color: #b91c1c;
    white-space: pre-wrap;
  }

  @media(max-width:520px) {
    #omokWindow {
      padding: 12px;
      border-radius: 14px;
    }

    #omokWindow h2 {
      font-size: 18px;
    }

    #omokWindow .og-board {
      width: min(95vw,490px);
    }
  }
`;

document.head.append(style);

// ===== 게임 팝업 =====

const overlay = document.createElement('div');
overlay.id = 'omokOverlay';

overlay.innerHTML = `
  <section id="omokWindow"
           role="dialog"
           aria-modal="true"
           aria-label="온라인 오목">

    <div class="og-top">
      <h2>⚫⚪ 우리 반 오목 대결</h2>
      <button class="og-secondary" id="omokClose">
        닫기 ×
      </button>
    </div>

    <p class="og-muted">
      학생 2명 입장 → 모두 준비 → 3초 뒤 시작
    </p>

    <div id="omokError" class="og-error"></div>

    <div class="og-card" id="omokStats">
      전적 불러오는 중...
    </div>

    <div class="og-card">
      <div class="og-row">
        <b>대기 중인 방</b>
        <button id="omokCreate">
          + 새 방 만들기
        </button>
      </div>
      <div class="og-list" id="omokLobby"></div>
    </div>

    <div class="og-card">
      <b>내 대국 목록</b>
      <div class="og-list" id="omokMine"></div>
    </div>

    <div class="og-card" id="omokRoom" style="display:none">

      <div id="omokRoomInfo"></div>

      <div class="og-row">
        <button id="omokReady">준비하기</button>

        <button id="omokExit" class="og-secondary">
          방 나가기 / 기권
        </button>
      </div>

      <div class="og-status" id="omokStatus"></div>

      <div class="og-board" id="omokBoard"></div>
    </div>

    <p class="og-muted">
      대국 기록은 Firebase에 저장됩니다.
      새로고침 후에도 완료된 대국을 확인할 수 있습니다.
    </p>

  </section>
`;

document.body.append(overlay);

const err = s => {
  $('omokError').textContent = s;
};

const viewOpen = () =>
  overlay.style.display === 'flex';

function close() {
  overlay.style.display = 'none';
}

$('omokClose').onclick = close;

overlay.addEventListener('click', e => {
  if (e.target === overlay) close();
});

// ===== 왼쪽 미니게임 버튼 =====

function show() {
  if (!isStudent()) {
    alert('미니게임은 학생 계정으로 로그인해야 합니다.');
    return;
  }

  overlay.style.display = 'flex';
  renderLists();
  renderRoom();
}

const button = document.createElement('button');

button.className = 'navBtn';
button.type = 'button';
button.dataset.open = 'minigame';

button.innerHTML = '<i>🎮</i> 미니게임 · 오목';
button.onclick = show;

document.getElementById('leftNav')?.append(button);

function showButton() {
  button.style.display = isStudent() ? '' : 'none';
}

showButton();

// ===== 전적 / 대기방 표시 =====

function renderLists() {
  if (!viewOpen()) return;

  const finished = myGames.filter(
    r => r.status === 'finished'
  );

  const wins = finished.filter(
    r => r.winner === me.no
  ).length;

  const draws = finished.filter(
    r => r.winner === 0
  ).length;

  $('omokStats').textContent =
    `🏅 누적 전적: ${finished.length}전 ` +
    `${wins}승 ${finished.length-wins-draws}패 ${draws}무`;

  const list = $('omokLobby');
  list.replaceChildren();

  const free = openRooms.filter(
    r => r.status === 'waiting'
  );

  if (!free.length) {
    list.textContent = '열린 대기방이 없어요.';
  }

  for (const r of free) {
    const b = document.createElement('button');
    b.className = 'og-secondary';

    b.textContent =
      `방 ${r.id.slice(0,6)} · ` +
      `${nickname(r.nos[0])} · ` +
      `${r.players.length}/2명` +
      (r.players.includes(uid) ? ' (내 방)' : '');

    b.onclick = () => r.players.includes(uid)
      ? selectRoom(r.id)
      : join(r.id);

    b.disabled =
      r.players.length >= 2 && !r.players.includes(uid);

    list.append(b);
  }

  const mine = $('omokMine');
  mine.replaceChildren();

  for (const r of myGames.slice(0, 30)) {
    const b = document.createElement('button');
    b.className = 'og-secondary';

    b.textContent =
      `${r.id.slice(0,6)} · ` +
      `${r.status === 'finished'
        ? '종료'
        : r.status === 'cancelled'
          ? '취소'
          : '진행 중'} · ` +
      `${r.nos.map(nickname).join(' vs ')}`;

    b.onclick = () => selectRoom(r.id);
    mine.append(b);
  }

  if (!myGames.length) {
    mine.textContent = '아직 참여한 대국이 없어요.';
  }
}

// ===== 새 방 만들기 =====

$('omokCreate').onclick = async () => {
  if (!isStudent()) return;

  const active = myGames.find(
    r => !['finished','cancelled'].includes(r.status)
  );

  if (active) {
    selectRoom(active.id);
    err('먼저 진행 중인 방을 완료하거나 나가세요.');
    return;
  }

  const ref = doc(rooms);

  try {
    await setDoc(ref, {
      players: [uid],
      nos: [me.no],
      ready: [false,false],
      moves: [],
      status: 'waiting',
      winner: null,
      startAt: null,
      endedAt: null,
      createdAt: serverTimestamp()
    });

    err('');
    selectRoom(ref.id);

  } catch (e) {
    err('방 생성 실패: ' + e.message);
  }
};

// ===== 다른 학생 방 입장 =====

async function join(id) {
  if (!isStudent()) return;

  try {
    await runTransaction(db, async tx => {
      const ref = doc(rooms, id);
      const s = await tx.get(ref);

      if (!s.exists()) {
        throw Error('이미 사라진 방입니다.');
      }

      const r = s.data();

      if (r.players.includes(uid)) return;

      if (
        r.status !== 'waiting' ||
        r.players.length !== 1
      ) {
        throw Error('방이 가득 찼습니다.');
      }

      tx.update(ref, {
        players: [r.players[0], uid],
        nos: [r.nos[0], me.no],
        ready: [false,false]
      });
    });

    err('');
    selectRoom(id);

  } catch (e) {
    err('입장 실패: ' + e.message);
  }
}

// ===== 방 실시간 구독 =====

function selectRoom(id) {
  stopRoom?.();
  stopRoom = null;

  roomId = id;
  room = null;

  stopRoom = onSnapshot(
    doc(rooms,id),
    snapshot => {
      room = snapshot.exists()
        ? {id:snapshot.id,...snapshot.data()}
        : null;

      renderRoom();
    },
    e => err('대국 연결 실패: ' + e.message)
  );

  if (isStudent()) {
    overlay.style.display = 'flex';
  }
}

// ===== 오목 판과 승리 판정 =====

function boardFrom(moves) {
  const cells = Array(225).fill(0);

  for (const m of moves) {
    if (
      m.x >= 0 && m.x < 15 &&
      m.y >= 0 && m.y < 15
    ) {
      cells[m.y*15+m.x] = m.p;
    }
  }

  return cells;
}

function checkFive(cells,x,y,p) {
  const directions = [
    [1,0],[0,1],[1,1],[1,-1]
  ];

  for (const [dx,dy] of directions) {
    let count = 1;

    for (const dir of [-1,1]) {
      for (let step=1;step<6;step++) {
        const xx = x+dx*step*dir;
        const yy = y+dy*step*dir;

        if (
          xx<0 || xx>=15 ||
          yy<0 || yy>=15 ||
          cells[yy*15+xx]!==p
        ) break;

        count++;
      }
    }

    if (count >= 5) return true;
  }

  return false;
}

function getRoundState(r) {
  if (r.status !== 'countdown') return r.status;

  const start = r.startAt?.toMillis?.();

  if (!start) return 'countdown';

  return Date.now() >= start+3000
    ? 'playing'
    : 'countdown';
}

// ===== 게임 화면 갱신 =====

function renderRoom() {
  const panel = $('omokRoom');

  if (
    !viewOpen() ||
    !room ||
    !room.players.includes(uid)
  ) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const idx = room.players.indexOf(uid);
  const status = getRoundState(room);

  const players = room.nos.map((n,i) =>
    `${i===0?'⚫':'⚪'} ${nickname(n)} ` +
    `${room.ready[i]?'✅':''}`
  ).join('　vs　');

  $('omokRoomInfo').textContent =
    `방 ${room.id.slice(0,6)} · ${players}`;

  const readyBtn = $('omokReady');

  readyBtn.style.display =
    room.status==='waiting' ? '' : 'none';

  readyBtn.disabled = room.players.length !== 2;

  readyBtn.textContent = room.ready[idx]
    ? '준비 취소'
    : '준비하기';

  $('omokExit').style.display =
    room.status==='finished' ||
    room.status==='cancelled'
      ? 'none'
      : '';

  let msg = '';

  if (room.status==='waiting') {
    msg = room.players.length===1
      ? '상대방 입장 대기 중'
      : '두 사람 모두 준비 버튼을 눌러주세요.';
  }

  if (status==='countdown') {
    const start = room.startAt?.toMillis?.() || Date.now();

    const remain = Math.max(
      1,
      Math.ceil((start+3000-Date.now())/1000)
    );

    msg = `🎯 ${remain}초 후 시작!`;
  }

  if (status==='playing') {
    msg = room.moves.length%2===idx
      ? '✅ 내 차례입니다'
      : '상대방 차례입니다.';
  }

  if (room.status==='finished') {
    msg = room.winner===0
      ? '🤝 무승부!'
      : room.winner===me.no
        ? '🏆 승리!'
        : '상대방 승리 · 다음에 다시 도전!';
  }

  if (room.status==='cancelled') {
    msg = '취소된 대국입니다.';
  }

  $('omokStatus').textContent = msg;

  const cells = boardFrom(room.moves);
  const board = $('omokBoard');

  const last = room.moves[room.moves.length-1];

  board.replaceChildren();

  for (let i=0;i<225;i++) {
    const b = document.createElement('button');

    b.type = 'button';

    b.className =
      'og-cell' +
      (last && i===last.y*15+last.x
        ? ' og-last'
        : '');

    b.setAttribute(
      'aria-label',
      `${Math.floor(i/15)+1}행 ${i%15+1}열`
    );

    if (cells[i]) {
      const stone = document.createElement('span');

      stone.className =
        cells[i]===1
          ? 'og-black'
          : 'og-white';

      b.append(stone);
    }

    b.disabled =
      cells[i]!==0 ||
      status!=='playing' ||
      room.moves.length%2!==idx;

    b.onclick = () =>
      placeStone(i%15,Math.floor(i/15));

    board.append(b);
  }
}

// ===== 준비 버튼 =====

$('omokReady').onclick = async () => {
  if (!room || !uid) return;

  try {
    await runTransaction(db,async tx => {
      const ref = doc(rooms,room.id);
      const snapshot = await tx.get(ref);
      const r = snapshot.data();

      if (
        !r ||
        r.status!=='waiting' ||
        r.players.length!==2
      ) {
        throw Error('준비할 수 없는 방입니다.');
      }

      const i = r.players.indexOf(uid);

      if (i<0) throw Error('참가자가 아닙니다.');

      const ready = [...r.ready];
      ready[i] = !ready[i];

      const both = ready.every(Boolean);

      tx.update(ref,{
        ready,
        status:both?'countdown':'waiting',
        startAt:both?serverTimestamp():null
      });
    });

    err('');

  } catch(e) {
    err(e.message);
  }
};

// ===== 오목 착수 =====

async function placeStone(x,y) {
  if (!room || !uid) return;

  try {
    await runTransaction(db,async tx => {
      const ref = doc(rooms,room.id);
      const s = await tx.get(ref);
      const r = s.data();

      if (
        !r ||
        !['countdown','playing'].includes(r.status)
      ) {
        throw Error('진행 중인 대국이 아닙니다.');
      }

      if (
        r.status==='countdown' &&
        (
          !r.startAt ||
          Date.now()<r.startAt.toMillis()+3000
        )
      ) {
        throw Error(
          '3초 카운트다운이 끝나지 않았습니다.'
        );
      }

      const i = r.players.indexOf(uid);

      if (
        i<0 ||
        r.moves.length%2!==i
      ) {
        throw Error('현재 내 차례가 아닙니다.');
      }

      if (
        r.moves.some(m=>m.x===x&&m.y===y)
      ) {
        throw Error('이미 돌이 놓인 곳입니다.');
      }

      const next = [
        ...r.moves,
        {x,y,p:i+1}
      ];

      const cells = boardFrom(next);
      const won = checkFive(cells,x,y,i+1);
      const draw = !won && next.length>=225;

      tx.update(ref,{
        moves:next,
        status:won||draw?'finished':'playing',
        winner:won?r.nos[i]:(draw?0:null),
        endedAt:won||draw?serverTimestamp():null
      });
    });

    err('');

  } catch(e) {
    err('착수 실패: '+e.message);
  }
}

// ===== 방 나가기 / 기권 =====

$('omokExit').onclick = async () => {
  if (!room || !uid) return;

  const message = room.status==='playing'
    ? '기권하면 상대방 승리로 기록됩니다. 계속할까요?'
    : '방에서 나갈까요?';

  if (!confirm(message)) return;

  try {
    await runTransaction(db,async tx => {
      const ref = doc(rooms,room.id);
      const s = await tx.get(ref);
      const r = s.data();

      if (!r || !r.players.includes(uid)) {
        throw Error('방이 없습니다.');
      }

      const i = r.players.indexOf(uid);

      if (r.status==='waiting') {
        if (r.players.length===1) {
          tx.update(ref,{status:'cancelled'});

        } else {
          const remain = 1-i;

          tx.update(ref,{
            players:[r.players[remain]],
            nos:[r.nos[remain]],
            ready:[false,false]
          });
        }

      } else if (
        ['countdown','playing'].includes(r.status)
      ) {
        const opponent = 1-i;

        tx.update(ref,{
          status:'finished',
          winner:r.moves.length===0
            ? 0
            : r.nos[opponent],
          endedAt:serverTimestamp()
        });
      }
    });

    stopRoom?.();
    stopRoom = null;

    room = null;
    roomId = null;

    renderRoom();
    err('');

  } catch(e) {
    err('퇴장 실패: '+e.message);
  }
};

// ===== 3초 카운트다운 갱신 =====

setInterval(() => {
  if (
    viewOpen() &&
    room?.status==='countdown'
  ) {
    renderRoom();
  }
},500);

// ===== Firebase 실시간 대기방 / 전적 =====

onAuthStateChanged(auth,async user => {
  stopOpen?.();
  stopMine?.();
  stopRoom?.();

  stopOpen = null;
  stopMine = null;
  stopRoom = null;

  room = null;
  roomId = null;

  uid = null;
  me = null;

  openRooms = [];
  myGames = [];

  showButton();

  if (!user) return;

  try {
    const s = await getDoc(
      doc(db,'accounts',user.uid)
    );

    if (
      auth.currentUser?.uid!==user.uid ||
      !s.exists()
    ) return;

    const a = s.data();
    const n = Number(a.studentId);

    if (
      a.role!=='student' ||
      !valid(n)
    ) return;

    me = {role:'student',no:n};
    uid = user.uid;

    showButton();

    // 대기방 실시간 조회
    stopOpen = onSnapshot(
      query(
        rooms,
        where(
          'status',
          'in',
          ['waiting','countdown','playing']
        )
      ),
      snapshot => {
        openRooms = snapshot.docs.map(d=>({
          id:d.id,
          ...d.data()
        }));

        renderLists();
      },
      e => err(
        '대기방 조회 실패: '+e.message
      )
    );

    // 내가 참가한 모든 대국 조회
    // 완료된 대국을 삭제하지 않으므로 누적 전적 계산 가능
    stopMine = onSnapshot(
      query(
        rooms,
        where('players','array-contains',uid)
      ),
      snapshot => {
        myGames = snapshot.docs.map(d=>({
          id:d.id,
          ...d.data()
        })).sort((a,b)=>
          (b.createdAt?.toMillis?.()||0) -
          (a.createdAt?.toMillis?.()||0)
        );

        renderLists();
      },
      e => err(
        '전적 조회 실패: '+e.message
      )
    );

  } catch(e) {
    console.error(
      '게임 로그인 확인 실패:',e
    );
  }
});

}
