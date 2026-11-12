
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore, doc, collection, query, where, onSnapshot, getDoc, getDocs, writeBatch, addDoc, setDoc, updateDoc, runTransaction, serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const config = window.CLASS_VILLAGE_FIREBASE_CONFIG || {};
const configured=!!(config.apiKey && config.authDomain && config.projectId && config.appId);
const gate=document.getElementById('cloudGate');
const intro=document.getElementById('cloudIntro');
const err=document.getElementById('cloudErr');
const loginButton=document.getElementById('cloudLoginBtn');
const demoButton=document.getElementById('cloudDemoBtn');
const status=document.getElementById('cloudStatus');
const statusText=document.getElementById('cloudStatusText');
const logoutButton=document.getElementById('cloudLogoutBtn');
const inputId=document.getElementById('cloudLoginId');
const inputPass=document.getElementById('cloudLoginPassword');
let app=null,auth=null,db=null,started=false,unsubs=[],activeUser=null,activeAccount=null;
const root='classrooms/main';
const cloud={active:false,role:null,studentId:null};
window.ClassCloud=cloud;
function notify(s){if(typeof window.toast==='function')window.toast(s);else {const el=document.getElementById('toast');if(el){el.textContent=s;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2500)}}}
function fail(e){console.error('Firebase:',e);const c=e?.code||'';notify(c==='permission-denied'?'권한이 없거나 Firestore 규칙이 올바르지 않아':c==='unavailable'?'네트워크 연결을 확인해 줘':'저장 중 오류: '+(e?.message||'알 수 없음'));}
function stop(){for(const f of unsubs)try{f()}catch{}unsubs=[];cloud.active=false;cloud.role=null;cloud.studentId=null;activeAccount=null;document.body.classList.remove('cloudStudent','cloudTeacher');status.style.display='none';window.__v7Apply?.('disconnected');}
function startDemo(){stop();gate.classList.add('hidden');notify('🎮 로컬 체험 모드 — 다른 기기와 동기화되지 않아');}
function showGate(text='로그인해 주세요'){intro.textContent=text;gate.classList.remove('hidden');}
demoButton.addEventListener('click',startDemo);
if(!configured){intro.textContent='Firebase 설정값이 아직 입력되지 않았어. 기존처럼 로그인 없이 체험판을 실행할 수 있어.';document.getElementById('cloudLoginFields').style.display='none';}
else {
  intro.textContent='학생은 번호(1~16,18~29), 선생님은 teacher를 입력해 로그인하세요.';
  try {
    app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);
    onAuthStateChanged(auth,async(user)=>{
      stop();activeUser=user;
      if(!user){showGate('학생 번호 또는 teacher 계정으로 로그인하세요.');return;}
      try{
        const snap=await getDoc(doc(db,'accounts',user.uid));
        if(!snap.exists())throw Error('이 계정에 학급 권한이 없어. 계정 생성 도구를 확인해 줘.');
        const acc=snap.data();
        if(!['teacher','student'].includes(acc.role))throw Error('계정 권한이 올바르지 않아.');
        // Firestore에 studentId가 문자열 "1"로 저장된 경우에도 숫자로 해석한다.
        // 단, 학생 번호가 누락됐거나 다른 계정 번호인 경우에는 차단한다.
        const studentId=acc.role==='student'?Number(acc.studentId):null;
        if(acc.role==='student'){
          if(!Number.isInteger(studentId)||studentId<1||studentId>29||studentId===17)
            throw Error('Firestore accounts 문서의 studentId를 숫자(1~16, 18~29)로 설정해 줘.');
          const emailNo=Number((user.email||'').toLowerCase().match(/^(\d{1,2})@class\.com$/)?.[1]);
          if(!Number.isInteger(emailNo)||emailNo!==studentId)
            throw Error('로그인 이메일과 Firestore의 studentId가 일치하지 않아. accounts 문서를 확인해 줘.');
        }
        activeAccount=acc;cloud.active=true;cloud.role=acc.role;cloud.studentId=studentId;
        document.body.classList.toggle('cloudStudent',acc.role==='student');
        document.body.classList.toggle('cloudTeacher',acc.role==='teacher');
        window.__v7Apply?.('account',{studentId:acc.role==='student'?studentId:1});
        status.style.display='flex';statusText.textContent=acc.role==='teacher'?'👩🏻‍🏫 교사 · 실시간 연결':`${studentId}번 학생 · 실시간 연결`;
        gate.classList.add('hidden');err.textContent='';subscribe();
      }catch(e){console.error(e);showGate(e?.message||'계정 정보 읽기 실패');err.textContent=e?.message||'학급 접근 권한이 없어';}
    });
  }catch(e){err.textContent='Firebase 초기화 실패: '+e.message;console.error(e);}
}
loginButton.addEventListener('click',async()=>{
 if(!auth)return;
 const id=inputId.value.trim().toLowerCase();const pass=inputPass.value;
 if(!id||!pass){err.textContent='계정과 비밀번호를 입력해 줘.';return;}
 // 숫자(1), 이메일(1@class.com), 교사명(teacher), 교사 이메일을 모두 지원한다.
 const isTeacher=id==='teacher'||id==='teacher@class.com';
 const studentMatch=id.match(/^(\d{1,2})(?:@class\.com)?$/);
 const n=studentMatch?Number(studentMatch[1]):NaN;
 if(!isTeacher&&(!Number.isInteger(n)||n<1||n>29||n===17)){
   err.textContent='학생은 1~16번·18~29번(또는 해당 @class.com 이메일), 선생님은 teacher로 로그인해 줘.';return;
 }
 const email=isTeacher?'teacher@class.com':`${n}@class.com`;
 loginButton.disabled=true;err.textContent='로그인 확인 중…';
 try{await signInWithEmailAndPassword(auth,email,pass);inputPass.value='';err.textContent='';}
 catch(e){console.error(e);err.textContent='로그인 실패: 계정 또는 비밀번호를 확인해 줘. ('+(e?.code||'error')+')';}
 finally{loginButton.disabled=false;}
});
inputPass.addEventListener('keydown',e=>{if(e.key==='Enter')loginButton.click()});
logoutButton.addEventListener('click',async()=>{if(auth)try{await signOut(auth)}catch(e){fail(e)}else showGate()});
function watch(ref,cb){unsubs.push(onSnapshot(ref,cb,e=>{console.error('실시간 구독 오류',e);fail(e)}));}
function subscribe(){
 watch(doc(db,root,'world','state'),s=>window.__v7Apply?.('world',s.exists()?s.data():{townXP:0}));
 watch(collection(db,root,'students'),q=>window.__v7Apply?.('students',q.docs.map(d=>d.data())));
 watch(collection(db,root,'missions'),q=>window.__v7Apply?.('missions',q.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id))));
 const subCol=collection(db,root,'submissions');const logCol=collection(db,root,'studyLogs');
 watch(cloud.role==='teacher'?subCol:query(subCol,where('studentId','==',cloud.studentId)),q=>window.__v7Apply?.('submissions',q.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.date||'').localeCompare(b.date||''))));
 watch(cloud.role==='teacher'?logCol:query(logCol,where('studentId','==',cloud.studentId)),q=>window.__v7Apply?.('studyLogs',q.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.date||'').localeCompare(b.date||''))));
 if(cloud.role==='teacher')watch(collection(db,root,'events'),q=>window.__v7Apply?.('events',q.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.date||'').localeCompare(b.date||''))));
}
const timestamp=()=>new Date().toLocaleString('ko-KR');
function teacher(){if(!cloud.active||cloud.role!=='teacher'){notify('선생님 계정에서만 가능한 기능이야');return false;}return true;}

