const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/profile', async (req, res) => {
  const profile = await prisma.financialProfile.findUnique({ where: { userId: req.userId } });
  res.json(profile || { workingCapital: 0, savingsGoal: 0, creditTypes: [] });
});

router.put('/profile', async (req, res) => {
  const { workingCapital, savingsGoal, creditTypes } = req.body;
  const profile = await prisma.financialProfile.upsert({
    where: { userId: req.userId },
    update: { workingCapital, savingsGoal, creditTypes },
    create: { userId: req.userId, workingCapital, savingsGoal, creditTypes },
  });
  res.json(profile);
});

async function ensureMonthlyIncomeRecords(userId, month, year) {
  const incomeSources = await prisma.incomeSource.findMany({ where: { userId, recorrente: true } });

  const created = [];
  for (const source of incomeSources) {
    const record = await prisma.incomeRecord.upsert({
      where: {
        incomeSourceId_month_year: {
          incomeSourceId: source.id,
          month,
          year,
        },
      },
      update: {},
      create: {
        incomeSourceId: source.id,
        userId,
        month,
        year,
        amount: source.amount,
        description: source.description,
        isReceived: false,
      },
    });
    created.push(record);
  }

  return created;
}

async function ensureMonthlyFixedExpenseRecords(userId, month, year) {
  const fixedExpenses = await prisma.fixedExpense.findMany({
    where: { userId, recorrente: true, creditCardId: null },
  });

  const created = [];
  for (const expense of fixedExpenses) {
    const record = await prisma.fixedExpenseRecord.upsert({
      where: {
        fixedExpenseId_month_year: {
          fixedExpenseId: expense.id,
          month,
          year,
        },
      },
      update: {},
      create: {
        fixedExpenseId: expense.id,
        userId,
        month,
        year,
        amount: expense.amount,
        description: expense.description,
        isPaid: false,
      },
    });
    created.push(record);
  }

  return created;
}

async function ensureMonthlyCardExpenseItems(userId, month, year) {
  const cardExpenses = await prisma.fixedExpense.findMany({
    where: { userId, recorrente: true, creditCardId: { not: null } },
  });

  const created = [];
  for (const expense of cardExpenses) {
    const invoice = await prisma.cardInvoice.upsert({
      where: { cardId_month_year: { cardId: expense.creditCardId, month, year } },
      update: {},
      create: { cardId: expense.creditCardId, month, year },
    });

    const item = await prisma.cardInvoiceItem.upsert({
      where: { invoiceId_fixedExpenseId: { invoiceId: invoice.id, fixedExpenseId: expense.id } },
      update: {},
      create: {
        invoiceId: invoice.id,
        fixedExpenseId: expense.id,
        description: expense.description,
        installmentAmount: expense.amount,
        currentInstallment: 1,
        totalInstallments: 1,
      },
    });
    created.push(item);
  }

  return created;
}

router.post('/income-sources/generate-monthly', async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const created = await ensureMonthlyIncomeRecords(req.userId, month, year);

  res.json({ month, year, records: created });
});

router.get('/income-sources/monthly-records', async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const records = await prisma.incomeRecord.findMany({
    where: { userId: req.userId, month, year },
    orderBy: { isReceived: 'asc' },
  });

  res.json(records);
});

router.patch('/income-sources/records/:id/toggle-received', async (req, res) => {
  const record = await prisma.incomeRecord.findUnique({ where: { id: Number(req.params.id) } });

  if (!record || record.userId !== req.userId) {
    return res.status(404).json({ error: 'Record não encontrado' });
  }

  const updated = await prisma.incomeRecord.update({
    where: { id: record.id },
    data: {
      isReceived: !record.isReceived,
      receivedAt: !record.isReceived ? new Date() : null,
    },
  });

  res.json(updated);
});

router.get('/income-sources', async (req, res) => {
  const sources = await prisma.incomeSource.findMany({ where: { userId: req.userId } });
  res.json(sources);
});

