/* ═══════ ESTADO ═══════ */
let activeId='c1', activeView='dashboard', filterF='all';
let calRef=new Date(), selDate=isoLocal(today);

/* ═══════ NAVEGAÇÃO ═══════ */
function switchView(v){
 if(window.FluxoNavigationPolicy && !window.FluxoNavigationPolicy.canAccessView(v,window.FluxoApi?.getSession?.(),window.FluxoRuntime?.mode||'demo')){
  toast('⚠️','Acesso restrito','Você não tem permissão para acessar este módulo.','coral');
  return false;
 }
 activeView=v;
 document.querySelector('#appShell')?.classList.toggle('sidebar-collapsed',v==='chat');
 $$('.view').forEach(x=>x.classList.remove('active'));
 $('#view-'+v).classList.add('active');
 const runtimeNotice=$('#runtimeNotice'), chatNotice=$('#chatApiNotice');
 if(runtimeNotice) runtimeNotice.hidden = v==='chat';
 if(chatNotice){
  const api = apiConversationsMode();
  chatNotice.hidden = !(v==='chat' && api);
  chatNotice.textContent = api ? (runtimeNotice?.textContent || 'CRM conectado à API · sugestões da Aurora disponíveis · envio externo ainda não integrado') : '';
 }
 $$('.rail-btn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
 if(v==='chat'){if(apiConversationsMode())loadApiConversations();else scrollBottom()}
 if(v==='dashboard'){
  if(window.FLUXO_CONFIG?.mode==='api'){
    loadDashboardMetrics();
  }else{
    runCounters();
  }
 }
 if(v==='kanban')renderKanban();
 if(v==='calendar')renderCalendar();
 if(v==='contacts')renderContacts();
 if(v==='integrations'||v==='organization'||v==='admin')renderManagement();
 return true;
}
$$('.rail-btn[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
window.switchView=switchView;
$('#settingsBtn').onclick=()=>{
 if(window.FluxoRuntime?.mode==='api'){
  switchView('settings'); window.dispatchEvent(new CustomEvent('fluxo:settings')); return
 }
 const current=getFluxoUserName();
 const name=window.prompt('Qual nome deseja exibir no Fluxo?',current);
 if(name===null)return;
 if(!setFluxoUserName(name)){toast('⚠️','Nome inválido','Informe um nome para exibir no CRM.','coral');return}
 updateUserIdentity();
 toast('✅','Perfil atualizado',`${getFluxoUserName()} será exibido na visão geral.`,'gold');
};
document.addEventListener('click',e=>{
 const t=e.target.closest('[data-toast]');if(t)toast('💡','Atenção',t.dataset.toast,'');
 const oc=e.target.closest('[data-open-chat]');if(oc){if(apiConversationsMode())toast('💡','Resumo demonstrativo','Abra a conversa pela lista conectada.','gold');else{openChat(oc.dataset.openChat);switchView('chat')}}
 const gg=e.target.closest('[data-goto]');if(gg)switchView(gg.dataset.goto);
 const nc=e.target.closest('[data-open-newchat]');if(nc)openModal('newchat');
 const contact=e.target.closest('[data-open-contact]');if(contact)openModal('contact');
 const sw=e.target.closest('.sw[data-sw]');if(sw){sw.classList.toggle('on');toast(sw.classList.contains('on')?'✅':'⏸️','Automação',`${sw.dataset.sw} ${sw.classList.contains('on')?'ativada':'pausada'}.`,sw.classList.contains('on')?'':'gold')}
 const tn=e.target.closest('[data-tone]');if(tn){$$('[data-tone]').forEach(x=>x.classList.remove('on'));tn.classList.add('on');toast('🎭','Tom de voz',`Aurora agora fala em tom ${tn.textContent.toLowerCase()}.`,'gold')}
});

/* ═══════ RELÓGIO / SAUDAÇÃO ═══════ */
function tick(){const d=new Date();$('#clockChip').textContent=nowT();$('#dateChip').textContent=d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'})}
tick();setInterval(tick,15000);
function updateUserIdentity(){
 const name=getFluxoUserName();
 const h=new Date().getHours(),g=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite',e=h<12?'☀️':h<18?'🌤️':'🌙';
 $('#greet').textContent=`${g}, ${name} ${e}`;
 const initials=name.split(' ').filter(Boolean).map(part=>part[0]).slice(0,2).join('').toUpperCase();
 const rail=$('#railUser');rail.title=`${name} · online`;rail.querySelector('.rail-user').innerHTML=`${initials}<i></i>`;$('#sidebarUserName').textContent=name;$('#profileMenuName').textContent=name;
}
updateUserIdentity();
window.addEventListener('fluxo:session',updateUserIdentity);
window.addEventListener('fluxo:session', event => {
  if (event.detail && activeView === 'dashboard') {
    loadDashboardMetrics();
  }
});
/* ═══════ DASHBOARD ═══════ */
let dashboardRequest = null;
function runCounters() {
  $$('[data-n]').forEach(el => {
    const target = Number(el.dataset.n) || 0;
    const decimals = Number(el.dataset.d) || 0;
    const isMoney = el.id === 'dashNegotiationValue' || el.id === 'dashPipelineValue';
    const start = performance.now();

    function step(time) {
      const progress = Math.min(1, (time - start) / 900);
      const easing = 1 - Math.pow(1 - progress, 3);
      const value = target * easing;

      el.textContent = isMoney
        ? new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          }).format(value)
        : value.toFixed(decimals).replace('.', ',');

      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}
function dashboardEmpty(text) {
  const node = document.createElement('p');
  node.className = 'dashboard-empty';
  node.textContent = text;
  return node;
}
function setDashboardEmpty(container, text) {
  if (!container) return;
  container.querySelectorAll(':scope > .dashboard-empty').forEach(el => el.remove());
  container.append(dashboardEmpty(text));
}
function applyApiDashboardState(data) {
  $$('#view-dashboard .kpi .kdelta, #view-dashboard .kpi .spark').forEach(el => { el.hidden = true; });
  const ai = $('#dashAiResolved');
  ai.textContent = data.aiResolvedPercent != null && Number.isFinite(Number(data.aiResolvedPercent)) ? `${data.aiResolvedPercent}%` : 'Indisponível';
  const cards = $$('#view-dashboard .dash-row .card, #view-dashboard .dash-row2 .card');
  if (cards[0]) { cards[0].querySelector('.bars')?.replaceChildren(dashboardEmpty('Histórico de mensagens indisponível.')); cards[0].querySelector('.blab')?.replaceChildren(); }
  if (cards[1]) { cards[1].querySelectorAll('.ins').forEach(el => el.remove()); setDashboardEmpty(cards[1], 'Insights da Aurora ainda não estão disponíveis na API.'); }
  if (cards[2]) { cards[2].querySelectorAll('.frow').forEach(el => el.remove()); setDashboardEmpty(cards[2], 'Nenhuma atividade recente disponível.'); }
  if (cards[3]) { cards[3].querySelector('#hotLeads')?.replaceChildren(dashboardEmpty('Leads em aquecimento indisponíveis na API.')); }
}
function applyDashboardApiError(message) {
  ['dashActiveConversations', 'dashNewLeads', 'dashNegotiationValue', 'dashPipelineValue'].forEach(id => { const el = $(`#${id}`); if (el) { el.textContent = '—'; el.dataset.n = '0'; } });
  const ai = $('#dashAiResolved'); if (ai) ai.textContent = 'Indisponível';
  const card = $('#view-dashboard .dash-row .card');
  if (card) { card.querySelector('.bars')?.replaceChildren(dashboardEmpty(message)); card.querySelector('.blab')?.replaceChildren(); }
}
async function loadDashboardMetrics() {
  if (window.FLUXO_CONFIG?.mode !== 'api') return;
  if (!window.FluxoApi?.getSession()) return;
  if (dashboardRequest) return dashboardRequest;
  dashboardRequest = FluxoApi.request('/dashboard').then(data => {

    const active = document.querySelector('#dashActiveConversations');
    const leads = document.querySelector('#dashNewLeads');
    const negotiation = document.querySelector('#dashNegotiationValue');
    const pipeline = document.querySelector('#dashPipelineValue');
    if (!active || !leads || !negotiation || !pipeline) return;

    active.dataset.n = data.activeConversations;
    leads.dataset.n = data.newLeads7d;
    negotiation.dataset.n = Number(data.negotiationValueCents || 0) / 100;
    pipeline.dataset.n = Number(data.pipelineValueCents || 0) / 100;
    applyApiDashboardState(data);
    runCounters();
  }).catch(error => {
    applyDashboardApiError(error?.status === 401 ? 'Sessão expirada. Entre novamente para carregar o Dashboard.' : 'Dados do Dashboard indisponíveis no momento.');
    console.error('Erro ao carregar indicadores do Dashboard:', error);
  }).finally(() => { dashboardRequest = null; });
  return dashboardRequest;
}
(function bars(){if(window.FLUXO_CONFIG?.mode==='api')return;const vals=[46,62,54,70,66,58,74,80,71,88,84,96,90,104],mx=Math.max(...vals);let h='',lb='';
 vals.forEach((v,i)=>{const d=new Date();d.setDate(d.getDate()-(vals.length-1-i));
  h+=`<div class="bar ${i===vals.length-1?'hot':''}" style="height:${v/mx*100}%;--d:${i*45}ms" title="${d.getDate()}/${d.getMonth()+1} · ${v*7} mensagens"></div>`;
  lb+=`<span>${i%2?'':String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')}</span>`});
 $('#bars').innerHTML=h;$('#blab').innerHTML=lb})();
(function hot(){if(window.FLUXO_CONFIG?.mode==='api'){return;}const hot3=[...contacts].sort((a,b)=>b.value-a.value).slice(0,4);
 $('#hotLeads').innerHTML=hot3.map((c,i)=>`<div class="frow" style="--d:${.5+i*.07}s;cursor:pointer" data-open-chat="${c.id}"><span class="cava" style="${avaStyle(c)};width:36px;height:36px;font-size:11px">${initials(c.name)}</span><div class="ftxt"><b>${c.name}</b> · ${c.company}<small style="display:block;color:var(--dim);font-size:11px">${c.stage}</small></div><span class="ftime" style="color:var(--jade)">${c.value?'R$ '+fmtK(c.value):'novo'}</span></div>`).join('')})();

/* ═══════ CHAT — LISTA ═══════ */
function preview(c){const m=c.msgs[c.msgs.length-1];if(!m)return'';if(m.file)return'📄 '+m.file;
 return (m.who==='me'?'Você: ':m.who==='ai'?'✦ ':'')+esc(m.text)}
function renderChatList(){
 if(apiConversationsMode())return renderApiConversationList();
 const q=($('#chatSearch').value||'').toLowerCase();
 let list=contacts.filter(c=>(c.name+' '+c.company).toLowerCase().includes(q));
 if(filterF==='unread')list=list.filter(c=>c.unread>0);
 if(filterF==='ai')list=list.filter(c=>c.msgs.some(m=>m.who==='ai'));
 if(filterF==='fav')list=list.filter(c=>c.fav);
 list.sort((a,b)=>b.ts-a.ts);
 $('#chatList').innerHTML=list.map(c=>{const m=c.msgs[c.msgs.length-1];
  return `<div class="citem ${c.id===activeId?'on':''}" data-id="${c.id}">
   <span class="cava" style="${avaStyle(c)}">${initials(c.name)}${c.online?'<i class="odot"></i>':''}</span>
   <div class="cmeta"><div class="crow"><b>${c.name}</b><span class="ctime">${m?m.time:''}</span></div>
   <div class="crow"><span class="cprev">${preview(c)}</span>${c.fav?'<span class="fstar">★</span>':''}${m&&m.who==='ai'?'<span class="aitag">✦</span>':''}${c.unread?`<span class="ubadge">${c.unread}</span>`:''}</div></div></div>`}).join('')||'<p style="padding:24px;color:var(--dim);text-align:center">Nenhuma conversa encontrada 🔍</p>';
}
$('#chatSearch').oninput=renderChatList;
$$('.fchip').forEach(ch=>ch.onclick=()=>{$$('.fchip').forEach(x=>x.classList.remove('on'));ch.classList.add('on');filterF=ch.dataset.f;renderChatList()});
$('#chatList').addEventListener('click',e=>{const it=e.target.closest('.citem');if(it){openChat(it.dataset.id);$('#chatShell').classList.add('conv-open')}});
function railBadge(){const n=contacts.reduce((a,c)=>a+c.unread,0);const b=$('#railBadge');b.style.display=n?'grid':'none';b.textContent=n}

/* ═══════ CHAT — CONVERSA ═══════ */
const msgsBox=$('#msgsBox'),msgScroll=$('#msgScroll');
const scrollBottom=()=>requestAnimationFrame(()=>msgScroll.scrollTop=msgScroll.scrollHeight);
const chatVisible=()=>activeView==='chat';

function bubbleHTML(m){
 if(m.file)return`<div class="msg me" data-mid="${m.id}"><div class="file"><span class="fico">📄</span><div><b>${esc(m.file)}</b><small>PDF · 1,2 MB</small></div></div><div class="meta">${m.time} <span class="tick ${m.st||''}">✓</span></div></div>`;
 const tag=m.who==='ai'?'<span class="ai-tag">✦ AURORA</span>':'';
 return`<div class="msg ${m.who==='me'?'me':'them'}" data-mid="${m.id}">${tag}<p>${esc(m.text)}</p><div class="meta">${m.time} ${m.who==='me'?`<span class="tick ${m.st||''}">${m.st==='sent'?'✓':'✓✓'}</span>`:''}</div></div>`;
}
function renderMessages(){const c=byId(activeId);
 msgsBox.innerHTML=`<div class="sys-chip">🔐 Demo — as respostas são simuladas localmente</div><div class="date-chip">Hoje</div>`+c.msgs.map(bubbleHTML).join('');
 scrollBottom()}
function appendMsg(m){msgsBox.insertAdjacentHTML('beforeend',bubbleHTML(m));scrollBottom()}
function setTick(m,st){m.st=st;const n=msgsBox.querySelector(`[data-mid="${m.id}"] .tick`);if(n){n.className='tick '+st;n.textContent=st==='sent'?'✓':'✓✓'}}
function markRead(c){c.msgs.forEach(m=>{if(m.who==='me')m.st='read'});msgsBox.querySelectorAll('.msg.me .tick').forEach(t=>{t.className='tick read';t.textContent='✓✓'})}
function showTyping(c,label,gold){hideTyping();if(!(chatVisible()&&activeId===c.id))return;
 msgsBox.insertAdjacentHTML('beforeend',`<div class="msg them typing-row" id="typingRow">${gold?'<span class="ai-tag">✦ AURORA</span>':''}<span class="dots"><i></i><i></i><i></i></span><span class="tlabel">${label}</span></div>`);scrollBottom()}
function hideTyping(){const t=$('#typingRow');if(t)t.remove()}

function renderConvHead(){const c=byId(activeId);
 $('#chAva').innerHTML=`<span class="cava" style="${avaStyle(c)};width:40px;height:40px">${initials(c.name)}</span>`;
 $('#chName').textContent=c.name+' · '+c.company;
 const sub=$('#chSub');sub.textContent=c.online?'online agora':(c.lastSeen?`visto por último às ${c.lastSeen}`:'presença não disponível');sub.className=c.online?'live':'';$('#chPresence').classList.toggle('online',!!c.online);
 renderServiceWindow(c);
 $('#aiSwitch').classList.toggle('on',c.aiOn)}
let serviceWindowTimer;
function renderServiceWindow(contact=byId(activeId)){
 const box=$('#serviceWindow');if(!box||!contact)return;
 clearTimeout(serviceWindowTimer);
 const state=window.FluxoServiceWindow?.calculateServiceWindow(contact.msgs||[])||{openedAt:null,remainingMs:0,status:'unavailable',reason:'no-incoming-message'};
 const {openedAt,remainingMs:remaining,visualStatus,status,displayText,reason}=state;box.dataset.status=visualStatus;box.dataset.reason=reason||'';$('#windowStatus').dataset.state=visualStatus;$('#windowStatus').dataset.reason=reason||'';$('#windowStatus').textContent=displayText;$('#windowRemaining').hidden=status!=='open';
 if(status==='open'){const minutes=Math.max(1,Math.ceil(remaining/60000));$('#windowRemaining').textContent=`Restam ${Math.floor(minutes/60)?`${Math.floor(minutes/60)}h `:''}${minutes%60}min`;serviceWindowTimer=setTimeout(()=>renderServiceWindow(contact),Math.min(remaining+1,60000))}else $('#windowRemaining').textContent='';
 $('#windowLastMessage').hidden=status==='open'||openedAt===null; if(openedAt!==null){$('#windowOpenedAt').textContent=new Date(openedAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});$('#windowOpenedAt').dateTime=new Date(openedAt).toISOString()}
 $('#windowHint').textContent=status==='open'?'Cada mensagem do cliente renova a janela por 24 horas.':status==='expired'?'Use um template aprovado para retomar o contato.':reason==='no-incoming-message'?'Nenhuma mensagem recebida do cliente.':'Horário indisponível';
}
function renderApiServiceWindow(conversation, messages = []) {
 const contact = { msgs: messages.map(message => ({
   who: message?.direction === 'inbound' ? 'c' : 'me',
   sentAt: message?.sentAt
 })) };
 renderServiceWindow(contact);
 const presence = $('#chPresence');
 if (presence) presence.classList.remove('online');
}
window.renderApiServiceWindow = renderApiServiceWindow;
function renderDetail(){const c=byId(activeId);
 $('#dAva').innerHTML=`<span class="cava" style="${avaStyle(c)};width:52px;height:52px;font-size:16px">${initials(c.name)}</span>`;
 $('#dName').textContent=c.name;$('#dComp').textContent=c.company;$('#dPhone').textContent=c.phone;$('#dMail').textContent=c.mail;
 $('#stageSel').value=c.stage;
 $('#tagBox').innerHTML=c.tags.map(t=>{const color=window.FluxoTagColor?.(window.FluxoTagLookup?.(t)?.color)||'sky';return `<span class="tag ${color}">${esc(t)}</span>`}).join('');
 $('#dOrigin').innerHTML='🏷️ Origem: <b>WhatsApp · Campanha Setembro</b>';
 $('#notesBox').value=c.note||'';
 $('#favBtn').style.color=c.fav?'var(--gold)':'var(--dim)';
 updateSuggestions(c)}
function updateSuggestions(c){const last=[...c.msgs].reverse().find(m=>m.who!=='me');
 $('#suggBox').innerHTML=suggestionsFor(last&&last.text).map(s=>`<button class="sgt">${esc(s)}</button>`).join('')}
$('#suggBox').addEventListener('click',e=>{const b=e.target.closest('.sgt');if(b)sendMessage(b.textContent)});

function openChat(id){if(apiConversationsMode())return openApiConversation(id);activeId=id;const c=byId(id);c.unread=0;markRead(c);
 renderChatList();renderConvHead();renderMessages();renderDetail();syncDetailPanel(false);railBadge()}

/* envio */
const inp=$('#composerInput'),sendBtn=$('#sendBtn');
const ICO_SEND='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
const ICO_MIC='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3"/></svg>';
function syncSend(){const mic=!inp.value.trim();sendBtn.classList.toggle('mic',mic);$('#sendIco').innerHTML=mic?ICO_MIC:ICO_SEND}
syncSend();inp.addEventListener('input',syncSend);

async function sendMessage(txt){const text=(txt!==undefined?txt:inp.value).trim();if(!text)return;
 if(apiConversationsMode()){if(await sendApiMessage(text)){inp.value='';syncSend()}return}
 const c=byId(activeId);
 const m={id:mid(),who:'me',text,time:nowT(),st:'sent'};c.msgs.push(m);c.ts=Date.now();
 appendMsg(m);inp.value='';syncSend();renderChatList();
 setTimeout(()=>setTick(m,'delivered'),700);
 if(Math.random()<.65)setTimeout(()=>flowIncoming(c,pick(REPLIES)),1700+Math.random()*1800);
 else setTimeout(()=>setTick(m,'read'),2400)}
function flowIncoming(c,text){
 if(chatVisible()&&activeId===c.id)showTyping(c,c.name.split(' ')[0]+' está digitando…');
 setTimeout(()=>{pushIncoming(c,text);aiRespond(c,text)},1000+Math.random()*900)}
function pushIncoming(c,text,ai=false){const m={id:mid(),who:ai?'ai':'c',text,time:nowT(),st:''};
 c.msgs.push(m);c.ts=Date.now();
 if(chatVisible()&&activeId===c.id){hideTyping();appendMsg(m);markRead(c);renderChatList()}
 else{c.unread++;toast(ai?'✦':'💬',c.name,(ai?'Aurora respondeu: ':'')+text,'gold');renderChatList();railBadge()}}
function aiRespond(c,src){if(!c.aiOn)return;
 setTimeout(()=>{if(chatVisible()&&activeId===c.id)showTyping(c,'Aurora está respondendo…',true);
  setTimeout(()=>{pushIncoming(c,kbReply(src),true);if(activeId===c.id)updateSuggestions(c)},1200+Math.random()*1300)},650)}
sendBtn.onclick=()=>{if(!inp.value.trim()){toast('🎙️','Mensagem de voz',apiConversationsMode()?'Envio de áudio ainda não integrado.':'Gravação de áudio simulada nesta demo.','');return}sendMessage()};
inp.addEventListener('keydown',e=>{if(e.key==='Enter')sendMessage()});
$('#attachBtn').onclick=()=>{if(apiConversationsMode()){toast('📎','Anexos indisponíveis','Persistência de anexos ainda não foi implementada.','gold');return}const c=byId(activeId);const m={id:mid(),who:'me',file:'proposta-fluxo.pdf',time:nowT(),st:'sent'};
 c.msgs.push(m);c.ts=Date.now();appendMsg(m);renderChatList();setTimeout(()=>setTick(m,'read'),1800)};

/* emoji picker */
$('#emojiPop').innerHTML=EMOJIS.map(e=>`<button>${e}</button>`).join('');
$('#emojiBtn').onclick=e=>{e.stopPropagation();$('#emojiPop').classList.toggle('open')};
$('#emojiPop').addEventListener('click',e=>{const b=e.target.closest('button');if(b){inp.value+=b.textContent;inp.focus();syncSend()}});
document.addEventListener('click',e=>{if(!e.target.closest('#emojiPop')&&!e.target.closest('#emojiBtn'))$('#emojiPop').classList.remove('open')});

/* header / painel de detalhes */
let detailPanelOpen = false;
function hasValidConversationContext() {
  return apiConversationsMode() ? Boolean(apiConversationState.active && apiConversationState.contact) : Boolean(byId(activeId));
}
function syncDetailPanel(open = detailPanelOpen) {
  const shell = $('#chatShell');
 const trigger = $('#clientDetailsToggle') || $('#convContactTrigger');
  const valid = hasValidConversationContext();
  detailPanelOpen = Boolean(open && valid);
  if (innerWidth > 1350) {
    shell.classList.toggle('no-detail', !detailPanelOpen);
    shell.classList.remove('show-detail');
  } else {
    shell.classList.toggle('show-detail', detailPanelOpen);
    shell.classList.remove('no-detail');
  }
 const pane = $('#detailPane');
 const backdrop = $('#detailBackdrop');
 if (pane) pane.hidden = !detailPanelOpen;
 if (backdrop) backdrop.hidden = !detailPanelOpen;
 if(!trigger)return;
 trigger.classList.toggle('is-open', detailPanelOpen);
  trigger.classList.toggle('is-disabled', !valid);
  trigger.setAttribute('aria-expanded', String(detailPanelOpen));
  trigger.setAttribute('aria-disabled', String(!valid));
  trigger.tabIndex = valid ? 0 : -1;
  trigger.title = valid ? (detailPanelOpen ? 'Ocultar detalhes do cliente' : 'Mostrar detalhes do cliente') : 'Detalhes indisponíveis sem conversa selecionada';
}
window.syncDetailPanel = syncDetailPanel;
function renderConversationPresence(online){
 const el=$('#presenceStatus'); if(!el)return;
 const known=typeof online==='boolean';
 el.className='presence-status '+(known?(online?'online':'offline'):'unavailable');
 el.textContent=known?(online?'● Online':'● Offline'):'● Indisponível';
 el.setAttribute('aria-label',known?(online?'Status de presença: online':'Status de presença: offline'):'Status de presença indisponível');
 el.title=el.getAttribute('aria-label');
}
function renderConversationWindowStatus(conversation, messages=[]){
 const el=$('#windowStatus'); if(!el)return;
 let text='◷ Janela 24h indisponível', state='unavailable';
 if(String(conversation?.channel||'').toLowerCase().includes('whatsapp')){
  const inbound=messages.filter(m=>m?.direction==='inbound'&&m.sentAt).sort((a,b)=>new Date(b.sentAt)-new Date(a.sentAt))[0];
  if(inbound){const date=new Date(inbound.sentAt), now=new Date(); const same=date.toDateString()===now.toDateString(); const time=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); const when=same?`às ${time}`:`em ${date.toLocaleDateString('pt-BR')} às ${time}`; const open=Date.now()-date.getTime()<86400000; state=open?'open':'expired'; text=open?`◷ Janela 24h aberta · Iniciada ${when}`:`◷ Janela 24h expirada · Última msg. do cliente ${when}`;}}
 el.className='window-status '+state; el.textContent=text; el.hidden=false;
}
window.renderConversationPresence=renderConversationPresence;
window.renderConversationWindowStatus=renderConversationWindowStatus;
$('#aiSwitch').onclick=()=>{if(apiConversationsMode()){toast('✦','Aurora indisponível','A IA ainda não está integrada às conversas persistidas.','gold');return}const c=byId(activeId);c.aiOn=!c.aiOn;$('#aiSwitch').classList.toggle('on',c.aiOn);
 toast(c.aiOn?'✦':'⏸️','Aurora',c.aiOn?'IA ativada nesta conversa — respostas automáticas ligadas.':'IA pausada — você assume o atendimento.',c.aiOn?'gold':'')};
function setClientDetails(open,restoreFocus=true){const sh=$('#chatShell');if(innerWidth>1350)sh.classList.toggle('no-detail',!open);else sh.classList.toggle('show-detail',open);$('#detailPane').hidden=!open;$('#detailBackdrop').hidden=!open;$('#clientDetailsToggle').setAttribute('aria-expanded',String(open));$('#clientDetailsToggle').setAttribute('aria-label',`${open?'Fechar':'Abrir'} detalhes do cliente`);if(restoreFocus)(open?$('#closeClientDetails'):$('#clientDetailsToggle')).focus({preventScroll:true})}
function toggleClientDetails(){const open=innerWidth>1350?!$('#chatShell').classList.contains('no-detail'):$('#chatShell').classList.contains('show-detail');setClientDetails(!open)}
$('#clientDetailsToggle').onclick=toggleClientDetails;$('#serviceWindow').onclick=toggleClientDetails;
$('#closeClientDetails').onclick=()=>setClientDetails(false);$('#detailBackdrop').onclick=()=>setClientDetails(false);
syncDetailPanel(false);
$$('[data-back]').forEach(b=>b.onclick=()=>$('#chatShell').classList.remove('conv-open'));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#detailPane').hidden)setClientDetails(false)});
$('#stageSel').innerHTML=STAGES.map(s=>`<option>${s}</option>`).join('');
$('#stageSel').onchange=e=>{if(!hasValidConversationContext())return;if(apiConversationsMode())return updateActiveApiContactStage(e.target.value);const c=byId(activeId);c.stage=e.target.value;renderKanban();toast('🎯','Funil atualizado',`${c.name} agora está em “${c.stage}”.`)};
$('#tagInput').addEventListener('keydown',e=>{if(apiConversationsMode()||!hasValidConversationContext())return;if(e.key==='Enter'&&e.target.value.trim()){byId(activeId).tags.push(e.target.value.trim());e.target.value='';renderDetail();toast('🏷','Tag adicionada','Salva no perfil do cliente.')}});
$('#notesBox').addEventListener('change',e=>{if(apiConversationsMode()||!hasValidConversationContext())return;byId(activeId).note=e.target.value;toast('📝','Nota salva','Anotação vinculada ao contato.')});
$('#favBtn').onclick=()=>{if(apiConversationsMode()||!hasValidConversationContext())return;const c=byId(activeId);c.fav=!c.fav;renderDetail();renderChatList()};
$$('.qact').forEach(b=>b.onclick=()=>{if(!hasValidConversationContext())return;const c=byId(activeId),a=b.dataset.act;
 if(apiConversationsMode()){if(a==='handoff')assignActiveApiConversation();else toast('💡','Ação demonstrativa','Esta ação ainda não está integrada à API.','gold');return}
 if(a==='task')toast('✅','Tarefa criada',`Follow-up com ${c.name} amanhã às 9h.`);
 if(a==='calendar'){openModal('event');$('#evContact').value=c.id;$('#evTitle').value='Follow-up — '+c.name}
 if(a==='win'){c.stage='Fechamento';$('#stageSel').value=c.stage;renderKanban();burst();toast('💰','Venda fechada!',`${c.name} · R$ ${fmtK(c.value||3000)} 🎉`)}
 if(a==='handoff'){c.aiOn=false;$('#aiSwitch').classList.remove('on');toast('🙋','Chat assumido','Aurora pausada — você está no controle.')}});

/* ═══════ KANBAN ═══════ */
function renderKanban(){const bd=$('#board');
 if(apiContactsMode())return renderApiKanban();
 bd.innerHTML=STAGES.map(s=>{const cs=contacts.filter(c=>c.stage===s);const sum=cs.reduce((a,c)=>a+c.value,0);
  return `<div class="kcol"><div class="khead"><span class="kdot" style="background:${SCOLOR[s]}"></span><b>${s}</b><span class="kcount">${cs.length}</span><span class="ksum">R$ ${fmtK(sum)}</span></div>
  <div class="kbody" data-stage="${s}">${cs.map(c=>`<div class="kcard" draggable="true" data-id="${c.id}">
    <div class="krow"><span class="kava" style="${avaStyle(c)}">${initials(c.name)}</span><div><b>${c.name}</b><small>${c.company}</small></div></div>
    <div class="krow kb"><span class="kval">${c.value?'R$ '+fmtK(c.value):'—'}</span><span class="kdays">${c.days}d no estágio</span></div>
    <div class="ktags">${c.tags.slice(0,2).map(t=>`<i>${esc(t)}</i>`).join('')}</div></div>`).join('')||'<div class="kempty">Solte cards aqui</div>'}</div></div>`}).join('');
 $('#kanbanTotal').textContent='R$ '+fmtK(contacts.reduce((a,c)=>a+c.value,0));
 bd.querySelectorAll('.kcard').forEach(card=>{
  card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.dataset.id);setTimeout(()=>card.classList.add('dragging'),0)});
  card.addEventListener('dragend',()=>card.classList.remove('dragging'));
  card.addEventListener('dblclick',()=>{openChat(card.dataset.id);switchView('chat')})});
 bd.querySelectorAll('.kbody').forEach(zone=>{
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('over')});
  zone.addEventListener('dragleave',()=>zone.classList.remove('over'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('over');
   const c=byId(e.dataTransfer.getData('text/plain'));const st=zone.dataset.stage;
   if(c.stage!==st){c.stage=st;c.days=0;renderKanban();toast('🎯','Card movido',`${c.name} → ${st}`);
    if(st==='Fechamento'){burst();toast('💰','Venda fechada!',`${c.name} · R$ ${fmtK(c.value||3000)} 🎉`)}}})})}

