import { prisma } from './lib/prisma';

const sampleUsers = [
  {
    name: 'Alice Johnson',
    age: 28,
    city: 'New York',
    educationLevel: 'BACHELOR' as const,
    goals: ['career growth', 'networking', 'fitness', 'travel'],
    score_selfGrowth: 85,
  },
  {
    name: 'Bob Smith',
    age: 35,
    city: 'New York',
    educationLevel: 'MASTER' as const,
    goals: ['career growth', 'investing', 'reading', 'fitness'],
    score_selfGrowth: 72,
  },
  {
    name: 'Carol Davis',
    age: 24,
    city: 'Los Angeles',
    educationLevel: 'BACHELOR' as const,
    goals: ['fitness', 'travel', 'cooking'],
    score_selfGrowth: 90,
  },
  {
    name: 'David Lee',
    age: 42,
    city: 'Chicago',
    educationLevel: 'DOCTORATE' as const,
    goals: ['reading', 'investing', 'mentorship'],
    score_selfGrowth: 60,
  },
  {
    name: 'Eva Martinez',
    age: 31,
    city: 'New York',
    educationLevel: 'MASTER' as const,
    goals: ['career growth', 'networking', 'travel', 'cooking'],
    score_selfGrowth: 78,
  },
  {
    name: 'Frank Wilson',
    age: 29,
    city: 'Chicago',
    educationLevel: 'BACHELOR' as const,
    goals: ['fitness', 'career growth', 'gaming'],
    score_selfGrowth: 45,
  },
  {
    name: 'Grace Kim',
    age: 26,
    city: 'Los Angeles',
    educationLevel: 'ASSOCIATE' as const,
    goals: ['travel', 'cooking', 'fitness', 'art'],
    score_selfGrowth: 82,
  },
  {
    name: 'Henry Brown',
    age: 38,
    city: 'San Francisco',
    educationLevel: 'MASTER' as const,
    goals: ['investing', 'mentorship', 'reading', 'networking'],
    score_selfGrowth: 68,
  },
  {
    name: 'Ivy Chen',
    age: 33,
    city: 'San Francisco',
    educationLevel: 'DOCTORATE' as const,
    goals: ['research', 'mentorship', 'reading', 'travel'],
    score_selfGrowth: 95,
  },
  {
    name: 'Jack Thompson',
    age: 45,
    city: 'New York',
    educationLevel: 'BACHELOR' as const,
    goals: ['investing', 'fitness', 'networking'],
    score_selfGrowth: 55,
  },
];

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.user.deleteMany();

  for (const user of sampleUsers) {
    await prisma.user.create({ data: user });
  }

  console.log(`✅ Seeded ${sampleUsers.length} users`);

  // Show a sample match
  const allUsers = await prisma.user.findMany();
  const alice = allUsers.find((u) => u.name === 'Alice Johnson')!;
  console.log(`\n📊 Sample match for ${alice.name}:`);
  console.log(JSON.stringify(alice, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
