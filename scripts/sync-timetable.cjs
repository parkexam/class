
/*
 * 문산중학교 1학년 12반 시간표 동기화
 * 실행 환경: GitHub Actions Node.js
 * 출처: 컴시간알리미 비공식 파서
 */

const fs = require('node:fs');
const Timetable = require('comcigan-parser');

function todayKST() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const get = key =>
    parts.find(p => p.type === key).value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function thisMonday() {
  const d = new Date(todayKST() + 'T00:00:00Z');
  const diff = (d.getUTCDay() + 6) % 7;

  d.setUTCDate(d.getUTCDate() - diff);

  return d.toISOString().slice(0, 10);
}

async function main() {
  const parser = new Timetable();

  await parser.init({ maxGrade: 3, cache: 0 });

  // 학교 검색
  const schools = await parser.search('문산중');

  const school = schools.find(s =>
    s.name === '문산중학교' &&
    (
      String(s.region).includes('경남') ||
      String(s.region).includes('경상남')
    )
  );

  if (!school) {
    throw new Error(
      '컴시간에서 경남 문산중학교를 찾지 못했습니다.'
    );
  }

  parser.setSchool(school.code);

  const all = await parser.getTimetable();

  // 1학년 12반
  const week = all?.[1]?.[12];

  if (!Array.isArray(week) || week.length < 5) {
    throw new Error(
      '1학년 12반 시간표가 제공되지 않았습니다.'
    );
  }

  const days = Array.from({ length: 5 }, (_, i) => {
    const lessons = week[i];

    if (!Array.isArray(lessons)) return [];

    return lessons.map((lesson, index) => ({
      period: Number(lesson.classTime) || index + 1,
      subject: String(lesson.subject || ''),
      teacher: String(lesson.teacher || ''),
      modified: Boolean(
        lesson.isModify || lesson.changed
      )
    }));
  });

  if (!days.some(d => d.some(x => x.subject))) {
    throw new Error('시간표가 비어 있습니다.');
  }

  const result = {
    school: school.name,
    grade: 1,
    classNo: 12,
    weekStart: thisMonday(),
    updatedAt: new Date().toISOString(),
    days
  };

  fs.writeFileSync(
    'timetable.json',
    JSON.stringify(result, null, 2),
    'utf8'
  );

  console.log('시간표 저장 완료');
  console.log('컴시간 학교 코드:', school.code);
  console.log('수집 시각:', result.updatedAt);
}

main().catch(error => {
  console.error('시간표 수집 실패:', error);
  process.exitCode = 1;
});