/* ═══════ CALENDÁRIO ═══════ */
const DOW=['dom','seg','ter','qua','qui','sex','sáb'];
function renderCalendar(){
 if(apiCalendarMode())return renderApiCalendar();
 $('#calTitle').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(calRef);
 const y=calRef.getFullYear(),m=calRef.getMonth();
 const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),prevD=new Date(y,m,0).getDate();
 let h=DOW.map(d=>`<div class="dow">${d}</div>`).join('');
 for(let i=0;i<first;i++)h+=`<div class="ccell dim"><span class="cnum">${prevD-first+1+i}</span></div>`;
 for(let d=1;d<=days;d++){const ds=isoLocal(new Date(y,m,d));const evs=events.filter(e=>e.d===ds).sort((a,b)=>a.t.localeCompare(b.t));
  h+=`<div class="ccell ${ds===isoLocal(new Date())?'today':''} ${ds===selDate?'sel':''}" data-d="${ds}"><span class="cnum">${d}</span><div>${evs.slice(0,2).map(e=>`<i class="echip ${e.type}">${e.t} ${esc(e.title)}</i>`).join('')}${evs.length>2?`<i class="emore">+${evs.length-2} mais</i>`:''}</div></div>`}
 const tot=first+days;for(let i=0;i<(7-tot%7)%7;i++)h+=`<div class="ccell dim"><span class="cnum">${i+1}</span></div>`;
 $('#calGrid').innerHTML=h;renderDayPanel()}
