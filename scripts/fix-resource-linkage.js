const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Get all subjects
  const subjects = await prisma.subject.findMany({
    include: {
      units: {
        include: {
          parts: {
            include: {
              sections: true
            }
          }
        }
      }
    }
  });

  for (const subject of subjects) {
    // Gather all section IDs for this subject
    const allSections = [];
    for (const unit of subject.units) {
      for (const part of unit.parts) {
        for (const section of part.sections) {
          allSections.push(section);
        }
      }
    }

    // 2. Get all resources for this subject
    const resources = await prisma.resource.findMany({
      where: { topic: { subjectId: subject.id } },
      include: { sections: true }
    });

    for (const resource of resources) {
      // Try to find a matching section by name or by topic/unit/part linkage
      let linkedSection = null;
      // Try to match by topic name in section name
      if (resource.topicId) {
        linkedSection = allSections.find(section =>
          section.name.toLowerCase().includes(resource.title.split(' ')[0].toLowerCase())
        );
      }
      // Fallback: just link to the first section if not already linked
      if (!linkedSection && allSections.length > 0) {
        linkedSection = allSections[0];
      }
      // If not already linked, link it
      if (linkedSection && !resource.sections.some(s => s.id === linkedSection.id)) {
        await prisma.resource.update({
          where: { id: resource.id },
          data: {
            sections: { set: [{ id: linkedSection.id }] }
          }
        });
        console.log(`Linked resource '${resource.title}' to section '${linkedSection.name}'`);
      } else if (!linkedSection) {
        console.warn(`No section found to link for resource '${resource.title}'`);
      }
    }
  }

  console.log('Resource-section linkage check complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); }); 