const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

function comProgresso(goal) {
  const percentualUsado = goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0;
  return { ...goal, percentualUsado, concluida: goal.currentAmount >= goal.targetAmount };
}

router.get('/', async (req, res) => {
  const goals = await prisma.goal.findMany({ where: { userId: req.userId }, orderBy: { id: 'asc' } });
  res.json(goals.map(comProgresso));
});

router.post('/', async (req, res) => {
  const { description, targetAmount } = req.body;
  if (!description || !targetAmount || Number(targetAmount) <= 0) {
    return res.status(400).json({ error: 'Descrição e valor alvo (maior que zero) são obrigatórios' });
  }
  const goal = await prisma.goal.create({
    data: { userId: req.userId, description, targetAmount: Number(targetAmount), currentAmount: 0 },
  });
  res.json(comProgresso(goal));
});

router.put('/:id', async (req, res) => {
  const goal = await prisma.goal.findUnique({ where: { id: Number(req.params.id) } });
  if (!goal || goal.userId !== req.userId) return res.status(404).json({ error: 'Meta não encontrada' });

  const { description, targetAmount, currentAmount } = req.body;
  const updated = await prisma.goal.update({
    where: { id: goal.id },
    data: {
      description: description ?? goal.description,
      targetAmount: targetAmount !== undefined ? Number(targetAmount) : goal.targetAmount,
      currentAmount: currentAmount !== undefined ? Number(currentAmount) : goal.currentAmount,
    },
  });
  res.json(comProgresso(updated));
});

router.delete('/:id', async (req, res) => {
  const goal = await prisma.goal.findUnique({ where: { id: Number(req.params.id) } });
  if (!goal || goal.userId !== req.userId) return res.status(404).json({ error: 'Meta não encontrada' });
  await prisma.goal.delete({ where: { id: goal.id } });
  res.json({ message: 'Meta excluída' });
});

module.exports = router;