function renderDayPanel(){
 if(apiCalendarMode())return renderApiDayPanel();
 const [y,m,d]=selDate.split('-').map(Number);const dt=new Date(y,m-1,d);
 $('#dayTitle').innerHTML='📅 '+dt.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
 const evs=events.filter(e=>e.d===selDate).sort((a,b)=>a.t.localeCompare(b.t));
 $('#dayList').innerHTML=evs.map(e=>{const c=e.cid?byId(e.cid):null;
  return `<div class="day-item"><span class="dtime">${e.t}</span><div><div class="dtit"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px" class="dot-${e.type==='reuniao'?'sky':e.type}"></i>${esc(e.title)}</div>${c?`<div class="dcon">👤 ${c.name} · ${c.company}</div>`:''}</div></div>`}).join('')||'<p style="color:var(--dim);padding:14px 0;font-size:13px">Nenhum compromisso — dia livre 🌿</p>'}
$('#calGrid').addEventListener('click',e=>{const c=e.target.closest('.ccell[data-d]');if(c){selDate=c.dataset.d;renderCalendar()}});
$('#calPrev').onclick=()=>{calRef.setMonth(calRef.getMonth()-1);renderCalendar()};
$('#calNext').onclick=()=>{calRef.setMonth(calRef.getMonth()+1);renderCalendar()};
$('#calToday').onclick=()=>{calRef=new Date();selDate=isoLocal(new Date());renderCalendar()};
$('#newEventBtn').onclick=()=>openModal('event');

