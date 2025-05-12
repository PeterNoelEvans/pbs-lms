-- CreateTable
CREATE TABLE "_ResourceAssessments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ResourceAssessments_A_fkey" FOREIGN KEY ("A") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ResourceAssessments_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_ResourceAssessments_AB_unique" ON "_ResourceAssessments"("A", "B");

-- CreateIndex
CREATE INDEX "_ResourceAssessments_B_index" ON "_ResourceAssessments"("B");
