const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Buscar o perfil financeiro do usuário
router.get('/profile', async (req, res) => {
  const profile = await prisma.financialProfile.findUnique({ where: { userId: req.userId } });
  res.json(profile || { monthlyIncome: 0, fixedExpenses: 0, workingCapital: 0, creditTypes: [] });
});

// Criar ou atualizar o perfil financeiro
router.put('/profile', async (req, res) => {
  const { monthlyIncome, fixedExpenses, workingCapital, creditTypes } = req.body;
  const profile = await prisma.financialProfile.upsert({
    where: { userId: req.userId },
    update: { monthlyIncome, fixedExpenses, workingCapital, creditTypes },
    create: { userId: req.userId, monthlyIncome, fixedExpenses, workingCapital, creditTypes },
  });
  res.json(profile);
});

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

// Dashboard: resumo do mês atual com cálculos
router.get('/dashboard', async (req, res) => {
  const profile = await prisma.financialProfile.findUnique({ where: { userId: req.userId } });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const transactions = await prisma.transaction.findMany({
    where: { userId: req.userId, date: { gte: startOfMonth, lte: endOfMonth } },
    include: { category: true },
  });

  const totalDespesas = transactions.filter(t => t.type === 'despesa').reduce((sum, t) => sum + t.amount, 0);
  const totalReceitas = transactions.filter(t => t.type === 'receita').reduce((sum, t) => sum + t.amount, 0);

  const monthlyIncome = profile?.monthlyIncome || 0;
  const fixedExpenses = profile?.fixedExpenses || 0;
  const limiteLivre = monthlyIncome - fixedExpenses;
  const disponivel = limiteLivre - totalDespesas;
  const percentualUsado = limiteLivre > 0 ? (totalDespesas / limiteLivre) * 100 : 0;

  const porCategoria = {};
  transactions.filter(t => t.type === 'despesa').forEach(t => {
    const nome = t.category.name;
    porCategoria[nome] = (porCategoria[nome] || 0) + t.amount;
  });

  res.json({
    profile: profile || null,
    totalDespesas: arredondar(totalDespesas),
    totalReceitas: arredondar(totalReceitas),
    limiteLivre: arredondar(limiteLivre),
    disponivel: arredondar(disponivel),
    percentualUsado: Math.round(percentualUsado),
    alerta: percentualUsado >= 80,
    gastosPorCategoria: Object.entries(porCategoria).map(([categoria, valor]) => ({ categoria, valor: arredondar(valor) })),
  });
});

module.exports = router;