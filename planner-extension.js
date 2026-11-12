
/* 우리 반 성장 마을 - 학습 플래너 확장
   기존 index.html과 firebase-v7.js 기능 유지
   학생 화면에 학습 플래너 추가
*/

(() => {
  'use strict';

  // ===== 1. 기본 설정 =====

  const schoolEvents = [
    { name: '2차고사 시작', date: '2026-12-14', emoji: '📝' },
    { name: '학교 축제', date: '2026-12-30', emoji: '🎪' },
    { name: '겨울방학', date: '2027-01-14', emoji: '❄️' }
  ];

  const subjects = [
    '국어', '영어', '수학', '과학', '사회', '기타'
  ];

  const $p = id => document.getElementById(id);

  const safe = value =>
    String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));

  const pad = n => String(n).padStart(2, '0');

  const dayKey = d =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const dateFromKey = s => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m-1, d);
  };

  const today = () => dayKey(new Date());

  const isValidStudent = n =>
    Number.isInteger(n) && n >= 1 && n <= 29 && n !== 17;

  function currentStudent() {
    const cloud = window.ClassCloud;

    if (cloud?.active && cloud.role === 'student') {
      return Number(cloud.studentId);
    }

    if (cloud?.active && cloud.role === 'teacher') {
      return null;
    }

    return Number(state.chosen);
  }

  // ===== 2. 학습 목표와 체크리스트 저장 =====

  const goalKey = id =>
    `classroom-study-goal-v1-${id}`;

  const taskKey = (id, day) =>
    `classroom-study-tasks-v1-${id}-${day}`;


function loadGoal(id) {
  try {
    const saved = localStorage.getItem(goalKey(id));

    // 아직 목표를 정하지 않은 학생은 0분
    if (saved === null) return 0;

    const value = Number(saved);

    return Number.isInteger(value) &&
           value >= 10 &&
           value <= 600
      ? value
      : 0;
  } catch {
    return 0;
  }
}

function saveGoal(id, value) {
  try {
    localStorage.setItem(goalKey(id), String(value));
    return true;
  } catch {
    return false;
  }
}

// 학생별 자유 목표 내용
const goalTitleKey = id =>
  `classroom-study-goal-title-v1-${id}`;

function loadGoalTitle(id) {
  try {
    return localStorage.getItem(goalTitleKey(id)) || '';
  } catch {
    return '';
  }
}

