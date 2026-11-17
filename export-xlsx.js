/* 우리 반 성장 여행 — 교사 전용 「전체 내역 엑셀」 일괄 다운로드
   ────────────────────────────────────────────────────────────
   · 시트 4개: 미션_칭찬_내역 / 학생현황 / 공부기록 / 활동이력
   · SheetJS(CDN)로 .xlsx 생성, 로드가 막히면 UTF-8 BOM .csv로 자동 폴백
   · 교사(teacher) 계정에서만 버튼이 생기고 내려받을 수 있다.
     학생 모드·로그인 없는 체험 모드에서는 버튼도 만들어지지 않는다.
   · 외부 사이트를 쓰지 않으므로 학생 개인 기록이 학급 밖으로 나가지 않는다.
*/

const SHEETJS_SOURCES = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];

const SHEETJS_TIMEOUT = 9000;
const MAX_XP = level => 60 + 18 * level;

const isTeacher = () => window.ClassCloud?.role === 'teacher';

const notify = message => {
  if (typeof window.toast === 'function') window.toast(message);
  else console.log('[전체내역]', message);
};

const todayKST = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

/* ── 값 정리 ───────────────────────────────────────────── */

// '2026. 11. 17. 오후 7:05:26' 같은 한국어 표기를 비교 가능한 숫자로 바꾼다.
function dateValue(text) {
  const source = String(text || '');
  if (!source) return NaN;

  const day = source.match(/(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/);
  if (!day) {
    const plain = Date.parse(source);
    return Number.isNaN(plain) ? NaN : plain;
  }

  let hour = 0;
  let minute = 0;
  let second = 0;

  const rest = source.slice(day.index + day[0].length);
  const clock = rest.match(/(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i);

  if (clock) {
    hour = Number(clock[2]);
    minute = Number(clock[3]);
    second = clock[4] ? Number(clock[4]) : 0;

    const mark = (clock[1] || '').toUpperCase();
    if ((mark === '오후' || mark === 'PM') && hour < 12) hour += 12;
    if ((mark === '오전' || mark === 'AM') && hour === 12) hour = 0;
  }

  return Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    hour,
    minute,
    second
  );
}

// 최근 기록이 위로 오도록 정렬하고, 날짜를 못 읽은 항목은 뒤에 둔다.
function newestFirst(list) {
  return list
    .map((row, index) => ({ row, index, time: dateValue(row?.date) }))
    .sort((a, b) => {
      const at = Number.isNaN(a.time) ? -Infinity : a.time;
      const bt = Number.isNaN(b.time) ? -Infinity : b.time;
      if (at === bt) return a.index - b.index;
      return bt - at;
    })
    .map(x => x.row);
}

const statusLabel = status => {
  if (status === 'approved') return '승인';
  if (status === 'pending') return '승인 대기';
  if (status === 'rejected') return '반려';
  return String(status || '');
};

const text = value => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const whole = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};

/* ── 학급 데이터 읽기 ─────────────────────────────────── */

// index.html의 window.ClassV6Snapshot()이 Firebase 최신 스냅샷을 넘겨준다.
function readSnapshot() {
  let raw = null;

  try {
    if (typeof window.ClassV6Snapshot === 'function') raw = window.ClassV6Snapshot();
  } catch (error) {
    console.warn('[전체내역] 학급 데이터 읽기 실패', error);
  }

  if (!raw) return null;

  const list = value => (Array.isArray(value) ? value : []);
  const map = value =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const students = map(raw.students);
  const levels = map(raw.levels);
  const titles = map(raw.titles);

  const studentRows = Object.keys(students)
    .map(key => {
      const id = Number(key);
      const profile = map(students[key]);
      const level = Math.max(1, whole(levels[id] ?? profile.level ?? 1));
      return {
        id,
        name: text(profile.nickname || `${id}번 학생`),
        level,
        xp: whole(profile.xp),
        title: text(titles[id] ?? profile.title),
        nextNeed: Math.max(0, MAX_XP(level) - whole(profile.xp))
      };
    })
    .filter(row => Number.isInteger(row.id) && row.id >= 1 && row.id <= 29 && row.id !== 17)
    .sort((a, b) => a.id - b.id);

  const names = new Map(studentRows.map(row => [row.id, row.name]));

  return {
    students: studentRows,
    missions: list(raw.missions).map(mission => ({
      id: text(mission?.id),
      name: text(mission?.name),
      xp: whole(mission?.xp),
      active: mission?.active !== false
    })),
    submissions: list(raw.submissions),
    studyLogs: list(raw.studyLogs),
    events: list(raw.events),
    names,
    nameOf: id => names.get(Number(id)) || (id ? `${Number(id)}번 학생` : '')
  };
}

/* ── 시트 만들기 ──────────────────────────────────────── */

