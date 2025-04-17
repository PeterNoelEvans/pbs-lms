// Year level mapping for different grades
const YEAR_LEVEL_MAP = {
    'P1': 1, 'P2': 2, 'P3': 3, 'P4': 4, 'P5': 5, 'P6': 6,
    'M1': 7, 'M2': 8, 'M3': 9
};

// Valid class codes
const VALID_CLASSES = [
    'M1/1', 'M1/2', 'M1/3', 'M1/4', 'M1/5', 'M1/6',
    'M2/1', 'M2/2', 'M2/3', 'M2/4', 'M2/5', 'M2/6',
    'M3/1', 'M3/2', 'M3/3', 'M3/4', 'M3/5', 'M3/6',
    'P1/1', 'P1/2', 'P1/3', 'P1/4', 'P1/5',
    'P2/1', 'P2/2', 'P2/3', 'P2/4', 'P2/5',
    'P3/1', 'P3/2', 'P3/3', 'P3/4', 'P3/5',
    'P4/1', 'P4/2', 'P4/3', 'P4/4', 'P4/5',
    'P5/1', 'P5/2', 'P5/3', 'P5/4', 'P5/5',
    'P6/1', 'P6/2', 'P6/3', 'P6/4', 'P6/5'
];

// Helper function to get year level from class code
const getYearLevelFromClass = (classCode) => {
    if (!classCode) return null;
    const prefix = classCode.split('/')[0];
    return YEAR_LEVEL_MAP[prefix] || null;
};

// Helper function to validate class code
const isValidClass = (classCode) => {
    return VALID_CLASSES.includes(classCode);
};

module.exports = {
    YEAR_LEVEL_MAP,
    VALID_CLASSES,
    getYearLevelFromClass,
    isValidClass
}; 