/* ═══════ CONTATOS ═══════ */
function renderContacts(){if(apiContactsMode())return renderApiContacts();const q=($('#ctSearch').value||'').toLowerCase();
 const list=contacts.filter(c=>(c.name+c.company+c.phone).toLowerCase().includes(q));
 $('#ctBody').innerHTML=list.map(c=>`<tr data-id="${c.id}">
  <td><div style="display:flex;gap:11px;align-items:center"><span class="cava" style="${avaStyle(c)};width:34px;height:34px;font-size:11px">${initials(c.name)}</span><div><b style="font-weight:600">${c.name}</b><small style="display:block;color:var(--dim)">${c.company}</small></div></div></td>
  <td class="mono" style="font-size:12px;color:var(--mut)">${c.phone}</td>
  <td><span class="stbadge" style="background:${STBG[c.stage]};color:${SCOLOR[c.stage]}">${c.stage}</span></td>
  <td class="mono" style="color:var(--jade);font-weight:600">${c.value?'R$ '+fmtK(c.value):'—'}</td>
  <td>${c.tags.slice(0,2).map(t=>{const color=window.FluxoTagColor?.(window.FluxoTagLookup?.(t)?.color)||'sky';return `<span class="tag ${color}" style="margin-right:4px">${esc(t)}</span>`}).join('')}</td>
  <td><span class="ia-dot" style="background:${c.aiOn?'var(--gold)':'var(--dim)'}"></span>${c.aiOn?'Aurora on':'manual'}</td></tr>`).join(''); renderContactActions()}
