
/* 학급 성장 여행: 급식 접기 + 학생 실명
   학생 명단은 공개 코드에 저장하지 않음
*/
import {getApps} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,onSnapshot,writeBatch} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const names = new Map();
window.ClassStudentNames = names;

const valid = n =>
  Number.isInteger(n) && n >= 1 && n <= 29 && n !== 17;

// ===== 급식판 기본 접힘 =====

function installMealFold() {
  const board = document.getElementById('classMealBoard');
  const head = board?.querySelector('.meal-head');

  if (!head || document.getElementById('mealToggleNew')) {
    return !!head;
  }

  document.getElementById('mealFoldBtn')?.remove();
  board.classList.remove('meal-folded');

  const btn = document.createElement('button');
  btn.id = 'mealToggleNew';
  btn.type = 'button';

  btn.addEventListener('click', () => {
    board.classList.toggle('mealCompact');

    const closed = board.classList.contains('mealCompact');

    btn.textContent = closed
      ? '🍱 급식 펼치기 ▾'
      : '접기 ▴';

    btn.setAttribute('aria-expanded', String(!closed));
  });

  head.prepend(btn);
  board.classList.add('mealCompact');

  btn.textContent = '🍱 급식 펼치기 ▾';
  btn.setAttribute('aria-expanded', 'false');

  return true;
}

const css = document.createElement('style');

css.textContent = `
  #classMealBoard.mealCompact {
    width: 166px !important;
    max-height: 43px !important;
    min-height: 0 !important;
  }

  #classMealBoard.mealCompact .meal-content,
  #classMealBoard.mealCompact .meal-head > span,
  #classMealBoard.mealCompact #openClassTimetable {
    display: none !important;
  }

  #classMealBoard #mealToggleNew {
    white-space: nowrap;
    padding: 5px 7px;
    font-size: 11px;
  }

  /* 왼쪽 학급 활동 메뉴 숨기기 */
  #leftNav [data-open="class"] {
    display: none !important;
  }

  /* 교사 이름 등록창 */
  #rosterEditor {
    font: 14px Pretendard, system-ui, sans-serif;
    color: #172033;
  }

  #rosterEditor textarea {
    display: block;
    width: 100%;
    min-height: 270px;
    box-sizing: border-box;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #172033;
    font: 14px/1.6 monospace;
  }

  #rosterEditor button {
    margin-top: 12px;
    padding: 12px 18px;
    background: #2563eb;
    color: white;
    border: 0;
    border-radius: 10px;
    font-weight: 800;
    cursor: pointer;
  }
`;

document.head.append(css);

// 급식판이 늦게 생성되어도 자동 적용
let attempts = 0;

const retry = setInterval(() => {
  if (installMealFold() || ++attempts > 100) {
    clearInterval(retry);
  }
}, 150);

// ===== 캐릭터 실명 명찰 =====

function installNameLabels() {
  if (
    typeof window.drawPerson !== 'function' ||
    window.drawPerson.__namesInstalled
  ) return;

  const original = window.drawPerson;
  const context = document
    .getElementById('game')?.getContext('2d');

  if (!context) return;

  const decorated = function(n, isPlayer, t) {
    original(n, isPlayer, t);

    const name = names.get(Number(n?.id));

    if (
      !name ||
      !Number.isFinite(n?.x) ||
      !Number.isFinite(n?.y)
    ) return;

    context.save();

    context.font = 'bold 11px system-ui,sans-serif';

    const width = Math.max(
      54,
      Math.ceil(context.measureText(name).width) + 17
    );

    // 기존 번호 명찰 위에 이름 명찰 표시
    context.fillStyle = isPlayer
      ? '#9e5c83'
      : '#302544';

    context.beginPath();
    context.roundRect(
      n.x - width / 2,
      n.y + 7,
      width,
      18,
      7
    );
    context.fill();

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';

    context.fillText(name, n.x, n.y + 16);
    context.restore();
  };

  decorated.__namesInstalled = true;
  window.drawPerson = decorated;
}