function buildTables(data) {
  const missions = new Map(data.missions.map(mission => [mission.id, mission]));

  const approved = new Map();
  const pending = new Map();
  const rejected = new Map();

  for (const submission of data.submissions) {
    const id = Number(submission?.studentId);
    const bucket =
      submission?.status === 'approved' ? approved :
      submission?.status === 'rejected' ? rejected : pending;
    bucket.set(id, (bucket.get(id) || 0) + 1);
  }

  const studyCount = new Map();
  const studyMinutes = new Map();

  for (const log of data.studyLogs) {
    const id = Number(log?.studentId);
    studyCount.set(id, (studyCount.get(id) || 0) + 1);
    studyMinutes.set(id, (studyMinutes.get(id) || 0) + whole(log?.minutes));
  }

  const earned = new Map();

  for (const event of data.events) {
    const id = Number(event?.studentId);
    earned.set(id, (earned.get(id) || 0) + whole(event?.amount));
  }

  const submissionRows = newestFirst(data.submissions).map((submission, index) => {
    const mission = missions.get(text(submission?.missionId));
    const studentId = Number(submission?.studentId);
    const status = text(submission?.status);

    return [
      index + 1,
      text(submission?.date),
      Number.isFinite(studentId) ? studentId : '',
      data.nameOf(studentId),
      text(submission?.missionId),
      mission?.name || (submission?.missionId ? '삭제된 미션' : ''),
      text(submission?.detail),
      statusLabel(status),
      status === 'approved' ? mission?.xp || 0 : 0,
      text(submission?.reviewed),
      text(submission?.dayKey)
    ];
  });

  const studentSheetRows = data.students.map(row => [
    row.id,
    row.name,
    row.level,
    row.xp,
    row.nextNeed,
    row.title,
    approved.get(row.id) || 0,
    pending.get(row.id) || 0,
    rejected.get(row.id) || 0,
    studyCount.get(row.id) || 0,
    studyMinutes.get(row.id) || 0,
    earned.get(row.id) || 0
  ]);

  const studyRows = newestFirst(data.studyLogs).map((log, index) => {
    const studentId = Number(log?.studentId);
    return [
      index + 1,
      text(log?.date),
      Number.isFinite(studentId) ? studentId : '',
      data.nameOf(studentId),
      text(log?.subject),
      whole(log?.minutes),
      text(log?.note)
    ];
  });

  const eventRows = newestFirst(data.events).map((event, index) => {
    const studentId = Number(event?.studentId);
    return [
      index + 1,
      text(event?.date),
      Number.isFinite(studentId) ? studentId : '',
      data.nameOf(studentId),
      whole(event?.amount),
      text(event?.reason)
    ];
  });

  return [
    {
      name: '미션_칭찬_내역',
      header: ['번호', '날짜/일시', '학생번호', '학생이름', '미션ID', '미션명', '작성내용', '상태', 'XP', '검토일시', '제출일'],
      widths: [6, 21, 9, 11, 9, 20, 46, 11, 7, 21, 11],
      rows: submissionRows
    },
    {
      name: '학생현황',
      header: ['번호', '이름', '레벨', '현재 XP', '다음 레벨까지', '칭호', '승인 미션', '대기 미션', '반려 미션', '공부 기록(건)', '총 공부 시간(분)', '누적 지급 XP'],
      widths: [6, 11, 6, 9, 13, 18, 10, 10, 10, 12, 15, 12],
      rows: studentSheetRows
    },
    {
      name: '공부기록',
      header: ['번호', '날짜/일시', '학생번호', '학생이름', '과목', '시간(분)', '학습내용'],
      widths: [6, 21, 9, 11, 8, 9, 40],
      rows: studyRows
    },
    {
      name: '활동이력',
      header: ['번호', '날짜/일시', '학생번호', '학생이름', 'XP', '사유'],
      widths: [6, 21, 9, 11, 8, 38],
      rows: eventRows
    }
  ];
}

/* ── CSV (폴백) ───────────────────────────────────────── */

// =, +, -, @ 로 시작하는 값은 스프레드시트가 수식으로 해석할 수 있어 앞에 '를 붙인다.
const RISKY_START = /^[=+\-@\t\r]/;

