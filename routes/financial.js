const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Buscar o perfil financeiro (sem a renda, que agora é calculada separadamente)
router.get('/profile', async (req, res) => {
  const profile = await prisma.financialProfile.findUnique({ where: { userId: req.userId } });
  res.json(profile || { workingCapital: 0, savingsGoal: 0, creditTypes: [] });
});

// Criar ou atualizar despesas fixas, meta de economia, capital de giro e tipos de crédito
router.put('/profile', async (req, res) => {
  const { workingCapital, savingsGoal, creditTypes } = req.body;
  const profile = await prisma.financialProfile.upsert({
    where: { userId: req.userId },
    update: { workingCapital, savingsGoal, creditTypes },
    create: { userId: req.userId, workingCapital, savingsGoal, creditTypes },
  });
  res.json(profile);
});

// Listar as fontes de renda do usuário
router.get('/income-sources', async (req, res) => {
  const sources = await prisma.incomeSource.findMany({ where: { userId: req.userId } });
  res.json(sources);
});

// Substituir a lista inteira de fontes de renda (mais simples que editar uma por uma)
router.put('/income-sources', async (req, res) => {
  const { sources } = req.body; // [{ description, amount }, ...]
  await prisma.incomeSource.deleteMany({ where: { userId: req.userId } });
  if (sources && sources.length > 0) {
    await prisma.incomeSource.createMany({
      data: sources.map(s => ({ userId: req.userId, description: s.description, amount: s.amount })),
    });
  }
  const updated = await prisma.incomeSource.findMany({ where: { userId: req.userId } });
  res.json(updated);
});

router.get('/fixed-expenses', async (req, res) => {
  const items = await prisma.fixedExpense.findMany({ where: { userId: req.userId } });
  res.json(items);
});

router.put('/fixed-expenses', async (req, res) => {
  const { items } = req.body;
  await prisma.fixedExpense.deleteMany({ where: { userId: req.userId } });
  if (items && items.length > 0) {
    await prisma.fixedExpense.createMany({
      data: items.map(i => ({ userId: req.userId, description: i.description, amount: i.amount })),
    });
  }
  const updated = await prisma.fixedExpense.findMany({ where: { userId: req.userId } });
  res.json(updated);
});

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

// Dashboard: resumo do mês atual com cálculos
router.get('/dashboard', async (req, res) => {
  const profile = await prisma.financialProfile.findUnique({ where: { userId: req.userId } });
  const incomeSources = await prisma.incomeSource.findMany({ where: { userId: req.userId } });
  const monthlyIncome = incomeSources.reduce((sum, s) => sum + s.amount, 0);

  const fixedExpenseItems = await prisma.fixedExpense.findMany({ where: { userId: req.userId } });
  const fixedExpenses = fixedExpenseItems.reduce((sum, i) => sum + i.amount, 0);

  const savingsGoal = profile?.savingsGoal || 0;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const cardInvoices = await prisma.cardInvoice.findMany({
    where: { month: now.getMonth() + 1, year: now.getFullYear(), card: { userId: req.userId } },
    include: { items: true },
  });
  const totalFaturaCartoes = cardInvoices.reduce((sum, inv) => sum + inv.items.reduce((s, i) => s + i.installmentAmount, 0), 0);

  const transactions = await prisma.transaction.findMany({
    where: { userId: req.userId, date: { gte: startOfMonth, lte: endOfMonth } },
    include: { category: true },
  });

  const totalDespesas = transactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + t.amount, 0);
  const totalReceitas = transactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + t.amount, 0);

  const limiteLivre = monthlyIncome - fixedExpenses - savingsGoal - totalFaturaCartoes;
  const disponivel = limiteLivre - totalDespesas;
  const percentualUsado = limiteLivre > 0 ? (totalDespesas / limiteLivre) * 100 : 0;

  const porCategoria = {};
  transactions.filter(t => t.type === 'despesa').forEach(t => {
    const nome = t.category.name;
    porCategoria[nome] = (porCategoria[nome] || 0) + t.amount;
  });

  res.json({
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
  });
});

module.exports = router;