function saveGoalTitle(id, title) {
  try {
    localStorage.setItem(
      goalTitleKey(id),
      String(title).trim().slice(0,80)
    );
    return true;
  } catch {
    return false;
  }
}


  function loadTasks(id, day) {
    try {
      const data = JSON.parse(
        localStorage.getItem(taskKey(id, day)) || '[]'
      );

      return Array.isArray(data)
        ? data.filter(x => x && typeof x.text === 'string').slice(0,20)
        : [];
    } catch {
      return [];
    }
  }

  function saveTasks(id, day, tasks) {
    try {
      localStorage.setItem(
        taskKey(id, day),
        JSON.stringify(tasks)
      );
      return true;
    } catch {
      return false;
    }
  }

  // ===== 3. Firebase 공부 기록 처리 =====

  function logDay(log) {
    const s = String(log.date || '');

    const match = s.match(
      /(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/
    );

    if (match) {
      return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
    }

    const d = new Date(s);

    return Number.isNaN(d.getTime())
      ? ''
      : dayKey(d);
  }

  function studentLogs(id) {
    return (v6.studyLogs || []).filter(
      x => Number(x.studentId) === id
    );
  }

  // ===== 4. 학사일정 D-DAY =====

  function daysUntil(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const now = new Date();

    const eventDate = Date.UTC(y, m-1, d);
    const todayDate = Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    return Math.round(
      (eventDate - todayDate) / 86400000
    );
  }

  function dateBadge(n) {
    if (n === 0) return 'D-DAY';
    if (n > 0) return `D-${n}`;
    return `D+${-n}`;
  }

  function weekday(d) {
    return ['일','월','화','수','목','금','토'][d.getDay()];
  }

  // ===== 5. 플래너 디자인 =====

  const css = `
    /* 학생 화면에서 레벨 전환창 숨기기 */
    body.cloudStudent #stageSwitcher {
      display: none !important;
    }

    /* 플래너 전체 */
    #modal:has(#studyPlanner) {
      width: min(880px, 96vw);
      max-height: 92dvh;
      padding: 20px 22px;
    }

    #studyPlanner {
      font-size: 13px;
      color: #493855;
      line-height: 1.45;
    }

    #studyPlanner * {
      box-sizing: border-box;
    }

    /* 상단 소개 */
    #studyPlanner .sp-hero {
      background: linear-gradient(125deg,#4b3c77,#7764aa);
      color: white;
      border-radius: 16px;
      padding: 17px 19px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 15px;
      box-shadow: 0 4px 0 #30234c;
    }

    #studyPlanner .sp-hero strong {
      font-size: 19px;
      display: block;
      margin: 3px 0;
    }

    #studyPlanner .sp-hero small {
      color: #e1d9f6;
      display: block;
    }

    #studyPlanner .sp-hero-icon {
      font-size: 40px;
    }

    /* 구역 제목 */
    #studyPlanner .sp-section-title {
      font-size: 15px;
      font-weight: 900;
      margin: 15px 0 9px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    /* 학사일정 D-DAY 카드 */
    #studyPlanner .sp-ddays {
      display: grid;
      grid-template-columns: repeat(3,minmax(0,1fr));
      gap: 10px;
    }

    #studyPlanner .sp-day-card {
      background: #fff8e8;
      border: 1px solid #e8d6ac;
      border-radius: 12px;
      padding: 11px 9px;
      min-width: 0;
    }

    #studyPlanner .sp-day-name {
      font-size: 12px;
      font-weight: 850;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #studyPlanner .sp-day-date {
      display: block;
      color: #9b8292;
      font-size: 11px;
      margin-top: 5px;
    }

    #studyPlanner .sp-day-count {
      font-size: 21px;
      font-weight: 950;
      color: #6942aa;
      display: block;
      margin-top: 3px;
    }

    #studyPlanner .sp-day-card.sp-past {
      opacity: .66;
    }

    /* 2열 카드 */
    #studyPlanner .sp-two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    #studyPlanner .sp-card {
      background: #fffdf6;
      border: 1px solid #e5d7b8;
      border-radius: 14px;
      padding: 14px;
      min-width: 0;
    }

    #studyPlanner .sp-small {
      color: #8b7791;
      font-size: 11px;
    }

    #studyPlanner .sp-kpi {
      font-weight: 950;
      font-size: 25px;
      line-height: 1.1;
      margin: 7px 0;
    }

    #studyPlanner .sp-kpi span {
      font-size: 12px;
      font-weight: 600;
      color: #8c7895;
    }

    /* 달성률 게이지 */
    #studyPlanner .sp-track {
      height: 11px;
      border-radius: 100px;
      background: #e9deef;
      overflow: hidden;
      margin-top: 10px;
    }

    #studyPlanner .sp-fill {
      height: 100%;
      background: linear-gradient(90deg,#8e75e6,#59c9c2);
      border-radius: inherit;
      transition: width .3s;
    }

    /* 주간 그래프 */
    #studyPlanner .sp-bar-chart {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 7px;
      height: 118px;
      padding-top: 8px;
    }

    #studyPlanner .sp-bar-col {
      flex: 1;
      min-width: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      justify-content: flex-end;
    }

    #studyPlanner .sp-bar-label {
      font-size: 10px;
      color: #826d8d;
      white-space: nowrap;
    }

    #studyPlanner .sp-bar-holder {
      height: 76px;
      width: 100%;
      max-width: 36px;
      display: flex;
      align-items: end;
      justify-content: center;
      border-radius: 6px;
      background: #f2ebf6;
      overflow: hidden;
    }

    #studyPlanner .sp-bar {
      width: 100%;
      background: linear-gradient(#8ac9f2,#8170d8);
      border-radius: 5px 5px 0 0;
    }

    #studyPlanner .sp-bar-col.today .sp-bar {
      background: linear-gradient(#ffcf8d,#e79b79);
    }

    /* 공통 행 */
    #studyPlanner .sp-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 9px;
      margin: 8px 0;
    }

    #studyPlanner .sp-inline {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    /* 입력창 */
    #studyPlanner input,
    #studyPlanner select {
      border: 1px solid #d8c6db;
      border-radius: 9px;
      background: white;
      padding: 10px;
      color: #493855;
      min-width: 0;
      max-width: 100%;
      font-size: 13px;
    }

    #studyPlanner input:focus,
    #studyPlanner select:focus {
      outline: 2px solid #b1a4df;
      outline-offset: 1px;
    }

    /* 버튼 */
    #studyPlanner button {
      border: 0;
      border-radius: 9px;
      padding: 10px 13px;
      background: #6c54a5;
      color: white;
      font-weight: 800;
      font-size: 12px;
      cursor: pointer;
    }

    #studyPlanner button:hover {
      filter: brightness(1.07);
    }

    /* 체크리스트 */
    #studyPlanner .sp-task {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 4px;
      border-bottom: 1px solid #eee4e8;
    }

    #studyPlanner .sp-task label {
      flex: 1;
      display: flex;
      gap: 9px;
      align-items: center;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    #studyPlanner .sp-task input {
      width: 17px;
      height: 17px;
      accent-color: #7861b0;
      flex: none;
    }

    #studyPlanner .sp-task.done label span {
      text-decoration: line-through;
      color: #9d92a0;
    }

    #studyPlanner .sp-task button {
      padding: 5px 9px;
      background: #f3e9ef;
      color: #9c657c;
    }

    /* 과목별 통계 */
    #studyPlanner .sp-subject {
      margin: 8px 0 11px;
    }

    #studyPlanner .sp-subject-line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 5px;
      font-size: 12px;
    }

    #studyPlanner .sp-mini-track {
      height: 7px;
      background: #eee5ed;
      border-radius: 8px;
      overflow: hidden;
    }

    #studyPlanner .sp-mini-track b {
      display: block;
      background: #87bbd2;
      height: 100%;
      border-radius: 8px;
    }

    /* 공부 기록 */
    #studyPlanner .sp-record {
      border-bottom: 1px solid #eee0e3;
      padding: 10px 0;
    }

    #studyPlanner .sp-record:last-child {
      border-bottom: 0;
    }

    #studyPlanner .sp-record-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    #studyPlanner .sp-record b {
      font-size: 13px;
    }

    #studyPlanner .sp-record small {
      color: #9e8b9b;
    }

    #studyPlanner .sp-record-note {
      font-size: 12px;
      color: #775f81;
      margin-top: 4px;
      overflow-wrap: anywhere;
    }

    #studyPlanner .sp-empty {
      padding: 15px;
      text-align: center;
      color: #9e89a2;
      background: #faf5fb;
      border-radius: 9px;
    }

    #studyPlanner .sp-form {
      display: grid;
      grid-template-columns: 1fr 105px;
      gap: 8px;
    }

    #studyPlanner .sp-form input[name="note"],
    #studyPlanner .sp-form button {
      grid-column: 1 / -1;
    }

    #studyPlanner .sp-note {
      font-size: 11px;
      color: #8d7891;
      margin-top: 9px;
    }

    /* 휴대폰 반응형 */
    @media(max-width:650px) {
      #modal:has(#studyPlanner) {
        padding: 14px;
        max-height: 90dvh;
      }

      #studyPlanner .sp-hero {
        padding: 13px;
      }

      #studyPlanner .sp-hero strong {
        font-size: 16px;
      }

      #studyPlanner .sp-day-count {
        font-size: 17px;
      }

      #studyPlanner .sp-ddays {
        gap: 5px;
      }

      #studyPlanner .sp-day-card {
        padding: 9px 6px;
      }

      #studyPlanner .sp-day-name {
        font-size: 10px;
      }

      #studyPlanner .sp-day-date {
        font-size: 9px;
      }

      #studyPlanner .sp-two {
        grid-template-columns: 1fr;
      }
    }
  `;

  const style = document.createElement('style');
  style.id = 'studentPlannerStyles';
  style.textContent = css;
  document.head.appendChild(style);

  // ===== 6. 왼쪽 메뉴 이름 변경 =====

  const nav = document.querySelector('[data-open="study"]');

  if (nav) {
    nav.innerHTML = '<i>📚</i> 학습 플래너';
  }

  // 기존 공부 기록 기능 백업
  const oldOpenStudy = openV6Study;

  // ===== 7. 통계 업데이트 =====

  function refreshPlanner() {
    const root = $p('studyPlanner');

    if (!root ||
        !$p('overlay')?.classList.contains('open')) {
      return;
    }

    const id = Number(root.dataset.student);

    if (!isValidStudent(id)) return;

    const goal = loadGoal(id);
    const key = today();
    const logs = studentLogs(id);

    // 오늘 공부 시간
    const todayLogs = logs.filter(
      x => logDay(x) === key
    );

    const total = todayLogs.reduce(
      (sum,x) => sum + (Number(x.minutes)||0), 0
    );

    // 최근 7일 날짜
    const allDays = Array.from({length:7},(_,i)=>{
      const d = dateFromKey(key);
      d.setDate(d.getDate()-(6-i));
      return dayKey(d);
    });

    const weekLogs = logs.filter(
      x => allDays.includes(logDay(x))
    );

    const weekTotal = weekLogs.reduce(
      (sum,x) => sum + (Number(x.minutes)||0), 0
    );

    // 달성률 계산
   
// 목표를 설정한 경우에만 달성률 계산
const dayPercent = goal > 0
  ? Math.min(100, Math.round(total / goal * 100))
  : 0;

const weekPercent = goal > 0
  ? Math.min(100, Math.round(weekTotal / (goal * 7) * 100))
  : 0;


    const tasks = loadTasks(id,key);
    const done = tasks.filter(t=>t.done).length;

    const taskPercent = tasks.length
      ? Math.round(done/tasks.length*100)
      : 0;

  
// 오늘 목표
$p('spTodayMin').textContent = total;
$p('spTodayGoal').textContent = goal || '미설정';
$p('spGoalUnit').textContent = goal ? '분' : '';

$p('spTodayPct').textContent =
  goal > 0 ? `${dayPercent}%` : '목표 미설정';

$p('spTodayFill').style.width =
  `${dayPercent}%`;

// 주간 목표
$p('spWeekMin').textContent = weekTotal;

$p('spWeekPct').textContent =
  goal > 0 ? `${weekPercent}%` : '목표 미설정';

$p('spWeekFill').style.width =
  `${weekPercent}%`;

// 학생이 직접 설정한 목표 표시
$p('spGoal').value = goal || '';
$p('spGoalTitle').value = loadGoalTitle(id);

    // 체크리스트
    $p('spTaskPct').textContent =
      `${done} / ${tasks.length} 완료 · ${taskPercent}%`;

    $p('spTaskFill').style.width =
      `${taskPercent}%`;

    $p('spGoal').value = goal;

    // ===== 주간 그래프 =====

    $p('spChart').innerHTML = allDays.map(day=>{
      const d = dateFromKey(day);

      const value = weekLogs
        .filter(x=>logDay(x)===day)
        .reduce((sum,x)=>sum+(Number(x.minutes)||0),0);

      const height = Math.min(
        100,value/Math.max(goal,1)*100
      );

      return `
        <div class="sp-bar-col ${day===key?'today':''}">
          <span class="sp-bar-label">${value}분</span>
          <div class="sp-bar-holder">
            <div class="sp-bar"
                 style="height:${height}%"></div>
          </div>
          <span class="sp-bar-label">${weekday(d)}</span>
        </div>
      `;
    }).join('');

    // ===== 할 일 목록 =====

    $p('spTasks').innerHTML = tasks.map((t,i)=>`
      <div class="sp-task ${t.done?'done':''}">
        <label>
          <input type="checkbox"
                 data-task-check="${i}"
                 ${t.done?'checked':''}>
          <span>${safe(t.text)}</span>
        </label>
        <button type="button"
                data-task-delete="${i}">×</button>
      </div>
    `).join('') ||
    '<div class="sp-empty">오늘의 할 일을 추가해 보세요.</div>';

    // ===== 과목별 공부 시간 =====

    const subjectTotals = Object.fromEntries(
      subjects.map(x=>[x,0])
    );

    weekLogs.forEach(x=>{
      if (Object.prototype.hasOwnProperty.call(
        subjectTotals,x.subject
      )) {
        subjectTotals[x.subject] += Number(x.minutes)||0;
      }
    });

    const maxSubject = Math.max(
      1,...Object.values(subjectTotals)
    );

    $p('spSubjects').innerHTML =
      Object.entries(subjectTotals)
        .filter(([,m])=>m>0)
        .sort((a,b)=>b[1]-a[1])
        .map(([name,minutes])=>`
          <div class="sp-subject">
            <div class="sp-subject-line">
              <b>${safe(name)}</b>
              <span>${minutes}분</span>
            </div>
            <div class="sp-mini-track">
              <b style="width:${
                Math.round(minutes/maxSubject*100)
              }%"></b>
            </div>
          </div>
        `).join('') ||
      '<div class="sp-empty">이번 주 기록이 아직 없어요.</div>';

    // ===== 최근 공부 기록 =====

    $p('spHistory').innerHTML =
      logs.slice(-12).reverse().map(x=>`
        <div class="sp-record">
          <div class="sp-record-top">
            <b>${safe(x.subject)} · ${Number(x.minutes)||0}분</b>
            <small>${safe(x.date||'')}</small>
          </div>
          ${
            x.note
            ? `<div class="sp-record-note">${safe(x.note)}</div>`
            : ''
          }
        </div>
      `).join('') ||
      '<div class="sp-empty">첫 공부 기록을 남겨 보세요.</div>';
  }

  // ===== 8. 학습 플래너 화면 =====

  function openStudentPlanner() {

    // 선생님은 기존 관리 기능 유지
    if (window.ClassCloud?.active &&
        window.ClassCloud.role === 'teacher') {
      return oldOpenStudy();
    }

    const id = currentStudent();

    if (!isValidStudent(id)) {
      toast('학생 계정으로 로그인해 줘.');
      return;
    }

    const ddays = schoolEvents.map(ev=>{
      const days = daysUntil(ev.date);

      return `
        <div class="sp-day-card ${days<0?'sp-past':''}">
          <span class="sp-day-name">
            ${ev.emoji} ${safe(ev.name)}
          </span>
          <span class="sp-day-date">
            ${ev.date}
          </span>
          <span class="sp-day-count">
            ${dateBadge(days)}
          </span>
        </div>
      `;
    }).join('');

    openModal(
      `📚 ${id}번 · 나의 학습 플래너`,
      `
      <div id="studyPlanner" data-student="${id}">

        <!-- 상단 -->
        <div class="sp-hero">
          <div>
            <small>
              MY STUDY PLANNER · ${safe(today())}
            </small>
            <strong>
              오늘도 한 걸음 성장하기 🌱
            </strong>
            <small>
              나만의 공부 습관을 만들어 봐요.
            </small>
          </div>
          <div class="sp-hero-icon">📖</div>
        </div>

        <!-- 학사일정 -->
        <div class="sp-section-title">
          📅 중요한 학사일정
          <small class="sp-small">자동 D-day 계산</small>
        </div>

        <div class="sp-ddays">
          ${ddays}
        </div>

        <!-- 목표와 달성률 -->
        <div class="sp-section-title">
          🎯 공부 목표와 달성률
        </div>

        <div class="sp-two">

          <div class="sp-card">
            <div class="sp-small">
              오늘 공부한 시간 / 목표
            </div>

            <div class="sp-kpi">
              <span id="spTodayMin">0</span>
              <span>
                / <span id="spTodayGoal">미설</span><span id="spGoalUnit"></span>
              </span>
            </div>

            <div class="sp-row">
              <span class="sp-small">오늘의 달성률</span>
              <strong id="spTodayPct">0%</strong>
            </div>

            <div class="sp-track">
              <div class="sp-fill" id="spTodayFill"></div>
            </div>

            <div class="sp-inline" style="margin-top:12px">
              
<div style="margin-top:14px">

  <label for="spGoalTitle"
         class="sp-small"
         style="display:block;margin-bottom:6px">
    ✏️ 나만의 학습 목표
  </label>

  <input
    id="spGoalTitle"
    type="text"
    maxlength="80"
    placeholder="예: 매일 과학 개념 3개 정리하기"
    style="width:100%;margin-bottom:12px"
  >

  <label for="spGoal"
         class="sp-small"
         style="display:block;margin-bottom:6px">
    ⏰ 하루 목표 공부 시간(분)
  </label>

  <div class="sp-inline">

    <input
      id="spGoal"
      type="number"
      min="10"
      max="600"
      step="5"
      placeholder="예: 90"
      style="width:120px"
    >

    <button type="button" id="spGoalSave">
      🎯 내 목표 저장
    </button>

  </div>

  <p class="sp-note">
    목표 내용과 시간은 언제든지 변경할 수 있어요.
  </p>

</div>

          </div>

          <div class="sp-card">
            <div class="sp-small">
              최근 7일 공부 시간
            </div>

            <div class="sp-kpi">
              <span id="spWeekMin">0</span>
              <span>분 누적</span>
            </div>

            <div class="sp-row">
              <span class="sp-small">7일 목표 대비</span>
              <strong id="spWeekPct">0%</strong>
            </div>

            <div class="sp-track">
              <div class="sp-fill" id="spWeekFill"></div>
            </div>

            <div id="spChart" class="sp-bar-chart"></div>
          </div>

        </div>

        <!-- 할 일과 과목 통계 -->
        <div class="sp-two" style="margin-top:12px">

          <div class="sp-card">
            <div class="sp-section-title"
                 style="margin:0 0 6px">
              ✅ 오늘의 할 일
            </div>

            <div class="sp-row">
              <span class="sp-small">
                체크리스트 달성률
              </span>
              <strong id="spTaskPct">0%</strong>
            </div>

            <div class="sp-track" style="margin-bottom:9px">
              <div class="sp-fill" id="spTaskFill"></div>
            </div>

            <div id="spTasks"></div>

            <div class="sp-inline" style="margin-top:10px">
              <input id="spNewTask"
                     maxlength="60"
                     placeholder="예: 과학 3단원 복습"
                     style="flex:1;min-width:100px">

              <button type="button" id="spTaskAdd">
                + 추가
              </button>
            </div>
          </div>

          <div class="sp-card">
            <div class="sp-section-title"
                 style="margin:0 0 8px">
              📊 최근 7일 과목별 공부
            </div>

            <div id="spSubjects"></div>
          </div>

        </div>

        <!-- 공부 기록 입력 -->
        <div class="sp-section-title">
          ✏️ 공부 시간 기록하기
        </div>

        <div class="sp-card">
          <div class="sp-form">

            <select id="spSubject" aria-label="과목">
              ${subjects.map(x=>`<option>${x}</option>`).join('')}
            </select>

            <input id="spMinutes"
                   type="number"
                   min="1"
                   max="240"
                   value="30"
                   aria-label="공부 시간(분)">

            <input id="spNote"
                   name="note"
                   maxlength="100"
                   placeholder="오늘 공부한 내용을 입력해 보세요">

            <button id="spSave" type="button">
              💾 공부 기록 저장
            </button>

          </div>

          <div class="sp-note">
            공부 기록은 Firebase에 저장됩니다.
            공부 시간만으로 XP가 자동 지급되지는 않습니다.
          </div>
        </div>

        <!-- 최근 기록 -->
        <div class="sp-section-title">
          🗂 최근 공부 기록
        </div>

        <div class="sp-card" id="spHistory"></div>

        <p class="sp-note">
          하루 목표와 체크리스트는 현재 브라우저에
          저장됩니다. 공부 기록은 학생 계정별로
          Firebase에서 동기화됩니다.
        </p>

      </div>
      `,
      el => {

        // ===== 목표 저장 =====

       
el.querySelector('#spGoalSave').onclick = () => {
  const val = Number(
    el.querySelector('#spGoal').value
  );

  if (!Number.isInteger(val) ||
      val < 10 || val > 600) {
    return toast('하루 목표는 10~600분으로 입력해 줘.');
  }

  if (!saveGoal(id,val)) {
    return toast('목표 저장에 실패했어.');
  }

  refreshPlanner();
  toast('🎯 하루 목표 저장 완료!');
};

        // ===== 할 일 추가 =====

        const addTask = () => {
          const field = el.querySelector('#spNewTask');
          const value = field.value.trim();

          if (!value) {
            return toast('할 일을 입력해 줘.');
          }

          const d = today();
          const tasks = loadTasks(id,d);

          if (tasks.length >= 20) {
            return toast('하루 할 일은 최대 20개까지 추가할 수 있어.');
          }

          tasks.push({
            text: value.slice(0,60),
            done: false
          });

          if (!saveTasks(id,d,tasks)) {
            return toast('할 일 저장에 실패했어.');
          }

          field.value = '';
          refreshPlanner();
        };

        el.querySelector('#spTaskAdd').onclick = addTask;

        el.querySelector('#spNewTask')
          .addEventListener('keydown',e=>{
            if (e.key === 'Enter') {
              e.preventDefault();
              addTask();
            }
          });

        // ===== 할 일 완료 체크 =====

        el.querySelector('#spTasks')
          .addEventListener('change',e=>{
            if (!e.target.matches('[data-task-check]')) return;

            const idx = Number(e.target.dataset.taskCheck);
            const d = today();
            const tasks = loadTasks(id,d);

            if (!tasks[idx]) return;

            tasks[idx].done = e.target.checked;

            saveTasks(id,d,tasks);
            refreshPlanner();
          });

        // ===== 할 일 삭제 =====

        el.querySelector('#spTasks')
          .addEventListener('click',e=>{
            const btn = e.target.closest('[data-task-delete]');

            if (!btn) return;

            const idx = Number(btn.dataset.taskDelete);
            const d = today();
            const tasks = loadTasks(id,d);

            if (!tasks[idx]) return;

            tasks.splice(idx,1);

            saveTasks(id,d,tasks);
            refreshPlanner();
          });

        // ===== 공부 기록 저장 =====

        el.querySelector('#spSave').onclick = () => {
          const subject =
            el.querySelector('#spSubject').value;

          const minutes = Number(
            el.querySelector('#spMinutes').value
          );

          const note =
            el.querySelector('#spNote').value.trim();

          if (!subjects.includes(subject) ||
              !Number.isInteger(minutes) ||
              minutes < 1 ||
              minutes > 240) {
            return toast('공부 시간은 1~240분으로 입력해 줘.');
          }

          // Firebase 학생 계정
          if (window.ClassCloud?.active) {
            if (
              window.ClassCloud.role !== 'student' ||
              Number(window.ClassCloud.studentId) !== id
            ) {
              return toast('내 기록만 저장할 수 있어.');
            }

            window.ClassCloud.saveStudy(
              id,subject,minutes,note
            );

          } else {
            // 체험판
            v6.studyLogs.push({
              studentId: id,
              subject,
              minutes,
              note,
              date: new Date().toLocaleString('ko-KR')
            });

            v6save();
            refreshPlanner();
            toast('📚 공부 기록 저장 완료!');
          }

          el.querySelector('#spNote').value = '';
        };

        refreshPlanner();
      }
    );
  }

  // ===== 9. 기존 공부 기록 메뉴 교체 =====

  openV6Study = openStudentPlanner;

  // Firebase 실시간 기록 수신 시 플래너 갱신
  const oldApply = window.__v7Apply;

  window.__v7Apply = (kind,payload) => {
    if (typeof oldApply === 'function') {
      oldApply(kind,payload);
    }

    if (kind === 'studyLogs' || kind === 'account') {
      refreshPlanner();
    }
  };

  console.info('[우리 반 학습 플래너] 준비 완료');

})();


