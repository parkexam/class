
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  getDocs,
  writeBatch,
  addDoc,
  updateDoc,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// ==========================================
// 기본 설정
// ==========================================

const config = window.CLASS_VILLAGE_FIREBASE_CONFIG || {};

const configured = !!(
  config.apiKey &&
  config.authDomain &&
  config.projectId &&
  config.appId
);

const gate = document.getElementById('cloudGate');
const intro = document.getElementById('cloudIntro');
const err = document.getElementById('cloudErr');
const loginButton = document.getElementById('cloudLoginBtn');
const demoButton = document.getElementById('cloudDemoBtn');
const status = document.getElementById('cloudStatus');
const statusText = document.getElementById('cloudStatusText');
const logoutButton = document.getElementById('cloudLogoutBtn');
const inputId = document.getElementById('cloudLoginId');
const inputPass = document.getElementById('cloudLoginPassword');

let app = null;
let auth = null;
let db = null;
let unsubs = [];
let activeUser = null;
let activeAccount = null;

const root = 'classrooms/main';

const cloud = {
  active: false,
  role: null,
  studentId: null
};

window.ClassCloud = cloud;

// ==========================================
// 알림
// ==========================================

function notify(message) {
  if (typeof window.toast === 'function') {
    window.toast(message);
  } else {
    const el = document.getElementById('toast');

    if (el) {
      el.textContent = message;
      el.classList.add('show');

      setTimeout(() => {
        el.classList.remove('show');
      }, 2500);
    }
  }
}

function fail(e) {
  console.error('Firebase:', e);

  const code = e?.code || '';

  if (code === 'permission-denied') {
    notify('Firestore 접근 권한이 없습니다. 보안 규칙을 확인해 주세요.');
  } else if (code === 'unavailable') {
    notify('네트워크 연결을 확인해 주세요.');
  } else {
    notify('오류: ' + (e?.message || '알 수 없는 오류'));
  }
}

// ==========================================
// 로그인 상태 초기화
// ==========================================

function stop() {
  for (const unsubscribe of unsubs) {
    try {
      unsubscribe();
    } catch (e) {
      console.error(e);
    }
  }

  unsubs = [];

  cloud.active = false;
  cloud.role = null;
  cloud.studentId = null;

  activeAccount = null;

  document.body.classList.remove(
    'cloudStudent',
    'cloudTeacher'
  );

  status.style.display = 'none';

  window.__v7Apply?.('disconnected');
}

function startDemo() {
  stop();

  gate.classList.add('hidden');

  notify('🎮 체험 모드로 시작합니다. 데이터는 실시간 공유되지 않습니다.');
}

function showGate(message = '로그인해 주세요') {
  intro.textContent = message;
  gate.classList.remove('hidden');
}

demoButton.addEventListener('click', startDemo);

// ==========================================
// Firebase 초기화
// ==========================================