router.put('/income-sources', async (req, res) => {
  const { sources } = req.body;
  const incoming = sources || [];

  const existing = await prisma.incomeSource.findMany({ where: { userId: req.userId } });
  const incomingIds = new Set(incoming.filter(s => s.id).map(s => s.id));
  const toDelete = existing.filter(e => !incomingIds.has(e.id));
  if (toDelete.length > 0) {
    await prisma.incomeSource.deleteMany({ where: { id: { in: toDelete.map(d => d.id) } } });
  }

  for (const s of incoming) {
    const recorrente = s.recorrente !== false;
    const month = recorrente ? null : s.month;
    const year = recorrente ? null : s.year;
    const data = { description: s.description, amount: s.amount, recorrente, month, year };

    let source;
    if (s.id && existing.some(e => e.id === s.id)) {
      source = await prisma.incomeSource.update({ where: { id: s.id }, data });
    } else {
      source = await prisma.incomeSource.create({ data: { ...data, userId: req.userId } });
    }

    if (!recorrente && month && year) {
      await prisma.incomeRecord.deleteMany({
        where: { incomeSourceId: source.id, NOT: { month, year } },
      });
      await prisma.incomeRecord.upsert({
        where: { incomeSourceId_month_year: { incomeSourceId: source.id, month, year } },
        update: { amount: s.amount, description: s.description },
        create: {
          incomeSourceId: source.id,
          userId: req.userId,
          month,
          year,
          amount: s.amount,
          description: s.description,
          isReceived: false,
        },
      });
    }
  }

  const updated = await prisma.incomeSource.findMany({ where: { userId: req.userId } });
  res.json(updated);
});

router.post('/fixed-expenses/generate-monthly', async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const created = await ensureMonthlyFixedExpenseRecords(req.userId, month, year);
  await ensureMonthlyCardExpenseItems(req.userId, month, year);

  res.json({ month, year, records: created });
});

router.get('/fixed-expenses/monthly-records', async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const records = await prisma.fixedExpenseRecord.findMany({
    where: { userId: req.userId, month, year },
    orderBy: { isPaid: 'asc' },
  });

  res.json(records);
});

router.patch('/fixed-expenses/records/:id/toggle-paid', async (req, res) => {
  const record = await prisma.fixedExpenseRecord.findUnique({
    where: { id: Number(req.params.id) },
  });

  if (!record || record.userId !== req.userId) {
    return res.status(404).json({ error: 'Record não encontrado' });
  }

  const updated = await prisma.fixedExpenseRecord.update({
    where: { id: record.id },
    data: {
      isPaid: !record.isPaid,
      paidAt: !record.isPaid ? new Date() : null,
    },
  });

  res.json(updated);
});

router.get('/fixed-expenses', async (req, res) => {
  const items = await prisma.fixedExpense.findMany({ where: { userId: req.userId } });
  res.json(items);
});

router.put('/fixed-expenses', async (req, res) => {
  const { items } = req.body;
  const incoming = items || [];

  const existing = await prisma.fixedExpense.findMany({ where: { userId: req.userId } });
  const incomingIds = new Set(incoming.filter(i => i.id).map(i => i.id));
  const toDelete = existing.filter(e => !incomingIds.has(e.id));
  if (toDelete.length > 0) {
    await prisma.fixedExpense.deleteMany({ where: { id: { in: toDelete.map(d => d.id) } } });
  }

  const userCards = await prisma.creditCard.findMany({ where: { userId: req.userId } });
  const userCardIds = new Set(userCards.map(c => c.id));

  for (const i of incoming) {
    const recorrente = i.recorrente !== false;
    const month = recorrente ? null : i.month;
    const year = recorrente ? null : i.year;
    const creditCardId = i.creditCardId && userCardIds.has(i.creditCardId) ? i.creditCardId : null;
    const data = { description: i.description, amount: i.amount, recorrente, month, year, creditCardId };

    let expense;
    if (i.id && existing.some(e => e.id === i.id)) {
      expense = await prisma.fixedExpense.update({ where: { id: i.id }, data });
    } else {
      expense = await prisma.fixedExpense.create({ data: { ...data, userId: req.userId } });
    }

    if (!recorrente && month && year && creditCardId) {
      await prisma.cardInvoiceItem.deleteMany({
        where: { fixedExpenseId: expense.id, NOT: { invoice: { month, year } } },
      });
      const invoice = await prisma.cardInvoice.upsert({
        where: { cardId_month_year: { cardId: creditCardId, month, year } },
        update: {},
        create: { cardId: creditCardId, month, year },
      });
      await prisma.cardInvoiceItem.upsert({
        where: { invoiceId_fixedExpenseId: { invoiceId: invoice.id, fixedExpenseId: expense.id } },
        update: { installmentAmount: i.amount, description: i.description },
        create: {
          invoiceId: invoice.id,
          fixedExpenseId: expense.id,
          description: i.description,
          installmentAmount: i.amount,
          currentInstallment: 1,
          totalInstallments: 1,
        },
      });
    } else if (!recorrente && month && year) {
      await prisma.fixedExpenseRecord.deleteMany({
        where: { fixedExpenseId: expense.id, NOT: { month, year } },
      });
      await prisma.fixedExpenseRecord.upsert({
        where: { fixedExpenseId_month_year: { fixedExpenseId: expense.id, month, year } },
        update: { amount: i.amount, description: i.description },
        create: {
          fixedExpenseId: expense.id,
          userId: req.userId,
          month,
          year,
          amount: i.amount,
          description: i.description,
          isPaid: false,
        },
      });
    }
  }

  const updated = await prisma.fixedExpense.findMany({ where: { userId: req.userId } });
  res.json(updated);
});

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Lazer', 'Moradia', 'Saúde', 'Outros'];

