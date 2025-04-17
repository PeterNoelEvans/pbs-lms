/*
  Warnings:

  - You are about to drop the `Book` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `yearLevel` on the `CoreSubject` table. All the data in the column will be lost.
  - You are about to drop the column `bookId` on the `Subject` table. All the data in the column will be lost.
  - Added the required column `name` to the `Subject` table without a default value. This is not possible if the table is not empty.
  - Added the required column `yearLevel` to the `Subject` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Book_name_coreSubjectId_yearLevel_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Book";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CoreSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CoreSubject" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "CoreSubject";
DROP TABLE "CoreSubject";
ALTER TABLE "new_CoreSubject" RENAME TO "CoreSubject";
CREATE UNIQUE INDEX "CoreSubject_name_key" ON "CoreSubject"("name");
CREATE TABLE "new_Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "yearLevel" INTEGER NOT NULL,
    "coreSubjectId" TEXT NOT NULL,
    "unitTerm" TEXT NOT NULL DEFAULT 'Unit',
    "partTerm" TEXT NOT NULL DEFAULT 'Part',
    "sectionTerm" TEXT NOT NULL DEFAULT 'Section',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "archiveReason" TEXT,
    "transferredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subject_coreSubjectId_fkey" FOREIGN KEY ("coreSubjectId") REFERENCES "CoreSubject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Subject" ("archiveReason", "archivedAt", "coreSubjectId", "createdAt", "id", "isArchived", "transferredAt", "updatedAt") SELECT "archiveReason", "archivedAt", "coreSubjectId", "createdAt", "id", "isArchived", "transferredAt", "updatedAt" FROM "Subject";
DROP TABLE "Subject";
ALTER TABLE "new_Subject" RENAME TO "Subject";
CREATE UNIQUE INDEX "Subject_name_coreSubjectId_yearLevel_key" ON "Subject"("name", "coreSubjectId", "yearLevel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
