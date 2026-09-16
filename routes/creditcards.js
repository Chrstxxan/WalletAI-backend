const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const now = new Date();
  const cards = await prisma.creditCard.findMany({
    where: { userId: req.userId },
    include: {
      invoices: {
        where: { month: now.getMonth() + 1, year: now.getFullYear() },
        include: { items: true },
      },
    },
  });

  const result = cards.map(card => {
    const invoice = card.invoices[0];
    const totalFatura = invoice ? invoice.items.reduce((s, i) => s + i.installmentAmount, 0) : 0;
    return {
      id: card.id,
      name: card.name,
      limit: card.limit,
      totalFaturaAtual: Math.round(totalFatura * 100) / 100,
      percentualDoLimite: card.limit > 0 ? Math.round((totalFatura / card.limit) * 100) : 0,
    };
  });

  res.json(result);
});

router.post('/', async (req, res) => {
  const { name, limit } = req.body;
  if (!name || !limit || Number(limit) <= 0) {
    return res.status(400).json({ error: 'Nome e limite (maior que zero) são obrigatórios' });
  }
  const card = await prisma.creditCard.create({ data: { userId: req.userId, name, limit: Number(limit) } });
  res.json(card);
});

router.delete('/:id', async (req, res) => {
  const card = await prisma.creditCard.findUnique({ where: { id: Number(req.params.id) } });
  if (!card || card.userId !== req.userId) return res.status(404).json({ error: 'Cartão não encontrado' });
  await prisma.creditCard.delete({ where: { id: Number(req.params.id) } });
  res.json({ message: 'Cartão excluído' });
});

router.post('/:cardId/invoice-items', async (req, res) => {
  const card = await prisma.creditCard.findUnique({ where: { id: Number(req.params.cardId) } });
  if (!card || card.userId !== req.userId) return res.status(404).json({ error: 'Cartão não encontrado' });

  const { month, year, description, installmentAmount, currentInstallment, totalInstallments, category } = req.body;

  const invoice = await prisma.cardInvoice.upsert({
    where: { cardId_month_year: { cardId: card.id, month: Number(month), year: Number(year) } },
    update: {},
    create: { cardId: card.id, month: Number(month), year: Number(year) },
  });

  const item = await prisma.cardInvoiceItem.create({
    data: {
      invoiceId: invoice.id,
      description,
      installmentAmount: Number(installmentAmount),
      currentInstallment: Number(currentInstallment) || 1,
      totalInstallments: Number(totalInstallments) || 1,
      category: category || null,
    },
  });

  res.json(item);
});

router.put('/invoice-items/:id', async (req, res) => {
  const item = await prisma.cardInvoiceItem.findUnique({
    where: { id: Number(req.params.id) },
    include: { invoice: { include: { card: true } } },
  });
  if (!item || item.invoice.card.userId !== req.userId) return res.status(404).json({ error: 'Item não encontrado' });

  const { description, installmentAmount, currentInstallment, totalInstallments, category } = req.body;
  const updated = await prisma.cardInvoiceItem.update({
    where: { id: item.id },
    data: {
      description: description ?? item.description,
      installmentAmount: installmentAmount !== undefined ? Number(installmentAmount) : item.installmentAmount,
      currentInstallment: currentInstallment !== undefined ? Number(currentInstallment) : item.currentInstallment,
      totalInstallments: totalInstallments !== undefined ? Number(totalInstallments) : item.totalInstallments,
      category: category !== undefined ? (category || null) : item.category,
    },
  });
  res.json(updated);
});

router.delete('/invoice-items/:id', async (req, res) => {
  const item = await prisma.cardInvoiceItem.findUnique({
    where: { id: Number(req.params.id) },
    include: { invoice: { include: { card: true } } },
  });
  if (!item || item.invoice.card.userId !== req.userId) return res.status(404).json({ error: 'Item não encontrado' });
  await prisma.cardInvoiceItem.delete({ where: { id: Number(req.params.id) } });
  res.json({ message: 'Item excluído' });
});

router.get('/summary', async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const invoices = await prisma.cardInvoice.findMany({
    where: { month, year, card: { userId: req.userId } },
    include: { items: true, card: true },
  });

  const incomeSources = await prisma.incomeSource.findMany({ where: { userId: req.userId } });
  const monthlyIncome = incomeSources.reduce((s, i) => s + i.amount, 0);

  let totalFaturaMes = 0;
  const itensDoMes = [];

  for (const invoice of invoices) {
    for (const item of invoice.items) {
      totalFaturaMes += item.installmentAmount;
      itensDoMes.push({
        id: item.id,
        cartao: invoice.card.name,
        descricao: item.description,
        categoria: item.category,
        valorParcela: item.installmentAmount,
        parcelaAtual: item.currentInstallment,
        totalParcelas: item.totalInstallments,
        parcelasRestantes: item.totalInstallments - item.currentInstallment,
      });
    }
  }

  const percentualDaRenda = monthlyIncome > 0 ? (totalFaturaMes / monthlyIncome) * 100 : 0;

  res.json({
    totalFaturaMes: Math.round(totalFaturaMes * 100) / 100,
    percentualDaRenda: Math.round(percentualDaRenda),
    itensDoMes,
  });
});

router.get('/:cardId/invoices', async (req, res) => {
  const card = await prisma.creditCard.findUnique({ where: { id: Number(req.params.cardId) } });
  if (!card || card.userId !== req.userId) return res.status(404).json({ error: 'Cartão não encontrado' });

  const invoices = await prisma.cardInvoice.findMany({
    where: { cardId: card.id },
    include: { items: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  const result = invoices.map(inv => ({
    id: inv.id,
    month: inv.month,
    year: inv.year,
    total: Math.round(inv.items.reduce((s, i) => s + i.installmentAmount, 0) * 100) / 100,
    items: inv.items,
  }));

  res.json(result);
});

module.exports = router;