const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { categorizeTransaction } = require('../services/aiService');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Criar transação (com categorização automática via IA)
router.post('/', async (req, res) => {
  const { amount, type, description } = req.body;

  const categoriaSugerida = await categorizeTransaction(description);

  let category = await prisma.category.findFirst({
    where: { name: categoriaSugerida }
  });
  if (!category) {
    category = await prisma.category.create({ data: { name: categoriaSugerida } });
  }

  const transaction = await prisma.transaction.create({
    data: {
      amount,
      type,
      description,
      userId: req.userId,
      categoryId: category.id,
    },
    include: { category: true },
  });

  res.json(transaction);
});

// Listar transações do usuário logado
router.get('/', async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { userId: req.userId },
    include: { category: true },
    orderBy: { date: 'desc' },
  });
  res.json(transactions);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const transaction = await prisma.transaction.findUnique({ where: { id: Number(id) } });

  if (!transaction || transaction.userId !== req.userId) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }

  await prisma.transaction.delete({ where: { id: Number(id) } });
  res.json({ message: 'Transação excluída' });
});

module.exports = router;