const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Find Let's Find Out Book 1
    const subject = await prisma.subject.findFirst({
        where: {
            name: "Let's Find Out Book 1",
            yearLevel: 7
        }
    });

    if (!subject) {
        console.log("Subject not found");
        return;
    }

    // First, get all topics for this subject
    const existingTopics = await prisma.topic.findMany({
        where: { subjectId: subject.id },
        include: { resources: true }
    });

    // Delete resources first
    for (const topic of existingTopics) {
        if (topic.resources.length > 0) {
            await prisma.resource.deleteMany({
                where: { topicId: topic.id }
            });
        }
    }

    // Then delete topics
    await prisma.topic.deleteMany({
        where: { subjectId: subject.id }
    });

    // Create topics based on actual textbook structure
    const topics = [
        {
            name: "Unit 1 All About Me",
            description: "Read what the boy says and look around the room to see what you can find out.",
            order: 1
        },
        {
            name: "Unit 2 Lost and Found",
            description: "Learning about lost items and how to find them",
            order: 2
        },
        {
            name: "Unit 3 – The Legend of the Lake Monster",
            description: "Exploring stories and legends",
            order: 3
        }
    ];

    for (const topic of topics) {
        await prisma.topic.create({
            data: {
                name: topic.name,
                description: topic.description,
                order: topic.order,
                subject: {
                    connect: { id: subject.id }
                }
            }
        });
    }

    console.log("Topics created successfully with correct textbook structure");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    }); 