const dayKST = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

async function submit(mid, detail) {
  if (!cloud.active || cloud.role !== 'student') {
    notify('학생 계정으로 로그인해야 제출할 수 있어');
    return;
  }

  detail = String(detail || '').trim();

  if (detail.length < 3 || detail.length > 250) {
    notify('활동 내용은 3~250자로 입력해 줘');
    return;
  }

  try {
    const mission = await getDoc(
      doc(db, root, 'missions', mid)
    );

    if (!mission.exists() || !mission.data().active) {
      throw Error('현재 운영 중인 미션이 아니야');
    }

    const dayKey = dayKST();

    // 학생 + 미션 + 날짜를 합쳐 문서 ID 생성
    // 같은 날에는 언제나 같은 ID가 사용됨
    const ref = doc(
      db,
      root,
      'submissions',
      `${activeUser.uid}_${mid}_${dayKey}`
    );

    await runTransaction(db, async tx => {
      const old = await tx.get(ref);

      if (
        old.exists() &&
        old.data().status !== 'rejected'
      ) {
        throw Error('오늘 이미 제출하거나 승인받은 미션이야');
      }

      const now = timestamp();

      if (old.exists()) {
        // 교사가 반려했다면 같은 날 재제출
        tx.update(ref, {
          detail,
          status: 'pending',
          date: now
        });
      } else {
        // 날짜마다 새 제출 문서 생성
        tx.set(ref, {
          ownerUid: activeUser.uid,
          studentId: cloud.studentId,
          missionId: mid,
          detail,
          status: 'pending',
          date: now,
          dayKey
        });
      }
    });

    notify('📨 오늘의 미션을 제출했어! 선생님 승인을 기다려 줘.');

  } catch (e) {
    fail(e);
  }
}

