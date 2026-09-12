const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { categorizeTransaction } = require('../services/aiService');

// Middleware simples de autenticação: extrai o userId do token JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

  const token = authHeader.split(' ')[1]; // formato: "Bearer <token>"
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

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

module.exports = router;