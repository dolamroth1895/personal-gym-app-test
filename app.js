/* ===================== ESTADO Y PERSISTENCIA ===================== */
const DAY_LABELS = ['D','L','M','X','J','V','S']; // JS getDay(): 0=Domingo
const DAY_NAMES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

function loadState(){
  try{
    return JSON.parse(localStorage.getItem('forja_state')) || {exercises:[],routines:[],sessions:[]};
  }catch(e){ return {exercises:[],routines:[],sessions:[]}; }
}
let state = loadState();
function save(){ localStorage.setItem('forja_state', JSON.stringify(state)); }

/* ===================== ALGORITMO SOBRECARGA PROGRESIVA ===================== */
function roundStep(value, step){
  return Math.max(0, Math.round(value/step)*step);
}
// Devuelve {action, newWeight, completion, avgRpe}
function computeAdjustment(entry, increment){
  const sets = entry.sets;
  let targetTotal = 0, actualTotal = 0, rpeSum=0, rpeCount=0;
  sets.forEach(s=>{
    targetTotal += s.targetReps;
    actualTotal += (Number(s.reps)||0);
    if(s.rpe!==null && s.rpe!==undefined && s.rpe!==''){ rpeSum += Number(s.rpe); rpeCount++; }
  });
  const completion = targetTotal>0 ? actualTotal/targetTotal : 0;
  const avgRpe = rpeCount>0 ? rpeSum/rpeCount : null;
  const lastWeight = sets.length ? Number(sets[sets.length-1].weight)||entry.prevWeight : entry.prevWeight;
  let action, newWeight;
  if(completion >= 1){
    if(avgRpe===null || avgRpe<=8){ action='up'; newWeight = lastWeight + increment; }
    else { action='same'; newWeight = lastWeight; }
  } else if(completion >= 0.8){
    action='same'; newWeight = lastWeight;
  } else {
    action='down'; newWeight = roundStep(lastWeight*0.9, increment<2.5?increment:1.25);
  }
  return {action, newWeight: roundStep(newWeight, increment<2.5?increment:1.25), completion, avgRpe};
}

/* ===================== NAVEGACIÓN ===================== */
let currentView = 'hoy';
let activeSession = null; // sesión en curso (no guardada aún)

const app = document.getElementById('app');
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(activeSession && !confirm('Tienes una sesión en curso. ¿Salir sin guardar?')) return;
    activeSession = null;
    setView(btn.dataset.view);
  });
});
function setView(v){
  currentView = v;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  render();
}
document.getElementById('topDate').textContent =
  new Date().toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'long'});

/* ===================== RENDER PRINCIPAL ===================== */
function render(){
  if(activeSession){ app.innerHTML = renderSessionView(); attachSessionEvents(); return; }
  if(currentView==='hoy') { app.innerHTML = renderHoy(); attachHoyEvents(); }
  else if(currentView==='rutinas'){ app.innerHTML = renderRutinas(); attachRutinasEvents(); }
  else if(currentView==='historial'){ app.innerHTML = renderHistorial(); attachHistorialEvents(); }
  else if(currentView==='ajustes'){ app.innerHTML = renderAjustes(); attachAjustesEvents(); }
}

/* ===================== VISTA: HOY ===================== */
function renderHoy(){
  const todayIdx = new Date().getDay();
  const candidatas = state.routines.filter(r=>r.days.includes(todayIdx));
  if(state.routines.length===0){
    return `<h1 class="page-title">Hoy · ${DAY_NAMES[todayIdx]}</h1>
      <div class="empty"><div class="glyph">🏋️</div>Aún no tienes rutinas.<br>Crea una en la pestaña Rutinas.</div>`;
  }
  if(candidatas.length===0){
    return `<h1 class="page-title">Hoy · ${DAY_NAMES[todayIdx]}</h1>
      <div class="empty"><div class="glyph">☕</div>No hay rutina asignada a hoy.<br>Descanso, o elige una manualmente.</div>
      <div class="stack">${state.routines.map(r=>routinePickCard(r)).join('')}</div>`;
  }
  return `<h1 class="page-title">Hoy · ${DAY_NAMES[todayIdx]}</h1>
    <div class="stack">${candidatas.map(r=>routinePickCard(r)).join('')}</div>`;
}
function routinePickCard(r){
  return `<div class="card">
    <div class="card-title">${r.name}</div>
    <div class="card-sub">${r.exercises.length} ejercicios</div>
    <button class="btn full" data-start="${r.id}">Empezar sesión</button>
  </div>`;
}
function attachHoyEvents(){
  app.querySelectorAll('[data-start]').forEach(b=>{
    b.addEventListener('click', ()=> startSession(b.dataset.start));
  });
}

