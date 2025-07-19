-- CreateTable
CREATE TABLE "Config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "criteria" TEXT,
    "questions" JSONB,
    "dueDate" DATETIME,
    "quarter" TEXT NOT NULL DEFAULT 'Q1',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT,
    "weeklyScheduleId" TEXT,
    "maxAttempts" INTEGER,
    CONSTRAINT "Assessment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assessment_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Assessment_weeklyScheduleId_fkey" FOREIGN KEY ("weeklyScheduleId") REFERENCES "WeeklySchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Assessment" ("category", "createdAt", "criteria", "description", "dueDate", "id", "maxAttempts", "questions", "sectionId", "title", "topicId", "type", "updatedAt", "userId", "weeklyScheduleId") SELECT "category", "createdAt", "criteria", "description", "dueDate", "id", "maxAttempts", "questions", "sectionId", "title", "topicId", "type", "updatedAt", "userId", "weeklyScheduleId" FROM "Assessment";
DROP TABLE "Assessment";
ALTER TABLE "new_Assessment" RENAME TO "Assessment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Config_key_key" ON "Config"("key");
