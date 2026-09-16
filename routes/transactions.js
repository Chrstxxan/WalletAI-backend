const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { categorizeTransaction, validarCompatibilidadeBeneficio } = require('../services/aiService');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Criar transação (com categorização automática via IA)
router.post('/', async (req, res) => {
  const { amount, type, description, benefitWalletId } = req.body;

  let wallet = null;
  if (benefitWalletId) {
    wallet = await prisma.benefitWallet.findUnique({ where: { id: Number(benefitWalletId) } });
    if (!wallet || wallet.userId !== req.userId) {
      return res.status(404).json({ error: 'Carteira de benefício não encontrada' });
    }
    if (type !== 'despesa') {
      return res.status(400).json({ error: 'invalido', mensagem: 'Carteira de benefício só pode ser usada em despesas' });
    }
    if (Number(amount) > wallet.balance) {
      return res.status(400).json({ error: 'saldo_insuficiente', mensagem: `Saldo insuficiente em ${wallet.type}. Saldo atual: R$ ${wallet.balance.toFixed(2)}.` });
    }
    const compativel = await validarCompatibilidadeBeneficio(description, wallet.type);
    if (!compativel) {
      return res.status(400).json({ error: 'incompativel', mensagem: `Essa transação normalmente não é aceita em cartões do tipo ${wallet.type}. Ajuste a descrição ou troque a forma de pagamento.` });
    }
  }

  const categoriaSugerida = await categorizeTransaction(description);

  let category = await prisma.category.findFirst({
    where: { name: categoriaSugerida }
  });
  if (!category) {
    category = await prisma.category.create({ data: { name: categoriaSugerida } });
  }

  const [transaction] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        amount,
        type,
        description,
        userId: req.userId,
        categoryId: category.id,
        benefitWalletId: wallet ? wallet.id : null,
      },
      include: { category: true, benefitWallet: true },
    }),
    ...(wallet ? [prisma.benefitWallet.update({ where: { id: wallet.id }, data: { balance: { decrement: Number(amount) } } })] : []),
  ]);

  res.json(transaction);
});

// Listar transações do usuário logado
router.get('/', async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { userId: req.userId },
    include: { category: true, benefitWallet: true },
    orderBy: { date: 'desc' },
  });
  res.json(transactions);
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, type, description, benefitWalletId } = req.body;

  const transaction = await prisma.transaction.findUnique({ where: { id: Number(id) } });
  if (!transaction || transaction.userId !== req.userId) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }

  let newWallet = null;
  if (benefitWalletId) {
    newWallet = await prisma.benefitWallet.findUnique({ where: { id: Number(benefitWalletId) } });
    if (!newWallet || newWallet.userId !== req.userId) {
      return res.status(404).json({ error: 'Carteira de benefício não encontrada' });
    }
    if (type !== 'despesa') {
      return res.status(400).json({ error: 'invalido', mensagem: 'Carteira de benefício só pode ser usada em despesas' });
    }
    const jaEstavaNessaCarteira = transaction.benefitWalletId === newWallet.id && transaction.type === 'despesa';
    const saldoDisponivel = newWallet.balance + (jaEstavaNessaCarteira ? transaction.amount : 0);
    if (Number(amount) > saldoDisponivel) {
      return res.status(400).json({ error: 'saldo_insuficiente', mensagem: `Saldo insuficiente em ${newWallet.type}. Saldo disponível: R$ ${saldoDisponivel.toFixed(2)}.` });
    }
    const compativel = await validarCompatibilidadeBeneficio(description, newWallet.type);
    if (!compativel) {
      return res.status(400).json({ error: 'incompativel', mensagem: `Essa transação normalmente não é aceita em cartões do tipo ${newWallet.type}. Ajuste a descrição ou troque a forma de pagamento.` });
    }
  }

  const categoriaSugerida = await categorizeTransaction(description);

  let category = await prisma.category.findFirst({
    where: { name: categoriaSugerida }
  });
  if (!category) {
    category = await prisma.category.create({ data: { name: categoriaSugerida } });
  }

  const walletOps = [];
  if (transaction.benefitWalletId && transaction.type === 'despesa') {
    walletOps.push(prisma.benefitWallet.update({ where: { id: transaction.benefitWalletId }, data: { balance: { increment: transaction.amount } } }));
  }
  if (newWallet) {
    walletOps.push(prisma.benefitWallet.update({ where: { id: newWallet.id }, data: { balance: { decrement: Number(amount) } } }));
  }

  const results = await prisma.$transaction([
    ...walletOps,
    prisma.transaction.update({
      where: { id: Number(id) },
      data: { amount, type, description, categoryId: category.id, benefitWalletId: newWallet ? newWallet.id : null },
      include: { category: true, benefitWallet: true },
    }),
  ]);

  res.json(results[results.length - 1]);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const transaction = await prisma.transaction.findUnique({ where: { id: Number(id) } });

  if (!transaction || transaction.userId !== req.userId) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }

  const ops = [];
  if (transaction.benefitWalletId && transaction.type === 'despesa') {
    ops.push(prisma.benefitWallet.update({ where: { id: transaction.benefitWalletId }, data: { balance: { increment: transaction.amount } } }));
  }
  ops.push(prisma.transaction.delete({ where: { id: Number(id) } }));

  await prisma.$transaction(ops);
  res.json({ message: 'Transação excluída' });
});

module.exports = router;
