const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const TIPOS_BENEFICIO = ['VR', 'VA', 'Combustível'];

router.get('/', async (req, res) => {
  const now = new Date();
  const wallets = await prisma.benefitWallet.findMany({ where: { userId: req.userId }, orderBy: { id: 'asc' } });

  const result = await Promise.all(wallets.map(async (wallet) => {
    const gasto = await prisma.transaction.aggregate({
      where: {
        benefitWalletId: wallet.id,
        type: 'despesa',
        date: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
          lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        },
      },
      _sum: { amount: true },
    });
    return { ...wallet, gastoNoMes: Math.round((gasto._sum.amount || 0) * 100) / 100 };
  }));

  res.json(result);
});

router.post('/', async (req, res) => {
  const { type } = req.body;
  if (!TIPOS_BENEFICIO.includes(type)) {
    return res.status(400).json({ error: `Tipo inválido. Escolha entre: ${TIPOS_BENEFICIO.join(', ')}` });
  }
  const existente = await prisma.benefitWallet.findFirst({ where: { userId: req.userId, type } });
  if (existente) {
    return res.status(400).json({ error: `Você já tem uma carteira do tipo ${type}` });
  }
  const wallet = await prisma.benefitWallet.create({ data: { userId: req.userId, type, balance: 0 } });
  res.json({ ...wallet, gastoNoMes: 0 });
});

router.post('/:id/topup', async (req, res) => {
  const wallet = await prisma.benefitWallet.findUnique({ where: { id: Number(req.params.id) } });
  if (!wallet || wallet.userId !== req.userId) return res.status(404).json({ error: 'Carteira não encontrada' });

  const { amount } = req.body;
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valor (maior que zero) é obrigatório' });
  }

  const updated = await prisma.benefitWallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: Number(amount) } },
  });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const wallet = await prisma.benefitWallet.findUnique({ where: { id: Number(req.params.id) } });
  if (!wallet || wallet.userId !== req.userId) return res.status(404).json({ error: 'Carteira não encontrada' });
  await prisma.benefitWallet.delete({ where: { id: wallet.id } });
  res.json({ message: 'Carteira excluída' });
});

module.exports = router;
