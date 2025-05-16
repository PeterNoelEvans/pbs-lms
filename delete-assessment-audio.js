// Script to delete audio files for an assessment using Prisma
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ASSESSMENT_ID = 'efbadb7b-9b7d-4810-8b05-a4a7862d5087';

async function deleteAudioFiles() {
  try {
    // Find all media files for this assessment
    const mediaFiles = await prisma.mediaFile.findMany({
      where: { 
        assessmentId: ASSESSMENT_ID,
        OR: [
          { type: { startsWith: 'audio/' } },
          { filePath: { endsWith: '.mp3' } },
          { filePath: { endsWith: '.wav' } },
          { filePath: { endsWith: '.ogg' } }
        ]
      }
    });
    
    console.log(`Found ${mediaFiles.length} audio files for assessment ${ASSESSMENT_ID}`);
    console.log('Media files:', JSON.stringify(mediaFiles, null, 2));
    
    if (mediaFiles.length > 0) {
      // Delete the media files
      const result = await prisma.mediaFile.deleteMany({
        where: {
          id: {
            in: mediaFiles.map(file => file.id)
          }
        }
      });
      
      console.log(`Successfully deleted ${result.count} audio files`);
    } else {
      // If no files found with the specific criteria, let's see if there are any media files at all
      const allMediaFiles = await prisma.mediaFile.findMany({
        where: { 
          assessmentId: ASSESSMENT_ID
        }
      });
      
      console.log(`Found ${allMediaFiles.length} total media files for assessment ${ASSESSMENT_ID}`);
      console.log('All media files:', JSON.stringify(allMediaFiles, null, 2));
    }
  } catch (error) {
    console.error('Error deleting audio files:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAudioFiles(); 