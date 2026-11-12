
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
    const dayPercent = Math.min(
      100,Math.round(total/goal*100)
    );

    const weekPercent = Math.min(
      100,Math.round(weekTotal/(goal*7)*100)
    );

    const tasks = loadTasks(id,key);
    const done = tasks.filter(t=>t.done).length;

    const taskPercent = tasks.length
      ? Math.round(done/tasks.length*100)
      : 0;

    // 오늘 목표
    $p('spTodayMin').textContent = total;
    $p('spTodayGoal').textContent = goal;
    $p('spTodayPct').textContent = `${dayPercent}%`;
    $p('spTodayFill').style.width = `${dayPercent}%`;

    // 주간 목표
    $p('spWeekMin').textContent = weekTotal;
    $p('spWeekPct').textContent = `${weekPercent}%`;
    $p('spWeekFill').style.width = `${weekPercent}%`;

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
                / <span id="spTodayGoal">60</span>분
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
              <label for="spGoal" class="sp-small">
                하루 목표(분)
              </label>

              <input id="spGoal"
                     type="number"
                     min="10"
                     max="600"
                     step="5"
                     style="width:85px">

              <button type="button" id="spGoalSave">
                저장
              </button>
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
