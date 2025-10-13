-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);
INSERT INTO "new_Config" ("id", "key", "value") SELECT "id", "key", "value" FROM "Config";
DROP TABLE "Config";
ALTER TABLE "new_Config" RENAME TO "Config";
CREATE UNIQUE INDEX "Config_key_key" ON "Config"("key");
CREATE TABLE "new_StudentProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topicId" TEXT,
    "skillCategory" TEXT,
    "status" TEXT NOT NULL,
    "score" REAL,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudentProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudentProgress_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentProgress" ("createdAt", "id", "lastUpdated", "score", "status", "studentId", "subjectId", "topicId", "updatedAt") SELECT "createdAt", "id", "lastUpdated", "score", "status", "studentId", "subjectId", "topicId", "updatedAt" FROM "StudentProgress";
DROP TABLE "StudentProgress";
ALTER TABLE "new_StudentProgress" RENAME TO "StudentProgress";
CREATE UNIQUE INDEX "StudentProgress_studentId_subjectId_topicId_key" ON "StudentProgress"("studentId", "subjectId", "topicId");
CREATE UNIQUE INDEX "StudentProgress_studentId_subjectId_skillCategory_key" ON "StudentProgress"("studentId", "subjectId", "skillCategory");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
