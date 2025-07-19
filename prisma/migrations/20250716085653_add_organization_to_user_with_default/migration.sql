-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answers" JSONB,
    "comment" TEXT,
    "score" REAL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attempts" INTEGER,
    "totalTime" INTEGER,
    CONSTRAINT "AssessmentSubmission_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentSubmission" ("answers", "assessmentId", "attempts", "comment", "id", "score", "studentId", "submittedAt", "totalTime") SELECT "answers", "assessmentId", "attempts", "comment", "id", "score", "studentId", "submittedAt", "totalTime" FROM "AssessmentSubmission";
DROP TABLE "AssessmentSubmission";
ALTER TABLE "new_AssessmentSubmission" RENAME TO "AssessmentSubmission";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organization" TEXT NOT NULL DEFAULT 'PBS',
    "nickname" TEXT,
    "yearLevel" INTEGER,
    "class" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" DATETIME,
    "resetToken" TEXT,
    "resetTokenExpiry" DATETIME,
    "profilePicture" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("active", "class", "createdAt", "email", "id", "lastLogin", "name", "nickname", "parentId", "password", "profilePicture", "resetToken", "resetTokenExpiry", "role", "updatedAt", "yearLevel") SELECT "active", "class", "createdAt", "email", "id", "lastLogin", "name", "nickname", "parentId", "password", "profilePicture", "resetToken", "resetTokenExpiry", "role", "updatedAt", "yearLevel" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
