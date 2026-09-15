# Fluxo — CRM Conversacional 💬

CRM estilo WhatsApp com chat, Kanban de conexões, calendário e **Aurora**,
uma assistente de IA que responde clientes automaticamente.

## 🚀 Como rodar

1. Abra esta pasta no VS Code (`Arquivo → Abrir Pasta…`)
2. Instale a extensão **Live Server** (sugerida automaticamente)
3. Clique em **Go Live** no canto inferior direito (ou `Alt+L Alt+O`)
4. O navegador abre em `http://127.0.0.1:5500`

> Sem Live Server? Basta abrir o `index.html` direto no navegador.

## 📁 Estrutura

| Arquivo           | Responsabilidade                          |
|-------------------|-------------------------------------------|
| `index.html`      | Estrutura de todas as telas               |
| `css/style.css`   | Tema, componentes e animações             |
| `js/data.js`      | Contatos, funil, agenda e helpers         |
| `js/ai.js`        | Motor de respostas da Aurora (IA)         |
| `js/app.js`       | Lógica da interface e simulações          |

## ✨ Recursos

- Chat em tempo real simulado (digitando…, checks de leitura, anexos, emojis)
- Aurora IA responde por palavras-chave (preço, agenda, pagamento, suporte…)
- Kanban drag & drop com 5 estágios de funil
- Calendário com eventos tipados e criação rápida
- Dashboard com KPIs, gráfico e insights
- Laboratório de testes da IA

## 🔮 Próximos passos sugeridos

- Persistência com `localStorage`
- Integração real com API de IA (Gemini / GPT)
- Conexão com WhatsApp via Z-API / Evolution API