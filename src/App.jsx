import { useState, useEffect } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { CheckCircle, Circle, Clock, ChevronLeft, ChevronRight, Plus, X, Trash2, TrendingUp, CalendarDays, ListTodo, Users, Home, FileText } from "lucide-react";
import { db } from "./firebase";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";

const PALETTE = ['#C8604A','#7BA68A','#D4956A','#5B8DB8','#9B7BB8','#B8A06B'];
const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today = new Date();
const todayStr = fmt(today);
const dow = d => (d.getDay()+6)%7;

const FREQ = { daily:'Quotidien', weekly:'Hebdomadaire', biweekly:'Bimensuel', monthly:'Mensuel', quarterly:'Trimestriel', biannual:'Semestriel', yearly:'Annuel', once:'Ponctuel' };
const FREQ_ORDER = ['daily','weekly','biweekly','monthly','quarterly','biannual','yearly','once'];
const DS = ['Lu','Ma','Me','Je','Ve','Sa','Di'];
const DF = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const MO = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];

function isDue(t, date) {
  if (t.freq==='daily') return true;
  if (t.freq==='weekly') return t.days.includes(dow(date));
  if (t.freq==='biweekly') {
    if (!t.days || !t.days.includes(dow(date))) return false;
    const anchor = new Date(t.anchor || todayStr);
    const diffDays = Math.round((date - anchor) / 864e5);
    return diffDays % 14 === 0;
  }
  if (t.freq==='monthly') return t.dom===date.getDate();
  if (t.freq==='quarterly') return date.getDate()===t.dom && [0,3,6,9].includes(date.getMonth());
  if (t.freq==='biannual') return date.getDate()===t.dom && [0,6].includes(date.getMonth());
  if (t.freq==='yearly') return date.getDate()===t.dom && date.getMonth()===(t.month||0);
  if (t.freq==='once') return true;
  return false;
}

function weekOf(ref, off=0) {
  const d = new Date(ref); d.setDate(d.getDate()+off*7);
  const wd = dow(d); d.setDate(d.getDate()-wd);
  return Array.from({length:7},(_,i)=>{ const dd=new Date(d); dd.setDate(dd.getDate()+i); return dd; });
}

const CAT_BG = {Cuisine:'#FFF0EB',Ménage:'#EDFAF3',Approvisionnement:'#EBF3FA',Général:'#F5F0FA',Jardin:'#F0FAF0',Courses:'#FFF5EB',Enfants:'#FFF0F5',Animaux:'#F5F0FF',Administratif:'#F0F0FF'};
const CAT_TX = {Cuisine:'#C8604A',Ménage:'#7BA68A',Approvisionnement:'#5B8DB8',Général:'#9B7BB8',Jardin:'#5B8A5B',Courses:'#D4956A',Enfants:'#C87B9B',Animaux:'#7B6BB8',Administratif:'#6B6BB8'};
const card = {background:'#fff',borderRadius:16,padding:'14px 18px',boxShadow:'0 2px 12px rgba(61,46,30,0.07)',marginBottom:10};
const btnStyle = (bg='#C8604A',color='#fff') => ({background:bg,color,border:`1.5px solid ${bg==='#FAF6F0'||bg==='#fff'?'#E8DFCF':bg}`,borderRadius:10,padding:'8px 16px',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13});
const inp = {border:'1.5px solid #E8DFCF',borderRadius:10,padding:'9px 12px',fontFamily:'inherit',fontSize:14,outline:'none',width:'100%',background:'#FAF6F0',color:'#3D2E1E'};

