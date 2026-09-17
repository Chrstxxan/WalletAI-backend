const authMiddleware = require('../middleware/auth');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      lastSeenMonth: now.getMonth() + 1,
      lastSeenYear: now.getFullYear(),
    },
  });
  res.json({ id: user.id, email: user.email, name: user.name });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

router.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword }
  });
  res.json({ message: 'Senha atualizada com sucesso' });
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  res.json(user);
});

router.post('/complete-onboarding', authMiddleware, async (req, res) => {
  await prisma.user.update({
    where: { id: req.userId },
    data: { onboardingCompletedAt: new Date() },
  });
  res.json({ ok: true });
});

router.put('/me', authMiddleware, async (req, res) => {
  const { name, email } = req.body;
  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { name, email },
    select: { id: true, email: true, name: true },
  });
  res.json(updated);
});

module.exports = router;