async function computeMonthlyFinancials(userId, month, year) {
  const profile = await prisma.financialProfile.findUnique({ where: { userId } });

  const incomeRecords = await prisma.incomeRecord.findMany({ where: { userId, month, year } });
  const monthlyIncome = incomeRecords.reduce((sum, r) => sum + r.amount, 0);

  const fixedExpenseRecords = await prisma.fixedExpenseRecord.findMany({ where: { userId, month, year } });
  const fixedExpenses = fixedExpenseRecords.reduce((sum, r) => sum + r.amount, 0);

  const savingsGoal = profile?.savingsGoal || 0;

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const cardInvoices = await prisma.cardInvoice.findMany({
    where: { month, year, card: { userId } },
    include: { items: true },
  });
  const totalFaturaCartoes = cardInvoices.reduce((sum, inv) => sum + inv.items.reduce((s, i) => s + i.installmentAmount, 0), 0);

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: startOfMonth, lte: endOfMonth } },
    include: { category: true },
  });

  // despesas pagas com carteira de benefício (VR/VA/Combustível) são dinheiro separado —
  // não entram no "disponível pra gastar" nem nos gráficos de categoria (ver benefit-wallets.tsx)
  const despesasProprias = transactions.filter(t => t.type === 'despesa' && !t.benefitWalletId);
  const totalDespesas = despesasProprias.reduce((sum, t) => sum + t.amount, 0);
  const totalReceitas = transactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + t.amount, 0);

  const limiteLivre = monthlyIncome - fixedExpenses - savingsGoal - totalFaturaCartoes;
  const disponivel = limiteLivre - totalDespesas;
  const percentualUsado = limiteLivre > 0 ? (totalDespesas / limiteLivre) * 100 : 0;

  const porCategoria = {};
  despesasProprias.forEach(t => {
    const nome = t.category.name;
    porCategoria[nome] = (porCategoria[nome] || 0) + t.amount;
  });

  const budgets = await prisma.categoryBudget.findMany({ where: { userId }, include: { category: true } });
  const orcamentosPorCategoria = budgets.map(b => {
    const gasto = porCategoria[b.category.name] || 0;
    const percentualOrcamento = b.limit > 0 ? (gasto / b.limit) * 100 : 0;
    return {
      categoria: b.category.name,
      limite: arredondar(b.limit),
      gasto: arredondar(gasto),
      percentualUsado: Math.round(percentualOrcamento),
      alerta: percentualOrcamento >= 80,
      estourado: percentualOrcamento >= 100,
    };
  });

  return {
    profile: profile || null,
    monthlyIncome: arredondar(monthlyIncome),
    totalDespesas: arredondar(totalDespesas),
    totalReceitas: arredondar(totalReceitas),
    totalFaturaCartoes: arredondar(totalFaturaCartoes),
    fixedExpenses: arredondar(fixedExpenses),
    limiteLivre: arredondar(limiteLivre),
    disponivel: arredondar(disponivel),
    percentualUsado: Math.round(percentualUsado),
    alerta: percentualUsado >= 80,
    gastosPorCategoria: Object.entries(porCategoria).map(([categoria, valor]) => ({ categoria, valor: arredondar(valor) })),
    orcamentosPorCategoria,
  };
}

