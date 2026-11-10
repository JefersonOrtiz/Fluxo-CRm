/* ═══════ HELPERS ═══════ */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowT=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const isoLocal=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const fmtK=v=>v>=1000?(v/1000).toFixed(1).replace('.',',')+'k':String(v);
const pick=a=>a[Math.floor(Math.random()*a.length)];
let midC=0; const mid=()=>'m'+(++midC)+'_'+Date.now();

/* ═══════ FUNIL ═══════ */
const STAGES=['Novo lead','Qualificação','Proposta','Negociação','Fechamento'];
const SCOLOR={'Novo lead':'var(--sky)','Qualificação':'var(--gold)','Proposta':'var(--coral)','Negociação':'var(--jade)','Fechamento':'var(--jade)'};
const STBG={'Novo lead':'var(--sky-t)','Qualificação':'var(--gold-t)','Proposta':'var(--coral-t)','Negociação':'var(--jade-t)','Fechamento':'var(--jade-t)'};

/* ═══════ CONTATOS ═══════ */
let contacts=[
 {id:'c1',name:'Carla Mendes',company:'Luma Studio',phone:'+55 11 98877-1020',mail:'carla@lumastudio.com.br',hue:152,online:true,lastSeen:'09:58',tags:['quente','design'],stage:'Negociação',value:14900,days:6,unread:0,fav:true,aiOn:true,ts:Date.now()-2e5,note:'Prefere contato à tarde. Decisão junto ao sócio.',msgs:[
   {who:'c',text:'Oi Marina! Vi a proposta que vocês montaram 👀',time:'09:41',st:''},
   {who:'c',text:'O plano Profissional caberia pra nossa agência?',time:'09:41',st:''},
   {who:'ai',text:`Oi, Carla! 😊 O Profissional custa ${formatPlanPrice(crmPlanById('profissional'))}, para até ${crmPlanById('profissional').maxUsers} usuários, com ${crmPlanById('profissional').trialDays} dias de teste. Posso preparar um comparativo?`,time:'09:42',st:''},
   {who:'me',text:'Bom dia, Carla! Podemos comparar os planos e escolher o que atende melhor a sua equipe 😉',time:'09:47',st:'read'},
   {who:'c',text:'Amei! Me chama pra uma call hoje à tarde?',time:'10:02',st:''}]},
 {id:'c2',name:'João Pedro Alves',company:'JP Alimentos',phone:'+55 31 99811-4455',mail:'jp@jpalimentos.com.br',hue:32,online:false,lastSeen:'08:30',tags:['atacado'],stage:'Proposta',value:8200,days:9,unread:0,fav:false,aiOn:true,ts:Date.now()-9e5,msgs:[
   {who:'me',text:'João, te enviei a proposta por e-mail. Consegue dar uma olhada?',time:'08:12',st:'read'},
   {who:'c',text:'Recebido! Vou revisar com o financeiro e te retorno.',time:'08:25',st:''}]},
 {id:'c3',name:'Bianca Rocha',company:'Ateliê Raízes',phone:'+55 21 97744-8899',mail:'bi@atelierraizes.com',hue:18,online:true,lastSeen:'agora',tags:['artesanato','instagram'],stage:'Qualificação',value:2400,days:3,unread:0,fav:false,aiOn:true,ts:Date.now()-16e5,msgs:[
   {who:'c',text:'Vi vocês no Instagram! Como funciona o plano básico?',time:'09:10',st:''},
   {who:'ai',text:`Oi, Bianca! 🌱 O Básico custa ${formatPlanPrice(crmPlanById('basico'))}, para até ${crmPlanById('basico').maxUsers} usuários, com ${crmPlanById('basico').trialDays} dias de teste. Quer conhecer o CRM?`,time:'09:10',st:''}]},
 {id:'c4',name:'Rafael Costa',company:'Studio Vértice',phone:'+55 11 96622-3311',mail:'rafa@studiovertice.com',hue:205,online:true,lastSeen:'agora',tags:['agência','urgente'],stage:'Novo lead',value:0,days:0,unread:2,fav:false,aiOn:false,ts:Date.now()-6e4,msgs:[
   {who:'c',text:'Olá! Vocês atendem agências também?',time:'10:14',st:''},
   {who:'c',text:'Consegue me mandar o mídia kit?',time:'10:15',st:''}]},
 {id:'c5',name:'Denise Prado',company:'Café Origem',phone:'+55 41 98833-2210',mail:'denise@cafeorigem.coffee',hue:6,online:false,lastSeen:'ontem',tags:['cliente','recorrente'],stage:'Fechamento',value:8900,days:14,unread:0,fav:true,aiOn:true,ts:Date.now()-26e5,msgs:[
   {who:'c',text:'Podem emitir a NF esse mês ainda?',time:'Ontem',st:''},
   {who:'me',text:'Pode deixar, Denise! Sai até sexta ✅',time:'Ontem',st:'read'}]},
 {id:'c6',name:'Marcos Lima',company:'TecnoNorte',phone:'+55 92 99122-7788',mail:'marcos@tecnonorte.com.br',hue:45,online:false,lastSeen:'07:44',tags:['equipe grande'],stage:'Qualificação',value:22000,days:5,unread:0,fav:false,aiOn:true,ts:Date.now()-33e5,msgs:[
   {who:'c',text:'Precisamos de algo para 40 operadores. Vocês escalam?',time:'07:40',st:''},
   {who:'ai',text:`Marcos, o maior plano do catálogo é o Profissional, para até ${crmPlanById('profissional').maxUsers} usuários. Vamos avaliar com a equipe comercial a necessidade dos seus 40 operadores antes de avançar?`,time:'07:41',st:''}]},
 {id:'c7',name:'Ana Beatriz',company:'Doce Mel Confeitaria',phone:'+55 85 98811-5544',mail:'ana@docemel.com.br',hue:330,online:true,lastSeen:'agora',tags:['pequeno negócio'],stage:'Novo lead',value:0,days:0,unread:1,fav:false,aiOn:true,ts:Date.now()-3e5,msgs:[
   {who:'c',text:'Boa tarde! Quanto fica o plano inicial? 🍰',time:'10:05',st:''}]},
 {id:'c8',name:'Paulo Henrique',company:'Grupo Vetor',phone:'+55 62 99977-6655',mail:'ph@grupovetor.com',hue:175,online:false,lastSeen:'12:20',tags:['follow-up'],stage:'Proposta',value:17500,days:11,unread:0,fav:false,aiOn:false,ts:Date.now()-41e5,msgs:[
   {who:'me',text:'Paulo, segue o comparativo que pediu 📊',time:'12:02',st:'read'},
   {who:'c',text:'Ótimo. Apresento na diretoria quinta-feira.',time:'12:18',st:''}]}
];
const byId=id=>contacts.find(c=>c.id===id);
const initials=n=>esc(n.split(' ').filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase());
const avaStyle=c=>`background:hsl(${c.hue} 42% 20%);color:hsl(${c.hue} 85% 72%);border:1px solid hsl(${c.hue} 50% 32%)`;