installNameLabels();

// ===== 교사 전용 이름 등록 =====

let unsub = null;

async function openRosterEditor(db) {
  if (window.ClassCloud?.role !== 'teacher') return;
  if (typeof window.openModal !== 'function') return;

  window.openModal(
    '👩‍🏫 학생 이름 일괄 등록',
    `
    <div id="rosterEditor">
      <p>
        한 줄에 <b>번호,이름</b>을 입력하세요.
        실제 이름은 공개 GitHub 코드가 아니라
        Firebase에 저장됩니다.
      </p>

      <textarea
        id="rosterInput"
        placeholder="1,학생이름&#10;2,학생이름">
      </textarea>

      <button type="button" id="rosterSave">
        28명 이름 저장
      </button>

      <p id="rosterResult" aria-live="polite"></p>
    </div>
    `,
    root => {
      root.querySelector('#rosterSave').onclick = async () => {
        const btn = root.querySelector('#rosterSave');
        btn.disabled = true;

        try {
          const lines = root
            .querySelector('#rosterInput')
            .value.trim()
            .split(/\r?\n/)
            .filter(Boolean);

          const entries = lines.map(line => {
            const m = line.trim().match(
              /^(\d{1,2})\s*[,\-:\t]\s*([가-힣]{2,8})$/
            );

            if (!m) {
              throw Error('입력 형식 오류: ' + line);
            }

            return [Number(m[1]), m[2]];
          });

          const unique = new Set(
            entries.map(([n]) => n)
          );

          if (
            entries.length !== 28 ||
            unique.size !== 28 ||
            entries.some(([n]) => !valid(n))
          ) {
            throw Error(
              '1~16번, 18~29번 총 28명을 중복 없이 입력해 주세요.'
            );
          }

          const batch = writeBatch(db);

          for (const [n, name] of entries) {
            batch.set(
              doc(
                db,
                'classrooms',
                'main',
                'students',
                String(n)
              ),
              {
                number: n,
                nickname: name
              },
              {merge: true}
            );
          }

          await batch.commit();

          root.querySelector('#rosterResult').textContent =
            '✅ 28명 저장 완료. 화면에 이름이 자동 반영됩니다.';

        } catch (e) {
          console.error(e);

          root.querySelector('#rosterResult').textContent =
            '저장 실패: ' + e.message;

        } finally {
          btn.disabled = false;
        }
      };
    }
  );
}

// ===== Firebase 이름 실시간 구독 =====

const app = getApps()[0];

if (app) {
  const auth = getAuth(app);
  const db = getFirestore(app);

  let btn = null;

  onAuthStateChanged(auth, async user => {
    unsub?.();
    unsub = null;

    names.clear();

    if (btn) {
      btn.remove();
      btn = null;
    }

    if (!user) return;

    unsub = onSnapshot(
      collection(
        db,
        'classrooms',
        'main',
        'students'
      ),
      snapshot => {
        names.clear();

        for (const row of snapshot.docs) {
          const x = row.data();
          const n = Number(x.number);

          if (
            valid(n) &&
            typeof x.nickname === 'string' &&
            !/^\d+번 주민$/.test(x.nickname)
          ) {
            names.set(n, x.nickname.slice(0, 8));
          }
        }

        installNameLabels();
      },
      error => {
        console.warn('이름 조회 실패:', error);
      }
    );

    const nav = document.getElementById('leftNav');

    const account = await getDoc(
      doc(db, 'accounts', user.uid)
    ).catch(() => null);

    if (auth.currentUser?.uid !== user.uid) return;

    if (
      nav &&
      account?.data()?.role === 'teacher'
    ) {
      btn = document.createElement('button');
      btn.className = 'navBtn teacherNav';
      btn.type = 'button';

      btn.innerHTML =
        '<i>🧑‍🏫</i> 학생 이름 등록';

      btn.onclick = () => openRosterEditor(db);

      nav.append(btn);
    }
  });
}
