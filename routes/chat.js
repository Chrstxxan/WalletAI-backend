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
      description: 'Busca o total gasto em UMA categoria específica no mês atual, e também o limite/orçamento que o usuário configurou pra essa categoria em "Orçamento por categoria" (se houver). Use sempre que a pergunta mencionar uma categoria específica (ex: "quanto gastei em alimentação", "qual meu limite de transporte").',
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
      name: 'buscar_orcamentos_por_categoria',
      description: 'Busca, de uma vez, o limite/orçamento configurado e o gasto atual de TODAS as categorias no mês atual (tela "Orçamento por categoria" do app). Use quando o usuário perguntar de forma geral sobre os orçamentos por categoria, sem citar uma categoria específica.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_metas_financeiras',
      description: 'Busca as metas financeiras do usuário (ex: "Viagem: R$5000"), com valor alvo, valor já guardado e percentual concluído.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_cartoes_de_credito',
      description: 'Busca os cartões de crédito do usuário: limite de cada cartão, valor da fatura do mês atual, percentual do limite usado e os itens lançados na fatura atual.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerar_visao_geral_financeira',
      description: 'Busca tudo de uma vez (resumo geral, orçamento por categoria, metas financeiras, cartões de crédito, e quantos dias faltam pro fim do mês) pra montar uma visão completa. Use quando o usuário pedir uma visão geral, um resumo, dicas ou insights, ou perguntar de forma ampla como estão as finanças dele (ex: "como estou indo esse mês?", "me dá uma dica", "to gastando muito?", "faz um resumo pra mim", "tem algum alerta?").',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_transacoes',
      description: 'Lista todas as transações do mês atual, com valores e categorias, podendo filtrar por tipo ou categoria. Use para responder perguntas sobre quantidade, maior/menor valor, ou detalhes específicos.',
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

const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Lazer', 'Moradia', 'Saúde', 'Outros'];

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
  const savingsGoal = profile?.savingsGoal || 0;

  const now = new Date();
  const cardInvoices = await prisma.cardInvoice.findMany({
    where: { month: now.getMonth() + 1, year: now.getFullYear(), card: { userId } },
    include: { items: true },
  });
  const totalFaturaCartoes = cardInvoices.reduce((sum, inv) => sum + inv.items.reduce((s, i) => s + i.installmentAmount, 0), 0);

  const { start, end } = getMonthRange();
  const transactions = await prisma.transaction.findMany({ where: { userId, date: { gte: start, lte: end } } });
  const totalDespesas = transactions.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const limiteLivre = monthlyIncome - fixedExpenses - savingsGoal - totalFaturaCartoes;

  return {
    rendaMensal: monthlyIncome,
    despesasFixas: fixedExpenses,
    faturaDeCartaoDoMes: totalFaturaCartoes,
    metaDeEconomiaMensal: savingsGoal,
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

  const categoryRow = await prisma.category.findFirst({ where: { name: categoria } });
  const budget = categoryRow
    ? await prisma.categoryBudget.findUnique({ where: { userId_categoryId: { userId, categoryId: categoryRow.id } } })
    : null;

  return {
    categoria,
    totalGastoNestaCategoriaNoMes: total,
    quantidadeDeTransacoes: transactions.length,
    limiteOrcadoParaEstaCategoria: budget ? budget.limit : null,
    percentualDoLimiteDaCategoriaUsado: budget && budget.limit > 0 ? Math.round((total / budget.limit) * 100) : null,
    observacao: budget
      ? 'limiteOrcadoParaEstaCategoria é o teto que o usuário definiu especificamente pra essa categoria em "Orçamento por categoria" — é diferente do limite livre geral do mês.'
      : 'O usuário não definiu um limite específico pra essa categoria em "Orçamento por categoria" (limiteOrcadoParaEstaCategoria é null).',
  };
}

