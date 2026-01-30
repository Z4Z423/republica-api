
import express from "express";
import cors from "cors";

// Node 18+ tem fetch nativo.
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 8787;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini"; // custo baixo, qualidade ótima p/ atendimento

if (!OPENAI_API_KEY) {
  console.warn("⚠️  OPENAI_API_KEY não definido. Defina no .env ou nas variáveis do servidor.");
}

// Extrai texto do Response (output -> message -> content -> output_text)
function extractOutputText(respJson) {
  if (!respJson) return "";
  if (typeof respJson.output_text === "string" && respJson.output_text.trim()) return respJson.output_text.trim();

  const out = respJson.output;
  if (!Array.isArray(out)) return "";
  const parts = [];
  for (const item of out) {
    if (!item || item.type !== "message") continue;
    if (item.role !== "assistant") continue;
    const content = item.content || [];
    for (const c of content) {
      if (c && c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

// Responde com JSON em formato fixo p/ o front
function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, userMessage, siteContext } = req.body || {};
    const msg = String(userMessage || "").trim();
    if (!msg) return res.status(400).json({ error: "Mensagem vazia." });

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        answer: "A IA avançada ainda não está configurada (falta a chave). Enquanto isso, posso ajudar com valores/horários/endereço/regras no próprio site 😊",
        action: "NONE",
      });
    }

    // Prompt “tipo ChatGPT”, mas amarrado ao seu negócio e com regras claras
    const instructions = `
Você é o assistente oficial da República da Praia (arena de esportes na areia).
Objetivo: responder rápido, amigável e com clareza.

REGRAS IMPORTANTES:
- Use APENAS as informações em siteContext. Se algo não estiver no siteContext, peça para a pessoa confirmar ou chame no Whats.
- Se o usuário falar sobre AULAS/TREINOS/PROFESSOR, você NÃO agenda e NÃO inventa preço. Responda curto e faça handoff humano:
  ação = "OPEN_WHATS" com mensagem pronta para equipe.
- Se o usuário falar de LOCAÇÃO AVULSA / RESERVA / QUADRA, você deve orientar e sugerir abrir reserva:
  ação = "OPEN_BOOKING".
- Para perguntas comuns (valores/horários/endereço/regras), responda direto.
- Respostas em PT-BR, tom leve e “top”, sem textão.

FORMATO DE SAÍDA (obrigatório): responda SOMENTE com um JSON:
{
  "answer": "texto para o usuário",
  "action": "NONE | OPEN_BOOKING | OPEN_WHATS",
  "whatsMessage": "se action=OPEN_WHATS, escreva a msg",
  "quick": [{"label":"texto","payload":"texto ou __BOOK__"}]
}
`.trim();

    const contextBlock = JSON.stringify(siteContext || {}, null, 2);

    // Chamada Responses API (HTTP)
    const payload = {
      model: MODEL,
      // instruções (system) + entrada (user)
      instructions,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `siteContext:\n${contextBlock}\n\nUsuário: ${msg}` }
          ]
        }
      ],
      // segura custo:
      max_output_tokens: 350,
      temperature: 0.3,
      store: false,
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({ error: "Falha ao chamar OpenAI", details: data?.error || data });
    }

    const raw = extractOutputText(data);
    const parsed = safeJsonParse(raw);

    if (parsed && typeof parsed.answer === "string") {
      // garante campos
      return res.json({
        answer: parsed.answer,
        action: parsed.action || "NONE",
        whatsMessage: parsed.whatsMessage || "",
        quick: Array.isArray(parsed.quick) ? parsed.quick : [],
      });
    }

    // Fallback: se o modelo responder texto normal, devolve assim mesmo
    return res.json({
      answer: raw || "Beleza! 😊",
      action: "NONE",
      quick: [],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro interno", details: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`✅ RP Chat backend rodando na porta ${PORT}`);
});
