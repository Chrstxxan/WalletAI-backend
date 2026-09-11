const express = require('express');
const authRoutes = require('./routes/auth');

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

app.get('/', (req, res) => res.send('API funcionando!'));

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));