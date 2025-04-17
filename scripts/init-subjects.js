const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function initializeSubjects() {
    try {
        // Create or update English CoreSubject
        const englishCore = await prisma.coreSubject.upsert({
            where: { name: 'English' },
            update: {
                description: "Let's Find Out",
                yearLevel: 1
            },
            create: {
                name: 'English',
                description: "Let's Find Out",
                yearLevel: 1
            }
        });

        // Create or update Math CoreSubject
        const mathCore = await prisma.coreSubject.upsert({
            where: { name: 'Math' },
            update: {
                description: 'Math math and more math',
                yearLevel: 1
            },
            create: {
                name: 'Math',
                description: 'Math math and more math',
                yearLevel: 1
            }
        });

        console.log('Core subjects created/updated:', { englishCore, mathCore });

        // First, find existing subjects
        let englishSubject = await prisma.subject.findFirst({
            where: {
                teacherId: '1',
                coreSubjectId: englishCore.id
            }
        });

        // If not found, create it
        if (!englishSubject) {
            englishSubject = await prisma.subject.create({
                data: {
                    coreSubject: {
                        connect: { id: englishCore.id }
                    },
                    teacher: {
                        connect: { id: '1' }
                    }
                }
            });
        }

        // Create units for English subject
        for (const unit of [
            {
                name: 'Unit 1 All About Me',
                description: 'Access to Information',
                order: 1,
                parts: [
                    {
                        name: 'Understanding Text',
                        description: "1) Understand a text's general meaning, main ideas and sequence of events.",
                        order: 1
                    },
                    {
                        name: 'Information Extraction',
                        description: '2) Identify and extract information from text',
                        order: 2
                    }
                ]
            },
            {
                name: 'Unit 2 Lost and Found',
                description: 'Access to Information',
                order: 2,
                parts: [
                    {
                        name: 'Text Analysis',
                        description: "1) Understand a text's general meaning, main ideas and sequence of events.",
                        order: 1
                    },
                    {
                        name: 'Emotional Context',
                        description: '2) Identify feelings in a text',
                        order: 2
                    }
                ]
            },
            {
                name: 'Unit 3 The Legend of the Lake Monster',
                description: 'No description available',
                order: 3,
                parts: []
            }
        ]) {
            // Find existing unit
            let existingUnit = await prisma.unit.findFirst({
                where: {
                    subjectId: englishSubject.id,
                    name: unit.name
                }
            });

            // Create or update unit
            const createdUnit = existingUnit 
                ? await prisma.unit.update({
                    where: { id: existingUnit.id },
                    data: {
                        description: unit.description,
                        order: unit.order
                    }
                })
                : await prisma.unit.create({
                    data: {
                        name: unit.name,
                        description: unit.description,
                        order: unit.order,
                        subject: {
                            connect: { id: englishSubject.id }
                        }
                    }
                });

            // Create parts for the unit
            for (const part of unit.parts) {
                // Find existing part
                let existingPart = await prisma.part.findFirst({
                    where: {
                        unitId: createdUnit.id,
                        name: part.name
                    }
                });

                // Create or update part
                if (existingPart) {
                    await prisma.part.update({
                        where: { id: existingPart.id },
                        data: {
                            description: part.description,
                            order: part.order
                        }
                    });
                } else {
                    await prisma.part.create({
                        data: {
                            name: part.name,
                            description: part.description,
                            order: part.order,
                            unit: {
                                connect: { id: createdUnit.id }
                            }
                        }
                    });
                }
            }
        }

        // Do the same for Math subject
        let mathSubject = await prisma.subject.findFirst({
            where: {
                teacherId: '1',
                coreSubjectId: mathCore.id
            }
        });

        if (!mathSubject) {
            mathSubject = await prisma.subject.create({
                data: {
                    coreSubject: {
                        connect: { id: mathCore.id }
                    },
                    teacher: {
                        connect: { id: '1' }
                    }
                }
            });
        }

        console.log('Teacher subjects created/updated:', { 
            englishSubject: { id: englishSubject.id }, 
            mathSubject: { id: mathSubject.id } 
        });
        
    } catch (error) {
        console.error('Error initializing subjects:', error);
    } finally {
        await prisma.$disconnect();
    }
}

initializeSubjects(); 