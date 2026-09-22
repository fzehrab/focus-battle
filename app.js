import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getDatabase, ref, set, onValue, runTransaction, serverTimestamp, onDisconnect
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const $ = id => document.getElementById(id);
const NAMES = { z:"Zehra", s:"Samiye" };

const DEFAULT_ROASTS = {
  z:[
    "Zehra'nın focus'u Wi‑Fi gibi: var görünüyor ama bağlanmıyor. 📶",
    "Zehra bugün kitabı açmış; kitap daha çok çalışmış olabilir. 📕",
    "Bugünün akademik NPC'si: Zehra. Yarın redemption arc bekliyoruz. 🎮",
    "Zehra '5 dakika mola'yı uzun metraj filme çevirmiş. 🎬",
    "Samiye çalışmış; Zehra moral desteği sağlamış. Takım işi sonuçta. 🤝",
    "Zehra'nın comeback'i yarına kaldı. Takvimler işaretlendi. 📅"
  ],
  s:[
    "Samiye Pomodoro'yu domates sanıp mutfağa gitmiş olabilir. 🍅",
    "Samiye'nin productivity era'sı yarına ertelendi. 📆",
    "Bugünün akademik NPC'si: Samiye. Yarın redemption arc bekliyoruz. 🎮",
    "Samiye masaya oturmuş olabilir; ders çalıştığına dair delil yetersiz. 🕵️‍♀️",
    "Zehra çalışmış; Samiye ortamın enerjisini yükseltmiş. O da katkı. ✨",
    "Samiye'nin comeback'i yarına kaldı. Takvimler işaretlendi. 📅"
  ]
};

const DEFAULT_PUNISHMENTS = [
  "Kaybeden kazanana kahve ısmarlar ☕",
  "Kaybeden 20 squat yapar 😭",
  "Kaybeden kazananın seçtiği komik bir selfie çeker 🤳",
  "Kaybeden 10 dakika masa toparlar 🧹",
  "Kaybeden aşırı dramatik bir tebrik mesajı yollar 👑",
  "Kaybeden ertesi gün ilk Pomodoro'yu başlatır ⏰",
  "Kaybeden kazananın seçtiği meme'i 1 saat profil fotoğrafı yapar 😂",
  "Kaybeden 15 dakika ekstra review yapar 📚"
];

const NUDGES = [
  "📚 Telefonu bırak. Rakibin çalışıyor olabilir.",
  "🚨 Focus alarmı! Aradaki fark açılıyor olabilir.",
  "😈 Bestie reminder: bahaneler puan getirmiyor.",
  "⏱️ Bir 25 dakika daha. Sonra dramatik mola serbest.",
  "👀 Karşı taraf seni geçtiyse bunu kişisel algılayabilirsin.",
  "🔥 Lock in. Bu mesaj dostça değildi."
];

let app, auth, db;
let roomData = null;
let previousRoom = null;
let roomCode = "";
let selectedPlayer = localStorage.getItem("lockin.player") || "z";
let roomUnsub = null;
let offsetUnsub = null;
let serverOffset = 0;
let deferredInstall = null;
let autoStopping = { z:false, s:false };

