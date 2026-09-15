/* ═══════ AURORA IA — MOTOR DE RESPOSTAS ═══════ */
const KB=[
 {k:/pre[çc]|valor|quanto|or[cç]ament/i,r:'Ótima pergunta! 💚 Nossos planos começam em R$ 297/mês, e o Pro sai por R$ 497/mês com onboarding dedicado. Posso montar uma proposta personalizada para o seu cenário?'},
 {k:/agend|hor[áa]ri|reuni|call|demo/i,r:'Claro! 🗓️ Tenho horários amanhã às 10h ou 15h30, e quinta às 11h. Qual prefere? Já deixo pré-reservado para você.'},
 {k:/pix|cart[ãa]o|pagament|boleto|parcel|desconto/i,r:'Aceitamos Pix, cartão em até 12x e boleto. 💳 No Pix à vista há 10% de desconto. Quer que eu gere o link de pagamento?'},
 {k:/prazo|entrega|quando receb|implementa/i,r:'O prazo padrão de implantação é de 5 a 7 dias úteis após a assinatura. Para capitais, geralmente sai antes! 😉'},
 {k:/problema|erro|n[ãa]o funciona|reclam|suporte/i,r:'Sinto muito por isso 😔 Vou abrir um chamado prioritário agora mesmo. Pode me descrever rapidamente o que aconteceu?'},
 {k:/human|atendente|pessoa|marina|falar com algu/i,r:'Sem problemas! Vou te conectar com a Marina 👩‍💻 Ela assume a conversa por aqui em instantes.'},
 {k:/obrigad|valeu|show|perfeito|top|fech/i,r:'Eu que agradeço! 🙌 Qualquer dúvida é só chamar por aqui. Estou sempre online ✦'},
 {k:/m[íi]dia kit|material|apresenta/i,r:'Claro! Vou te enviar nosso material completo em PDF com cases e números. 📄 Enquanto isso, quer agendar uma apresentação rápida?'},
 {k:/oi|ol[áa]|bom dia|boa tarde|boa noite/i,r:'Olá! Que bom te ver por aqui 😊 Sou a Aurora, assistente virtual da Fluxo. Como posso ajudar você hoje?'}
];
const DEFAULTS=['Boa! Deixa eu entender melhor: você busca algo para começar agora ou para escalar a operação? 🚀','Anotado! ✍️ A Marina já revisa sua solicitação. Enquanto isso, posso adiantar algo sobre planos ou prazos?','Entendi perfeitamente! Posso te ajudar com planos, agendamentos ou pagamentos — qual desses resolve agora? 💚'];
let defIdx=0;
function kbReply(text){for(const e of KB){if(e.k.test(text))return e.r}return DEFAULTS[(defIdx++)%DEFAULTS.length]}
function suggestionsFor(last){
 if(!last)return['👋 Olá! Como posso ajudar hoje?','📋 Quero conhecer os planos','🗓️ Vamos agendar uma conversa?'];
 if(/pre[çc]|valor|quanto/i.test(last))return['O plano Pro sai por R$ 497/mês com tudo incluso 💚','Posso aplicar 15% de desconto fechando essa semana 😉','Te envio uma proposta personalizada em 10 min?'];
 if(/agend|hor[áa]ri|call|reuni/i.test(last))return['Perfeito! Tenho amanhã às 16h30, confirma? 🗓️','Fechado, te mando o convite no e-mail 📩','Prefere de manhã ou à tarde?'];
 if(/kit|material/i.test(last))return['Segue nosso mídia kit atualizado 📄','Te mando também 3 cases de agências parceiras 🚀','Podemos marcar 15 min para apresentar?'];
 return['Perfeito! Vou verificar e te retorno em instantes 👍','Ótima notícia: consigo uma condição especial pra você 💚','Fechado! Te envio os próximos passos agora 📩'];
}