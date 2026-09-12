const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const categories = ['Alimentação', 'Transporte', 'Lazer', 'Moradia', 'Saúde', 'Outros'];

async function main() {
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Categorias padrão criadas!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());