async function buscarOrcamentosPorCategoria(userId) {
  const { start, end } = getMonthRange();
  const budgets = await prisma.categoryBudget.findMany({ where: { userId }, include: { category: true } });
  const budgetByName = new Map(budgets.map(b => [b.category.name, b.limit]));

  const transactions = await prisma.transaction.findMany({
    where: { userId, type: 'despesa', date: { gte: start, lte: end } },
    include: { category: true },
  });
  const gastoPorCategoria = {};
  transactions.forEach(t => {
    gastoPorCategoria[t.category.name] = (gastoPorCategoria[t.category.name] || 0) + t.amount;
  });

  return CATEGORIAS_PADRAO.map(nome => {
    const limite = budgetByName.get(nome) || null;
    const gasto = gastoPorCategoria[nome] || 0;
    return {
      categoria: nome,
      limiteOrcado: limite,
      gastoNoMes: gasto,
      percentualUsado: limite ? Math.round((gasto / limite) * 100) : null,
    };
  });
}

async function buscarMetasFinanceiras(userId) {
  const goals = await prisma.goal.findMany({ where: { userId } });
  return goals.map(g => ({
    descricao: g.description,
    valorAlvo: g.targetAmount,
    valorAtual: g.currentAmount,
    percentualConcluido: g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0,
    concluida: g.currentAmount >= g.targetAmount,
  }));
}

async function buscarCartoesDeCredito(userId) {
  const now = new Date();
  const cards = await prisma.creditCard.findMany({
    where: { userId },
    include: {
      invoices: {
        where: { month: now.getMonth() + 1, year: now.getFullYear() },
        include: { items: true },
      },
    },
  });
  return cards.map(card => {
    const invoice = card.invoices[0];
    const totalFatura = invoice ? invoice.items.reduce((s, i) => s + i.installmentAmount, 0) : 0;
    return {
      nome: card.name,
      limiteDoCartao: card.limit,
      faturaAtualDoMes: totalFatura,
      percentualDoLimiteUsado: card.limit > 0 ? Math.round((totalFatura / card.limit) * 100) : 0,
      itensDaFaturaAtual: invoice
        ? invoice.items.map(i => ({ descricao: i.description, valorParcela: i.installmentAmount, parcela: `${i.currentInstallment}/${i.totalInstallments}` }))
        : [],
    };
  });
}

async function gerarVisaoGeralFinanceira(userId) {
  const [resumoGeral, orcamentosPorCategoria, metasFinanceiras, cartoesDeCredito] = await Promise.all([
    buscarResumoFinanceiro(userId),
    buscarOrcamentosPorCategoria(userId),
    buscarMetasFinanceiras(userId),
    buscarCartoesDeCredito(userId),
  ]);

  const hoje = new Date();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();

  return {
    resumoGeral,
    orcamentosPorCategoria,
    metasFinanceiras,
    cartoesDeCredito,
    diaAtualDoMes: hoje.getDate(),
    diasTotalNoMes: diasNoMes,
    diasRestantesNoMes: diasNoMes - hoje.getDate(),
  };
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

router.get('/history', async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.chatMessage.deleteMany({ where: { userId: req.userId, createdAt: { lt: sevenDaysAgo } } });
  const messages = await prisma.chatMessage.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages);
});

router.delete('/history', async (req, res) => {
  await prisma.chatMessage.deleteMany({ where: { userId: req.userId } });
  res.json({ message: 'Histórico apagado' });
});