$('#ctSearch').addEventListener('input',()=>{if(!apiContactsMode())renderContacts()});

/* ═══════ VIEW DA IA ═══════ */
let kbs=['site-fluxo.pdf','tabela-precos.xlsx','faq-atendimento','politica-de-trocas'];
function renderKB(){$('#kbBox').innerHTML=kbs.map((k,i)=>`<span class="kbpill">📄 ${esc(k)}<button data-kb="${i}">✕</button></span>`).join('')}
renderKB();
$('#kbBox').addEventListener('click',e=>{const b=e.target.closest('[data-kb]');if(b){kbs.splice(b.dataset.kb,1);renderKB();toast('🗑','Documento removido','Aurora não usará mais essa fonte.','coral')}});
$('#kbAdd').onclick=()=>{const v=$('#kbInput').value.trim();if(!v)return;kbs.push(v);$('#kbInput').value='';renderKB();toast('📚','Base atualizada','A Aurora será retreinada com esse documento.','gold')};
$('#pgBtn').onclick=()=>{const v=$('#pgInput').value.trim();if(!v)return;
 if(apiConversationsMode())return;
 $('#pgBox').insertAdjacentHTML('beforeend',`<div class="msg me" style="margin-left:auto"><p>${esc(v)}</p></div>`);
 $('#pgInput').value='';$('#pgBox').scrollTop=1e5;
 setTimeout(()=>{$('#pgBox').insertAdjacentHTML('beforeend',`<div class="msg them" style="max-width:85%"><span class="ai-tag">✦ AURORA</span><p>${esc(kbReply(v))}</p></div>`);$('#pgBox').scrollTop=1e5},700)};
