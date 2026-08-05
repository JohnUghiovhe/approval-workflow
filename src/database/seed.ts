import prisma from './index.ts';
import { SYS_MSG } from '../shared/constants/system.messages.ts';
import { logger } from '../shared/utils/logger.ts';

interface ReviewerSeed {
  name: string;
  email: string;
  role: string;
}

interface RequestSeed {
  title: string;
  description: string;
  department: string;
  requester_name: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RETURNED';
}

const REVIEWER_SEEDS: ReviewerSeed[] = [
  { name: 'Amina Bello', email: 'amina.bello@peerless.com', role: 'reviewer' },
  { name: 'Chidi Okafor', email: 'chidi.okafor@peerless.com', role: 'reviewer' },
  { name: 'Fatima Yusuf', email: 'fatima.yusuf@peerless.com', role: 'reviewer' },
  { name: 'James Adeyemi', email: 'james.adeyemi@peerless.com', role: 'reviewer' },
  { name: 'Grace Nwosu', email: 'grace.nwosu@peerless.com', role: 'reviewer' },
];

const REQUEST_SEEDS: RequestSeed[] = [
  {
    title: 'Laptop upgrade for design team',
    description:
      'Replace aging laptops for the design team with newer models to keep design tools performant.',
    department: 'Engineering',
    requester_name: 'Olu Smith',
    status: 'SUBMITTED',
  },
  {
    title: 'Annual offsite venue booking',
    description: 'Book a venue for the annual team offsite including accommodation for two nights.',
    department: 'Operations',
    requester_name: 'Tunde Adele',
    status: 'APPROVED',
  },
  {
    title: 'New CRM software subscription',
    description:
      'Purchase a yearly subscription for a cloud CRM to replace the in-house spreadsheet workflow.',
    department: 'Sales',
    requester_name: 'Ngozi Eze',
    status: 'REJECTED',
  },
  {
    title: 'Office snack restock',
    description: 'Restock the pantry for the quarter with snacks and beverages for staff.',
    department: 'People',
    requester_name: 'Kemi Alade',
    status: 'RETURNED',
  },
  {
    title: 'Server capacity expansion',
    description: 'Add two extra nodes to the staging cluster ahead of the next release.',
    department: 'Engineering',
    requester_name: 'Yusuf Danjuma',
    status: 'SUBMITTED',
  },
];

// Upsert keeps the seed idempotent: re-running it updates reviewer details
// by email instead of creating duplicates.
async function seedReviewers(): Promise<void> {
  for (const reviewer of REVIEWER_SEEDS) {
    await prisma.reviewer.upsert({
      where: { email: reviewer.email },
      update: { name: reviewer.name, role: reviewer.role },
      create: reviewer,
    });
  }
}

async function seedRequests(): Promise<void> {
  const existingCount = await prisma.request.count();
  if (existingCount > 0) {
    return;
  }
  await prisma.request.createMany({ data: REQUEST_SEEDS });
}

async function main(): Promise<void> {
  await seedReviewers();
  await seedRequests();

  const reviewerCount = await prisma.reviewer.count();
  const requestCount = await prisma.request.count();
  logger.info(`${SYS_MSG.SEED_SUCCESS} (${reviewerCount} reviewers, ${requestCount} requests)`);
}

main()
  .catch((error: unknown) => {
    logger.error({ err: error }, SYS_MSG.INTERNAL_SERVER_ERROR);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
