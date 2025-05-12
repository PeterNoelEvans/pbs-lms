/*
  Warnings:

  - You are about to drop the `_ResourceToSection` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "_ResourceToSection_B_index";

-- DropIndex
DROP INDEX "_ResourceToSection_AB_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_ResourceToSection";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "_ResourceSections" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ResourceSections_A_fkey" FOREIGN KEY ("A") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ResourceSections_B_fkey" FOREIGN KEY ("B") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "filePath" TEXT,
    "thumbnail" TEXT,
    "duration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "unitId" TEXT,
    "partId" TEXT,
    "sectionId" TEXT,
    "topicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    CONSTRAINT "Resource_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Resource_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Resource_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Resource_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Resource" ("content", "createdAt", "description", "duration", "filePath", "id", "metadata", "thumbnail", "title", "topicId", "type", "updatedAt", "url", "usageCount", "userId") SELECT "content", "createdAt", "description", "duration", "filePath", "id", "metadata", "thumbnail", "title", "topicId", "type", "updatedAt", "url", "usageCount", "userId" FROM "Resource";
DROP TABLE "Resource";
ALTER TABLE "new_Resource" RENAME TO "Resource";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_ResourceSections_AB_unique" ON "_ResourceSections"("A", "B");

-- CreateIndex
CREATE INDEX "_ResourceSections_B_index" ON "_ResourceSections"("B");