/* ==================================================
   우리 반 성장 마을 - 프리미엄 학습 플래너 테마
   parkexam.github.io/exam 디자인 적용
   기존 Firebase 및 학습 기능 유지
================================================== */

;(() => {
  'use strict';

  const styleId = 'classroomPremiumPlanner';

  // 중복 적용 방지
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;

  style.textContent = `

  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');

  /* =====================================
     프리미엄 컬러 시스템
  ===================================== */

  #studyPlanner {
    --pp-navy: #0f172a;
    --pp-blue: #2563eb;
    --pp-blue-light: #eff6ff;
    --pp-green: #10b981;
    --pp-text: #0f172a;
    --pp-muted: #64748b;
    --pp-border: #e2e8f0;
    --pp-bg: #f8fafc;

    font-family:
      'Pretendard Variable',
      Pretendard,
      -apple-system,
      BlinkMacSystemFont,
      'Apple SD Gothic Neo',
      sans-serif !important;

    font-size: 14px !important;
    letter-spacing: -0.025em;
    line-height: 1.6;
    color: var(--pp-text) !important;
    padding: 4px 0 15px;
  }

  #studyPlanner * {
    box-sizing: border-box;
  }

  /* =====================================
     학습 플래너 팝업 전체
     기존 게임 UI와 구분
  ===================================== */

  #modal:has(#studyPlanner) {
    width: min(1000px, calc(100vw - 24px)) !important;
    max-height: 94dvh !important;

    background: #f8fafc !important;
    border: 1px solid #cbd5e1 !important;

    border-radius: 20px !important;
    padding: 28px !important;

    color: #0f172a !important;

    box-shadow:
      0 25px 70px rgba(15,23,42,.35),
      0 4px 15px rgba(15,23,42,.08) !important;

    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  #modal:has(#studyPlanner) > h2 {
    font-family: Pretendard, sans-serif !important;
    font-size: 21px !important;
    font-weight: 800 !important;
    color: #0f172a !important;
    letter-spacing: -0.04em;
    margin: 0 50px 18px 0 !important;
  }

  #modal:has(#studyPlanner) > .close {
    background: white !important;
    color: #475569 !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 11px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,.05);
    font-size: 19px !important;
    font-weight: 600 !important;
    width: 36px;
    height: 36px;
  }

  #modal:has(#studyPlanner) > .close:hover {
    color: #0f172a !important;
    background: #f1f5f9 !important;
  }

  /* =====================================
     상단 네이비 히어로
  ===================================== */

  #studyPlanner .sp-hero {
    background:
      radial-gradient(
        circle at 95% 12%,
        rgba(59,130,246,.23),
        transparent 38%
      ),
      linear-gradient(
        125deg,
        #0f172a 0%,
        #172554 60%,
        #1e3a8a 100%
      ) !important;

    border: 1px solid rgba(255,255,255,.1) !important;
    border-radius: 18px !important;

    padding: 27px 30px !important;
    margin-bottom: 25px !important;

    box-shadow:
      0 12px 24px -6px rgba(15,23,42,.24) !important;

    color: #ffffff !important;
  }

  #studyPlanner .sp-hero strong {
    font-size: clamp(20px,3vw,27px) !important;
    line-height: 1.35 !important;
    font-weight: 800 !important;
    letter-spacing: -0.04em;
    color: white !important;
    margin: 7px 0 9px !important;
  }

  #studyPlanner .sp-hero small {
    color: #bfdbfe !important;
    font-size: 12px !important;
    font-weight: 500;
  }

  #studyPlanner .sp-hero-icon {
    width: 76px;
    height: 76px;
    flex-shrink: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    font-size: 40px !important;

    border-radius: 20px;
    background: rgba(255,255,255,.09);
    border: 1px solid rgba(255,255,255,.13);
  }

  /* =====================================
     제목 스타일
  ===================================== */

  #studyPlanner .sp-section-title {
    font-size: 16px !important;
    font-weight: 800 !important;
    color: #0f172a !important;

    margin: 24px 0 12px !important;
    letter-spacing: -0.035em;
  }

  #studyPlanner .sp-section-title:first-child {
    margin-top: 0 !important;
  }

  #studyPlanner .sp-small,
  #studyPlanner .sp-note {
    color: #64748b !important;
    font-size: 12px !important;
    font-weight: 500;
  }

  /* =====================================
     D-DAY 카드
  ===================================== */

  #studyPlanner .sp-ddays {
    display: grid !important;
    grid-template-columns: repeat(3,minmax(0,1fr));
    gap: 12px !important;
  }

  #studyPlanner .sp-day-card {
    background: #ffffff !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 16px !important;

    padding: 19px !important;
    position: relative;
    overflow: hidden;

    box-shadow:
      0 1px 3px rgba(15,23,42,.04) !important;

    transition:
      transform .2s ease,
      box-shadow .2s ease;
  }

  #studyPlanner .sp-day-card:hover {
    transform: translateY(-2px);

    box-shadow:
      0 8px 20px rgba(15,23,42,.08) !important;
  }

  #studyPlanner .sp-day-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: #2563eb;
  }

  #studyPlanner .sp-day-card:nth-child(2)::before {
    background: #10b981;
  }

  #studyPlanner .sp-day-card:nth-child(3)::before {
    background: #f59e0b;
  }

  #studyPlanner .sp-day-name {
    color: #334155 !important;
    font-size: 13px !important;
    font-weight: 750 !important;
  }

  #studyPlanner .sp-day-date {
    color: #94a3b8 !important;
    font-size: 12px !important;
    margin: 7px 0 !important;
  }

  #studyPlanner .sp-day-count {
    color: #2563eb !important;
    font-size: clamp(22px,3vw,30px) !important;
    font-weight: 850 !important;

    letter-spacing: -0.05em;
    margin-top: 8px !important;
  }

  #studyPlanner .sp-day-card:nth-child(2)
  .sp-day-count {
    color: #059669 !important;
  }

  #studyPlanner .sp-day-card:nth-child(3)
  .sp-day-count {
    color: #d97706 !important;
  }

  #studyPlanner .sp-day-card.sp-past {
    opacity: .7;
  }

  /* =====================================
     일반 통계 카드
  ===================================== */

  #studyPlanner .sp-two {
    display: grid !important;
    grid-template-columns:
      repeat(2,minmax(0,1fr)) !important;
    gap: 16px !important;
  }

  #studyPlanner .sp-card {
    background: #ffffff !important;
    color: #0f172a !important;

    border: 1px solid #e2e8f0 !important;
    border-radius: 16px !important;

    padding: 22px !important;

    box-shadow:
      0 1px 3px rgba(15,23,42,.04) !important;

    transition:
      border-color .2s ease,
      box-shadow .2s ease;
  }

  #studyPlanner .sp-card:hover {
    border-color: #cbd5e1 !important;

    box-shadow:
      0 5px 15px rgba(15,23,42,.05) !important;
  }

  #studyPlanner .sp-kpi {
    color: #0f172a !important;

    font-size: 34px !important;
    font-weight: 850 !important;

    line-height: 1.25 !important;
    letter-spacing: -0.05em;
    margin: 12px 0 !important;
  }

  #studyPlanner .sp-kpi span {
    font-size: 15px !important;
    color: #64748b !important;
    font-weight: 550 !important;
  }

  #studyPlanner .sp-kpi > span:first-child {
    font-size: inherit !important;
    color: #0f172a !important;
    font-weight: inherit !important;
  }

  #studyPlanner .sp-row {
    color: #334155 !important;
    font-size: 13px;
  }

  #studyPlanner .sp-row strong {
    color: #2563eb !important;
    font-weight: 800 !important;
  }

  /* =====================================
     파란색 목표 달성률 게이지
  ===================================== */

  #studyPlanner .sp-track {
    height: 10px !important;
    background: #e2e8f0 !important;
    border-radius: 999px !important;
    overflow: hidden;
  }

  #studyPlanner .sp-fill {
    background:
      linear-gradient(
        90deg,
        #2563eb,
        #60a5fa
      ) !important;

    height: 100% !important;
    border-radius: 999px !important;
    transition: width .4s ease !important;
  }

  #studyPlanner #spTaskFill {
    background:
      linear-gradient(
        90deg,
        #059669,
        #34d399
      ) !important;
  }

  /* =====================================
     최근 7일 공부량 그래프
  ===================================== */

  #studyPlanner .sp-bar-chart {
    height: 148px !important;
    padding-top: 18px !important;
    gap: 9px !important;
  }

  #studyPlanner .sp-bar-holder {
    height: 98px !important;
    max-width: 40px !important;
    background: #eff6ff !important;
    border-radius: 7px 7px 3px 3px !important;
  }

  #studyPlanner .sp-bar {
    background:
      linear-gradient(
        180deg,
        #60a5fa,
        #2563eb
      ) !important;

    border-radius: 6px 6px 0 0 !important;
    min-height: 2px;
  }

  #studyPlanner .sp-bar-col.today .sp-bar {
    background:
      linear-gradient(
        180deg,
        #34d399,
        #059669
      ) !important;
  }

  #studyPlanner .sp-bar-label {
    font-size: 11px !important;
    font-weight: 600;
    color: #64748b !important;
  }

  /* =====================================
     학생 목표 입력 영역
  ===================================== */

  #studyPlanner label {
    color: #475569 !important;
    font-weight: 650 !important;
  }

  #studyPlanner input:not([type="checkbox"]),
  #studyPlanner select {
    font-family: inherit !important;
    font-size: 13px !important;

    background: #ffffff !important;
    color: #0f172a !important;

    border: 1px solid #cbd5e1 !important;
    border-radius: 10px !important;

    padding: 11px 13px !important;
    min-height: 42px;

    box-shadow:
      0 1px 2px rgba(15,23,42,.025);

    transition:
      border-color .15s,
      box-shadow .15s;
  }

  #studyPlanner input:focus,
  #studyPlanner select:focus {
    border-color: #2563eb !important;
    outline: none !important;

    box-shadow:
      0 0 0 3px rgba(37,99,235,.13) !important;
  }

  #studyPlanner input::placeholder {
    color: #94a3b8 !important;
  }

  /* =====================================
     버튼 디자인
  ===================================== */

  #studyPlanner button {
    font-family: inherit !important;

    background: #2563eb !important;
    border: 1px solid #2563eb !important;

    color: white !important;

    border-radius: 10px !important;
    padding: 11px 15px !important;

    font-size: 13px !important;
    font-weight: 700 !important;

    box-shadow:
      0 2px 5px rgba(37,99,235,.12) !important;

    transition:
      background .2s,
      transform .2s,
      box-shadow .2s;
  }

  #studyPlanner button:hover {
    background: #1d4ed8 !important;

    transform: translateY(-1px);

    box-shadow:
      0 5px 12px rgba(37,99,235,.22) !important;
  }

  #studyPlanner button:active {
    transform: scale(.98);
  }

  #studyPlanner #spSave {
    background: #0f172a !important;
    border-color: #0f172a !important;
    padding: 13px !important;
  }

  #studyPlanner #spSave:hover {
    background: #1e293b !important;
  }

  /* =====================================
     체크리스트
  ===================================== */

  #studyPlanner .sp-task {
    border-bottom:
      1px solid #f1f5f9 !important;
    padding: 12px 2px !important;
  }

  #studyPlanner .sp-task label {
    color: #334155 !important;
    font-size: 13px;
    font-weight: 550 !important;
  }

  #studyPlanner .sp-task input[type="checkbox"] {
    width: 18px;
    height: 18px;

    accent-color: #2563eb !important;
    cursor: pointer;
  }

  #studyPlanner .sp-task.done label span {
    color: #94a3b8 !important;
  }

  #studyPlanner .sp-task button {
    background: #f1f5f9 !important;
    color: #64748b !important;
    border: 1px solid #e2e8f0 !important;
    padding: 5px 10px !important;
    box-shadow: none !important;
  }

  #studyPlanner .sp-task button:hover {
    background: #fee2e2 !important;
    color: #dc2626 !important;
    border-color: #fecaca !important;
  }

  /* =====================================
     과목별 공부 통계
  ===================================== */

  #studyPlanner .sp-subject {
    margin: 13px 0 !important;
  }

  #studyPlanner .sp-subject-line {
    color: #475569 !important;
    font-size: 13px !important;
    font-weight: 550;
    margin-bottom: 7px !important;
  }

  #studyPlanner .sp-subject-line b {
    color: #0f172a;
    font-weight: 750;
  }

  #studyPlanner .sp-mini-track {
    height: 8px !important;
    background: #eff6ff !important;
    border-radius: 999px !important;
  }

  #studyPlanner .sp-mini-track b {
    background:
      linear-gradient(
        90deg,
        #38bdf8,
        #2563eb
      ) !important;

    border-radius: 999px !important;
  }

  /* =====================================
     최근 학습 기록
  ===================================== */

  #studyPlanner .sp-record {
    padding: 13px 3px !important;
    border-bottom:
      1px solid #f1f5f9 !important;
  }

  #studyPlanner .sp-record b {
    font-size: 13px !important;
    font-weight: 750;
    color: #1e293b !important;
  }

  #studyPlanner .sp-record small {
    color: #94a3b8 !important;
    font-size: 11px !important;
  }

  #studyPlanner .sp-record-note {
    color: #64748b !important;
    font-size: 12px !important;
  }

  #studyPlanner .sp-empty {
    background: #f8fafc !important;
    color: #94a3b8 !important;

    border: 1px dashed #cbd5e1;
    border-radius: 12px !important;

    padding: 24px !important;
    font-size: 13px;
  }

  /* =====================================
     공부 기록 입력 폼
  ===================================== */

  #studyPlanner .sp-form {
    display: grid;
    grid-template-columns:
      minmax(0,1fr) minmax(100px,140px);

    gap: 12px !important;
  }

  #studyPlanner .sp-form input[name="note"],
  #studyPlanner .sp-form button {
    grid-column: 1 / -1;
  }

  /* =====================================
     모바일 반응형 디자인
  ===================================== */

  @media (max-width: 700px) {

    #modal:has(#studyPlanner) {
      padding: 17px !important;

      width: calc(100vw - 14px) !important;
      max-height: 94dvh !important;

      border-radius: 15px !important;
    }

    #modal:has(#studyPlanner) > h2 {
      font-size: 18px !important;
      margin-bottom: 14px !important;
    }

    #studyPlanner .sp-hero {
      padding: 20px 17px !important;
      margin-bottom: 19px !important;
      border-radius: 14px !important;
    }

    #studyPlanner .sp-hero strong {
      font-size: 19px !important;
    }

    #studyPlanner .sp-hero-icon {
      width: 52px;
      height: 52px;
      font-size: 28px !important;
      border-radius: 13px;
    }

    #studyPlanner .sp-ddays {
      gap: 7px !important;
    }

    #studyPlanner .sp-day-card {
      padding: 12px 9px !important;
      border-radius: 12px !important;
    }

    #studyPlanner .sp-day-name {
      font-size: 11px !important;
    }

    #studyPlanner .sp-day-date {
      font-size: 10px !important;
    }

    #studyPlanner .sp-day-count {
      font-size: 20px !important;
    }

    #studyPlanner .sp-two {
      grid-template-columns: 1fr !important;
      gap: 12px !important;
    }

    #studyPlanner .sp-card {
      padding: 17px !important;
      border-radius: 13px !important;
    }

    #studyPlanner .sp-section-title {
      margin: 20px 0 10px !important;
      font-size: 15px !important;
    }

    #studyPlanner .sp-kpi {
      font-size: 28px !important;
    }

    #studyPlanner .sp-form {
      grid-template-columns:
        minmax(0,1fr) 100px;
      gap: 8px !important;
    }

    #studyPlanner button {
      padding: 10px !important;
      font-size: 12px !important;
    }
  }

  @media (max-width: 360px) {

    #studyPlanner .sp-day-card {
      padding: 10px 6px !important;
    }

    #studyPlanner .sp-day-count {
      font-size: 17px !important;
    }

    #studyPlanner .sp-day-name {
      font-size: 10px !important;
    }

    #studyPlanner .sp-hero-icon {
      display: none;
    }
  }

  `;

  document.head.appendChild(style);

  console.log('프리미엄 학습 플래너 디자인 적용 완료');

})();