async function approve(sid,decision){
 if(!teacher())return;
 if(!['approved','rejected'].includes(decision))return;
 try{
   const subRef=doc(db,root,'submissions',sid),worldRef=doc(db,root,'world','state');
   await runTransaction(db,async(tx)=>{
     const subSnap=await tx.get(subRef);if(!subSnap.exists()||subSnap.data().status!=='pending')throw Error('이미 처리된 미션이야');
     const sub=subSnap.data(),missionRef=doc(db,root,'missions',sub.missionId),stuRef=doc(db,root,'students',String(sub.studentId));
     const missionSnap=await tx.get(missionRef);
     if(!missionSnap.exists())throw Error('등록된 미션을 찾을 수 없어');
     const xp=Number(missionSnap.data().xp)||0;
     let stuSnap,worldSnap;
     if(decision==='approved'){stuSnap=await tx.get(stuRef);worldSnap=await tx.get(worldRef);if(!stuSnap.exists())throw Error('학생 프로필을 찾지 못했어');}
     tx.update(subRef,{status:decision,reviewed:timestamp(),reviewedBy:activeUser.uid});
     if(decision==='approved'){
       const profile=stuSnap.data();let level=Math.max(1,Number(profile.level)||1),remain=(Number(profile.xp)||0)+xp;
       while(level<99&&remain>=60+18*level){remain-=60+18*level;level++}
       tx.update(stuRef,{level,xp:remain});
       tx.set(worldRef,{townXP:(Number(worldSnap.exists()?worldSnap.data().townXP:0)||0)+xp},{merge:true});
       const eventRef=doc(collection(db,root,'events'));
       tx.set(eventRef,{studentId:sub.studentId,amount:xp,reason:'미션 승인: '+missionSnap.data().name,date:timestamp(),teacherUid:activeUser.uid});
     }
   });notify(decision==='approved'?'✅ 승인 및 XP 지급 완료':'↩️ 반려 완료');
 }catch(e){fail(e)}
}
async function saveStudy(id,subject,minutes,note){
 if(!cloud.active||cloud.role!=='student'||id!==cloud.studentId){notify('내 공부 기록만 작성할 수 있어');return;}
 if(!['과학','국어','수학','영어','사회','기타'].includes(subject)||!Number.isInteger(minutes)||minutes<1||minutes>240||String(note).length>100){notify('입력값을 확인해 줘');return;}
 try{await addDoc(collection(db,root,'studyLogs'),{ownerUid:activeUser.uid,studentId:id,subject,minutes,note:String(note),date:timestamp()});notify('📚 공부 기록 저장 완료');}catch(e){fail(e)}
}
async function createMission(name,desc,xp){if(!teacher())return;name=String(name).trim();desc=String(desc).trim();if(name.length<2||name.length>40||desc.length>150||!Number.isInteger(xp)||xp<1||xp>100)return notify('미션 입력값을 확인해 줘');try{await addDoc(collection(db,root,'missions'),{name,desc,xp,active:true});notify('✅ 새 미션 등록 완료')}catch(e){fail(e)}}
async function toggleMission(id,active){if(!teacher())return;try{await updateDoc(doc(db,root,'missions',id),{active:!!active});notify(active?'▶️ 미션 재개':'⏸ 미션 종료')}catch(e){fail(e)}}
async function setHonor(id,title){if(!teacher())return;id=Number(id);title=String(title||'').trim();if(id<1||id>29||id===17||title.length>22)return notify('칭호는 22자 이내로 입력해 줘');try{await updateDoc(doc(db,root,'students',String(id)),{title});notify(title?`🏅 ${id}번 칭호 수여 완료`:'칭호 삭제 완료')}catch(e){fail(e)}}
async function setLevel(id,val){if(!teacher())return;id=Number(id);const level=Math.max(1,Math.min(99,Math.round(Number(val)||1)));if(id<1||id>29||id===17)return;try{await updateDoc(doc(db,root,'students',String(id)),{level,xp:0});notify(`✨ ${id}번 Lv.${level} 적용`)}catch(e){fail(e)}}
async function grantXP(id,amount,reason){if(!teacher())return;id=Number(id);amount=Number(amount);if(!(id>=1&&id<=29&&id!==17)||!Number.isInteger(amount)||amount<1||amount>500)return notify('지급 값이 올바르지 않아');try{
 const stuRef=doc(db,root,'students',String(id)),worldRef=doc(db,root,'world','state');
 await runTransaction(db,async(tx)=>{const s=await tx.get(stuRef),w=await tx.get(worldRef);if(!s.exists())throw Error('학생이 없어');let level=Number(s.data().level)||1,xp=(Number(s.data().xp)||0)+amount;while(level<99&&xp>=60+18*level){xp-=60+18*level;level++}tx.update(stuRef,{level,xp});tx.set(worldRef,{townXP:(Number(w.exists()?w.data().townXP:0)||0)+amount},{merge:true});tx.set(doc(collection(db,root,'events')),{studentId:id,amount,reason:String(reason||'교사 보상').slice(0,100),date:timestamp(),teacherUid:activeUser.uid})});notify(`✅ ${id}번 +${amount} XP`)
 }catch(e){fail(e)}}

