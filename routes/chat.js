const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const tools = [
  {
    type: 'function',
    function: {
      name: 'buscar_resumo_financeiro',
      description: 'Busca o resumo financeiro do mês atual: renda mensal, despesas fixas, quanto já foi gasto e quanto ainda pode gastar.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_gastos_por_categoria',
      description: 'Busca o total gasto em uma categoria específica no mês atual.',
      parameters: {
        type: 'object',
        properties: {
          categoria: { type: 'string', description: 'Nome da categoria: Alimentação, Transporte, Lazer, Moradia, Saúde ou Outros' },
        },
        required: ['categoria'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_transacoes',
      description: 'Lista as transações do mês atual, podendo filtrar por tipo ou categoria.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['receita', 'despesa'], description: 'Filtrar por tipo' },
          categoria: { type: 'string', description: 'Filtrar por categoria' },
        },
      },
    },
  },
];

function getMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

async function buscarResumoFinanceiro(userId) {
  const profile = await prisma.financialProfile.findUnique({ where: { userId } });
  const incomeSources = await prisma.incomeSource.findMany({ where: { userId } });
  const fixedExpenseItems = await prisma.fixedExpense.findMany({ where: { userId } });
  const monthlyIncome = incomeSources.reduce((s, i) => s + i.amount, 0);
  const fixedExpenses = fixedExpenseItems.reduce((s, i) => s + i.amount, 0);

  const { start, end } = getMonthRange();
  const transactions = await prisma.transaction.findMany({ where: { userId, date: { gte: start, lte: end } } });
  const totalDespesas = transactions.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const limiteLivre = monthlyIncome - fixedExpenses;

  return {
    rendaMensal: monthlyIncome,
    despesasFixas: fixedExpenses,
    limiteLivreParaGastos: limiteLivre,
    totalGastoNoMes: totalDespesas,
    disponivelParaGastar: limiteLivre - totalDespesas,
    reservaDeSeguranca: profile?.workingCapital || 0,
  };
}

async function buscarGastosPorCategoria(userId, categoria) {
  const { start, end } = getMonthRange();
  const transactions = await prisma.transaction.findMany({
    where: { userId, type: 'despesa', date: { gte: start, lte: end }, category: { name: categoria } },
  });
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  return { categoria, total, quantidadeDeTransacoes: transactions.length };
}

async function listarTransacoes(userId, tipo, categoria) {
  const { start, end } = getMonthRange();
  const where = { userId, date: { gte: start, lte: end } };
  if (tipo) where.type = tipo;
  if (categoria) where.category = { name: categoria };

  const transactions = await prisma.transaction.findMany({ where, include: { category: true }, orderBy: { date: 'desc' } });
  return transactions.map(t => ({
    descricao: t.description,
    valor: t.amount,
    tipo: t.type,
    categoria: t.category.name,
  }));
}

router.post('/', async (req, res) => {
  const { message } = req.body;
  const userId = req.userId;

  try {
    const messages = [
      {
        role: 'system',
        content: 'Você é o assistente financeiro do app WalletAI. Responda sempre em português, de forma direta e amigável. Use SEMPRE os dados reais retornados pelas ferramentas — nunca invente números.',
      },
      { role: 'user', content: message },
    ];

    let response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages,
      tools,
      tool_choice: 'auto',
    });

    let responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls) {
      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        let result;

        if (toolCall.function.name === 'buscar_resumo_financeiro') {
          result = await buscarResumoFinanceiro(userId);
        } else if (toolCall.function.name === 'buscar_gastos_por_categoria') {
          result = await buscarGastosPorCategoria(userId, args.categoria);
        } else if (toolCall.function.name === 'listar_transacoes') {
          result = await listarTransacoes(userId, args.tipo, args.categoria);
        } else {
          result = { erro: 'Ferramenta desconhecida' };
        }

        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
      }

      response = await groq.chat.completions.create({ model: 'openai/gpt-oss-120b', messages });
      responseMessage = response.choices[0].message;
    }

    res.json({ reply: responseMessage.content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Não foi possível processar a mensagem' });
  }
});

module.exports = router;