router.get('/category-budgets', async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const budgets = await prisma.categoryBudget.findMany({ where: { userId: req.userId }, include: { category: true } });
  const budgetByName = new Map(budgets.map(b => [b.category.name, b.limit]));

  const transactions = await prisma.transaction.findMany({
    where: { userId: req.userId, type: 'despesa', benefitWalletId: null, date: { gte: startOfMonth, lte: endOfMonth } },
    include: { category: true },
  });
  const gastoPorCategoria = {};
  transactions.forEach(t => {
    gastoPorCategoria[t.category.name] = (gastoPorCategoria[t.category.name] || 0) + t.amount;
  });

  const result = CATEGORIAS_PADRAO.map(nome => {
    const limite = budgetByName.get(nome) || 0;
    const gasto = gastoPorCategoria[nome] || 0;
    const percentualUsado = limite > 0 ? Math.round((gasto / limite) * 100) : 0;
    return {
      categoria: nome,
      limite: budgetByName.has(nome) ? arredondar(budgetByName.get(nome)) : null,
      gasto: arredondar(gasto),
      percentualUsado,
      alerta: limite > 0 && percentualUsado >= 80,
    };
  });

  res.json(result);
});

router.put('/category-budgets', async (req, res) => {
  const { budgets } = req.body;
  const incoming = budgets || [];

  const existing = await prisma.categoryBudget.findMany({ where: { userId: req.userId }, include: { category: true } });

  for (const nome of CATEGORIAS_PADRAO) {
    const entry = incoming.find(b => b.categoria === nome);
    const existingBudget = existing.find(e => e.category.name === nome);

    if (entry && entry.limite > 0) {
      let category = await prisma.category.findFirst({ where: { name: nome } });
      if (!category) {
        category = await prisma.category.create({ data: { name: nome } });
      }

      await prisma.categoryBudget.upsert({
        where: { userId_categoryId: { userId: req.userId, categoryId: category.id } },
        update: { limit: entry.limite },
        create: { userId: req.userId, categoryId: category.id, limit: entry.limite },
      });
    } else if (existingBudget) {
      await prisma.categoryBudget.delete({ where: { id: existingBudget.id } });
    }
  }

  const updated = await prisma.categoryBudget.findMany({ where: { userId: req.userId }, include: { category: true } });
  res.json(updated.map(b => ({ categoria: b.category.name, limite: b.limit })));
});

router.get('/dashboard', async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  await ensureMonthlyIncomeRecords(req.userId, month, year);
  await ensureMonthlyFixedExpenseRecords(req.userId, month, year);
  await ensureMonthlyCardExpenseItems(req.userId, month, year);

  const data = await computeMonthlyFinancials(req.userId, month, year);
  res.json(data);
});

router.get('/month-summary', async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!month || !year) {
    return res.status(400).json({ error: 'Informe month e year' });
  }

  const data = await computeMonthlyFinancials(req.userId, month, year);
  res.json(data);
});

router.get('/month-status', async (req, res) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { lastSeenMonth: true, lastSeenYear: true },
  });

  if (!user.lastSeenMonth || !user.lastSeenYear) {
    await prisma.user.update({
      where: { id: req.userId },
      data: { lastSeenMonth: currentMonth, lastSeenYear: currentYear },
    });
    return res.json({ needsClosing: false, lastSeenMonth: currentMonth, lastSeenYear: currentYear, currentMonth, currentYear });
  }

  const needsClosing = user.lastSeenYear < currentYear || (user.lastSeenYear === currentYear && user.lastSeenMonth < currentMonth);

  res.json({ needsClosing, lastSeenMonth: user.lastSeenMonth, lastSeenYear: user.lastSeenYear, currentMonth, currentYear });
});

router.post('/acknowledge-month', async (req, res) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  await prisma.user.update({
    where: { id: req.userId },
    data: { lastSeenMonth: currentMonth, lastSeenYear: currentYear },
  });

  res.json({ lastSeenMonth: currentMonth, lastSeenYear: currentYear });
});

module.exports = router;