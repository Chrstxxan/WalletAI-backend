const express = require('express');
const authRoutes = require('./routes/auth');
const { categorizeTransaction } = require('./services/aiService');
const transactionRoutes = require('./routes/transactions');

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

app.use('/transactions', transactionRoutes);

app.get('/', (req, res) => res.send('API funcionando!'));

app.post('/test-ai', async (req, res) => {
  const categoria = await categorizeTransaction(req.body.description);
  res.json({ categoria });
});

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));