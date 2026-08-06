import prisma from './index.ts';
import { activity_action, request_status } from '../generated/prisma/client.ts';
import { SYS_MSG } from '../shared/constants/system.messages.ts';
import { logger } from '../shared/utils/logger.ts';
import * as activityRepository from '../modules/activity/activity.repository.ts';

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

// Build the append-only trail a request should have based on its seeded
// status: every request starts with a SUBMISSION, then the matching decision
// activity. Timestamps are staggered so the trail is chronologically stable.
function buildActivityChain(
  requestId: string,
  status: RequestSeed['status'],
  reviewerId: string,
): Parameters<typeof activityRepository.createMany>[1] {
  const base = new Date(Date.now());
  const chain: Parameters<typeof activityRepository.createMany>[1] = [
    {
      request_id: requestId,
      action: activity_action.SUBMISSION,
      to_status: request_status.SUBMITTED,
      note: 'Olu Smith',
      created_at: new Date(base.getTime() - 2 * 60_000),
    },
  ];

  if (status === 'APPROVED') {
    chain.push({
      request_id: requestId,
      reviewer_id: reviewerId,
      action: activity_action.APPROVAL,
      from_status: request_status.SUBMITTED,
      to_status: request_status.APPROVED,
      created_at: new Date(base.getTime() - 60_000),
    });
  } else if (status === 'REJECTED') {
    chain.push({
      request_id: requestId,
      reviewer_id: reviewerId,
      action: activity_action.REJECTION,
      from_status: request_status.SUBMITTED,
      to_status: request_status.REJECTED,
      created_at: new Date(base.getTime() - 60_000),
    });
  } else if (status === 'RETURNED') {
    chain.push({
      request_id: requestId,
      reviewer_id: reviewerId,
      action: activity_action.RETURN,
      from_status: request_status.SUBMITTED,
      to_status: request_status.RETURNED,
      created_at: new Date(base.getTime() - 60_000),
    });
  }
  return chain;
}

// Title is not a unique column, so match the seed entry with a find + create
// or update instead of upsert. New seed entries land on existing databases;
// re-runs keep requests stable and only add missing audit history.
async function seedRequests(): Promise<void> {
  const reviewer = await prisma.reviewer.findFirst();
  const reviewerId = reviewer?.id ?? '';
  if (!reviewerId) {
    logger.warn('No reviewer seeded yet; skipping request seeding');
    return;
  }

  for (const requestSeed of REQUEST_SEEDS) {
    const existingRequest = await prisma.request.findFirst({ where: { title: requestSeed.title } });
    const row = existingRequest ?? (await prisma.request.create({ data: requestSeed }));

    if (existingRequest) {
      await prisma.request.update({
        where: { id: row.id },
        data: {
          description: requestSeed.description,
          department: requestSeed.department,
          requester_name: requestSeed.requester_name,
          status: requestSeed.status,
        },
      });
    }

    const existing = await prisma.activity.count({ where: { request_id: row.id } });
    if (existing === 0) {
      await activityRepository.createMany(
        prisma,
        buildActivityChain(row.id, requestSeed.status, reviewerId),
      );
    }
  }
}

async function main(): Promise<void> {
  await seedReviewers();
  await seedRequests();

  const reviewerCount = await prisma.reviewer.count();
  const requestCount = await prisma.request.count();
  const activityCount = await prisma.activity.count();
  logger.info(
    `${SYS_MSG.SEED_SUCCESS} (${reviewerCount} reviewers, ${requestCount} requests, ${activityCount} activities)`,
  );
}

main()
  .catch((error: unknown) => {
    logger.error({ err: error }, SYS_MSG.INTERNAL_SERVER_ERROR);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