if (!configured) {
  intro.textContent =
    'Firebase 설정값이 없습니다. 체험 모드로 실행할 수 있습니다.';

  document.getElementById('cloudLoginFields').style.display = 'none';
} else {
  intro.textContent =
    '학생은 자신의 번호를, 선생님은 teacher를 입력하세요.';

  try {
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, async (user) => {
      stop();

      activeUser = user;

      if (!user) {
        showGate('학생 번호 또는 teacher 계정으로 로그인하세요.');
        return;
      }

      try {
        const accountRef = doc(db, 'accounts', user.uid);
        const snapshot = await getDoc(accountRef);

        if (!snapshot.exists()) {
          throw new Error(
            'Firestore accounts에 계정 권한이 등록되지 않았습니다.'
          );
        }

        const account = snapshot.data();

        if (!['teacher', 'student'].includes(account.role)) {
          throw new Error('계정 역할이 올바르지 않습니다.');
        }

        if (
          account.role === 'student' &&
          (
            !Number.isInteger(account.studentId) ||
            account.studentId < 1 ||
            account.studentId > 29 ||
            account.studentId === 17
          )
        ) {
          throw new Error('학생 번호 정보가 올바르지 않습니다.');
        }

        activeAccount = account;

        cloud.active = true;
        cloud.role = account.role;

        cloud.studentId =
          account.role === 'student'
            ? account.studentId
            : null;

        document.body.classList.toggle(
          'cloudStudent',
          account.role === 'student'
        );

        document.body.classList.toggle(
          'cloudTeacher',
          account.role === 'teacher'
        );

        window.__v7Apply?.('account', {
          studentId:
            account.role === 'student'
              ? account.studentId
              : 1
        });

        status.style.display = 'flex';

        statusText.textContent =
          account.role === 'teacher'
            ? '👩🏻‍🏫 교사 · 실시간 연결'
            : `${account.studentId}번 학생 · 실시간 연결`;

        gate.classList.add('hidden');
        err.textContent = '';

        subscribe();

      } catch (e) {
        console.error(e);

        showGate(e?.message || '계정 정보 읽기 실패');

        err.textContent =
          e?.message || '학급 접근 권한이 없습니다.';
      }
    });

  } catch (e) {
    console.error(e);

    err.textContent =
      'Firebase 초기화 실패: ' + e.message;
  }
}

// ==========================================
// 로그인
// 실제 계정 형식: teacher@class.com
// 학생 계정 형식: 1@class.com ~ 29@class.com
// ==========================================

loginButton.addEventListener('click', async () => {
  if (!auth) {
    err.textContent = 'Firebase 연결이 설정되지 않았습니다.';
    return;
  }

  const id = inputId.value.trim().toLowerCase();
  const password = inputPass.value;

  if (!id || !password) {
    err.textContent = '아이디와 비밀번호를 입력해 주세요.';
    return;
  }

  const isTeacher = id === 'teacher';
  const number = Number(id);

  if (
    !isTeacher &&
    (
      !Number.isInteger(number) ||
      number < 1 ||
      number > 29 ||
      number === 17
    )
  ) {
    err.textContent =
      '학생은 1~16번 또는 18~29번으로 로그인하세요.';
    return;
  }

  // ★ 실제 Firebase 등록 이메일 적용 ★
  const email = isTeacher
    ? 'teacher@class.com'
    : `${number}@class.com`;

  loginButton.disabled = true;
  err.textContent = '로그인 확인 중...';

  try {
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    inputPass.value = '';
    err.textContent = '';

  } catch (e) {
    console.error(e);

    err.textContent =
      '로그인 실패: ' +
      (e?.code || e?.message || '알 수 없는 오류');

  } finally {
    loginButton.disabled = false;
  }
});

// 엔터키로 로그인
inputPass.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    loginButton.click();
  }
});

// ==========================================
// 로그아웃
// ==========================================

logoutButton.addEventListener('click', async () => {
  if (!auth) {
    showGate();
    return;
  }

  try {
    await signOut(auth);
  } catch (e) {
    fail(e);
  }
});

// ==========================================
// Firestore 실시간 동기화
// ==========================================

function watch(ref, callback) {
  const unsubscribe = onSnapshot(
    ref,
    callback,
    (e) => {
      console.error('실시간 동기화 오류:', e);
      fail(e);
    }
  );

  unsubs.push(unsubscribe);
}