function startSession(routineId){
  const routine = state.routines.find(r=>r.id===routineId);
  if(!routine) return;
  activeSession = {
    routineId: routine.id,
    routineName: routine.name,
    date: new Date().toISOString(),
    entries: routine.exercises.map(ex=>{
      const exo = state.exercises.find(e=>e.id===ex.exerciseId);
      return {
        exerciseId: ex.exerciseId,
        name: exo ? exo.name : '(ejercicio eliminado)',
        increment: exo ? exo.increment : 2.5,
        prevWeight: ex.weight,
        repsMin: ex.repsMin, repsMax: ex.repsMax,
        sets: Array.from({length: ex.sets}, ()=>({targetReps: ex.repsMax, reps:'', weight: ex.weight, rpe:''}))
      };
    })
  };
  render();
}

/* ===================== VISTA: SESIÓN ACTIVA ===================== */
function renderSessionView(){
  const blocks = activeSession.entries.map((e, ei)=>{
    const header = `<div class="set-header">
      <div></div><div class="field-label">Reps</div><div class="field-label">Kg</div><div class="field-label">RPE</div>
    </div>`;
    const rows = e.sets.map((s,si)=>`
      <div class="set-row">
        <div class="set-idx">${si+1}</div>
        <input type="number" inputmode="numeric" placeholder="${s.targetReps}" value="${s.reps}" data-ei="${ei}" data-si="${si}" data-f="reps">
        <input type="number" inputmode="decimal" step="0.5" value="${s.weight}" data-ei="${ei}" data-si="${si}" data-f="weight">
        <input type="number" inputmode="numeric" min="1" max="10" placeholder="–" value="${s.rpe}" data-ei="${ei}" data-si="${si}" data-f="rpe">
      </div>`).join('');
    return `<div class="exercise-block">
      <div class="ex-name">${e.name}</div>
      <div class="ex-meta">Objetivo: ${e.sets.length}×${e.repsMin===e.repsMax?e.repsMax:e.repsMin+'-'+e.repsMax} · último peso ${e.prevWeight}kg</div>
      ${header}${rows}
    </div>`;
  }).join('');
  return `<h1 class="page-title">${activeSession.routineName}</h1>
    <div class="card">${blocks}</div>
    <button class="btn full" id="finishSession">Finalizar sesión</button>
    <button class="btn secondary full" id="cancelSession" style="margin-top:8px;">Cancelar</button>`;
}
function attachSessionEvents(){
  app.querySelectorAll('input[data-f]').forEach(inp=>{
    inp.addEventListener('input', e=>{
      const {ei,si,f} = e.target.dataset;
      activeSession.entries[ei].sets[si][f] = e.target.value;
    });
  });
  document.getElementById('cancelSession').addEventListener('click', ()=>{
    if(confirm('¿Descartar esta sesión?')){ activeSession=null; render(); }
  });
  document.getElementById('finishSession').addEventListener('click', finishSession);
}
function finishSession(){
  const routine = state.routines.find(r=>r.id===activeSession.routineId);
  const results = [];
  activeSession.entries.forEach(entry=>{
    const adj = computeAdjustment(entry, entry.increment);
    results.push({name: entry.name, ...adj, prevWeight: entry.prevWeight});
    if(routine){
      const rex = routine.exercises.find(x=>x.exerciseId===entry.exerciseId);
      if(rex) rex.weight = adj.newWeight;
    }
  });
  const session = {
    id: uid(), date: activeSession.date,
    routineId: activeSession.routineId, routineName: activeSession.routineName,
    entries: activeSession.entries.map((e,i)=>({
      exerciseId:e.exerciseId, name:e.name, sets:e.sets,
      prevWeight:e.prevWeight, newWeight: results[i].newWeight,
      completion: results[i].completion, action: results[i].action, avgRpe: results[i].avgRpe
    }))
  };
  state.sessions.unshift(session);
  save();
  activeSession = null;
  showSummary(session);
}
function showSummary(session){
  const rows = session.entries.map(e=>{
    const diff = (e.newWeight - e.prevWeight);
    const cls = diff>0?'up':diff<0?'down':'flat';
    const arrow = diff>0?'▲':diff<0?'▼':'●';
    return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);">
      <div>${e.name}<div class="ex-meta">${Math.round(e.completion*100)}% completado${e.avgRpe?' · RPE '+e.avgRpe.toFixed(1):''}</div></div>
      <div class="trend ${cls}">${arrow} ${e.prevWeight}→${e.newWeight}kg</div>
    </div>`;
  }).join('');
  app.innerHTML = `<h1 class="page-title">Sesión guardada</h1>
    <div class="card">${rows}</div>
    <button class="btn full" id="backHome">Volver a Hoy</button>`;
  document.getElementById('backHome').addEventListener('click', ()=> setView('hoy'));
}

/* ===================== VISTA: RUTINAS ===================== */
function renderRutinas(){
  const list = state.routines.map(r=>`
    <div class="card">
      <div class="row">
        <div>
          <div class="card-title">${r.name}</div>
          <div class="card-sub">${r.days.map(d=>DAY_LABELS[d]).join(' ')} · ${r.exercises.length} ejercicios</div>
        </div>
        <div class="row" style="gap:4px;">
          <button class="icon-btn" data-edit="${r.id}">✎</button>
          <button class="icon-btn" data-del="${r.id}">🗑</button>
        </div>
      </div>
    </div>`).join('');
  return `<h1 class="page-title">Rutinas</h1>
    ${state.routines.length? `<div class="stack">${list}</div>` : `<div class="empty"><div class="glyph">📋</div>No hay rutinas creadas.</div>`}
    <button class="btn full" id="newRoutine" style="margin-top:14px;">+ Nueva rutina</button>`;
}
function attachRutinasEvents(){
  document.getElementById('newRoutine').addEventListener('click', ()=> openRoutineEditor(null));
  app.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=> openRoutineEditor(b.dataset.edit)));
  app.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
    if(confirm('¿Eliminar esta rutina?')){
      state.routines = state.routines.filter(r=>r.id!==b.dataset.del);
      save(); render();
    }
  }));
}

/* --- Editor de rutina (modal) --- */
let editorDraft = null;
function openRoutineEditor(routineId){
  const existing = routineId ? state.routines.find(r=>r.id===routineId) : null;
  editorDraft = existing ? JSON.parse(JSON.stringify(existing)) : {id:uid(), name:'', days:[], exercises:[]};
  renderModal(routineEditorHTML(), attachRoutineEditorEvents);
}
function routineEditorHTML(){
  const dayChips = DAY_LABELS.map((l,i)=>
    `<div class="chip ${editorDraft.days.includes(i)?'on':''}" data-day="${i}">${l}</div>`).join('');
  const exList = editorDraft.exercises.map((ex,i)=>{
    const exo = state.exercises.find(e=>e.id===ex.exerciseId);
    return `<div class="card" style="padding:12px;">
      <div class="row">
        <b>${exo?exo.name:'?'}</b>
        <button class="icon-btn" data-rmex="${i}">✕</button>
      </div>
      <div class="ex-meta">${ex.sets} series × ${ex.repsMin===ex.repsMax?ex.repsMax:ex.repsMin+'-'+ex.repsMax} reps · inicio ${ex.weight}kg</div>
    </div>`;
  }).join('');
  return `
    <h2>${editorDraft.name?'Editar rutina':'Nueva rutina'}</h2>
    <label class="field"><span>Nombre</span><input type="text" id="rname" value="${editorDraft.name}" placeholder="Ej. Push A"></label>
    <label class="field"><span>Días de la semana</span><div class="chip-list">${dayChips}</div></label>
    <div class="divider"></div>
    <label class="field"><span>Ejercicios</span></label>
    <div class="stack">${exList || '<div class="ex-meta">Ningún ejercicio añadido.</div>'}</div>
    <button class="btn secondary full" id="addExToRoutine" style="margin-top:10px;">+ Añadir ejercicio</button>
    <div class="divider"></div>
    <button class="btn full" id="saveRoutine">Guardar rutina</button>
    <button class="btn ghost full" id="closeModal" style="margin-top:8px;">Cancelar</button>
  `;
}
function attachRoutineEditorEvents(){
  document.getElementById('rname').addEventListener('input', e=> editorDraft.name = e.target.value);
  document.querySelectorAll('[data-day]').forEach(c=>c.addEventListener('click', ()=>{
    const d = Number(c.dataset.day);
    editorDraft.days = editorDraft.days.includes(d) ? editorDraft.days.filter(x=>x!==d) : [...editorDraft.days,d];
    updateModal(routineEditorHTML(), attachRoutineEditorEvents);
  }));
  document.querySelectorAll('[data-rmex]').forEach(b=>b.addEventListener('click', ()=>{
    editorDraft.exercises.splice(Number(b.dataset.rmex),1);
    updateModal(routineEditorHTML(), attachRoutineEditorEvents);
  }));
  document.getElementById('addExToRoutine').addEventListener('click', openExercisePicker);
  document.getElementById('saveRoutine').addEventListener('click', ()=>{
    if(!editorDraft.name.trim()){ alert('Ponle un nombre a la rutina'); return; }
    if(editorDraft.days.length===0){ alert('Elige al menos un día'); return; }
    const idx = state.routines.findIndex(r=>r.id===editorDraft.id);
    if(idx>=0) state.routines[idx] = editorDraft; else state.routines.push(editorDraft);
    save(); closeModal(); render();
  });
  document.getElementById('closeModal').addEventListener('click', closeModal);
}

/* --- Selector / creador de ejercicio dentro de una rutina --- */
function openExercisePicker(){
  renderModal(exercisePickerHTML(), attachExercisePickerEvents, true);
}
function exercisePickerHTML(){
  const items = state.exercises.map(ex=>
    `<div class="chip" data-pick="${ex.id}">${ex.name}</div>`).join('');
  return `
    <h2>Añadir ejercicio</h2>
    <div class="chip-list">${items || '<span class="ex-meta">No hay ejercicios aún.</span>'}</div>
    <div class="divider"></div>
    <div class="card-sub">Crear ejercicio nuevo</div>
    <label class="field"><span>Nombre</span><input type="text" id="newExName" placeholder="Ej. Press banca"></label>
    <label class="field"><span>Incremento de peso (kg)</span><input type="number" id="newExInc" value="2.5" step="0.5"></label>
    <button class="btn secondary full" id="createExercise">Crear y usar</button>
    <div class="divider"></div>
    <div id="exConfigArea"></div>
    <button class="btn ghost full" id="closeSubModal">Volver</button>
  `;
}
let pendingExerciseId = null;
function attachExercisePickerEvents(){
  document.querySelectorAll('[data-pick]').forEach(c=>c.addEventListener('click', ()=>{
    pendingExerciseId = c.dataset.pick;
    showExConfig();
  }));
  document.getElementById('createExercise').addEventListener('click', ()=>{
    const name = document.getElementById('newExName').value.trim();
    const inc = Number(document.getElementById('newExInc').value)||2.5;
    if(!name){ alert('Escribe un nombre'); return; }
    const ex = {id:uid(), name, increment:inc};
    state.exercises.push(ex); save();
    pendingExerciseId = ex.id;
    showExConfig();
  });
  document.getElementById('closeSubModal').addEventListener('click', ()=>{
    updateModal(routineEditorHTML(), attachRoutineEditorEvents);
  });
}
function showExConfig(){
  document.getElementById('exConfigArea').innerHTML = `
    <div class="divider"></div>
    <label class="field"><span>Series</span><input type="number" id="cfgSets" value="3" min="1"></label>
    <div class="row" style="gap:10px;">
      <label class="field" style="flex:1;"><span>Reps mín.</span><input type="number" id="cfgRepsMin" value="8"></label>
      <label class="field" style="flex:1;"><span>Reps máx.</span><input type="number" id="cfgRepsMax" value="10"></label>
    </div>
    <label class="field"><span>Peso inicial (kg)</span><input type="number" id="cfgWeight" value="20" step="0.5"></label>
    <button class="btn full" id="confirmAddEx">Añadir a la rutina</button>
  `;
  document.getElementById('confirmAddEx').addEventListener('click', ()=>{
    editorDraft.exercises.push({
      exerciseId: pendingExerciseId,
      sets: Number(document.getElementById('cfgSets').value)||3,
      repsMin: Number(document.getElementById('cfgRepsMin').value)||8,
      repsMax: Number(document.getElementById('cfgRepsMax').value)||10,
      weight: Number(document.getElementById('cfgWeight').value)||0
    });
    updateModal(routineEditorHTML(), attachRoutineEditorEvents);
  });
}

/* ===================== VISTA: HISTORIAL ===================== */
function renderHistorial(){
  if(state.sessions.length===0){
    return `<h1 class="page-title">Historial</h1><div class="empty"><div class="glyph">📈</div>Aún no hay sesiones registradas.</div>`;
  }
  const items = state.sessions.map(s=>{
    const d = new Date(s.date);
    return `<div class="hist-item">
      <div class="row"><b>${s.routineName}</b><span class="tag">${d.toLocaleDateString('es-ES')}</span></div>
      <div class="ex-meta">${s.entries.map(e=>e.name).join(', ')}</div>
    </div>`;
  }).join('');
  return `<h1 class="page-title">Historial</h1><div class="card">${items}</div>`;
}
function attachHistorialEvents(){}

/* ===================== VISTA: AJUSTES ===================== */
function renderAjustes(){
  return `<h1 class="page-title">Ajustes</h1>
    <div class="card">
      <div class="card-title">Exportar datos</div>
      <div class="card-sub">Descarga tu historial para Excel/Sheets o como copia de seguridad.</div>
      <button class="btn full" id="exportCsv">Exportar CSV</button>
      <button class="btn secondary full" id="exportJson" style="margin-top:8px;">Exportar copia (JSON)</button>
    </div>
    <div class="card">
      <div class="card-title">Importar copia</div>
      <input type="file" id="importFile" accept="application/json" style="margin-top:8px;">
    </div>
    <div class="card">
      <div class="card-title">Cómo ajusta el peso</div>
      <div class="ex-meta">
        · 100% de repeticiones y RPE ≤8 (o sin RPE) → sube el incremento configurado.<br>
        · 100% con RPE ≥8.5, o entre 80-99% → mantiene el peso.<br>
        · Menos del 80% → baja ~10%.
      </div>
    </div>
    <div class="card">
      <button class="btn ghost full" id="resetData">Borrar todos los datos</button>
    </div>`;
}
function attachAjustesEvents(){
  document.getElementById('exportCsv').addEventListener('click', exportCsv);
  document.getElementById('exportJson').addEventListener('click', exportJson);
  document.getElementById('importFile').addEventListener('change', importJson);
  document.getElementById('resetData').addEventListener('click', ()=>{
    if(confirm('Esto borrará rutinas, ejercicios e historial. ¿Continuar?')){
      state = {exercises:[],routines:[],sessions:[]}; save(); render();
    }
  });
}
function exportCsv(){
  let rows = [['Fecha','Rutina','Ejercicio','Serie','Reps objetivo','Reps hechas','Peso(kg)','RPE']];
  state.sessions.forEach(s=>{
    s.entries.forEach(e=>{
      e.sets.forEach((set,i)=>{
        rows.push([new Date(s.date).toLocaleDateString('es-ES'), s.routineName, e.name, i+1, set.targetReps, set.reps, set.weight, set.rpe]);
      });
    });
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(csv, 'forja_historial.csv', 'text/csv');
}
function exportJson(){ downloadFile(JSON.stringify(state,null,2), 'forja_backup.json', 'application/json'); }
function importJson(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data.exercises||!data.routines||!data.sessions) throw new Error('formato inválido');
      state = data; save(); alert('Copia importada correctamente.'); render();
    }catch(err){ alert('Archivo no válido: '+err.message); }
  };
  reader.readAsText(file);
}
function downloadFile(content, filename, mime){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ===================== MODAL GENÉRICO ===================== */
function renderModal(html, attachFn, stacked){
  let bg = document.querySelector('.modal-bg');
  if(!bg || !stacked){
    if(bg) bg.remove();
    bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(bg);
  } else {
    bg.querySelector('.modal').innerHTML = html;
  }
  attachFn();
}
function updateModal(html, attachFn){
  document.querySelector('.modal-bg .modal').innerHTML = html;
  attachFn();
}
function closeModal(){
  const bg = document.querySelector('.modal-bg');
  if(bg) bg.remove();
}

/* ===================== SERVICE WORKER + INICIO ===================== */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
render();