// v9: Teacher-only, idempotent class startup: creates missing documents only.
// Does not create login credentials and never overwrites existing XP, honors or missions.
async function initializeClass(){
 if(!teacher())return null;
 if(!confirm('교사 전용 초기설정\n\n기존 학생 레벨·XP·칭호는 그대로 두고, 없는 학생 프로필과 기본 미션/마을 문서만 생성할까요?'))return null;
 const ids=[...Array.from({length:16},(_,i)=>i+1),...Array.from({length:12},(_,i)=>i+18)];
 try{
   const [existingStudents,existingMissions,existingWorld]=await Promise.all([
     getDocs(collection(db,root,'students')),
     getDocs(collection(db,root,'missions')),
     getDoc(doc(db,root,'world','state'))
   ]);
   const studentIds=new Set(existingStudents.docs.map(d=>d.id));
   const missionIds=new Set(existingMissions.docs.map(d=>d.id));
   const defaults=[
     ['m1','아침 독서 10분','읽은 책과 인상 깊었던 내용을 한 문장으로 적어 보세요.',35],
     ['m2','과학 탐구 미션','오늘 새롭게 배운 과학 사실을 적어 보세요.',45],
     ['m3','학급 정리 도우미','학급을 정리한 활동을 간단히 기록해 보세요.',30],
     ['m4','친구에게 칭찬 전달','친구의 좋은 점을 구체적으로 적어 보세요.',25]
   ];
   const batch=writeBatch(db);let studentsCreated=0,missionsCreated=0,worldCreated=0;
   for(const id of ids){
     if(!studentIds.has(String(id))){
       batch.set(doc(db,root,'students',String(id)),{
         number:id,nickname:`${id}번 주민`,level:1,xp:0,title:''
       });
       studentsCreated++;
     }
   }
   for(const [id,name,desc,xp] of defaults){
     if(!missionIds.has(id)){
       batch.set(doc(db,root,'missions',id),{name,desc,xp,active:true});
       missionsCreated++;
     }
   }
   if(!existingWorld.exists()){
     batch.set(doc(db,root,'world','state'),{townXP:0});
     worldCreated=1;
   }
   const changes=studentsCreated+missionsCreated+worldCreated;
   if(changes)await batch.commit();
   const report=`학생 프로필 ${studentsCreated}개 · 미션 ${missionsCreated}개 · 마을 ${worldCreated}개 생성`;
   notify('✅ 초기설정 완료: '+report);
   alert('우리 반 Firebase 초기설정 완료!\n\n'+report+'\n\n기존 데이터는 그대로 유지됐습니다.\n이제 1번 학생 계정으로 미션 제출을 시험해 보세요.');
   return {studentsCreated,missionsCreated,worldCreated};
 }catch(e){fail(e);alert('초기설정 실패: '+(e?.code||e?.message||'알 수 없는 오류')+'\n\nFirestore 규칙과 교사 계정 역할을 확인해 주세요.');return null;}
}

Object.assign(cloud,{submit,approve,saveStudy,createMission,toggleMission,setHonor,setLevel,grantXP,initializeClass});