$('#pgInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('#pgBtn').click()});

/* ═══════ MODAIS ═══════ */
let modalMode='';
function openModal(mode,id){modalMode=mode;$$('.mbody').forEach(b=>b.classList.remove('open'));
 if(mode==='newchat'){$('#mTitle').textContent='💬 Nova conversa';$('#mb-newchat').classList.add('open');renderNC()}
 if(mode==='event'){$('#mTitle').textContent='📅 Novo evento';$('#mb-event').classList.add('open');
  if(apiCalendarMode())prepareApiEventModal(id);else{$('#evDate').value=selDate;$('#evEndDate').value=selDate;$('#evContact').innerHTML='<option value="">— nenhum —</option>'+contacts.map(c=>`<option value="${c.id}">${c.name} · ${c.company}</option>`).join('')}}
 if(mode==='contact')prepareContactModal(id);
 $('#modal').classList.add('open')}
function closeModal(){$('#modal').classList.remove('open')}
$$('[data-close]').forEach(b=>b.onclick=closeModal);
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();$('#emojiPop').classList.remove('open')}});
$('#mAction').onclick=async()=>{
 if(modalMode==='contact'){if(await saveContactModal())closeModal();return}
 if(modalMode==='event'&&apiCalendarMode()){if(await saveApiEventModal())closeModal();return}
 if(modalMode==='event'){const t=$('#evTitle').value.trim();if(!t){toast('⚠️','Campo obrigatório','Dê um título ao evento.','coral');return}
  events.push({d:$('#evDate').value||selDate,t:$('#evTime').value||'09:00',title:t,type:$('#evType').value,cid:$('#evContact').value});
  renderCalendar();closeModal();toast('📅','Evento criado',t+' — '+$('#evDate').value)}
 closeModal()};
