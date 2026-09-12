const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function categorizeTransaction(description) {
  const response = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: `Categorize esta transação em uma única palavra, escolhendo entre: Alimentação, Transporte, Lazer, Moradia, Saúde, Outros. Responda só com a categoria, sem explicação. Transação: "${description}"` }]
  });
  return response.choices[0].message.content.trim();
}

module.exports = { categorizeTransaction };