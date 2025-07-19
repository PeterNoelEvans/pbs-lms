/*
  Warnings:

  - A unique constraint covering the columns `[studentNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "studentNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_studentNumber_key" ON "User"("studentNumber");