function csvCell(value) {
  let cell = value === null || value === undefined ? '' : String(value);
  if (RISKY_START.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function tablesToCsv(tables) {
  const lines = [];

  for (const table of tables) {
    lines.push(`[${table.name}]`);
    lines.push(table.header.map(csvCell).join(','));
    for (const row of table.rows) lines.push(row.map(csvCell).join(','));
    lines.push('');
  }

  return lines.join('\r\n');
}

/* ── SheetJS 불러오기 ─────────────────────────────────── */

let sheetJsLoad = null;

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsLoad) return sheetJsLoad;

  sheetJsLoad = (async () => {
    for (const src of SHEETJS_SOURCES) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          const timer = setTimeout(() => {
            script.remove();
            reject(new Error('시간 초과'));
          }, SHEETJS_TIMEOUT);

          script.src = src;
          script.async = true;
          script.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          script.onerror = () => {
            clearTimeout(timer);
            script.remove();
            reject(new Error('불러오기 실패'));
          };

          document.head.append(script);
        });

        if (window.XLSX) return window.XLSX;
      } catch (error) {
        console.warn('[전체내역] 엑셀 모듈을 불러오지 못했습니다:', src, error.message);
      }
    }

    return null;
  })().then(result => {
    if (!result) sheetJsLoad = null;
    return result;
  });

  return sheetJsLoad;
}

/* ── 파일 내려받기 ────────────────────────────────────── */

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function fileBaseName() {
  return `1학년12반_성장여행_전체내역_${todayKST()}`;
}

function summaryOf(data) {
  return (
    `미션 ${data.submissions.length}건 · 학생 ${data.students.length}명 · ` +
    `공부기록 ${data.studyLogs.length}건 · 활동 ${data.events.length}건`
  );
}

// 엑셀 모듈을 못 불러왔을 때의 대체 경로. UTF-8 BOM을 붙여 한글이 깨지지 않게 한다.
function writeCsv(tables, base, summary) {
  saveBlob(
    new Blob([`\uFEFF${tablesToCsv(tables)}`], { type: 'text/csv;charset=utf-8' }),
    `${base}.csv`
  );

  notify(`📥 CSV로 내려받았어 (엑셀에서 바로 열려) · ${summary}`);
  return 'csv';
}

async function download() {
  if (!isTeacher()) {
    notify('선생님 계정에서만 전체 내역을 내려받을 수 있어');
    return null;
  }

  const data = readSnapshot();

  if (!data) {
    notify('학급 데이터를 아직 읽지 못했어. 잠시 뒤 다시 눌러 줘');
    return null;
  }

  const tables = buildTables(data);
  const base = fileBaseName();
  const summary = summaryOf(data);

  notify('📥 전체 내역 파일을 만드는 중…');

  const XLSX = await loadSheetJS();

  if (XLSX) {
    try {
      const book = XLSX.utils.book_new();

      for (const table of tables) {
        const sheet = XLSX.utils.aoa_to_sheet([table.header, ...table.rows]);
        sheet['!cols'] = table.widths.map(width => ({ wch: width }));
        sheet['!autofilter'] = {
          ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: table.rows.length, c: table.header.length - 1 }
          })
        };
        XLSX.utils.book_append_sheet(book, sheet, table.name);
      }

      const buffer = XLSX.write(book, {
        bookType: 'xlsx',
        type: 'array',
        compression: true
      });

      saveBlob(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        `${base}.xlsx`
      );

      notify(`📥 엑셀 다운로드 완료 · ${summary}`);
      return 'xlsx';
    } catch (error) {
      console.error('[전체내역] 엑셀 파일 생성 실패', error);
    }
  }

  return writeCsv(tables, base, summary);
}

// 엑셀 모듈이 계속 막히는 환경에서 CSV만 바로 받고 싶을 때(같은 데이터·같은 검사).
function downloadCsv() {
  if (!isTeacher()) {
    notify('선생님 계정에서만 전체 내역을 내려받을 수 있어');
    return null;
  }

  const data = readSnapshot();

  if (!data) {
    notify('학급 데이터를 아직 읽지 못했어. 잠시 뒤 다시 눌러 줘');
    return null;
  }

  return writeCsv(buildTables(data), fileBaseName(), summaryOf(data));
}

/* ── 교사 전용 버튼 ───────────────────────────────────── */

const NAV_ID = 'classExportNav';

function installNavButton() {
  const nav = document.getElementById('leftNav');
  if (!nav) return false;

  const existing = document.getElementById(NAV_ID);

  if (!isTeacher()) {
    existing?.remove();
    return true;
  }

  if (existing) return true;

  const button = document.createElement('button');
  button.id = NAV_ID;
  button.type = 'button';
  button.className = 'navBtn teacherNav';
  button.title = '미션·칭찬 내역, 학생 현황, 공부 기록, 활동 이력을 엑셀 파일 하나로 내려받기';
  button.innerHTML = '<i>📥</i> 전체 내역 엑셀';
  button.onclick = () => download();

  nav.append(button);
  return true;
}

function watchTeacherState() {
  installNavButton();

  if (typeof MutationObserver === 'function' && document.body) {
    let queued = false;

    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        installNavButton();
      });
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
}

window.ClassExport = {
  download,
  downloadCsv,
  buildTables,
  readSnapshot,
  tablesToCsv,
  loadSheetJS,
  fileBaseName
};

watchTeacherState();
