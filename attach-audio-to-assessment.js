// Script to manually attach an audio file to an assessment
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const ASSESSMENT_ID = 'efbadb7b-9b7d-4810-8b05-a4a7862d5087';
// Use one of the existing audio files that we found in the uploads/resources directory
const AUDIO_FILE = '1747127597224-860493332.mp3'; // This exists in the directory

async function attachAudioToAssessment() {
  try {
    // First check if the assessment exists
    const assessment = await prisma.assessment.findUnique({
      where: { id: ASSESSMENT_ID },
      include: { mediaFiles: true }
    });
    
    if (!assessment) {
      console.log(`Assessment ${ASSESSMENT_ID} not found`);
      return;
    }

    console.log(`Found assessment: ${assessment.title}`);
    
    // Check if the audio file exists
    const filePath = path.join(__dirname, 'uploads', 'resources', AUDIO_FILE);
    const fileExists = fs.existsSync(filePath);
    
    if (!fileExists) {
      console.log(`Audio file does not exist at path: ${filePath}`);
      console.log('Please place your audio file in the uploads/resources directory');
      return;
    }
    
    console.log(`Audio file exists at: ${filePath}`);
    
    // Create the media file record
    const mediaFile = await prisma.mediaFile.create({
      data: {
        filePath: `/uploads/resources/${AUDIO_FILE}`,
        type: 'audio/mpeg', // Most MP3 files use this MIME type
        label: 'audio',
        assessment: {
          connect: { id: ASSESSMENT_ID }
        }
      }
    });
    
    console.log(`Successfully attached audio file to assessment. Media file ID: ${mediaFile.id}`);
    
  } catch (error) {
    console.error('Error attaching audio to assessment:', error);
  } finally {
    await prisma.$disconnect();
  }
}

attachAudioToAssessment(); 