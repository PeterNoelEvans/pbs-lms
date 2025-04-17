/**
 * Subject and Topic Configuration
 * This file defines the subjects and major topics in the system
 */

const subjects = [
  {
    id: 'Math',
    name: 'Mathematics',
    topics: [
      {
        id: 'numbers-operations',
        name: 'Numbers and Operations',
        displayName: 'Numbers and Operations',
        description: 'Whole numbers, factors, multiples, HCF & LCM, integers',
        resourcePath: '/resources/math/numbers-operations'
      },
      {
        id: 'fractions-decimals',
        name: 'Fractions, Decimals, and Percentages',
        displayName: 'Fractions, Decimals, and Percentages',
        description: 'Converting between forms, operations, real-world applications',
        resourcePath: '/resources/math/fractions-decimals'
      },
      {
        id: 'algebra',
        name: 'Introduction to Algebra',
        displayName: 'Introduction to Algebra',
        description: 'Algebraic expressions, substitution, simple linear equations',
        resourcePath: '/resources/math/algebra'
      },
      {
        id: 'geometry-basics',
        name: 'Geometry Basics',
        displayName: 'Geometry Basics',
        description: 'Points, lines, angles, angle properties',
        resourcePath: '/resources/math/geometry-basics'
      },
      {
        id: 'triangles-quadrilaterals',
        name: 'Triangles and Quadrilaterals',
        displayName: 'Triangles and Quadrilaterals',
        description: 'Classifying shapes, angle sums, congruence',
        resourcePath: '/resources/math/triangles-quadrilaterals'
      }
    ]
  },
  {
    id: 'Science',
    name: 'Science',
    topics: [
      {
        id: 'biology',
        name: 'Biology',
        displayName: 'Biology',
        description: 'Living organisms and their interactions',
        resourcePath: '/resources/science/biology'
      },
      {
        id: 'chemistry',
        name: 'Chemistry',
        displayName: 'Chemistry',
        description: 'Matter and its properties',
        resourcePath: '/resources/science/chemistry'
      },
      {
        id: 'physics',
        name: 'Physics',
        displayName: 'Physics',
        description: 'Forces, energy, and motion',
        resourcePath: '/resources/science/physics'
      }
    ]
  },
  {
    id: 'English',
    name: 'English Language',
    topics: [
      {
        id: 'grammar',
        name: 'Grammar',
        displayName: 'Grammar',
        description: 'English grammar rules and usage',
        resourcePath: '/resources/english/grammar'
      },
      {
        id: 'vocabulary',
        name: 'Vocabulary',
        displayName: 'Vocabulary',
        description: 'Word meanings and usage',
        resourcePath: '/resources/english/vocabulary'
      },
      {
        id: 'reading',
        name: 'Reading Comprehension',
        displayName: 'Reading Comprehension',
        description: 'Understanding and analyzing texts',
        resourcePath: '/resources/english/reading'
      }
    ]
  }
];

/**
 * Get all subjects
 * @returns {Array} Array of subject objects
 */
function getSubjects() {
  return subjects;
}

/**
 * Get a subject by ID
 * @param {string} subjectId - Subject ID
 * @returns {Object|null} Subject object or null if not found
 */
function getSubject(subjectId) {
  return subjects.find(subject => subject.id === subjectId) || null;
}

/**
 * Get all topics for a subject
 * @param {string} subjectId - Subject ID
 * @returns {Array} Array of topic objects or empty array if subject not found
 */
function getTopics(subjectId) {
  const subject = getSubject(subjectId);
  return subject ? subject.topics : [];
}

/**
 * Get a topic by ID
 * @param {string} subjectId - Subject ID
 * @param {string} topicId - Topic ID
 * @returns {Object|null} Topic object or null if not found
 */
function getTopic(subjectId, topicId) {
  const topics = getTopics(subjectId);
  return topics.find(topic => topic.id === topicId) || null;
}

/**
 * Get all topic IDs across all subjects
 * @returns {Array} Array of topic IDs
 */
function getAllTopicIds() {
  return subjects.flatMap(subject => 
    subject.topics.map(topic => topic.id)
  );
}

module.exports = {
  getSubjects,
  getSubject,
  getTopics,
  getTopic,
  getAllTopicIds
};