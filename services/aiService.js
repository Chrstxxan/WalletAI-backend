const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function categorizeTransaction(description) {
  const response = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: `Categorize esta transação em uma única palavra, escolhendo entre: Alimentação, Transporte, Lazer, Moradia, Saúde, Outros. Responda só com a categoria, sem explicação. Transação: "${description}"` }]
  });
  return response.choices[0].message.content.trim();
}

const REGRAS_BENEFICIO = {
  VR: 'restaurantes, delivery de comida (iFood, Rappi) e às vezes mercado/supermercado',
  VA: 'mercado/supermercado',
  'Combustível': 'postos de combustível/gasolina',
};

async function validarCompatibilidadeBeneficio(description, tipoBeneficio) {
  const regras = REGRAS_BENEFICIO[tipoBeneficio];
  const response = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content:
      `Um cartão de benefício do tipo ${tipoBeneficio} normalmente só é aceito em ${regras}. ` +
      `A transação "${description}" seria tipicamente aceita nesse tipo de cartão? Responda só SIM ou NÃO.` }],
  });
  return response.choices[0].message.content.trim().toUpperCase().startsWith('SIM');
}

module.exports = { categorizeTransaction, validarCompatibilidadeBeneficio };