function subscribe() {
  // 마을 정보
  watch(
    doc(db, root, 'world', 'state'),
    (snapshot) => {
      window.__v7Apply?.(
        'world',
        snapshot.exists()
          ? snapshot.data()
          : { townXP: 0 }
      );
    }
  );

  // 학생 정보
  watch(
    collection(db, root, 'students'),
    (snapshot) => {
      window.__v7Apply?.(
        'students',
        snapshot.docs.map(d => d.data())
      );
    }
  );

  // 미션 정보
  watch(
    collection(db, root, 'missions'),
    (snapshot) => {
      const missions = snapshot.docs
        .map(d => ({
          id: d.id,
          ...d.data()
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      window.__v7Apply?.('missions', missions);
    }
  );

  const submissionsRef = collection(db, root, 'submissions');
  const studyRef = collection(db, root, 'studyLogs');

  // 미션 제출 기록
  watch(
    cloud.role === 'teacher'
      ? submissionsRef
      : query(
          submissionsRef,
          where('studentId', '==', cloud.studentId)
        ),
    (snapshot) => {
      const submissions = snapshot.docs
        .map(d => ({
          id: d.id,
          ...d.data()
        }))
        .sort((a, b) =>
          (a.date || '').localeCompare(b.date || '')
        );

      window.__v7Apply?.('submissions', submissions);
    }
  );

  // 공부 기록
  watch(
    cloud.role === 'teacher'
      ? studyRef
      : query(
          studyRef,
          where('studentId', '==', cloud.studentId)
        ),
    (snapshot) => {
      const records = snapshot.docs
        .map(d => ({
          id: d.id,
          ...d.data()
        }))
        .sort((a, b) =>
          (a.date || '').localeCompare(b.date || '')
        );

      window.__v7Apply?.('studyLogs', records);
    }
  );

  // 교사 전용 XP 지급 기록
  if (cloud.role === 'teacher') {
    watch(
      collection(db, root, 'events'),
      (snapshot) => {
        const events = snapshot.docs
          .map(d => ({
            id: d.id,
            ...d.data()
          }))
          .sort((a, b) =>
            (a.date || '').localeCompare(b.date || '')
          );

        window.__v7Apply?.('events', events);
      }
    );
  }
}

const timestamp = () =>
  new Date().toLocaleString('ko-KR');

// ==========================================
// 교사 권한 확인
// ==========================================

function teacher() {
  if (!cloud.active || cloud.role !== 'teacher') {
    notify('선생님 계정에서만 사용할 수 있습니다.');
    return false;
  }

  return true;
}

// ==========================================
// 학생 미션 제출
// ==========================================

async function submit(missionId, detail) {
  if (!cloud.active || cloud.role !== 'student') {
    notify('학생 계정으로 로그인해야 합니다.');
    return;
  }

  detail = String(detail || '').trim();

  if (detail.length < 3 || detail.length > 250) {
    notify('활동 내용은 3~250자로 입력해 주세요.');
    return;
  }

  try {
    const missionSnapshot = await getDoc(
      doc(db, root, 'missions', missionId)
    );

    if (
      !missionSnapshot.exists() ||
      !missionSnapshot.data().active
    ) {
      throw new Error('현재 운영 중인 미션이 아닙니다.');
    }

    const submissionRef = doc(
      db,
      root,
      'submissions',
      `${activeUser.uid}_${missionId}`
    );

    await runTransaction(db, async (tx) => {
      const existing = await tx.get(submissionRef);

      if (
        existing.exists() &&
        existing.data().status !== 'rejected'
      ) {
        throw new Error('이미 신청하거나 승인받은 미션입니다.');
      }

      const date = timestamp();

      if (existing.exists()) {
        tx.update(submissionRef, {
          detail,
          status: 'pending',
          date
        });
      } else {
        tx.set(submissionRef, {
          ownerUid: activeUser.uid,
          studentId: cloud.studentId,
          missionId,
          detail,
          status: 'pending',
          date
        });
      }
    });

    notify('📨 미션 제출 완료! 선생님 승인을 기다려 주세요.');

  } catch (e) {
    fail(e);
  }
}

// ==========================================
// 교사 미션 승인 및 반려
// ==========================================

async function approve(submissionId, decision) {
  if (!teacher()) return;

  if (!['approved', 'rejected'].includes(decision)) {
    return;
  }

  try {
    const submissionRef = doc(
      db,
      root,
      'submissions',
      submissionId
    );

    const worldRef = doc(
      db,
      root,
      'world',
      'state'
    );

    await runTransaction(db, async (tx) => {
      const submissionSnapshot = await tx.get(submissionRef);

      if (
        !submissionSnapshot.exists() ||
        submissionSnapshot.data().status !== 'pending'
      ) {
        throw new Error('이미 처리된 미션입니다.');
      }

      const submission = submissionSnapshot.data();

      const missionRef = doc(
        db,
        root,
        'missions',
        submission.missionId
      );

      const studentRef = doc(
        db,
        root,
        'students',
        String(submission.studentId)
      );

      const missionSnapshot = await tx.get(missionRef);

      if (!missionSnapshot.exists()) {
        throw new Error('미션 정보를 찾을 수 없습니다.');
      }

      const xp = Number(missionSnapshot.data().xp) || 0;

      let studentSnapshot;
      let worldSnapshot;

      if (decision === 'approved') {
        studentSnapshot = await tx.get(studentRef);
        worldSnapshot = await tx.get(worldRef);

        if (!studentSnapshot.exists()) {
          throw new Error('학생 프로필을 찾을 수 없습니다.');
        }
      }

      tx.update(submissionRef, {
        status: decision,
        reviewed: timestamp(),
        reviewedBy: activeUser.uid
      });

      if (decision === 'approved') {
        const profile = studentSnapshot.data();

        let level = Math.max(
          1,
          Number(profile.level) || 1
        );

        let remainingXP =
          (Number(profile.xp) || 0) + xp;

        while (
          level < 99 &&
          remainingXP >= 60 + 18 * level
        ) {
          remainingXP -= 60 + 18 * level;
          level++;
        }

        tx.update(studentRef, {
          level,
          xp: remainingXP
        });

        const oldTownXP = worldSnapshot.exists()
          ? Number(worldSnapshot.data().townXP) || 0
          : 0;

        tx.set(
          worldRef,
          {
            townXP: oldTownXP + xp
          },
          { merge: true }
        );

        const eventRef = doc(
          collection(db, root, 'events')
        );

        tx.set(eventRef, {
          studentId: submission.studentId,
          amount: xp,
          reason: '미션 승인: ' + missionSnapshot.data().name,
          date: timestamp(),
          teacherUid: activeUser.uid
        });
      }
    });

    notify(
      decision === 'approved'
        ? '✅ 미션 승인 및 경험치 지급 완료'
        : '↩️ 미션 반려 완료'
    );

  } catch (e) {
    fail(e);
  }
}

// ==========================================
// 학생 공부 기록
// ==========================================

async function saveStudy(id, subject, minutes, note) {
  if (
    !cloud.active ||
    cloud.role !== 'student' ||
    id !== cloud.studentId
  ) {
    notify('본인의 공부 기록만 작성할 수 있습니다.');
    return;
  }

  const subjects = [
    '과학',
    '국어',
    '수학',
    '영어',
    '사회',
    '기타'
  ];

  if (
    !subjects.includes(subject) ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 240 ||
    String(note).length > 100
  ) {
    notify('공부 기록 입력값을 확인해 주세요.');
    return;
  }

  try {
    await addDoc(
      collection(db, root, 'studyLogs'),
      {
        ownerUid: activeUser.uid,
        studentId: id,
        subject,
        minutes,
        note: String(note),
        date: timestamp()
      }
    );

    notify('📚 공부 기록 저장 완료');

  } catch (e) {
    fail(e);
  }
}

// ==========================================
// 교사 미션 생성
// ==========================================

async function createMission(name, desc, xp) {
  if (!teacher()) return;

  name = String(name).trim();
  desc = String(desc).trim();

  if (
    name.length < 2 ||
    name.length > 40 ||
    desc.length > 150 ||
    !Number.isInteger(xp) ||
    xp < 1 ||
    xp > 100
  ) {
    notify('미션 입력값을 확인해 주세요.');
    return;
  }

  try {
    await addDoc(
      collection(db, root, 'missions'),
      {
        name,
        desc,
        xp,
        active: true
      }
    );

    notify('✅ 새로운 미션이 등록됐습니다.');

  } catch (e) {
    fail(e);
  }
}

// ==========================================
// 교사 미션 활성화 / 종료
// ==========================================

async function toggleMission(id, active) {
  if (!teacher()) return;

  try {
    await updateDoc(
      doc(db, root, 'missions', id),
      { active: !!active }
    );

    notify(
      active
        ? '▶️ 미션 다시 시작'
        : '⏸ 미션 종료'
    );

  } catch (e) {
    fail(e);
  }
}

// ==========================================
// 학생 칭호 수여
// ==========================================

async function setHonor(id, title) {
  if (!teacher()) return;

  id = Number(id);
  title = String(title || '').trim();

  if (
    id < 1 ||
    id > 29 ||
    id === 17 ||
    title.length > 22
  ) {
    notify('학생 번호 또는 칭호를 확인해 주세요.');
    return;
  }

  try {
    await updateDoc(
      doc(db, root, 'students', String(id)),
      { title }
    );

    notify(
      title
        ? `🏅 ${id}번 학생에게 칭호를 수여했습니다.`
        : '칭호가 삭제됐습니다.'
    );

  } catch (e) {
    fail(e);
  }
}

// ==========================================
// 학생 레벨 변경
// ==========================================

async function setLevel(id, value) {
  if (!teacher()) return;

  id = Number(id);

  const level = Math.max(
    1,
    Math.min(
      99,
      Math.round(Number(value) || 1)
    )
  );

  if (
    id < 1 ||
    id > 29 ||
    id === 17
  ) {
    return;
  }

  try {
    await updateDoc(
      doc(db, root, 'students', String(id)),
      {
        level,
        xp: 0
      }
    );

    notify(`✨ ${id}번 학생 Lv.${level} 적용 완료`);

  } catch (e) {
    fail(e);
  }
}

// ==========================================
// 교사 경험치 직접 지급
// ==========================================

async function grantXP(id, amount, reason) {
  if (!teacher()) return;

  id = Number(id);
  amount = Number(amount);

  if (
    !(id >= 1 && id <= 29 && id !== 17) ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 500
  ) {
    notify('경험치 지급값을 확인해 주세요.');
    return;
  }

  try {
    const studentRef = doc(
      db,
      root,
      'students',
      String(id)
    );

    const worldRef = doc(
      db,
      root,
      'world',
      'state'
    );

    await runTransaction(db, async (tx) => {
      const studentSnapshot = await tx.get(studentRef);
      const worldSnapshot = await tx.get(worldRef);

      if (!studentSnapshot.exists()) {
        throw new Error('학생 프로필을 찾을 수 없습니다.');
      }

      let level =
        Number(studentSnapshot.data().level) || 1;

      let xp =
        (Number(studentSnapshot.data().xp) || 0) +
        amount;

      while (
        level < 99 &&
        xp >= 60 + 18 * level
      ) {
        xp -= 60 + 18 * level;
        level++;
      }

      tx.update(studentRef, {
        level,
        xp
      });

      const oldTownXP = worldSnapshot.exists()
        ? Number(worldSnapshot.data().townXP) || 0
        : 0;

      tx.set(
        worldRef,
        {
          townXP: oldTownXP + amount
        },
        { merge: true }
      );

      const eventRef = doc(
        collection(db, root, 'events')
      );

      tx.set(eventRef, {
        studentId: id,
        amount,
        reason: String(reason || '교사 보상').slice(0, 100),
        date: timestamp(),
        teacherUid: activeUser.uid
      });
    });

    notify(`✅ ${id}번 학생 +${amount} XP 지급 완료`);

  } catch (e) {
    fail(e);
  }
}

// ==========================================
// v9 학급 초기설정
// 없는 학생 / 미션 / 마을 문서만 생성
// ==========================================

async function initializeClass() {
  if (!teacher()) return null;

  const yes = confirm(
    '교사 전용 학급 초기설정\n\n' +
    '기존 학생 레벨, XP, 칭호는 유지합니다.\n' +
    '없는 학생 프로필과 기본 미션만 생성할까요?'
  );

  if (!yes) return null;

  const studentIds = [
    ...Array.from(
      { length: 16 },
      (_, i) => i + 1
    ),
    ...Array.from(
      { length: 12 },
      (_, i) => i + 18
    )
  ];

  try {
    const [
      existingStudents,
      existingMissions,
      existingWorld
    ] = await Promise.all([
      getDocs(collection(db, root, 'students')),
      getDocs(collection(db, root, 'missions')),
      getDoc(doc(db, root, 'world', 'state'))
    ]);

    const savedStudentIds = new Set(
      existingStudents.docs.map(d => d.id)
    );

    const savedMissionIds = new Set(
      existingMissions.docs.map(d => d.id)
    );

    const defaultMissions = [
      [
        'm1',
        '아침 독서 10분',
        '읽은 책과 인상 깊었던 내용을 한 문장으로 적어 보세요.',
        35
      ],
      [
        'm2',
        '과학 탐구 미션',
        '오늘 새롭게 배운 과학 사실을 적어 보세요.',
        45
      ],
      [
        'm3',
        '학급 정리 도우미',
        '학급을 정리한 활동을 간단히 기록해 보세요.',
        30
      ],
      [
        'm4',
        '친구에게 칭찬 전달',
        '친구의 좋은 점을 구체적으로 적어 보세요.',
        25
      ]
    ];

    const batch = writeBatch(db);

    let studentsCreated = 0;
    let missionsCreated = 0;
    let worldCreated = 0;

    // 학생 프로필 28명
    for (const id of studentIds) {
      if (!savedStudentIds.has(String(id))) {
        batch.set(
          doc(db, root, 'students', String(id)),
          {
            number: id,
            nickname: `${id}번 주민`,
            level: 1,
            xp: 0,
            title: ''
          }
        );

        studentsCreated++;
      }
    }

    // 기본 미션 생성
    for (
      const [id, name, desc, xp]
      of defaultMissions
    ) {
      if (!savedMissionIds.has(id)) {
        batch.set(
          doc(db, root, 'missions', id),
          {
            name,
            desc,
            xp,
            active: true
          }
        );

        missionsCreated++;
      }
    }

    // 마을 공동 XP 초기화
    if (!existingWorld.exists()) {
      batch.set(
        doc(db, root, 'world', 'state'),
        {
          townXP: 0
        }
      );

      worldCreated = 1;
    }

    const changes =
      studentsCreated +
      missionsCreated +
      worldCreated;

    if (changes > 0) {
      await batch.commit();
    }

    const report =
      `학생 ${studentsCreated}명 · ` +
      `미션 ${missionsCreated}개 · ` +
      `마을 ${worldCreated}개 생성`;

    notify('✅ 초기설정 완료: ' + report);

    alert(
      '우리 반 초기설정 완료!\n\n' +
      report +
      '\n\n기존 데이터는 유지되었습니다.'
    );

    return {
      studentsCreated,
      missionsCreated,
      worldCreated
    };

  } catch (e) {
    fail(e);

    alert(
      '초기설정 실패\n\n' +
      (e?.code || e?.message || '알 수 없는 오류') +
      '\n\n교사 계정 권한과 Firestore 규칙을 확인해 주세요.'
    );

    return null;
  }
}

// ==========================================
// 웹앱에서 사용할 기능 등록
// ==========================================

Object.assign(cloud, {
  submit,
  approve,
  saveStudy,
  createMission,
  toggleMission,
  setHonor,
  setLevel,
  grantXP,
  initializeClass
});