/* ═══════ AGENDA ═══════ */
const today=new Date();
const off=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return isoLocal(d)};
let events=[
 {d:off(0),t:'14:00',title:'Follow-up proposta — JP Alimentos',type:'followup',cid:'c2'},
 {d:off(0),t:'16:30',title:'Call de proposta — Luma Studio',type:'reuniao',cid:'c1'},
 {d:off(1),t:'10:00',title:'Demonstração do CRM — TecnoNorte',type:'reuniao',cid:'c6'},
 {d:off(1),t:'15:30',title:'Enviar contrato — Café Origem',type:'entrega',cid:'c5'},
 {d:off(2),t:'11:00',title:'Onboarding — Ateliê Raízes',type:'lead',cid:'c3'},
 {d:off(4),t:'09:30',title:'Reunião de pipeline semanal',type:'reuniao',cid:''},
 {d:off(-2),t:'14:30',title:'Apresentação — Grupo Vetor',type:'reuniao',cid:'c8'}
];

/* ═══════ POOLS ═══════ */
const REPLIES=['Perfeito! 👍','Show, obrigado!','Consegue me passar mais detalhes?','Hmm, deixa eu ver aqui e já te retorno.','Fechou! 🤝','Pode me mandar isso por escrito?','Boa! E qual seria o prazo?','Ótimo, vou conversar com meu sócio e te aviso 😄'];
const EMOJIS=['😀','😄','😂','🤝','👍','🙏','🔥','💚','🎯','📅','✅','⭐','🚀','💡','📌','🎉','😍','🤔','👀','💰','📦','☕','🌱','✨'];
