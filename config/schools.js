/**
 * School and Class Configuration
 * This file defines the schools and classes in the system
 */

const schools = [
  {
    id: 'PBSChonburi',
    name: 'Prabhassorn Vidhaya School Chonburi',
    classes: [
      {
        id: 'ClassM2-001',
        name: 'Class 001',
        displayName: 'M2 2025',
        description: 'This is a presentation of M2 2025 001 Coding Class.',
        portfolioPath: '/portfolios/ClassM2-001'
      }
    ]
  },
  {
    id: 'PhumdhamPrimary',
    name: 'Phumdham Primary Learning Center',
    classes: [
      {
        id: 'Class4-1',
        name: 'Class 4/1',
        displayName: 'Class 4/1',
        description: 'Grade 4/1 Coding Class',
        portfolioPath: '/portfolios/P4-1'
      },
      {
        id: 'Class4-2',
        name: 'Class 4/2',
        displayName: 'Class 4/2',
        description: 'Grade 4/2 Coding Class',
        portfolioPath: '/portfolios/P4-2'
      }
    ]
  }
  // Add more schools as needed
];

/**
 * Get all schools
 * @returns {Array} Array of school objects
 */
function getSchools() {
  return schools;
}

/**
 * Get a school by ID
 * @param {string} schoolId - School ID
 * @returns {Object|null} School object or null if not found
 */
function getSchool(schoolId) {
  return schools.find(school => school.id === schoolId) || null;
}

/**
 * Get all classes for a school
 * @param {string} schoolId - School ID
 * @returns {Array} Array of class objects or empty array if school not found
 */
function getClasses(schoolId) {
  const school = getSchool(schoolId);
  return school ? school.classes : [];
}

/**
 * Get a class by ID
 * @param {string} schoolId - School ID
 * @param {string} classId - Class ID
 * @returns {Object|null} Class object or null if not found
 */
function getClass(schoolId, classId) {
  const classes = getClasses(schoolId);
  return classes.find(cls => cls.id === classId) || null;
}

/**
 * Get all class IDs across all schools
 * @returns {Array} Array of class IDs
 */
function getAllClassIds() {
  return schools.flatMap(school => 
    school.classes.map(cls => cls.id)
  );
}

module.exports = {
  getSchools,
  getSchool,
  getClasses,
  getClass,
  getAllClassIds
};