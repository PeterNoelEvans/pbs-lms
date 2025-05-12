-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answers" JSONB NOT NULL,
    "score" REAL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attempts" INTEGER,
    "totalTime" INTEGER,
    CONSTRAINT "AssessmentSubmission_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentSubmission" ("answers", "assessmentId", "attempts", "id", "score", "studentId", "submittedAt", "totalTime") SELECT "answers", "assessmentId", "attempts", "id", "score", "studentId", "submittedAt", "totalTime" FROM "AssessmentSubmission";
DROP TABLE "AssessmentSubmission";
ALTER TABLE "new_AssessmentSubmission" RENAME TO "AssessmentSubmission";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
