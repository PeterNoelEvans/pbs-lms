const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function blankAllAssessments() {
  const assessments = await prisma.assessment.findMany({ select: { id: true } });

  for (const assessment of assessments) {
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        title: "",
        description: "",
        type: "",
        category: "",
        criteria: "",
        questions: null,
        dueDate: null,
        maxAttempts: null,
        sectionId: null,
        userId: null,
        topicId: null,
        weeklyScheduleId: null,
        mediaFiles: { set: [] },
        resources: { set: [] },
        submissions: { set: [] },
        // Add any other non-ID, non-relation fields here as needed
      }
    });
    console.log(`Blanked assessment ${assessment.id}`);
  }
}

blankAllAssessments()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 