function renderNC(){const q=($('#ncSearch').value||'').toLowerCase();
 if(apiConversationsMode())return renderApiNewConversationContacts();
 $('#ncList').innerHTML=contacts.filter(c=>(c.name+c.company).toLowerCase().includes(q)).map(c=>
  `<div class="ncitem" data-id="${c.id}"><span class="cava" style="${avaStyle(c)};width:38px;height:38px;font-size:12px">${initials(c.name)}</span><div><b>${c.name}</b><small>${c.company} · ${c.phone}</small></div></div>`).join('')}
$('#ncSearch').oninput=renderNC;
$('#ncList').addEventListener('click',e=>{const it=e.target.closest('.ncitem');if(it){if(apiConversationsMode())createApiConversation(it.dataset.id);else{closeModal();openChat(it.dataset.id);switchView('chat')}}});

/* ═══════ TOASTS / CONFETE / SIMULAÇÃO ═══════ */
function toast(ico,title,sub,cls){const t=document.createElement('div');t.className='toast '+(cls||'');
 t.innerHTML=`<span class="tico">${ico}</span><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>`;
 $('#toastWrap').appendChild(t);t.onclick=()=>t.remove();setTimeout(()=>{t.style.transition='.4s';t.style.opacity='0';t.style.transform='translateX(40px)';setTimeout(()=>t.remove(),400)},4200)}
