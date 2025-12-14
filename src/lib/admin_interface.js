// Inline admin HTML and JS for serving
export const adminHTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forminator Odoo Sync - Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;padding:20px}.container{max-width:1400px;margin:0 auto}.login-box{background:#fff;border-radius:12px;padding:40px;max-width:400px;margin:100px auto;box-shadow:0 10px 40px rgba(0,0,0,.2)}.login-box h1{text-align:center;margin-bottom:30px}.login-box input{width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:6px;margin-bottom:20px}.login-box button{width:100%;padding:12px;background:#667eea;color:#fff;border:none;border-radius:6px;cursor:pointer}.main-interface{display:none}.header{background:#fff;border-radius:12px;padding:20px 30px;margin-bottom:20px;box-shadow:0 2px 10px rgba(0,0,0,.1);display:flex;justify-content:space-between;align-items:center}.header h1{font-size:24px}.header button{padding:10px 20px;background:#764ba2;color:#fff;border:none;border-radius:6px;cursor:pointer}.content{display:grid;grid-template-columns:300px 1fr;gap:20px}.sidebar{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.1)}.sidebar h2{font-size:18px;margin-bottom:15px}.form-list{list-style:none}.form-item{padding:12px;margin-bottom:8px;background:#f5f5f5;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center}.form-item:hover{background:#e8e8e8}.form-item.active{background:#667eea;color:#fff}.form-item button{padding:4px 8px;font-size:12px;background:#ff4757;color:#fff;border:none;border-radius:4px;cursor:pointer}.add-form-btn{width:100%;padding:12px;background:#667eea;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-top:15px}.editor{background:#fff;border-radius:12px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,.1)}.editor h2{margin-bottom:20px}.form-group{margin-bottom:20px}.form-group label{display:block;margin-bottom:8px;font-weight:500}.form-group input,.form-group textarea{width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:6px}.form-group textarea{min-height:200px;font-family:monospace}.section{background:#f9f9f9;border-radius:8px;padding:20px;margin-bottom:20px}.section h3{margin-bottom:15px;font-size:16px}.btn-group{display:flex;gap:10px;margin-top:20px}.btn{padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500}.btn-primary{background:#667eea;color:#fff}.btn-success{background:#2ed573;color:#fff}.btn-danger{background:#ff4757;color:#fff}.btn-secondary{background:#e0e0e0;color:#333}.empty-state{text-align:center;padding:60px 20px;color:#999}.alert{padding:12px 20px;border-radius:6px;margin-bottom:20px}.alert-success{background:#d4edda;color:#155724}.alert-error{background:#f8d7da;color:#721c24}.hidden{display:none!important}.mapping-row{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;margin-bottom:10px}.mapping-row button{padding:8px 12px;background:#ff4757;color:#fff;border:none;border-radius:4px;cursor:pointer}
</style>
</head>
<body>
<div id="loginScreen" class="login-box">
<h1>🔐 Admin Login</h1>
<input type="password" id="tokenInput" placeholder="Enter admin token"/>
<button onclick="login()">Login</button>
<div id="loginError" class="alert alert-error hidden"></div>
</div>
<div id="mainInterface" class="main-interface container">
<div class="header">
<h1>📋 Forminator Odoo Sync</h1>
<button onclick="logout()">Logout</button>
</div>
<div id="alerts"></div>
<div class="content">
<div class="sidebar">
<h2>Formulieren</h2>
<ul id="formList" class="form-list"></ul>
<button class="add-form-btn" onclick="createNew()">+ Nieuw Formulier</button>
<div style="margin-top:30px">
<h2>Import/Export</h2>
<button class="btn btn-secondary" style="width:100%;margin-bottom:10px" onclick="exportJSON()">📥 Export</button>
<input type="file" id="importFile" accept=".json" style="display:none" onchange="importJSON(event)"/>
<button class="btn btn-secondary" style="width:100%" onclick="document.getElementById('importFile').click()">📤 Import</button>
</div>
</div>
<div class="editor">
<div id="emptyState" class="empty-state">
<h3>Geen formulier geselecteerd</h3>
<p>Selecteer een formulier of maak een nieuw formulier aan.</p>
</div>
<div id="editorContent" class="hidden">
<h2 id="editorTitle">Configuratie</h2>
<div class="form-group">
<label>Form ID</label>
<input type="text" id="formId" placeholder="11987"/>
</div>
<div class="section">
<h3>Field Mapping</h3>
<div id="fieldMappings"></div>
<button class="btn btn-secondary" onclick="addField()">+ Veld</button>
</div>
<div class="section">
<h3>Workflow (JSON)</h3>
<textarea id="workflowJson"></textarea>
</div>
<div class="btn-group">
<button class="btn btn-success" onclick="save()">💾 Opslaan</button>
<button class="btn btn-danger" onclick="deleteForm()">🗑️ Verwijderen</button>
<button class="btn btn-secondary" onclick="cancel()">✖️ Annuleren</button>
</div>
</div>
</div>
</div>
</div>
<script>
const API='/api';let token=localStorage.getItem('adminToken'),current=null,data={};if(token){show();load()}
async function login(){const t=document.getElementById('tokenInput').value;if(!t)return;try{const r=await fetch(API+'/mappings',{headers:{'Authorization':'Bearer '+t}});if(r.ok){localStorage.setItem('adminToken',t);location.reload()}else{error('loginError','Invalid token')}}catch(e){error('loginError',e.message)}}
function logout(){localStorage.removeItem('adminToken');location.reload()}
function show(){document.getElementById('loginScreen').style.display='none';document.getElementById('mainInterface').style.display='block'}
async function load(){try{const r=await fetch(API+'/mappings',{headers:{'Authorization':'Bearer '+token}});if(!r.ok)throw new Error('Failed');const d=await r.json();data=d.data||{};renderList()}catch(e){alert('error','Load error: '+e.message)}}
async function save(){const id=document.getElementById('formId').value;if(!id){alert('error','Form ID required');return}const fm={};document.querySelectorAll('#fieldMappings .mapping-row').forEach(r=>{const k=r.querySelector('.mapping-key').value.trim(),v=r.querySelector('.mapping-value').value.trim();if(k&&v)fm[k]=v});let wf;try{wf=JSON.parse(document.getElementById('workflowJson').value)}catch(e){alert('error','Invalid JSON: '+e.message);return}try{const r=await fetch(API+'/mappings/'+id,{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({field_mapping:fm,workflow:wf})});if(!r.ok)throw new Error('Failed');data[id]={field_mapping:fm,workflow:wf};renderList();alert('success','Saved!');if(id!==current){current=id;renderList()}}catch(e){alert('error','Save error: '+e.message)}}
async function deleteForm(){if(!current||!confirm('Delete?'))return;try{const r=await fetch(API+'/mappings/'+current,{method:'DELETE',headers:{'Authorization':'Bearer '+token}});if(!r.ok)throw new Error('Failed');delete data[current];renderList();showEditor(null);alert('success','Deleted')}catch(e){alert('error','Delete error: '+e.message)}}
function renderList(){const l=document.getElementById('formList');l.innerHTML='';const ids=Object.keys(data).filter(i=>!i.startsWith('_'));if(!ids.length){l.innerHTML='<li style="color:#999;padding:12px">Geen formulieren</li>';return}ids.forEach(id=>{const li=document.createElement('li');li.className='form-item'+(id===current?' active':'');li.innerHTML='<span onclick="loadForm(\\\''+id+'\\\')">Form '+id+'</span><button onclick="event.stopPropagation();deleteForm()">×</button>';l.appendChild(li)})}
function loadForm(id){current=id;renderList();showEditor(id)}
function showEditor(id){const empty=document.getElementById('emptyState'),editor=document.getElementById('editorContent');if(!id){empty.classList.remove('hidden');editor.classList.add('hidden');return}empty.classList.add('hidden');editor.classList.remove('hidden');const m=data[id]||{};document.getElementById('editorTitle').textContent='Form '+id;document.getElementById('formId').value=id;renderFields(m.field_mapping||{});document.getElementById('workflowJson').value=JSON.stringify(m.workflow||[],null,2)}
function renderFields(fm){const c=document.getElementById('fieldMappings');c.innerHTML='';Object.entries(fm).forEach(([k,v])=>addFieldRow(k,v));if(!Object.keys(fm).length)addFieldRow()}
function addField(){addFieldRow()}
function addFieldRow(k='',v=''){const c=document.getElementById('fieldMappings'),r=document.createElement('div');r.className='mapping-row';r.innerHTML='<input type="text" placeholder="forminator_field" value="'+k+'" class="mapping-key"/><input type="text" placeholder="odoo_field" value="'+v+'" class="mapping-value"/><button onclick="this.parentElement.remove()">×</button>';c.appendChild(r)}
function createNew(){const id=prompt('Form ID:');if(!id)return;if(data[id]){alert('error','Already exists');return}data[id]={field_mapping:{},workflow:[]};current=id;renderList();showEditor(id)}
function cancel(){current=null;renderList();showEditor(null)}
function exportJSON(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mappings.json';a.click();URL.revokeObjectURL(url)}
async function importJSON(e){const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=async(ev)=>{try{const d=JSON.parse(ev.target.result);const r=await fetch(API+'/mappings/import',{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({mappings:d})});if(!r.ok)throw new Error('Failed');data=d;renderList();alert('success','Imported')}catch(e){alert('error','Import error: '+e.message)}};reader.readAsText(f);e.target.value=''}
function alert(type,msg){const c=document.getElementById('alerts'),d=document.createElement('div');d.className='alert alert-'+type;d.textContent=msg;c.appendChild(d);setTimeout(()=>d.remove(),5000)}
function error(id,msg){const el=document.getElementById(id);el.textContent=msg;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),5000)}
document.getElementById('tokenInput')?.addEventListener('keypress',e=>{if(e.key==='Enter')login()});
</script>
</body>
</html>`;