function isConfigured(){
  return firebaseConfig?.apiKey && !firebaseConfig.apiKey.includes("PASTE_") &&
         firebaseConfig?.databaseURL && !firebaseConfig.databaseURL.includes("PASTE_");
}
function serverNow(){ return Date.now() + serverOffset; }
function todayKey(d=new Date(serverNow())){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function randomCode(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:7},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}
function cleanCode(v){ return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,10); }
function uid(prefix="s"){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
function fmt(sec){
  sec=Math.max(0,Math.floor(sec||0));
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
  return [h,m,s].map(v=>String(v).padStart(2,"0")).join(":");
}
function lines(v){ return String(v||"").split("\n").map(x=>x.trim()).filter(Boolean).slice(0,50); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function toast(msg){
  const el=document.createElement("div"); el.className="toast"; el.textContent=msg;
  $("toastHost").appendChild(el);
  setTimeout(()=>el.remove(),2800);
}
function confetti(n=90){
  const host=$("confetti"), colors=["#ff6687","#7567ff","#ffd166","#30b679","#6dd5ff"];
  for(let i=0;i<n;i++){
    const x=document.createElement("div"); x.className="conf";
    x.style.left=Math.random()*100+"vw";
    x.style.background=pick(colors);
    x.style.animationDelay=Math.random()*.6+"s";
    x.style.transform=`rotate(${Math.random()*360}deg)`;
    host.appendChild(x); setTimeout(()=>x.remove(),3600);
  }
}
function systemNotify(title,body){
  if(!("Notification" in window) || Notification.permission!=="granted") return;
  try{ new Notification(title,{body,tag:`lockin-${roomCode}`}); }catch{}
}
function setIdentity(p){
  selectedPlayer=p;
  localStorage.setItem("lockin.player",p);
  document.querySelectorAll("[data-me]").forEach(b=>b.classList.toggle("active",b.dataset.me===p));
}
function showSetup(){
  $("appView").classList.add("hidden");
  $("setupView").classList.remove("hidden");
}
function showApp(){
  $("setupView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("roomCodeLabel").textContent=roomCode;
  $("dateLabel").textContent=new Intl.DateTimeFormat("tr-TR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(serverNow()));
}
function initialRoom(){
  return {
    dayKey:todayKey(), goal:180, closed:false, createdAt:serverNow(),
    today:{z:{seconds:0},s:{seconds:0}},
    timers:{
      z:{running:false,startedAt:null,mode:"free",targetSeconds:null},
      s:{running:false,startedAt:null,mode:"free",targetSeconds:null}
    },
    stats:{z:{wins:0,streak:0},s:{wins:0,streak:0}},
    settings:{roasts:{z:[],s:[]},punishments:[]}
  };
}

async function initFirebase(){
  if(!isConfigured()){
    $("configWarning").classList.remove("hidden");
    return false;
  }
  app=initializeApp(firebaseConfig);
  auth=getAuth(app);
  db=getDatabase(app);

  offsetUnsub=onValue(ref(db,".info/serverTimeOffset"),snap=>{
    serverOffset=Number(snap.val()||0);
  });
  await signInAnonymously(auth);
  await new Promise(resolve=>{
    const un=onAuthStateChanged(auth,u=>{if(u){un();resolve();}});
  });
  return true;
}

async function createRoom(){
  if(!db){ $("configWarning").classList.remove("hidden"); return; }
  const code=randomCode();
  await set(ref(db,`rooms/${code}`),initialRoom());
  await joinRoom(code);
}

async function joinRoom(raw){
  if(!db){ $("configWarning").classList.remove("hidden"); return; }
  const code=cleanCode(raw);
  if(code.length<5){toast("Geçerli bir oda kodu gir.");return;}

  roomCode=code;
  localStorage.setItem("lockin.room",code);
  const url=new URL(location.href);url.searchParams.set("room",code);history.replaceState(null,"",url);

  if(roomUnsub)roomUnsub();
  roomUnsub=onValue(ref(db,`rooms/${code}`),async snap=>{
    if(!snap.exists()){
      toast("Bu oda bulunamadı.");
      leaveRoom(false);
      return;
    }
    const next=snap.val();
    if(next.dayKey!==todayKey()){
      await rolloverDay();
      return;
    }
    previousRoom=roomData?structuredClone(roomData):null;
    roomData=next;
    detectEvents(previousRoom,roomData);
    render();
    showApp();
  });

  const presence=ref(db,`rooms/${code}/presence/${selectedPlayer}`);
  await set(presence,{online:true,updatedAt:serverTimestamp()});
  onDisconnect(presence).set({online:false,updatedAt:serverTimestamp()});
}

async function rolloverDay(){
  if(!roomCode)return;
  const now=serverNow(),newDay=todayKey();
  await runTransaction(ref(db,`rooms/${roomCode}`),room=>{
    if(!room||room.dayKey===newDay)return room;
    room.history=room.history||{};
    if(!room.closed&&room.dayKey&&((room.today?.z?.seconds||0)>0||(room.today?.s?.seconds||0)>0)){
      const z=Math.floor((room.today?.z?.seconds||0)/60);
      const s=Math.floor((room.today?.s?.seconds||0)/60);
      room.history[room.dayKey]={zMinutes:z,sMinutes:s,winner:z===s?"tie":z>s?"z":"s",autoClosed:true,closedAt:now};
    }
    room.dayKey=newDay;room.closed=false;
    room.today={z:{seconds:0},s:{seconds:0}};
    room.timers={
      z:{running:false,startedAt:null,mode:"free",targetSeconds:null},
      s:{running:false,startedAt:null,mode:"free",targetSeconds:null}
    };
    room.lastResult=null;
    return room;
  });
}

function elapsed(p,data=roomData){
  const t=data?.timers?.[p];
  if(!t?.running||!t.startedAt)return 0;
  return Math.max(0,(serverNow()-t.startedAt)/1000);
}
function totalSeconds(p,data=roomData){
  return (data?.today?.[p]?.seconds||0)+elapsed(p,data);
}
function minutes(p,data=roomData){return Math.floor(totalSeconds(p,data)/60);}

async function startTimer(p,mode="free",targetSeconds=null){
  if(!roomData||roomData.closed)return;
  const now=serverNow();
  await runTransaction(ref(db,`rooms/${roomCode}`),room=>{
    if(!room||room.closed)return room;
    room.timers=room.timers||{};
    if(room.timers[p]?.running)return room;
    room.timers[p]={running:true,startedAt:now,mode,targetSeconds};
    return room;
  });
}

async function stopTimer(p,completed=false){
  if(!roomData)return;
  const now=serverNow();
  await runTransaction(ref(db,`rooms/${roomCode}`),room=>{
    if(!room||room.closed)return room;
    room.today=room.today||{z:{seconds:0},s:{seconds:0}};
    room.today[p]=room.today[p]||{seconds:0};
    room.timers=room.timers||{};
    const t=room.timers[p]||{};
    if(!t.running||!t.startedAt)return room;

    const actual=Math.max(0,(now-t.startedAt)/1000);
    const credited=completed&&t.targetSeconds?Math.min(actual,t.targetSeconds):actual;
    room.today[p].seconds=(room.today[p].seconds||0)+credited;

    room.sessions=room.sessions||{};
    room.sessions[room.dayKey]=room.sessions[room.dayKey]||{};
    if(credited>=30){
      room.sessions[room.dayKey][uid("session")]={
        player:p,seconds:Math.floor(credited),mode:t.mode||"free",
        targetSeconds:t.targetSeconds||null,completed:!!completed,endedAt:now
      };
    }
    room.timers[p]={running:false,startedAt:null,mode:"free",targetSeconds:null};
    return room;
  });
  if(completed){
    confetti(30);
    toast(`${NAMES[p]} Pomodoro tamamladı 🍅`);
    systemNotify(`${NAMES[p]} Pomodoro tamamladı 🍅`,"Session skora eklendi.");
  }
}

async function toggleFree(p){
  if(roomData?.timers?.[p]?.running) await stopTimer(p,false);
  else await startTimer(p,"free",null);
}
async function addMinutes(p,n){
  if(!roomData||roomData.closed)return;
  await runTransaction(ref(db,`rooms/${roomCode}/today/${p}/seconds`),v=>(v||0)+n*60);
}
async function sendNudge(target){
  if(!roomData)return;
  const msg=pick(NUDGES);
  await set(ref(db,`rooms/${roomCode}/lastNudge`),{target,from:selectedPlayer,msg,at:serverTimestamp()});
  toast(`${NAMES[target]} dürtüldü 😈`);
}

async function finishDay(){
  if(!roomData||roomData.closed)return;
  if(!confirm("Bugünün skorunu kilitleyelim mi?"))return;
  const now=serverNow();

  await runTransaction(ref(db,`rooms/${roomCode}`),room=>{
    if(!room||room.closed)return room;
    room.today=room.today||{z:{seconds:0},s:{seconds:0}};
    room.timers=room.timers||{};
    room.sessions=room.sessions||{};
    room.sessions[room.dayKey]=room.sessions[room.dayKey]||{};

    for(const p of ["z","s"]){
      room.today[p]=room.today[p]||{seconds:0};
      const t=room.timers[p]||{};
      if(t.running&&t.startedAt){
        const e=Math.max(0,(now-t.startedAt)/1000);
        room.today[p].seconds=(room.today[p].seconds||0)+e;
        if(e>=30){
          room.sessions[room.dayKey][uid(`final_${p}`)]={player:p,seconds:Math.floor(e),mode:t.mode||"free",completed:false,endedAt:now};
        }
      }
      room.timers[p]={running:false,startedAt:null,mode:"free",targetSeconds:null};
    }

    const z=Math.floor((room.today.z.seconds||0)/60),s=Math.floor((room.today.s.seconds||0)/60);
    const winner=z===s?"tie":z>s?"z":"s";
    const loser=winner==="z"?"s":winner==="s"?"z":null;

    room.stats=room.stats||{z:{wins:0,streak:0},s:{wins:0,streak:0}};
    room.stats.z=room.stats.z||{wins:0,streak:0};
    room.stats.s=room.stats.s||{wins:0,streak:0};
    if(winner!=="tie")room.stats[winner].wins=(room.stats[winner].wins||0)+1;

    const goal=room.goal||180;
    room.stats.z.streak=z>=goal?(room.stats.z.streak||0)+1:0;
    room.stats.s.streak=s>=goal?(room.stats.s.streak||0)+1:0;

    const custom=loser?(room.settings?.roasts?.[loser]||[]):[];
    const pool=loser?[...DEFAULT_ROASTS[loser],...custom]:[];
    const roast=loser?pick(pool):"Beraberlik. Roast departmanı bugün kapalı. 😔";

    room.history=room.history||{};
    room.history[room.dayKey]={zMinutes:z,sMinutes:s,winner,closedAt:now};
    room.lastResult={winner,loser,zMinutes:z,sMinutes:s,roast,closedAt:now};
    room.closed=true;
    return room;
  });
}

function detectEvents(prev,next){
  if(!prev||!next)return;
  const me=selectedPlayer,other=me==="z"?"s":"z";
  const pm=minutes(me,prev),po=minutes(other,prev),nm=minutes(me,next),no=minutes(other,next);
  if(po<=pm&&no>nm){
    systemNotify(`${NAMES[other]} seni geçti 😭`,`${no-nm} dakika geridesin. Lock in zamanı.`);
  }
  const a=prev.lastNudge,b=next.lastNudge;
  if(b?.target===me&&b?.at&&b.at!==a?.at){
    $("nudgeBar").textContent=`${NAMES[b.from]}: ${b.msg}`;
    $("nudgeBar").classList.remove("hidden");
    setTimeout(()=>$("nudgeBar").classList.add("hidden"),6000);
    systemNotify(`${NAMES[b.from]} seni dürttü 😈`,b.msg);
  }
}

function currentWeekKeys(){
  const d=new Date(serverNow());d.setHours(0,0,0,0);
  d.setDate(d.getDate()-((d.getDay()+6)%7));
  const out=new Set();
  for(let i=0;i<7;i++){const x=new Date(d);x.setDate(d.getDate()+i);out.add(todayKey(x));}
  return out;
}
function allSessions(){
  const out=[];
  for(const [date,obj] of Object.entries(roomData?.sessions||{})){
    for(const [id,s] of Object.entries(obj||{}))out.push({...s,id,date});
  }
  return out.sort((a,b)=>(b.endedAt||0)-(a.endedAt||0));
}
function currentMonthPrefix(){
  const d=new Date(serverNow());return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function render(){
  if(!roomData)return;
  const z=minutes("z"),s=minutes("s"),goal=roomData.goal||180;
  $("goalLabel").textContent=goal;
  $("zMinutes").textContent=z;$("sMinutes").textContent=s;
  $("zProgress").style.width=Math.min(100,z/goal*100)+"%";
  $("sProgress").style.width=Math.min(100,s/goal*100)+"%";
  $("zRank").textContent=z===s?"TIE":z>s?"#1":"#2";
  $("sRank").textContent=z===s?"TIE":s>z?"#1":"#2";
  $("zStreak").textContent=roomData.stats?.z?.streak||0;$("sStreak").textContent=roomData.stats?.s?.streak||0;
  $("zWins").textContent=roomData.stats?.z?.wins||0;$("sWins").textContent=roomData.stats?.s?.wins||0;

  const todaySess=Object.values(roomData.sessions?.[roomData.dayKey]||{});
  $("zSessions").textContent=todaySess.filter(x=>x.player==="z").length;
  $("sSessions").textContent=todaySess.filter(x=>x.player==="s").length;
  $("todaySessions").textContent=todaySess.length;
  $("todayTotal").textContent=z+s;
  $("todayGap").textContent=Math.abs(z-s);

  if(z===s){
    $("leaderText").textContent=z===0?"Henüz beraberlik 👀":"Tam beraberlik. Drama loading… 👀";
    $("gapText").textContent=z===0?"Bugünün savaşı daha yeni başlıyor.":`İkiniz de ${z} dakika.`;
    $("roastBox").textContent="Şimdilik kimseyle dalga geçemiyoruz. Bu kabul edilemez.";
  }else{
    $("leaderText").textContent=`👑 ${z>s?"Zehra":"Samiye"} önde!`;
    $("gapText").textContent=`${Math.abs(z-s)} dakika fark var.`;
    $("roastBox").textContent=`${z>s?"Samiye":"Zehra"} alarm: fark açılıyor. 🚨`;
  }

  renderTimerButtons();
  renderWeek();
  renderChart();
  renderHistory();
  renderWrapped();

  $("finishDay").disabled=!!roomData.closed;
  $("finishDay").textContent=roomData.closed?"✅ Bugün kilitlendi":"🏁 Günü Bitir";

  if(roomData.closed&&roomData.lastResult){
    const k=`lockin.seen.${roomCode}.${roomData.dayKey}`;
    if(!sessionStorage.getItem(k)){
      sessionStorage.setItem(k,"1");
      showResult(roomData.lastResult);
    }
  }
}
function renderTimerButtons(){
  for(const p of ["z","s"]){
    const t=roomData.timers?.[p]||{};
    $(p+"Free").textContent=t.running?"⏸ Duraklat":"▶ Free";
    $(p+"Free").disabled=!!roomData.closed;
    document.querySelectorAll(`[data-pomo][data-player="${p}"]`).forEach(b=>b.disabled=!!roomData.closed||!!t.running);
    const mode=t.running?(t.mode==="p25"?"🍅 25 dk Pomodoro":t.mode==="p50"?"🧠 50 dk Deep Focus":"Free focus"):"Free focus";
    $(p+"Mode").textContent=mode;
  }
}
function renderWeek(){
  const keys=currentWeekKeys(),entries=Object.entries(roomData.history||{}).filter(([k])=>keys.has(k));
  let zw=0,sw=0,zm=0,sm=0;
  entries.forEach(([,x])=>{zm+=x.zMinutes||0;sm+=x.sMinutes||0;if(x.winner==="z")zw++;if(x.winner==="s")sw++;});
  $("weekZ").textContent=zw;$("weekS").textContent=sw;
  if(!entries.length){
    $("weekTitle").textContent="Haftalık kupa ortada";
    $("weekSubtitle").textContent="İlk tamamlanan günden sonra yarış başlar.";
    return;
  }
  const champ=zw!==sw?(zw>sw?"z":"s"):(zm!==sm?(zm>sm?"z":"s":null));
  $("weekTitle").textContent=champ?`${NAMES[champ]} haftalık kupayı tutuyor 🏆`:"Haftalık kupa tam ortada 👀";
  $("weekSubtitle").textContent=`${zw}-${sw} günlük galibiyet • Zehra ${zm} dk / Samiye ${sm} dk`;
}
function renderChart(){
  const hist=Object.entries(roomData.history||{}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-7);
  if(!hist.length){$("weekChart").innerHTML='<div class="empty">İlk savaş bitince grafik burada çıkacak.</div>';return;}
  const max=Math.max(1,...hist.flatMap(([,x])=>[x.zMinutes||0,x.sMinutes||0]));
  $("weekChart").innerHTML=hist.map(([date,x])=>{
    const zh=Math.max(3,Math.round((x.zMinutes||0)/max*120)),sh=Math.max(3,Math.round((x.sMinutes||0)/max*120));
    return `<div class="chart-day"><div class="chart-bars"><div class="bar z" style="height:${zh}px" title="Zehra ${x.zMinutes||0} dk"></div><div class="bar s" style="height:${sh}px" title="Samiye ${x.sMinutes||0} dk"></div></div><div class="chart-label">${escapeHtml(date.slice(5))}</div></div>`;
  }).join("");
}
function renderHistory(){
  const sessions=allSessions().slice(0,16);
  $("sessionList").innerHTML=sessions.length?sessions.map(x=>{
    const mode=x.mode==="p25"?"🍅 25":x.mode==="p50"?"🧠 50":"⏱ Free";
    return `<div class="row-item"><b>${escapeHtml(x.date)}</b><span>${x.player==="z"?"🌸 Zehra":"💜 Samiye"}</span><span>${mode}${x.completed?" ✓":""}</span><strong>${Math.max(1,Math.round((x.seconds||0)/60))} dk</strong></div>`;
  }).join(""):'<div class="empty">Henüz focus session yok.</div>';

  const hist=Object.entries(roomData.history||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,20);
  $("historyList").innerHTML=hist.length?hist.map(([date,x])=>{
    const winner=x.winner==="tie"?"Berabere":NAMES[x.winner];
    return `<div class="row-item"><b>${escapeHtml(date)}</b><span>🌸 ${x.zMinutes||0} dk</span><span>💜 ${x.sMinutes||0} dk</span><strong>🏆 ${escapeHtml(winner)}</strong></div>`;
  }).join(""):'<div class="empty">Henüz tamamlanmış gün yok.</div>';
}
function renderWrapped(){
  const prefix=currentMonthPrefix(),monthHist=Object.entries(roomData.history||{}).filter(([k])=>k.startsWith(prefix));
  let zm=0,sm=0,zw=0,sw=0;
  monthHist.forEach(([,x])=>{zm+=x.zMinutes||0;sm+=x.sMinutes||0;if(x.winner==="z")zw++;if(x.winner==="s")sw++;});
  const sessions=allSessions().filter(x=>x.date.startsWith(prefix));
  const longest=sessions.reduce((m,x)=>Math.max(m,Math.round((x.seconds||0)/60)),0);
  $("wrapZMin").textContent=zm;$("wrapSMin").textContent=sm;$("wrapZWins").textContent=zw;$("wrapSWins").textContent=sw;
  $("wrapSessions").textContent=sessions.length;$("wrapLongest").textContent=longest;
  $("wrappedMonth").textContent=new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric"}).format(new Date(serverNow()));

  const champ=zw!==sw?(zw>sw?"z":"s"):(zm!==sm?(zm>sm?"z":"s":null));
  $("wrappedEmoji").textContent=champ==="z"?"🌸🏆":champ==="s"?"💜🏆":"📚";
  $("wrappedHeadline").textContent=monthHist.length?(champ?`${NAMES[champ]} bu ay önde.`:"Bu ay tam beraberlik."):"Biraz data biriksin 👀";
  $("wrappedQuote").textContent=champ
    ? `${NAMES[champ]} bu ay ${champ==="z"?zm:sm} dakika focus yaptı. Diğer tarafın redemption arc'ı hâlâ mümkün.`
    : "İkiniz de aynı seviyede disiplin ve kaos göstermişsiniz.";
}
function tick(){
  if(!roomData)return;
  for(const p of ["z","s"]){
    const t=roomData.timers?.[p]||{};
    if(t.running&&t.targetSeconds){
      const remaining=Math.max(0,t.targetSeconds-elapsed(p));
      $(p+"Timer").textContent=fmt(remaining);
      if(remaining<=0&&!autoStopping[p]){
        autoStopping[p]=true;
        stopTimer(p,true).finally(()=>setTimeout(()=>autoStopping[p]=false,1500));
      }
    }else $(p+"Timer").textContent=fmt(totalSeconds(p));
  }
  const z=minutes("z"),s=minutes("s"),goal=roomData.goal||180;
  $("zMinutes").textContent=z;$("sMinutes").textContent=s;
  $("zProgress").style.width=Math.min(100,z/goal*100)+"%";$("sProgress").style.width=Math.min(100,s/goal*100)+"%";
  $("zRank").textContent=z===s?"TIE":z>s?"#1":"#2";$("sRank").textContent=z===s?"TIE":s>z?"#1":"#2";
  $("todayTotal").textContent=z+s;$("todayGap").textContent=Math.abs(z-s);
}
function showResult(r){
  $("resultEmoji").textContent=r.winner==="tie"?"🤝":"🏆";
  $("resultTitle").textContent=r.winner==="tie"?"Berabere!":`${NAMES[r.winner]} kazandı!`;
  $("resultScore").textContent=`Zehra ${r.zMinutes} dk — Samiye ${r.sMinutes} dk`;
  $("resultRoast").textContent=r.roast||"";
  $("resultDialog").showModal();
  confetti();
}
function openSettings(){
  $("settingsGoal").value=roomData.goal||180;
  $("zRoasts").value=(roomData.settings?.roasts?.z||[]).join("\n");
  $("sRoasts").value=(roomData.settings?.roasts?.s||[]).join("\n");
  $("punishments").value=(roomData.settings?.punishments||[]).join("\n");
  $("settingsDialog").showModal();
}
async function saveSettings(){
  const goal=parseInt($("settingsGoal").value,10);
  if(!goal||goal<10){toast("Hedef en az 10 dakika.");return;}
  await set(ref(db,`rooms/${roomCode}/goal`),goal);
  await set(ref(db,`rooms/${roomCode}/settings`),{
    roasts:{z:lines($("zRoasts").value),s:lines($("sRoasts").value)},
    punishments:lines($("punishments").value)
  });
  $("settingsDialog").close();toast("Ayarlar iki cihazda senkronize edildi ✓");
}
async function leaveRoom(confirmFirst=true){
  if(confirmFirst&&!confirm("Odadan çıkmak istiyor musun? Veriler odada kalır."))return;
  roomUnsub?.();roomUnsub=null;roomData=null;previousRoom=null;
  roomCode="";localStorage.removeItem("lockin.room");
  const url=new URL(location.href);url.searchParams.delete("room");history.replaceState(null,"",url);
  showSetup();
}

document.querySelectorAll("[data-me]").forEach(b=>b.addEventListener("click",()=>setIdentity(b.dataset.me)));
$("createRoom").addEventListener("click",()=>createRoom().catch(e=>toast("Oda oluşturulamadı: "+e.message)));
$("joinRoom").addEventListener("click",()=>joinRoom($("roomCodeInput").value).catch(e=>toast("Bağlantı hatası: "+e.message)));
$("roomCodeInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("joinRoom").click();});
$("zFree").addEventListener("click",()=>toggleFree("z"));
$("sFree").addEventListener("click",()=>toggleFree("s"));
document.querySelectorAll("[data-pomo]").forEach(b=>b.addEventListener("click",()=>startTimer(b.dataset.player,b.dataset.pomo==="25"?"p25":"p50",parseInt(b.dataset.pomo,10)*60)));
document.querySelectorAll("[data-add]").forEach(b=>b.addEventListener("click",()=>addMinutes(b.dataset.player,parseInt(b.dataset.add,10))));
document.querySelectorAll("[data-nudge]").forEach(b=>b.addEventListener("click",()=>sendNudge(b.dataset.nudge)));
document.querySelectorAll("[data-custom]").forEach(b=>b.addEventListener("click",()=>{
  const n=parseInt(prompt(`${NAMES[b.dataset.custom]} için kaç dakika ekleyelim?`),10);
  if(n>0&&n<1000)addMinutes(b.dataset.custom,n);
}));
$("finishDay").addEventListener("click",finishDay);
$("settingsBtn").addEventListener("click",openSettings);
$("saveSettings").addEventListener("click",saveSettings);
$("editGoal").addEventListener("click",()=>{$("goalInput").value=roomData.goal||180;$("goalDialog").showModal();});
$("saveGoal").addEventListener("click",async()=>{
  const n=parseInt($("goalInput").value,10);if(!n||n<10){toast("Hedef en az 10 dakika.");return;}
  await set(ref(db,`rooms/${roomCode}/goal`),n);$("goalDialog").close();
});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
$("closeResult").addEventListener("click",()=>$("resultDialog").close());
$("leaveRoom").addEventListener("click",()=>leaveRoom(true));
$("shareRoom").addEventListener("click",async()=>{
  const url=new URL(location.href);url.searchParams.set("room",roomCode);
  const text=`Zehra vs Samiye: Lock In — oda kodu ${roomCode}`;
  try{
    if(navigator.share)await navigator.share({title:"Lock In",text,url:url.href});
    else{await navigator.clipboard.writeText(url.href);toast("Davet linki kopyalandı ✓");}
  }catch{}
});
$("notifyBtn").addEventListener("click",async()=>{
  if(!("Notification" in window)){toast("Bu tarayıcı bildirim desteklemiyor.");return;}
  const p=await Notification.requestPermission();
  toast(p==="granted"?"Bildirimler açık 🔔":"Bildirim izni verilmedi.");
});
$("spinPunishment").addEventListener("click",()=>{
  const pool=[...DEFAULT_PUNISHMENTS,...(roomData.settings?.punishments||[])];
  $("punishmentText").textContent=pick(pool);
});
$("copyWrapped").addEventListener("click",async()=>{
  const text=`${$("wrappedMonth").textContent} — Zehra vs Samiye: Lock In
🌸 Zehra: ${$("wrapZMin").textContent} dk • ${$("wrapZWins").textContent} win
💜 Samiye: ${$("wrapSMin").textContent} dk • ${$("wrapSWins").textContent} win
🍅 ${$("wrapSessions").textContent} session
⚡ En uzun: ${$("wrapLongest").textContent} dk`;
  await navigator.clipboard.writeText(text);toast("Wrapped kopyalandı ✓");
});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  for(const name of ["overview","history","wrapped","fun"])$(name+"Panel").classList.toggle("hidden",name!==b.dataset.tab);
}));

window.addEventListener("online",()=>{$("connectionBar").classList.add("hidden");toast("Bağlantı geri geldi ✓");});
window.addEventListener("offline",()=>{$("connectionBar").textContent="İnternet bağlantısı yok — son veriler gösteriliyor.";$("connectionBar").classList.remove("hidden");});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").classList.remove("hidden");});
$("installBtn").addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").classList.add("hidden");});

setIdentity(selectedPlayer);
setInterval(tick,500);

(async function boot(){
  const ok=await initFirebase().catch(e=>{console.error(e);toast("Firebase bağlantısı kurulamadı.");return false;});
  if(!ok)return;
  const invite=new URL(location.href).searchParams.get("room");
  const saved=localStorage.getItem("lockin.room");
  if(invite)await joinRoom(invite);
  else if(saved)await joinRoom(saved);
})();

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
}