function burst(){const cols=['#31e3a2','#ffc24b','#ff7d6e','#5ec8ff','#e9f3ed'];
 for(let i=0;i<28;i++){const p=document.createElement('i');p.className='cf';
  p.style.cssText=`left:${Math.random()*100}vw;background:${pick(cols)};animation-delay:${Math.random()*.4}s;transform:rotate(${Math.random()*360}deg)`;
  document.body.appendChild(p);setTimeout(()=>p.remove(),2300)}}
setInterval(()=>{if(apiConversationsMode())return;if(Math.random()<.55){const c=pick(contacts.filter(x=>x.id!==activeId));
 const pool=['Oi! Tudo bem por aí?','Consegue me retornar ainda hoje? 🙏','Vocês têm condição especial pra fechar esse mês?','Passando pra agradecer o atendimento! 💚','Meu sócio aprovou! Quais os próximos passos?'];
 pushIncoming(c,pick(pool));if(c.aiOn)aiRespond(c,c.msgs[c.msgs.length-1].text)}},26000);
if(!apiConversationsMode())setTimeout(()=>{pushIncoming(byId('c4'),'Consegue me enviar ainda hoje? 🙏')},6000);

/* ═══════ INIT ═══════ */
const contactCreateButton = document.querySelector('#view-contacts [data-open-contact]');
if (contactCreateButton) { contactCreateButton.textContent = '＋ Novo cliente'; contactCreateButton.setAttribute('aria-label', 'Novo cliente'); }
const demoPipelineValue = document.querySelector('#dashPipelineValue');
if (demoPipelineValue && window.FLUXO_CONFIG?.mode !== 'api') demoPipelineValue.dataset.n = contacts.reduce((sum, contact) => sum + Number(contact.value || 0), 0);
renderChatList();if(!apiConversationsMode())openChat('c1');renderKanban();renderCalendar();renderContacts();if(window.FLUXO_CONFIG?.mode==='api'){applyApiDashboardState({aiResolvedPercent:null});loadDashboardMetrics();}else runCounters();railBadge();
if(window.FLUXO_CONFIG?.mode!=='api')toast('✦',`Bem-vinda ao Fluxo, ${getFluxoUserName()}!`,'A Aurora está online em modo demonstrativo.','gold');
