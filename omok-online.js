
/* 1학년 12반 성장 여행 - 하루 1판 오목 + 누적 랭킹
   기존 omok-online.js 내용을 모두 교체해 사용
*/
import {getApps} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,setDoc,query,where,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const app=getApps()[0];
if(!app) console.error('오목: Firebase가 아직 초기화되지 않았습니다.');
else {
 const auth=getAuth(app), db=getFirestore(app);
 const rooms=collection(db,'classrooms','main','omokFinalRooms');
 const locks=collection(db,'classrooms','main','omokFinalDaily');
 const $=id=>document.getElementById(id);
 const valid=n=>Number.isInteger(n)&&n>=1&&n<=29&&n!==17;
 const nickname=n=>window.ClassStudentNames?.get(n)||`${n}번`;
 const dayIndex=()=>Math.floor((Date.now()+9*3600000)/86400000);
 const lockRef=(n,personUid)=>doc(locks,`${n}_${personUid}`);
 const active=s=>['waiting','countdown','playing'].includes(s);
 let self=null, uid=null, room=null, stopRoom=null;
 let allRooms=[], myRooms=[], finished=[], todayUsed=false;
 let unsubs=[], listeningDay=null;
 const currentDay=()=>dayIndex();
 const tell=s=>{$('ogError').textContent=s||''};

 const style=document.createElement('style');
 style.textContent=`
 #ogOverlay{position:fixed;inset:0;z-index:100200;background:#0f172ad9;display:none;align-items:center;justify-content:center;padding:10px}
 #ogDialog{width:min(860px,98vw);max-height:94dvh;overflow:auto;background:#f8fafc;color:#0f172a;border-radius:18px;padding:20px;font:14px/1.55 Pretendard,system-ui,sans-serif;box-shadow:0 20px 80px #0007}
 #ogDialog *{box-sizing:border-box}
 #ogDialog h2{color:#0f172a;font-size:21px;margin:0}
 #ogDialog button{border:0;background:#2563eb;color:#fff;border-radius:9px;padding:9px 12px;cursor:pointer;font:700 13px Pretendard,system-ui,sans-serif}
 #ogDialog button:disabled{opacity:.45;cursor:not-allowed}
 #ogDialog .muted{color:#64748b;font-size:12px}
 #ogDialog .light{background:#e2e8f0;color:#334155}
 #ogDialog .panel{border:1px solid #e2e8f0;border-radius:12px;background:white;padding:14px;margin-top:12px}
 #ogDialog .row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
 #ogError{color:#b91c1c;white-space:pre-wrap}
 #ogLobby button,#ogHistory button{margin:4px}
 #ogBoard{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));width:min(525px,90vw);aspect-ratio:1;background:#ebc892;border:2px solid #926639;margin:14px auto;touch-action:manipulation}
 #ogBoard button{padding:0!important;border:1px solid #b58f5c!important;border-radius:0!important;background:transparent!important;display:grid;place-items:center;min-width:0;min-height:0;box-shadow:none!important}
 #ogBoard button span{width:78%;aspect-ratio:1;border-radius:50%;display:block}
 #ogBoard .black{background:radial-gradient(circle at 35% 25%,#555,#111827 65%);box-shadow:1px 2px 2px #0008}
 #ogBoard .white{background:radial-gradient(circle at 35% 25%,white,#cbd5e1 75%);border:1px solid #94a3b8;box-shadow:1px 2px 2px #0005}
 #ogBoard .last{outline:2px solid #e11d48;outline-offset:-2px}
 #ogRanks{width:100%;border-collapse:collapse;font-size:12px}
 #ogRanks td,#ogRanks th{padding:7px;border-bottom:1px solid #e2e8f0;text-align:center}
 #ogRanks tr.mine{background:#eff6ff;font-weight:800}
 #ogRanks th{background:#f1f5f9}
 @media(max-width:540px){#ogDialog{padding:12px}#ogDialog h2{font-size:18px}}
 `;
 document.head.append(style);

 const overlay=document.createElement('div');
 overlay.id='ogOverlay';
 overlay.innerHTML=`
  <section id="ogDialog" role="dialog" aria-modal="true" aria-label="오목 온라인 대결">
   <div class="row"><h2>🎮 온라인 오목 · 하루 1판</h2><button id="ogClose" class="light">닫기 ×</button></div>
   <p class="muted">2명 입장 → 모두 준비 → 3초 후 시작 · 한국시간 자정 초기화</p>
   <div id="ogError" role="alert"></div>
   <div class="panel"><b id="ogToday">오늘의 대국 확인 중…</b><div id="ogStats" class="muted"></div></div>
   <div class="panel"><div class="row"><b>🏁 대기 중인 방</b><button id="ogCreate">+ 새 방 만들기</button></div><div id="ogLobby"></div></div>
   <div class="panel"><b>📂 내 대국</b><div id="ogHistory"></div></div>
   <div class="panel" id="ogGame" style="display:none">
    <div id="ogRoomInfo"></div>
    <div class="row"><button id="ogReady">준비하기</button><button id="ogLeave" class="light">방 나가기 / 기권</button></div>
    <p id="ogStatus" style="font-weight:850;color:#1d4ed8"></p>
    <div id="ogBoard"></div>
   </div>
   <div class="panel"><h3 style="margin:0 0 8px">🏆 누적 오목 랭킹</h3><p class="muted">승리 수 → 승률 → 대국 수 순 · 진행 중인 대국은 제외</p><table id="ogRanks"><thead><tr><th>순위</th><th>학생</th><th>승</th><th>패</th><th>무</th><th>승률</th></tr></thead><tbody id="ogRankRows"></tbody></table></div>
   <p class="muted">대기방 생성만으로는 1판이 차감되지 않습니다. 시작 이후 기권하면 당일 추가 대국이 불가능합니다.</p>
  </section>`;
 document.body.append(overlay);
 const viewing=()=>overlay.style.display==='flex';
 $('ogClose').onclick=()=>overlay.style.display='none';
 overlay.onclick=e=>{if(e.target===overlay)overlay.style.display='none'};

 const nav=document.createElement('button');
 nav.className='navBtn';nav.dataset.open='minigame';nav.type='button';
 nav.innerHTML='<i>🎮</i> 미니게임 · 오목';
 nav.onclick=()=>{if(!self)return;overlay.style.display='flex';renderAll()};
 document.getElementById('leftNav')?.append(nav);
 const visibleNav=()=>nav.style.display=self?'':'none';
 visibleNav();

 function boardOf(moves){const a=Array(225).fill(0);for(const m of moves){if(m.x>=0&&m.x<15&&m.y>=0&&m.y<15)a[m.y*15+m.x]=m.p}return a}
 function five(a,x,y,p){for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){let c=1;for(const d of [-1,1])for(let k=1;k<=5;k++){const xx=x+dx*k*d,yy=y+dy*k*d;if(xx<0||xx>14||yy<0||yy>14||a[yy*15+xx]!==p)break;c++}if(c>=5)return true}return false}

 function winnerStats(){
  const res=new Map();for(const n of [...Array.from({length:16},(_,i)=>i+1),...Array.from({length:12},(_,i)=>i+18)])res.set(n,{n,w:0,l:0,d:0});
  for(const r of finished){if(!Array.isArray(r.nos)||r.nos.length!==2)continue;for(const n of r.nos){const v=res.get(n);if(!v)continue;if(r.winner===0)v.d++;else if(r.winner===n)v.w++;else if(r.winner!=null)v.l++}}
  return [...res.values()].sort((a,b)=>b.w-a.w||((b.w/(b.w+b.l+b.d||1))-(a.w/(a.w+a.l+a.d||1)))||((b.w+b.l+b.d)-(a.w+a.l+a.d))||a.n-b.n);
 }

 function showRank(){
  const rows=$('ogRankRows');rows.replaceChildren();
  for(const [i,s] of winnerStats().entries()){
   const tr=document.createElement('tr');if(s.n===self?.no)tr.className='mine';
   const pct=(100*s.w/(s.w+s.l+s.d||1)).toFixed(1)+'%';
   for(const v of [i+1,nickname(s.n),s.w,s.l,s.d,pct]){const td=document.createElement('td');td.textContent=v;tr.append(td)}rows.append(tr);
  }
 }

 function renderAll(){
  if(!viewing()||!self)return;
  const stats=winnerStats().find(r=>r.n===self.no)||{w:0,l:0,d:0};
  const meGames=stats.w+stats.l+stats.d;
  $('ogStats').textContent=`누적 ${meGames}전 ${stats.w}승 ${stats.l}패 ${stats.d}무 · 승률 ${(100*stats.w/(meGames||1)).toFixed(1)}%`;
  $('ogToday').textContent=self.role==='teacher'?'👩‍🏫 교사용 학급 랭킹 조회':todayUsed?'🔒 오늘의 1판 사용 완료 · 내일 다시 도전!':'✅ 오늘 1판 대결 가능';
  const ongoing=myRooms.find(r=>active(r.status));
  $('ogCreate').disabled=self.role==='teacher'||todayUsed||!!ongoing;
  const lobby=$('ogLobby');lobby.replaceChildren();
  for(const r of allRooms.filter(r=>r.status==='waiting')){
   const b=document.createElement('button');b.className='light';
   b.textContent=`${r.id.slice(0,6)} · ${nickname(r.nos?.[0])} · ${r.players.length}/2명`;
   b.disabled=self.role==='teacher'||((todayUsed||r.players.length>=2)&&!r.players.includes(uid));
   b.onclick=()=>r.players.includes(uid)?watchRoom(r.id):join(r.id);lobby.append(b);
  }
  if(!lobby.children.length)lobby.textContent='대기 중인 방이 없습니다.';
  const hist=$('ogHistory');hist.replaceChildren();
  for(const r of myRooms.slice(0,25)){
   const b=document.createElement('button');b.className='light';
   b.textContent=`${r.nos.map(nickname).join(' vs ')} · ${r.status==='finished'?'종료':r.status==='cancelled'?'취소':'진행 중'}`;
   b.onclick=()=>watchRoom(r.id);hist.append(b);
  }
  if(!hist.children.length)hist.textContent='참여한 대국이 없습니다.';
  showRank();renderRoom();
 }

 async function refreshDay(){
  if(!uid)return;
  const n=currentDay();
  if(listeningDay===n)return;
  listeningDay=n;
  try{const s=await getDoc(lockRef(n,uid));if(currentDay()===n&&auth.currentUser?.uid===uid){todayUsed=s.exists();renderAll()}}catch(e){tell('하루 이용권 확인 실패: '+e.message)}
 }

 async function canStart(){
  await refreshDay();
  const s=await getDoc(lockRef(currentDay(),uid));
  if(s.exists()){todayUsed=true;renderAll();throw Error('오늘은 이미 1판을 사용했어요.')}
 }

 $('ogCreate').onclick=async()=>{
  if(!self||self.role!=='student')return;
  try{
   await canStart();
   if(myRooms.some(r=>active(r.status)))throw Error('이미 참여 중인 방이 있습니다.');
   const ref=doc(rooms);
   await setDoc(ref,{players:[uid],nos:[self.no],ready:[false,false],moves:[],status:'waiting',winner:null,startAt:null,endedAt:null,createdAt:serverTimestamp(),dayIndex:null});
   tell('');watchRoom(ref.id);
  }catch(e){tell('방 생성 실패: '+e.message)}
 };

 async function join(id){
  if(!self||self.role!=='student')return;
  try{
   await canStart();
   if(myRooms.some(r=>active(r.status)))throw Error('이미 참여 중인 방이 있습니다.');
   await runTransaction(db,async tx=>{
    const ref=doc(rooms,id),lock=lockRef(currentDay(),uid);
    const s=await tx.get(ref),l=await tx.get(lock);
    if(l.exists())throw Error('오늘의 1판을 이미 사용했어요.');
    if(!s.exists())throw Error('방이 삭제됐습니다.');
    const r=s.data();
    if(r.status!=='waiting'||r.players.length!==1||r.players.includes(uid))throw Error('입장 가능한 방이 아닙니다.');
    tx.update(ref,{players:[r.players[0],uid],nos:[r.nos[0],self.no],ready:[false,false]});
   });
   tell('');watchRoom(id);
  }catch(e){tell('방 입장 실패: '+e.message)}
 }

 function watchRoom(id){
  stopRoom?.();room=null;
  stopRoom=onSnapshot(doc(rooms,id),s=>{room=s.exists()?{id:s.id,...s.data()}:null;renderRoom()},e=>tell('대국 연결 오류: '+e.message));
  overlay.style.display='flex';renderRoom();
 }

 function stage(r){if(r.status!=='countdown')return r.status;const n=r.startAt?.toMillis?.();return n&&Date.now()>=n+3000?'playing':'countdown'}

 function renderRoom(){
  const p=$('ogGame');
  if(!viewing()||!room||!room.players.includes(uid)){p.style.display='none';return}
  p.style.display='block';
  const idx=room.players.indexOf(uid),phase=stage(room);
  $('ogRoomInfo').textContent=`방 ${room.id.slice(0,6)} · ${room.nos.map((n,i)=>`${i?'⚪':'⚫'} ${nickname(n)}${room.ready[i]?' ✅':''}`).join(' vs ')}`;
  $('ogReady').style.display=room.status==='waiting'?'':'none';
  $('ogReady').disabled=room.players.length!==2||todayUsed;
  $('ogReady').textContent=room.ready[idx]?'준비 취소':'준비하기';
  $('ogLeave').style.display=['finished','cancelled'].includes(room.status)?'none':'';
  let msg=room.status==='waiting'?(room.players.length===1?'상대방 입장 대기 중':'두 사람 모두 준비 버튼을 눌러주세요')
   :phase==='countdown'?`${Math.max(1,Math.ceil(((room.startAt?.toMillis?.()||Date.now())+3000-Date.now())/1000))}초 후 시작!`
   :phase==='playing'?(room.moves.length%2===idx?'✅ 내 차례':'상대방 차례')
   :room.status==='finished'?(room.winner===0?'무승부':room.winner===self.no?'🏆 승리!':'상대방 승리'):'취소된 방';
  $('ogStatus').textContent=msg;
  const cells=boardOf(room.moves),last=room.moves.at(-1),board=$('ogBoard');board.replaceChildren();
  for(let i=0;i<225;i++){
   const b=document.createElement('button');b.type='button';b.className=(last&&i===last.y*15+last.x)?'last':'';
   b.setAttribute('aria-label',`${Math.floor(i/15)+1}행 ${i%15+1}열`);
   if(cells[i]){const stone=document.createElement('span');stone.className=cells[i]===1?'black':'white';b.append(stone)}
   b.disabled=!!cells[i]||phase!=='playing'||room.moves.length%2!==idx;
   b.onclick=()=>place(i%15,Math.floor(i/15));board.append(b);
  }
 }

 $('ogReady').onclick=async()=>{
  if(!room||!uid||self?.role!=='student')return;
  try{
   await runTransaction(db,async tx=>{
    const ref=doc(rooms,room.id),s=await tx.get(ref);
    if(!s.exists())throw Error('방이 없습니다.');
    const r=s.data(),i=r.players.indexOf(uid);
    if(r.status!=='waiting'||r.players.length!==2||i<0)throw Error('준비할 수 없는 방입니다.');
    const ready=[...r.ready];ready[i]=!ready[i];
    if(ready.every(Boolean)){
     const d=currentDay();
     const refs=r.players.map(id=>lockRef(d,id));
     const existing=await Promise.all(refs.map(x=>tx.get(x)));
     if(existing.some(x=>x.exists()))throw Error('두 학생 중 오늘 이미 대국한 학생이 있어요.');
     tx.update(ref,{ready,status:'countdown',startAt:serverTimestamp(),dayIndex:d});
     for(let j=0;j<2;j++)tx.set(refs[j],{uid:r.players[j],studentId:r.nos[j],roomId:room.id,dayIndex:d,startedAt:serverTimestamp()});
    } else tx.update(ref,{ready});
   });
   tell('');await refreshDay();
  }catch(e){tell('준비 실패: '+e.message)}
 };

 async function place(x,y){
  if(!room||!uid||self?.role!=='student')return;
  try{
   await runTransaction(db,async tx=>{
    const ref=doc(rooms,room.id),s=await tx.get(ref);
    if(!s.exists())throw Error('방이 없습니다.');
    const r=s.data(),i=r.players.indexOf(uid);
    if(!['countdown','playing'].includes(r.status)||!r.startAt||Date.now()<r.startAt.toMillis()+3000)throw Error('대국 시작 전입니다.');
    if(i<0||r.moves.length%2!==i)throw Error('내 차례가 아닙니다.');
    if(r.moves.some(m=>m.x===x&&m.y===y))throw Error('이미 돌이 있습니다.');
    const moves=[...r.moves,{x,y,p:i+1}],grid=boardOf(moves),win=five(grid,x,y,i+1),draw=!win&&moves.length===225;
    tx.update(ref,{moves,status:win||draw?'finished':'playing',winner:win?r.nos[i]:draw?0:null,endedAt:win||draw?serverTimestamp():null});
   });tell('');
  }catch(e){tell('착수 오류: '+e.message)}
 }

 $('ogLeave').onclick=async()=>{
  if(!room||!uid||self?.role!=='student')return;
  if(!confirm(['playing','countdown'].includes(room.status)?'기권하면 오늘의 1판이 사용됩니다. 나갈까요?':'대기방에서 나갈까요?'))return;
  try{
   await runTransaction(db,async tx=>{
    const ref=doc(rooms,room.id),s=await tx.get(ref);
    if(!s.exists())throw Error('방이 없습니다.');
    const r=s.data(),i=r.players.indexOf(uid);
    if(i<0)throw Error('참가자가 아닙니다.');
    if(r.status==='waiting'){
     if(r.players.length===1)tx.update(ref,{status:'cancelled'});
     else{const other=1-i;tx.update(ref,{players:[r.players[other]],nos:[r.nos[other]],ready:[false,false]})}
    }else if(['countdown','playing'].includes(r.status)){
     tx.update(ref,{status:'finished',winner:r.nos[1-i],endedAt:serverTimestamp()});
    }else throw Error('종료된 대국입니다.');
   });
   tell('');stopRoom?.();stopRoom=null;room=null;renderRoom();
  }catch(e){tell('나가기 실패: '+e.message)}
 };

 setInterval(()=>{if(viewing()&&room?.status==='countdown')renderRoom();if(uid&&listeningDay!==currentDay())refreshDay()},600);

 onAuthStateChanged(auth,async user=>{
  for(const stop of unsubs)stop();unsubs=[];stopRoom?.();stopRoom=null;
  room=null;self=null;uid=null;allRooms=[];myRooms=[];finished=[];todayUsed=false;listeningDay=null;
  visibleNav();overlay.style.display='none';
  if(!user)return;
  try{
   const snap=await getDoc(doc(db,'accounts',user.uid));
   if(auth.currentUser?.uid!==user.uid||!snap.exists())return;
   const a=snap.data(),n=Number(a.studentId);
   if(a.role==='teacher'){
    uid=user.uid;self={role:'teacher',no:0};visibleNav();
    unsubs.push(onSnapshot(query(rooms,where('status','==','finished')),s=>{finished=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()},e=>tell(e.message)));
    return;
   }
   if(a.role!=='student'||!valid(n))return;
   uid=user.uid;self={role:'student',no:n};visibleNav();
   unsubs.push(onSnapshot(query(rooms,where('status','in',['waiting','countdown','playing'])),s=>{allRooms=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()},e=>tell(e.message)));
   unsubs.push(onSnapshot(query(rooms,where('players','array-contains',uid)),s=>{myRooms=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));renderAll()},e=>tell(e.message)));
   unsubs.push(onSnapshot(query(rooms,where('status','==','finished')),s=>{finished=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()},e=>tell(e.message)));
   await refreshDay();
   const watchDay=()=>onSnapshot(lockRef(currentDay(),uid),s=>{todayUsed=s.exists();listeningDay=currentDay();renderAll()},e=>tell('오늘 1판 확인 오류: '+e.message));
   let stopDay=watchDay();let day=currentDay();
   const timer=setInterval(()=>{if(currentDay()!==day){day=currentDay();stopDay();todayUsed=false;stopDay=watchDay();renderAll()}},10000);
   unsubs.push(()=>{stopDay();clearInterval(timer)});
  }catch(e){console.error('오목 로그인 실패',e)}
 });
}