router.post('/', async (req, res) => {
  const { message } = req.body;
  const userId = req.userId;

  try {
    const messages = [
      {
        role: 'system',
        content: 'Você é o Wally, o assistente financeiro do app WalletAI. Se perguntarem seu nome, diga que é Wally. Responda sempre em português, de forma direta e amigável. Use SEMPRE os dados reais retornados pelas ferramentas — nunca invente números. Se precisar de mais de uma ferramenta pra responder, pode chamar quantas precisar.\n\n' +
          'ATENÇÃO: não confunda estes dois conceitos parecidos:\n' +
          '- "limite livre para gastos" / "quanto ainda posso gastar" (SEM mencionar categoria) = campo limiteLivreParaGastos/disponivelParaGastar de buscar_resumo_financeiro. É o teto GERAL do mês (renda − despesas fixas − meta de economia − fatura de cartão).\n' +
          '- "limite"/"orçamento" de uma categoria específica (ex: "limite de alimentação", "quanto posso gastar em transporte") = campo limiteOrcadoParaEstaCategoria de buscar_gastos_por_categoria, ou use buscar_orcamentos_por_categoria pra ver todas de uma vez. Esse limite é configurado pelo usuário na tela "Orçamento por categoria" e pode ser null se ele não definiu.\n' +
          'Sempre que a pergunta citar uma categoria (alimentação, transporte, lazer, moradia, saúde, outros), use buscar_gastos_por_categoria ou buscar_orcamentos_por_categoria — nunca responda com o limite geral do mês nesse caso.\n\n' +
          'Você também tem acesso às metas financeiras do usuário (buscar_metas_financeiras) e aos cartões de crédito (buscar_cartoes_de_credito, com limite, fatura do mês e itens lançados).\n\n' +
          'INSIGHTS: quando o pedido for amplo — uma visão geral, resumo, dica, insight, ou "como estão minhas finanças"/"to gastando muito?" — use gerar_visao_geral_financeira (ela já traz resumo, orçamento por categoria, metas, cartões e quantos dias faltam no mês, tudo de uma vez) e responda com uma ANÁLISE curta, não só uma lista de números. Aponte o que for relevante: qual categoria pesa mais, se algum orçamento por categoria está perto de estourar (≥80%) ou já estourou, se o ritmo de gastos está alto considerando quantos dias já passaram no mês vs. quanto do limite livre já foi usado, se alguma meta está muito atrasada, se a fatura de algum cartão está perto do limite. Feche com 1-2 sugestões práticas quando fizer sentido. Seja honesto: se os dados forem insuficientes ou estiver tudo bem, diga isso — não invente um problema que não existe.',
      },
      { role: 'user', content: message },
    ];

    let finalContent = null;
    let iterations = 0;

    while (iterations < 5) {
      iterations++;
      const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages,
        tools,
        tool_choice: 'auto',
      });
      const responseMessage = response.choices[0].message;

      if (responseMessage.tool_calls) {
        messages.push(responseMessage);
        for (const toolCall of responseMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          let result;
          if (toolCall.function.name === 'buscar_resumo_financeiro') {
            result = await buscarResumoFinanceiro(userId);
          } else if (toolCall.function.name === 'buscar_gastos_por_categoria') {
            result = await buscarGastosPorCategoria(userId, args.categoria);
          } else if (toolCall.function.name === 'buscar_orcamentos_por_categoria') {
            result = await buscarOrcamentosPorCategoria(userId);
          } else if (toolCall.function.name === 'buscar_metas_financeiras') {
            result = await buscarMetasFinanceiras(userId);
          } else if (toolCall.function.name === 'buscar_cartoes_de_credito') {
            result = await buscarCartoesDeCredito(userId);
          } else if (toolCall.function.name === 'gerar_visao_geral_financeira') {
            result = await gerarVisaoGeralFinanceira(userId);
          } else if (toolCall.function.name === 'listar_transacoes') {
            result = await listarTransacoes(userId, args.tipo, args.categoria);
          } else {
            result = { erro: 'Ferramenta desconhecida' };
          }
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
        }
        continue;
      }

      finalContent = responseMessage.content;
      break;
    }

    if (!finalContent) {
      finalContent = 'Não consegui concluir a resposta a tempo. Tenta reformular a pergunta.';
    }

    await prisma.chatMessage.create({ data: { userId, role: 'user', content: message } });
    await prisma.chatMessage.create({ data: { userId, role: 'assistant', content: finalContent } });

    res.json({ reply: finalContent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Não foi possível processar a mensagem' });
  }
});

module.exports = router;