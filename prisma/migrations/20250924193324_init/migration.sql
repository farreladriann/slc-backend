-- CreateEnum
CREATE TYPE "public"."Stm32Mode" AS ENUM ('Otomatis', 'Manual');

-- CreateEnum
CREATE TYPE "public"."TerminalStatus" AS ENUM ('off', 'on');

-- CreateTable
CREATE TABLE "public"."users" (
    "userGoogleId" VARCHAR NOT NULL,
    "userEmail" VARCHAR NOT NULL,
    "userName" VARCHAR NOT NULL,
    "stm32Id" VARCHAR,

    CONSTRAINT "users_pkey" PRIMARY KEY ("userGoogleId")
);

-- CreateTable
CREATE TABLE "public"."stm32" (
    "stm32Id" VARCHAR NOT NULL,
    "stm32Threshold" INTEGER,
    "mode" "public"."Stm32Mode" NOT NULL,

    CONSTRAINT "stm32_pkey" PRIMARY KEY ("stm32Id")
);

-- CreateTable
CREATE TABLE "public"."terminals" (
    "terminalId" VARCHAR NOT NULL,
    "stm32Id" VARCHAR NOT NULL,
    "terminalPriority" INTEGER NOT NULL DEFAULT 0,
    "terminalStatus" "public"."TerminalStatus" NOT NULL,
    "startOn" TIMESTAMP(3),
    "finishOn" TIMESTAMP(3),

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("terminalId")
);

-- CreateTable
CREATE TABLE "public"."powerUsage" (
    "powerUsageId" VARCHAR NOT NULL,
    "terminalId" VARCHAR NOT NULL,
    "power" DOUBLE PRECISION NOT NULL,
    "ampere" DOUBLE PRECISION NOT NULL,
    "volt" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "powerUsage_pkey" PRIMARY KEY ("powerUsageId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_userEmail_key" ON "public"."users"("userEmail");

-- CreateIndex
CREATE INDEX "terminals_stm32Id_idx" ON "public"."terminals"("stm32Id");

-- CreateIndex
CREATE INDEX "powerUsage_terminalId_idx" ON "public"."powerUsage"("terminalId");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_stm32Id_fkey" FOREIGN KEY ("stm32Id") REFERENCES "public"."stm32"("stm32Id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."terminals" ADD CONSTRAINT "terminals_stm32Id_fkey" FOREIGN KEY ("stm32Id") REFERENCES "public"."stm32"("stm32Id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."powerUsage" ADD CONSTRAINT "powerUsage_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "public"."terminals"("terminalId") ON DELETE CASCADE ON UPDATE CASCADE;
