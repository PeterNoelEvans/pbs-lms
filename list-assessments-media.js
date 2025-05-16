// Script to list all assessments and their media files
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listAssessmentsMedia() {
  try {
    // Find the specific assessment
    const assessment = await prisma.assessment.findUnique({
      where: { 
        id: 'efbadb7b-9b7d-4810-8b05-a4a7862d5087'
      },
      include: {
        mediaFiles: true
      }
    });
    
    if (assessment) {
      console.log(`Assessment: ${assessment.id} - ${assessment.title}`);
      console.log(`Media files count: ${assessment.mediaFiles.length}`);
      console.log('Media files:', JSON.stringify(assessment.mediaFiles, null, 2));
      
      // Look for any files in the database with similar names
      console.log('\nSearching for similar files in all media files...');
      const allMediaFiles = await prisma.mediaFile.findMany({
        where: {
          OR: [
            { type: { startsWith: 'audio/' } },
            { filePath: { endsWith: '.mp3' } },
            { filePath: { endsWith: '.wav' } },
            { filePath: { endsWith: '.ogg' } }
          ]
        }
      });
      
      console.log(`Found ${allMediaFiles.length} audio files in the entire database`);
      if (allMediaFiles.length > 0) {
        console.log('Audio files:', JSON.stringify(allMediaFiles, null, 2));
      }
    } else {
      console.log('Assessment not found');
    }
  } catch (error) {
    console.error('Error listing assessments and media:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listAssessmentsMedia(); 