export default function App() {
  const [tab, setTab] = useState('today');
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wkOff, setWkOff] = useState(0);
  const [statMode, setStatMode] = useState('person');
  const [checkModal, setCheckModal] = useState(null);
  const [selMember, setSelMember] = useState(null);
  const [timeVal, setTimeVal] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [nt, setNt] = useState({name:'',cat:'',freq:'daily',days:[],dom:1,month:0,est:'',notes:''});
  const [nm, setNm] = useState({name:'',emoji:'👤'});
  const [editTask, setEditTask] = useState(null);
  const [cats, setCats] = useState(['Cuisine','Ménage','Jardin','Courses','Enfants','Animaux','Administratif','Général']);
  const [newCat, setNewCat] = useState('');
  const [todaySort, setTodaySort] = useState('cat');
  const [taskSort, setTaskSort] = useState('freq');

  useEffect(()=>{
    const u1 = onSnapshot(collection(db,'members'), s=>{
      setMembers(s.docs.map(d=>({id:d.id,...d.data()})));
    });
    const u2 = onSnapshot(collection(db,'tasks'), s=>{
      setTasks(s.docs.map(d=>({id:d.id,...d.data()})));
    });
    const u3 = onSnapshot(collection(db,'completions'), s=>{
      setComps(s.docs.map(d=>({id:d.id,...d.data()})));
      setLoading(false);
    });
    return ()=>{ u1(); u2(); u3(); };
  },[]);

  const getMember = id => members.find(m=>m.id===id);
  const getTask = id => tasks.find(t=>t.id===id);
  const getComp = (taskId, date) => comps.find(c=>c.taskId===taskId&&c.date===date&&!c.skipped);
  const getComps = (taskId, date) => comps.filter(c=>c.taskId===taskId&&c.date===date&&!c.skipped);

  const isSkipped = (taskId, date) => comps.some(c=>c.taskId===taskId&&c.date===date&&c.skipped);

  const skipTask = async (taskId, date) => {
    const ex = comps.find(c=>c.taskId===taskId&&c.date===date&&c.skipped);
    if (ex) { await deleteDoc(doc(db,'completions',ex.id)); return; }
    await addDoc(collection(db,'completions'),{taskId,memberId:'',date,min:0,skipped:true});
  };

  const todayTasks = tasks.filter(t=>isDue(t,today) && !isSkipped(t.id,todayStr));
  const todayComps = comps.filter(c=>c.date===todayStr);
  const doneToday = id => todayComps.some(c=>c.taskId===id&&!c.skipped);
  const doneByMember = (taskId, date, memberId) => comps.some(c=>c.taskId===taskId&&c.date===date&&c.memberId===memberId&&!c.skipped);
  const visibleTodayTasks = todayTasks.filter(t=>!(t.freq==='once' && doneToday(t.id)));
  const doneCount = visibleTodayTasks.filter(t=>doneToday(t.id)).length;
  const progress = visibleTodayTasks.length ? Math.round(doneCount/visibleTodayTasks.length*100) : 0;

  const overdueTasks = (() => {
    const result = [];
    for (let ago=1; ago<=7; ago++) {
      const d = new Date(today); d.setDate(d.getDate()-ago);
      const ds = fmt(d);
      tasks.forEach(t => {
        if (!isDue(t,d)) return;
        const done = comps.some(c=>c.taskId===t.id&&c.date===ds&&!c.skipped);
        const skipped = comps.some(c=>c.taskId===t.id&&c.date===ds&&c.skipped);
        if (!done && !skipped) result.push({...t, overdueDate:ds, daysAgo:ago});
      });
    }
    return result;
  })();

  const sortedTodayTasks = [...visibleTodayTasks].sort((a,b)=>{
    if (todaySort==='cat') return (a.cat||'').localeCompare(b.cat||'');
    if (todaySort==='freq') return FREQ_ORDER.indexOf(a.freq)-FREQ_ORDER.indexOf(b.freq);
    return 0;
  });

  const sortedTasks = [...tasks].sort((a,b)=>{
    if (taskSort==='freq') return FREQ_ORDER.indexOf(a.freq)-FREQ_ORDER.indexOf(b.freq);
    if (taskSort==='cat') return (a.cat||'').localeCompare(b.cat||'');
    return 0;
  });

  const openCheck = async (taskId, date) => {
    setCheckModal({taskId, date: date||todayStr});
    setSelMember(members[0]?.id);
    const t = tasks.find(t=>t.id===taskId);
    setTimeVal(t?.est ? String(t.est) : '');
  };

  const removeComp = async (compId) => {
    await deleteDoc(doc(db,'completions',compId));
  };

  const confirmCheck = async () => {
    if (!selMember||!checkModal) return;
    const t = getTask(checkModal.taskId);
    const mins = parseInt(timeVal)||t?.est||15;
    const existing = comps.find(c=>c.taskId===checkModal.taskId&&c.date===checkModal.date&&c.memberId===selMember&&!c.skipped);
    if (existing) {
      await updateDoc(doc(db,'completions',existing.id),{min:mins});
    } else {
      await addDoc(collection(db,'completions'),{taskId:checkModal.taskId,memberId:selMember,date:checkModal.date,min:mins,skipped:false});
    }
    setCheckModal(null);
  };

  const weekDates = weekOf(today,wkOff);

  const stats = (()=>{
    const recent = comps.filter(c=>(today-new Date(c.date))/864e5<=28);
    const byPerson = members.map(m=>({
      name:m.name, color:m.color,
      minutes:recent.filter(c=>c.memberId===m.id).reduce((s,c)=>s+c.min,0),
      count:recent.filter(c=>c.memberId===m.id).length,
    }));
    const byTask = tasks.map(t=>({
      name:t.name, color:t.color||PALETTE[0],
      minutes:recent.filter(c=>c.taskId===t.id).reduce((s,c)=>s+c.min,0),
    })).sort((a,b)=>b.minutes-a.minutes).slice(0,8);
    const byWeek = Array.from({length:4},(_,i)=>{
      const ws=new Date(today); ws.setDate(ws.getDate()-dow(today)-(3-i)*7);
      const we=new Date(ws); we.setDate(we.getDate()+6);
      const wc=recent.filter(c=>{const d=new Date(c.date);return d>=ws&&d<=we;});
      const entry={label:`S-${3-i}`};
      members.forEach(m=>{entry[m.name]=Math.round(wc.filter(c=>c.memberId===m.id).reduce((s,c)=>s+c.min,0));});
      return entry;
    });
    return {byPerson,byTask,byWeek};
  })();

  const doAddTask = async () => {
    if (!nt.name.trim()) return;
    const estVal = parseInt(nt.est)||15;
    const data = {name:nt.name,cat:nt.cat||'Général',freq:nt.freq,days:(nt.freq==='weekly'||nt.freq==='biweekly')?nt.days:[0,1,2,3,4,5,6],dom:nt.dom,month:nt.month||0,anchor:todayStr,est:estVal,notes:nt.notes||'',color:PALETTE[tasks.length%PALETTE.length]};
    if (editTask) {
      await updateDoc(doc(db,'tasks',editTask.id), data);
      setEditTask(null);
    } else {
      await addDoc(collection(db,'tasks'), data);
    }
    setNt({name:'',cat:'',freq:'daily',days:[],dom:1,month:0,est:'',notes:''});
    setShowAddTask(false);
  };

  const doAddMember = async () => {
    if (!nm.name.trim()) return;
    await addDoc(collection(db,'members'),{name:nm.name,color:PALETTE[members.length%PALETTE.length],emoji:nm.emoji||'👤'});
    setNm({name:'',emoji:'👤'}); setShowAddMember(false);
  };

  const groupByKey = (arr, key) => arr.reduce((acc,item)=>{
    const k = item[key]||'Général';
    if (!acc[k]) acc[k]=[];
    acc[k].push(item);
    return acc;
  },{});

  const TABS = [
    {id:'today',label:"Aujourd'hui",icon:<Home size={17}/>},
    {id:'calendar',label:'Calendrier',icon:<CalendarDays size={17}/>},
    {id:'tasks',label:'Tâches',icon:<ListTodo size={17}/>},
    {id:'stats',label:'Stats',icon:<TrendingUp size={17}/>},
    {id:'family',label:'Famille',icon:<Users size={17}/>},
  ];

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'Nunito,sans-serif',color:'#C8604A',fontSize:18,fontWeight:800}}>
      Chargement… 🏠
    </div>
  );

  return (
    <div style={{fontFamily:"'Nunito',sans-serif",background:'#FAF6F0',minHeight:'100vh',color:'#3D2E1E',maxWidth:480,margin:'0 auto',paddingBottom:80}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700&display=swap');
        *{box-sizing:border-box;}
        .task-card{transition:transform 0.15s,box-shadow 0.15s;}
        .task-card:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(61,46,30,0.13)!important;}
        .chk{transition:transform 0.1s;} .chk:hover{transform:scale(1.12);}
        .tab-btn{transition:color 0.2s;}
      `}</style>

      <div style={{background:'linear-gradient(135deg,#C8604A 0%,#D4956A 100%)',padding:'22px 20px 18px',color:'#fff'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,opacity:0.8,letterSpacing:2,textTransform:'uppercase',marginBottom:2}}>
              {today.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
            </div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,lineHeight:1.2}}>Maison &amp; Famille</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:30,fontWeight:900,lineHeight:1}}>{progress}%</div>
            <div style={{fontSize:11,opacity:0.8}}>{doneCount}/{visibleTodayTasks.length} tâches</div>
          </div>
        </div>
        <div style={{marginTop:14,background:'rgba(255,255,255,0.25)',borderRadius:99,height:7,overflow:'hidden'}}>
          <div style={{width:`${progress}%`,background:'#fff',height:'100%',borderRadius:99,transition:'width 0.6s ease'}}/>
        </div>
        <div style={{display:'flex',gap:6,marginTop:12}}>
          {members.map(m=>(
            <div key={m.id} style={{width:34,height:34,borderRadius:'50%',background:'rgba(255,255,255,0.22)',border:'2px solid rgba(255,255,255,0.5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17}}>{m.emoji}</div>
          ))}
        </div>
      </div>

      <div style={{padding:'16px 14px 0'}}>

        {tab==='today' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:800,color:'#9C8878',textTransform:'uppercase',letterSpacing:1.5}}>{doneCount}/{visibleTodayTasks.length} complétées</div>
              <div style={{display:'flex',gap:4}}>
                <button onClick={()=>setTodaySort('cat')} style={{...btnStyle(todaySort==='cat'?'#C8604A':'#FAF6F0',todaySort==='cat'?'#fff':'#9C8878'),fontSize:11,padding:'5px 10px'}}>Catégorie</button>
                <button onClick={()=>setTodaySort('freq')} style={{...btnStyle(todaySort==='freq'?'#C8604A':'#FAF6F0',todaySort==='freq'?'#fff':'#9C8878'),fontSize:11,padding:'5px 10px'}}>Fréquence</button>
              </div>
            </div>
            {visibleTodayTasks.length===0&&<div style={{...card,textAlign:'center',color:'#9C8878',fontSize:15,padding:30}}>Aucune tâche aujourd'hui 🎉</div>}
            {todaySort==='cat' ? (
              Object.entries(groupByKey(sortedTodayTasks,'cat')).map(([cat,catTasks])=>(
                <div key={cat}>
                  <div style={{fontSize:11,fontWeight:800,color:CAT_TX[cat]||'#9B7BB8',background:CAT_BG[cat]||'#F5F0FA',padding:'4px 12px',borderRadius:99,display:'inline-block',marginBottom:6,marginTop:4}}>{cat}</div>
                  {catTasks.map(task=>{
                    const comp=getComp(task.id,todayStr), done=!!comp, who=comp?getMember(comp.memberId):null;
                    return (
                      <div key={task.id} className="task-card" style={{...card,opacity:done?0.82:1,borderLeft:`4px solid ${task.color||'#C8604A'}`,display:'flex',alignItems:'center',gap:12}}>
                        <button className="chk" onClick={()=>openCheck(task.id)} style={{background:'none',border:'none',cursor:'pointer',padding:0,flexShrink:0}}>
                          {done?<CheckCircle size={27} color="#7BA68A" fill="#7BA68A"/>:<Circle size={27} color="#D4C4B0"/>}
                        </button>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:15,textDecoration:done?'line-through':'none',color:done?'#9C8878':'#3D2E1E'}}>{task.name}</div>
                          {task.notes&&<div style={{fontSize:11,color:'#9C8878',marginTop:2,fontStyle:'italic'}}>{task.notes}</div>}
                          <div style={{display:'flex',gap:6,marginTop:4,alignItems:'center',flexWrap:'wrap'}}>
                            <span style={{color:'#9C8878',fontSize:11,display:'flex',alignItems:'center',gap:2}}><Clock size={10}/>{task.est}min</span>
                            {done&&who&&<span style={{fontSize:12,fontWeight:800,color:who.color}}>{who.emoji} {who.name} · {comp.min}min</span>}
                          </div>
                        </div>
                        {!done&&<button onClick={()=>skipTask(task.id,todayStr)} title="Ignorer aujourd'hui" style={{background:'none',border:'none',cursor:'pointer',color:'#E88080',padding:4,fontWeight:900,fontSize:15}}>✕</button>}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              sortedTodayTasks.map(task=>{
                const comp=getComp(task.id,todayStr), done=!!comp, who=comp?getMember(comp.memberId):null;
                return (
                  <div key={task.id} className="task-card" style={{...card,opacity:done?0.82:1,borderLeft:`4px solid ${task.color||'#C8604A'}`,display:'flex',alignItems:'center',gap:12}}>
                    <button className="chk" onClick={()=>openCheck(task.id)} style={{background:'none',border:'none',cursor:'pointer',padding:0,flexShrink:0}}>
                      {done?<CheckCircle size={27} color="#7BA68A" fill="#7BA68A"/>:<Circle size={27} color="#D4C4B0"/>}
                    </button>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,textDecoration:done?'line-through':'none',color:done?'#9C8878':'#3D2E1E'}}>{task.name}</div>
                      {task.notes&&<div style={{fontSize:11,color:'#9C8878',marginTop:2,fontStyle:'italic'}}>{task.notes}</div>}
                      <div style={{display:'flex',gap:6,marginTop:4,alignItems:'center',flexWrap:'wrap'}}>
                        <span style={{background:CAT_BG[task.cat]||'#F5F0FA',color:CAT_TX[task.cat]||'#9B7BB8',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99}}>{task.cat}</span>
                        <span style={{color:'#9C8878',fontSize:11,display:'flex',alignItems:'center',gap:2}}><Clock size={10}/>{task.est}min</span>
                        {done&&who&&<span style={{fontSize:12,fontWeight:800,color:who.color}}>{who.emoji} {who.name} · {comp.min}min</span>}
                      </div>
                    </div>
                    {!done&&<button onClick={()=>skipTask(task.id,todayStr)} title="Ignorer aujourd'hui" style={{background:'none',border:'none',cursor:'pointer',color:'#E88080',padding:4,fontWeight:900,fontSize:15}}>✕</button>}
                  </div>
                );
              })
            )}
            {comps.filter(c=>c.date===todayStr&&c.skipped).length>0&&(
              <div style={{marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:800,color:'#9C8878',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>
                  Ignorées aujourd'hui
                </div>
                {comps.filter(c=>c.date===todayStr&&c.skipped).map(c=>{
                  const t=getTask(c.taskId);
                  if(!t) return null;
                  return (
                    <div key={c.id} style={{...card,display:'flex',alignItems:'center',gap:10,opacity:0.7,marginBottom:6,padding:'10px 14px'}}>
                      <span style={{flex:1,fontSize:13,color:'#9C8878',textDecoration:'line-through'}}>{t.name}</span>
                      <button onClick={()=>removeComp(c.id)} style={{...btnStyle('#FAF6F0','#7BA68A'),fontSize:11,padding:'5px 10px',border:'1.5px solid #7BA68A'}}>↩ Récupérer</button>
                    </div>
                  );
                })}
              </div>
            )}
            {overdueTasks.length>0&&(
              <div style={{marginTop:8}}>
                <div style={{fontSize:12,fontWeight:800,color:'#C8604A',textTransform:'uppercase',letterSpacing:1.5,marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                  🔴 En retard ({overdueTasks.length})
                </div>
                {overdueTasks.map(task=>(
                  <div key={task.id+task.overdueDate} className="task-card" style={{...card,borderLeft:'4px solid #C8604A',display:'flex',alignItems:'center',gap:12,opacity:0.9}}>
                    <button className="chk" onClick={()=>openCheck(task.id,task.overdueDate)} style={{background:'none',border:'none',cursor:'pointer',padding:0,flexShrink:0}}>
                      <Circle size={27} color="#C8604A"/>
                    </button>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:'#3D2E1E'}}>{task.name}</div>
                      <div style={{display:'flex',gap:6,marginTop:3,alignItems:'center',flexWrap:'wrap'}}>
                        <span style={{background:'#FFF0EB',color:'#C8604A',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99}}>
                          {task.daysAgo===1?'Hier':`Il y a ${task.daysAgo}j`}
                        </span>
                        <span style={{background:CAT_BG[task.cat]||'#F5F0FA',color:CAT_TX[task.cat]||'#9B7BB8',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99}}>{task.cat}</span>
                      </div>
                    </div>
                    <button onClick={()=>skipTask(task.id,task.overdueDate)} style={{background:'none',border:'none',cursor:'pointer',color:'#E88080',padding:4,fontWeight:900,fontSize:15}}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {doneCount===visibleTodayTasks.length&&visibleTodayTasks.length>0&&overdueTasks.length===0&&(
              <div style={{...card,background:'linear-gradient(135deg,#7BA68A,#5B8A7A)',color:'#fff',textAlign:'center',padding:28,borderLeft:'none'}}>
                <div style={{fontSize:32}}>🎉</div>
                <div style={{fontWeight:900,fontSize:17,marginTop:6}}>Tout est fait !</div>
                <div style={{fontSize:13,opacity:0.85,marginTop:4}}>Bravo à toute la famille</div>
              </div>
            )}
          </div>
        )}

        {tab==='calendar' && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <button onClick={()=>setWkOff(w=>w-1)} style={{...btnStyle('#fff','#3D2E1E'),padding:'6px 10px'}}><ChevronLeft size={16}/></button>
              <div style={{fontWeight:800,fontSize:14}}>{weekDates[0].getDate()} {MO[weekDates[0].getMonth()]} – {weekDates[6].getDate()} {MO[weekDates[6].getMonth()]} {weekDates[6].getFullYear()}</div>
              <button onClick={()=>setWkOff(w=>w+1)} style={{...btnStyle('#fff','#3D2E1E'),padding:'6px 10px'}}><ChevronRight size={16}/></button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:6}}>
              {DS.map((d,i)=><div key={i} style={{textAlign:'center',fontSize:10,fontWeight:800,color:'#9C8878',textTransform:'uppercase'}}>{d}</div>)}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:16}}>
              {weekDates.map((date,i)=>{
                const ds=fmt(date), isToday=ds===todayStr;
                const dayTasks=tasks.filter(t=>isDue(t,date));
                const dayComps=comps.filter(c=>c.date===ds);
                return (
                  <div key={i} style={{background:isToday?'#FFF0EB':'#fff',borderRadius:10,padding:'6px 3px',border:`2px solid ${isToday?'#C8604A':'transparent'}`,minHeight:72}}>
                    <div style={{textAlign:'center',fontWeight:800,fontSize:13,color:isToday?'#C8604A':'#3D2E1E',marginBottom:3}}>{date.getDate()}</div>
                    {dayTasks.slice(0,4).map(t=>{
                      const c=dayComps.find(c=>c.taskId===t.id), who=c?getMember(c.memberId):null;
                      return (
                        <div key={t.id} style={{background:c?'#EDF7F1':'#F5F0FA',borderRadius:3,padding:'1px 3px',fontSize:8,fontWeight:700,color:c?'#7BA68A':'#9C8878',marginBottom:1,overflow:'hidden',display:'flex',alignItems:'center',gap:1}}>
                          {c&&<span>{who?.emoji}</span>}
                          <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                        </div>
                      );
                    })}
                    {dayTasks.length>4&&<div style={{fontSize:8,color:'#9C8878',textAlign:'center'}}>+{dayTasks.length-4}</div>}
                  </div>
                );
              })}
            </div>
            {DF.map((dayName,i)=>{
              const date=weekDates[i], ds=fmt(date);
              const dayTasks=tasks.filter(t=>isDue(t,date));
              if(!dayTasks.length) return null;
              const isToday=ds===todayStr;
              return (
                <div key={i} style={{marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:800,color:isToday?'#C8604A':'#9C8878',textTransform:'uppercase',letterSpacing:1,marginBottom:5,display:'flex',alignItems:'center',gap:6}}>
                    {isToday&&<span style={{background:'#C8604A',color:'#fff',fontSize:9,padding:'1px 6px',borderRadius:99}}>AUJOURD'HUI</span>}
                    {dayName} {date.getDate()}
                  </div>
                  {dayTasks.map(t=>{
                    const c=getComp(t.id,ds), who=c?getMember(c.memberId):null;
                    return (
                      <div key={t.id} style={{...card,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:c?'#7BA68A':'#D4C4B0',flexShrink:0}}/>
                        <span style={{flex:1,fontSize:13,fontWeight:600,color:c?'#9C8878':'#3D2E1E',textDecoration:c?'line-through':'none'}}>{t.name}</span>
                        {who&&<span style={{fontSize:12,fontWeight:800,color:who.color}}>{who.emoji} {who.name}</span>}
                        {c&&<span style={{fontSize:11,color:'#9C8878'}}>{c.min}min</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {tab==='tasks' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <button onClick={()=>{setEditTask(null);setNt({name:'',cat:'',freq:'daily',days:[],dom:1,month:0,est:'',notes:''});setShowAddTask(true);}} style={{...btnStyle(),display:'flex',alignItems:'center',gap:6,padding:'10px 14px',fontSize:13}}>
                <Plus size={15}/>Ajouter
              </button>
              <div style={{display:'flex',gap:4}}>
                <button onClick={()=>setTaskSort('freq')} style={{...btnStyle(taskSort==='freq'?'#C8604A':'#FAF6F0',taskSort==='freq'?'#fff':'#9C8878'),fontSize:11,padding:'5px 10px'}}>Fréquence</button>
                <button onClick={()=>setTaskSort('cat')} style={{...btnStyle(taskSort==='cat'?'#C8604A':'#FAF6F0',taskSort==='cat'?'#fff':'#9C8878'),fontSize:11,padding:'5px 10px'}}>Catégorie</button>
              </div>
            </div>
            {taskSort==='freq' ? (
              Object.entries(groupByKey(sortedTasks,'freq')).map(([freq,freqTasks])=>(
                <div key={freq}>
                  <div style={{fontSize:11,fontWeight:800,color:'#9B7BB8',background:'#F5F0FA',padding:'4px 12px',borderRadius:99,display:'inline-block',marginBottom:6,marginTop:4}}>{FREQ[freq]||freq}</div>
                  {freqTasks.map(t=>(
                    <div key={t.id} className="task-card" style={{...card,display:'flex',alignItems:'center',gap:12,borderLeft:`4px solid ${t.color||'#C8604A'}`}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:14}}>{t.name}</div>
                        {t.notes&&<div style={{fontSize:11,color:'#9C8878',marginTop:2,fontStyle:'italic',display:'flex',alignItems:'center',gap:4}}><FileText size={10}/>{t.notes}</div>}
                        <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap',alignItems:'center'}}>
                          {(t.freq==='weekly'||t.freq==='biweekly')&&<span style={{fontSize:11,color:'#9C8878'}}>{t.days.map(d=>DS[d]).join(', ')}</span>}
                          {['monthly','quarterly','biannual'].includes(t.freq)&&<span style={{fontSize:11,color:'#9C8878'}}>le {t.dom}</span>}
                          {t.freq==='yearly'&&<span style={{fontSize:11,color:'#9C8878'}}>{t.dom} {MO[t.month||0]}</span>}
                          <span style={{fontSize:11,color:'#9C8878',display:'flex',alignItems:'center',gap:2}}><Clock size={10}/>~{t.est}min</span>
                          <span style={{background:CAT_BG[t.cat]||'#F5F0FA',color:CAT_TX[t.cat]||'#9B7BB8',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99}}>{t.cat}</span>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        <button onClick={()=>{setEditTask(t);setNt({name:t.name,cat:t.cat,freq:t.freq,days:t.days||[],dom:t.dom||1,month:t.month||0,est:t.est||15,notes:t.notes||''});setShowAddTask(true);}} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,padding:4}}>✏️</button>
                        <button onClick={()=>deleteDoc(doc(db,'tasks',t.id))} style={{background:'none',border:'none',cursor:'pointer',color:'#D4C4B0',padding:4}}><Trash2 size={15}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              Object.entries(groupByKey(sortedTasks,'cat')).map(([cat,catTasks])=>(
                <div key={cat}>
                  <div style={{fontSize:11,fontWeight:800,color:CAT_TX[cat]||'#9B7BB8',background:CAT_BG[cat]||'#F5F0FA',padding:'4px 12px',borderRadius:99,display:'inline-block',marginBottom:6,marginTop:4}}>{cat}</div>
                  {catTasks.map(t=>(
                    <div key={t.id} className="task-card" style={{...card,display:'flex',alignItems:'center',gap:12,borderLeft:`4px solid ${t.color||'#C8604A'}`}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:14}}>{t.name}</div>
                        {t.notes&&<div style={{fontSize:11,color:'#9C8878',marginTop:2,fontStyle:'italic',display:'flex',alignItems:'center',gap:4}}><FileText size={10}/>{t.notes}</div>}
                        <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap',alignItems:'center'}}>
                          <span style={{background:'#F5F0FA',color:'#9B7BB8',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99}}>{FREQ[t.freq]}</span>
                          <span style={{fontSize:11,color:'#9C8878',display:'flex',alignItems:'center',gap:2}}><Clock size={10}/>~{t.est}min</span>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        <button onClick={()=>{setEditTask(t);setNt({name:t.name,cat:t.cat,freq:t.freq,days:t.days||[],dom:t.dom||1,month:t.month||0,est:t.est||15,notes:t.notes||''});setShowAddTask(true);}} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,padding:4}}>✏️</button>
                        <button onClick={()=>deleteDoc(doc(db,'tasks',t.id))} style={{background:'none',border:'none',cursor:'pointer',color:'#D4C4B0',padding:4}}><Trash2 size={15}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {tab==='stats' && (
          <div>
            <div style={{display:'flex',gap:6,marginBottom:14}}>
              {[['person','Personnes'],['task','Tâches'],['week','Semaines']].map(([m,l])=>(
                <button key={m} onClick={()=>setStatMode(m)} style={{...btnStyle(statMode===m?'#C8604A':'#fff',statMode===m?'#fff':'#9C8878'),flex:1,fontSize:12,padding:'8px 4px'}}>{l}</button>
              ))}
            </div>
            {statMode==='person'&&(
              <div>
                <div style={card}>
                  <div style={{fontWeight:800,marginBottom:12,fontSize:14}}>⏱ Temps total — 4 dernières semaines</div>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={stats.byPerson} margin={{top:0,right:0,bottom:0,left:-25}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0E8DC"/>
                      <XAxis dataKey="name" tick={{fontSize:12}}/>
                      <YAxis tick={{fontSize:10}} unit="m"/>
                      <Tooltip formatter={v=>[`${v} min`,'Temps']}/>
                      <Bar dataKey="minutes" radius={[6,6,0,0]}>{stats.byPerson.map((p,i)=><Cell key={i} fill={p.color}/>)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={card}>
                  <div style={{fontWeight:800,marginBottom:14,fontSize:14}}>🏆 Classement</div>
                  {[...stats.byPerson].sort((a,b)=>b.minutes-a.minutes).map((p,i)=>{
                    const max=Math.max(...stats.byPerson.map(x=>x.minutes))||1;
                    const medal=['🥇','🥈','🥉'][i]||`${i+1}.`;
                    return (
                      <div key={p.name} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                        <div style={{width:28,textAlign:'center',fontSize:18}}>{medal}</div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
                          <div style={{background:'#F0E8DC',borderRadius:99,height:7,marginTop:4,overflow:'hidden'}}>
                            <div style={{width:`${p.minutes/max*100}%`,background:p.color,height:'100%',borderRadius:99}}/>
                          </div>
                        </div>
                        <div style={{fontWeight:900,color:p.color,fontSize:14}}>{Math.floor(p.minutes/60)}h{p.minutes%60?`${p.minutes%60}m`:''}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {statMode==='task'&&(
              <div style={card}>
                <div style={{fontWeight:800,marginBottom:12,fontSize:14}}>🧹 Temps par tâche</div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.byTask} layout="vertical" margin={{top:0,right:30,bottom:0,left:70}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E8DC"/>
                    <XAxis type="number" tick={{fontSize:10}} unit="m"/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:11}} width={70}/>
                    <Tooltip formatter={v=>[`${v} min`,'Temps']}/>
                    <Bar dataKey="minutes" radius={[0,6,6,0]}>{stats.byTask.map((t,i)=><Cell key={i} fill={t.color||PALETTE[i%PALETTE.length]}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {statMode==='week'&&(
              <div style={card}>
                <div style={{fontWeight:800,marginBottom:12,fontSize:14}}>📈 Évolution hebdomadaire</div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={stats.byWeek} margin={{top:0,right:10,bottom:0,left:-20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E8DC"/>
                    <XAxis dataKey="label" tick={{fontSize:12}}/>
                    <YAxis tick={{fontSize:10}} unit="m"/>
                    <Tooltip formatter={v=>[`${v} min`]}/>
                    <Legend/>
                    {members.map(m=>(<Line key={m.id} type="monotone" dataKey={m.name} stroke={m.color} strokeWidth={2.5} dot={{r:4,fill:m.color}}/>))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {tab==='family'&&(
          <div>
            <button onClick={()=>setShowAddMember(true)} style={{...btnStyle(),width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'12px',marginBottom:14,fontSize:14}}>
              <Plus size={17}/>Ajouter un membre
            </button>
            {members.map(m=>{
              const mComps=comps.filter(c=>c.memberId===m.id);
              const totalMin=mComps.reduce((s,c)=>s+c.min,0);
              const thisWeek=mComps.filter(c=>(today-new Date(c.date))/864e5<=7);
              return (
                <div key={m.id} className="task-card" style={{...card,borderLeft:`4px solid ${m.color}`,display:'flex',alignItems:'center',gap:14}}>
                  <div style={{width:48,height:48,borderRadius:'50%',background:m.color+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26}}>{m.emoji}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:16,color:m.color}}>{m.name}</div>
                    <div style={{fontSize:12,color:'#9C8878',marginTop:2}}>{mComps.length} tâches · {Math.floor(totalMin/60)}h{totalMin%60?` ${totalMin%60}min`:''}</div>
                    <div style={{fontSize:11,color:'#9C8878'}}>Cette semaine : {thisWeek.length} tâches</div>
                  </div>
                  {members.length>1&&<button onClick={()=>deleteDoc(doc(db,'members',m.id))} style={{background:'none',border:'none',cursor:'pointer',color:'#D4C4B0',padding:4}}><Trash2 size={15}/></button>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,background:'#fff',borderTop:'1px solid #F0E8DC',display:'flex',boxShadow:'0 -4px 24px rgba(61,46,30,0.08)',zIndex:100}}>
        {TABS.map(t=>(
          <button key={t.id} className="tab-btn" onClick={()=>setTab(t.id)} style={{flex:1,border:'none',background:'none',cursor:'pointer',padding:'10px 4px 14px',display:'flex',flexDirection:'column',alignItems:'center',gap:3,color:tab===t.id?'#C8604A':'#9C8878',fontFamily:'Nunito',fontWeight:tab===t.id?800:600,fontSize:9.5}}>
            {t.icon}
            <span>{t.label}</span>
            {tab===t.id&&<div style={{width:18,height:3,background:'#C8604A',borderRadius:99,marginTop:1}}/>}
          </button>
        ))}
      </div>

      {checkModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(61,46,30,0.5)',display:'flex',alignItems:'flex-end',zIndex:200}} onClick={e=>e.target===e.currentTarget&&setCheckModal(null)}>
          <div style={{background:'#fff',borderRadius:'22px 22px 0 0',padding:'26px 20px 36px',width:'100%',maxWidth:480,margin:'0 auto'}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:20,marginBottom:4}}>{getTask(checkModal.taskId)?.name}</div>
            {getTask(checkModal.taskId)?.notes&&(
              <div style={{background:'#FAF6F0',borderRadius:10,padding:'8px 12px',marginBottom:12,fontSize:12,color:'#9C8878',fontStyle:'italic'}}>
                📋 {getTask(checkModal.taskId).notes}
              </div>
            )}
            <div style={{color:'#9C8878',fontSize:13,marginBottom:10}}>Qui a réalisé cette tâche ?</div>
            {getComps(checkModal.taskId,checkModal.date).length>0&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:800,color:'#9C8878',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Déjà enregistré</div>
                {getComps(checkModal.taskId,checkModal.date).map(c=>{
                  const who=getMember(c.memberId);
                  return who?(
                    <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,background:'#EDF7F1',borderRadius:10,padding:'8px 12px',marginBottom:6}}>
                      <span style={{fontSize:16}}>{who.emoji}</span>
                      <span style={{fontWeight:700,color:who.color,flex:1}}>{who.name}</span>
                      <span style={{fontSize:12,color:'#9C8878'}}>{c.min} min</span>
                      <button onClick={()=>removeComp(c.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#E88080',fontWeight:900,fontSize:14,padding:'2px 6px'}}>✕</button>
                    </div>
                  ):null;
                })}
              </div>
            )}
            <div style={{fontSize:11,fontWeight:800,color:'#9C8878',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Ajouter une participation</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
              {members.map(m=>(<button key={m.id} onClick={()=>setSelMember(m.id)} style={{...btnStyle(selMember===m.id?m.color:'#FAF6F0',selMember===m.id?'#fff':m.color),padding:'9px 16px',display:'flex',alignItems:'center',gap:6,border:`2px solid ${m.color}`}}>{m.emoji} {m.name}</button>))}
            </div>
            <div style={{marginBottom:22}}>
              <label style={{fontSize:12,fontWeight:800,color:'#9C8878',display:'block',marginBottom:6}}>TEMPS RÉELLEMENT PASSÉ</label>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <input type="number" value={timeVal} onChange={e=>setTimeVal(e.target.value)} style={{...inp,width:100}} min={1} max={300}/>
                <span style={{color:'#9C8878',fontSize:14,fontWeight:600}}>minutes</span>
              </div>
              <div style={{fontSize:11,color:'#D4C4B0',marginTop:4}}>Estimation : {getTask(checkModal.taskId)?.est||15} min</div>
            </div>
            <button onClick={confirmCheck} disabled={!selMember} style={{...btnStyle(),width:'100%',padding:'14px',fontSize:15,opacity:selMember?1:0.45}}>✓ Confirmer</button>
          </div>
        </div>
      )}

      {showAddTask&&(
        <div style={{position:'fixed',inset:0,background:'rgba(61,46,30,0.5)',display:'flex',alignItems:'flex-end',zIndex:200}} onClick={e=>e.target===e.currentTarget&&setShowAddTask(false)}>
          <div style={{background:'#fff',borderRadius:'22px 22px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:480,margin:'0 auto',maxHeight:'88vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:20}}>{editTask?'Modifier la tâche':'Nouvelle tâche'}</div>
              <button onClick={()=>{setShowAddTask(false);setEditTask(null);setNt({name:'',cat:'',freq:'daily',days:[],dom:1,month:0,est:'',notes:''});}} style={{background:'none',border:'none',cursor:'pointer',color:'#9C8878'}}><X size={20}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>NOM</label>
                <input style={inp} value={nt.name} onChange={e=>setNt(p=>({...p,name:e.target.value}))} placeholder="Ex: Faire les vitres"/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>NOTES (optionnel)</label>
                <textarea style={{...inp,resize:'vertical',minHeight:60}} value={nt.notes} onChange={e=>setNt(p=>({...p,notes:e.target.value}))} placeholder="Ex: Utiliser le produit vert sous l'évier…"/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>CATÉGORIE</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                  {cats.map(c=>(
                    <button key={c} onClick={()=>setNt(p=>({...p,cat:c}))} style={{...btnStyle(nt.cat===c?'#C8604A':'#FAF6F0',nt.cat===c?'#fff':'#9C8878'),fontSize:12,padding:'7px 12px',borderRadius:99}}>
                      {c}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',gap:6}}>
                  <input style={{...inp,flex:1}} value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Nouvelle catégorie…" onKeyDown={e=>{if(e.key==='Enter'&&newCat.trim()){setCats(p=>[...p,newCat.trim()]);setNt(p=>({...p,cat:newCat.trim()}));setNewCat('');}}}/>
                  <button onClick={()=>{if(newCat.trim()){setCats(p=>[...p,newCat.trim()]);setNt(p=>({...p,cat:newCat.trim()}));setNewCat('');}}} style={{...btnStyle(),padding:'9px 14px',flexShrink:0}}>+</button>
                </div>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>FRÉQUENCE</label>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                  {Object.entries(FREQ).map(([f,label])=>(<button key={f} onClick={()=>setNt(p=>({...p,freq:f}))} style={{...btnStyle(nt.freq===f?'#C8604A':'#FAF6F0',nt.freq===f?'#fff':'#9C8878'),fontSize:12,padding:'9px 4px',textAlign:'center'}}>{label}</button>))}
                </div>
              </div>
              {(nt.freq==='weekly'||nt.freq==='biweekly')&&(
                <div>
                  <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>{nt.freq==='biweekly'?'JOUR (toutes les 2 semaines)':'JOURS'}</label>
                  <div style={{display:'flex',gap:4}}>
                    {DS.map((d,i)=>(<button key={i} onClick={()=>setNt(p=>({...p,days:nt.freq==='biweekly'?[i]:p.days.includes(i)?p.days.filter(x=>x!==i):[...p.days,i]}))} style={{...btnStyle(nt.days.includes(i)?'#C8604A':'#FAF6F0',nt.days.includes(i)?'#fff':'#9C8878'),flex:1,padding:'7px 2px',fontSize:11}}>{d}</button>))}
                  </div>
                </div>
              )}
              {['monthly','quarterly','biannual','yearly'].includes(nt.freq)&&(
                <div>
                  <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>{nt.freq==='quarterly'?'JOUR (jan, avr, jul, oct)':nt.freq==='biannual'?'JOUR (jan & jul)':nt.freq==='yearly'?'JOUR':'JOUR DU MOIS'}</label>
                  <input type="number" style={{...inp,width:90}} value={nt.dom} onChange={e=>setNt(p=>({...p,dom:parseInt(e.target.value)||1}))} min={1} max={31}/>
                </div>
              )}
              {nt.freq==='yearly'&&(
                <div>
                  <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>MOIS</label>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
                    {MO.map((m,i)=>(<button key={i} onClick={()=>setNt(p=>({...p,month:i}))} style={{...btnStyle(nt.month===i?'#C8604A':'#FAF6F0',nt.month===i?'#fff':'#9C8878'),fontSize:12,padding:'7px 2px'}}>{m}</button>))}
                  </div>
                </div>
              )}
              <div>
                <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>DURÉE ESTIMÉE (minutes)</label>
                <input type="number" style={{...inp,width:100}} value={nt.est} onChange={e=>setNt(p=>({...p,est:e.target.value}))} onBlur={e=>setNt(p=>({...p,est:parseInt(e.target.value)||15}))} placeholder="ex: 20" min={1}/>
              </div>
              <button onClick={doAddTask} style={{...btnStyle(),width:'100%',padding:'14px',fontSize:15,marginTop:6}}>{editTask?'✏️ Modifier la tâche':'+ Créer la tâche'}</button>
            </div>
          </div>
        </div>
      )}

      {showAddMember&&(
        <div style={{position:'fixed',inset:0,background:'rgba(61,46,30,0.5)',display:'flex',alignItems:'flex-end',zIndex:200}} onClick={e=>e.target===e.currentTarget&&setShowAddMember(false)}>
          <div style={{background:'#fff',borderRadius:'22px 22px 0 0',padding:'24px 20px 36px',width:'100%',maxWidth:480,margin:'0 auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:20}}>Nouveau membre</div>
              <button onClick={()=>setShowAddMember(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#9C8878'}}><X size={20}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>PRÉNOM</label>
                <input style={inp} value={nm.name} onChange={e=>setNm(p=>({...p,name:e.target.value}))} placeholder="Ex: Papa"/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:800,color:'#9C8878',display:'block',marginBottom:5,letterSpacing:1}}>EMOJI</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {['👩','👨','👧','🧒','👶','🧑','👵','👴','🐶'].map(e=>(<button key={e} onClick={()=>setNm(p=>({...p,emoji:e}))} style={{fontSize:22,background:nm.emoji===e?'#FFF0EB':'#FAF6F0',border:`2px solid ${nm.emoji===e?'#C8604A':'transparent'}`,borderRadius:8,padding:5,cursor:'pointer'}}>{e}</button>))}
                </div>
              </div>
              <button onClick={doAddMember} style={{...btnStyle(),width:'100%',padding:'14px',fontSize:15,marginTop:6}}>+ Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}