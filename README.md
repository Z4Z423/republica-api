# API de Reserva — República da Praia (2 quadras)

Esta API conecta no Google Calendar e permite:
- Listar horários disponíveis (capacidade 2 quadras por horário)
- Criar reserva (evento no Google Calendar) para **Locação Avulsa** (1h ou 2h)

## 1) Preparar Google Cloud (Service Account)

1. No Google Cloud Console, crie um projeto (ou use um existente).
2. Ative a **Google Calendar API**.
3. Crie uma **Service Account**.
4. Crie uma **chave JSON** para a Service Account e baixe.

## 2) Compartilhar a agenda com a Service Account

No Google Calendar:
- Configurações da agenda → **Compartilhar com pessoas específicas**
- Adicione o e-mail da Service Account (ex: `xxx@yyy.iam.gserviceaccount.com`)
- Permissão: **Fazer alterações em eventos**

## 3) Variáveis de ambiente

Defina:

### Opção recomendada (mais fácil no deploy): JSON em Base64

Em vez de setar `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY`, você pode colocar o **arquivo JSON inteiro** em uma variável:

- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` = base64 do arquivo `.json` da Service Account

Como gerar o base64 no Windows (PowerShell):

```powershell
$bytes = [System.IO.File]::ReadAllBytes("caminho\service-account.json")
[Convert]::ToBase64String($bytes) | Set-Clipboard
```

No macOS/Linux:

```bash
base64 -w 0 service-account.json
```

Depois cole o valor em `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` no Render/servidor.

> Segurança: essa chave dá acesso para criar eventos na sua agenda. Guarde como senha e restrinja CORS (`ALLOWED_ORIGINS`).


- `GOOGLE_CALENDAR_ID` = `napraiasjp@gmail.com` (ou o ID da agenda)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` = e-mail da Service Account
- `GOOGLE_PRIVATE_KEY` = chave privada do JSON (campo `private_key`)
  - Se estiver no Render, cole a chave e mantenha as quebras de linha.
  - Se precisar, use `\n` no lugar de quebras de linha reais.

Opcional:
- `BASE_TZ` = `America/Sao_Paulo`
- `ALLOWED_ORIGINS` = `https://seu-site.com,https://www.seu-site.com` (se quiser restringir CORS)

## 4) Rodar local

```bash
cd backend
npm install
npm start
```

Teste:
- `GET http://localhost:3000/health`
- `GET http://localhost:3000/api/slots?date=2026-01-29&duration=60`

## 5) Deploy no Render (recomendado)

- Crie um **Web Service** (Node)
- Build: `npm install`
- Start: `npm start`
- Configure as variáveis de ambiente acima

Após deploy, você terá uma URL tipo:
`https://seu-servico.onrender.com`

## 6) Ligar com o site

No arquivo `index.html`, ajuste:

```js
API_BASE: "https://SUA-API-DO-RENDER.onrender.com"
```

## Como o bloqueio de quadra funciona

- Eventos com "Quadra 1" ou "Q1" bloqueiam só a quadra 1
- Eventos com "Quadra 2" ou "Q2" bloqueiam só a quadra 2
- Eventos que NÃO informam quadra bloqueiam as duas (ex: aulas/torneios)

Sugestão: sempre nomear eventos manuais como:
- `Aula Beach Tennis — Quadra 1`
- `Aula Vôlei — Quadra 2`