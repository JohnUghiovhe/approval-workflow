-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "activity_action" AS ENUM ('SUBMISSION', 'APPROVAL', 'REJECTION', 'RETURN', 'RESUBMISSION', 'COMMENT');

-- CreateTable
CREATE TABLE "reviewer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'reviewer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "status" "request_status" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "action" "activity_action" NOT NULL,
    "from_status" "request_status",
    "to_status" "request_status",
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_email_key" ON "reviewer"("email");

-- CreateIndex
CREATE INDEX "request_status_idx" ON "request"("status");

-- CreateIndex
CREATE INDEX "comment_request_id_idx" ON "comment"("request_id");

-- CreateIndex
CREATE INDEX "comment_reviewer_id_idx" ON "comment"("reviewer_id");

-- CreateIndex
CREATE INDEX "activity_request_id_idx" ON "activity"("request_id");

-- CreateIndex
CREATE INDEX "activity_reviewer_id_idx" ON "activity"("reviewer_id");

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "reviewer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "reviewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
