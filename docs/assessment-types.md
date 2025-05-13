# Assessment Types and Subtypes

This document provides a comprehensive reference for all assessment types and subtypes in the Teacher Resource Platform. This is a critical reference that should be consulted before making any changes to assessment-related functionality.

## Assessment Types

The following are the supported assessment types:

1. **Multiple Choice** (`multiple-choice`)
   - Standard multiple choice questions with one correct answer
   - Auto-graded
   - Supports bulk import

2. **True/False** (`true-false`)
   - Simple true/false questions
   - Auto-graded
   - Can have multiple statements per question

3. **Matching** (`matching`)
   - Match items from two columns
   - Auto-graded
   - Supports bulk import of pairs

4. **Drag and Drop** (`drag-and-drop`)
   - Has multiple subtypes (see below)
   - Auto-graded
   - Supports various interactive formats

5. **Writing** (`writing`)
   - Short answer writing questions
   - Manually graded
   - Single question per assessment

6. **Writing (Long)** (`writing-long`)
   - Extended writing assignments
   - Manually graded
   - Supports file uploads

7. **Speaking** (`speaking`)
   - Oral response assignments
   - Manually graded
   - Supports audio/video recording

8. **Assignment** (`assignment`)
   - General assignment type
   - Manually graded
   - Flexible format

9. **Listening Comprehension** (`listening`)
   - Audio-based questions
   - Can be auto or manually graded
   - Supports audio file uploads

## Drag and Drop Subtypes

The `drag-and-drop` type has several subtypes that MUST be properly handled:

1. **Sequence** (`sequence`)
   - Students arrange items in correct order
   - Supports audio prompts
   - Requires:
     - Word bank (comma-separated)
     - Correct sequence
     - Optional audio file
     - Optional extra words

2. **Fill-in-the-Blank** (`fill-in-blank`)
   - Students fill in blanks in sentences
   - Requires:
     - Sentences with [BLANK] markers
     - Correct answers for each blank
     - Optional extra words

3. **Image Fill-in-Blank** (`image-fill-blank`)
   - Fill-in-blank with image prompts
   - Requires:
     - Images
     - Sentences with [BLANK] markers
     - Correct answers
     - Optional extra words

4. **Long Paragraph Fill-in-Blank** (`long-paragraph-fill-in-blank`)
   - Extended paragraph with multiple blanks
   - Requires:
     - Paragraph text with [BLANK] markers
     - Word bank
     - Correct answers in sequence
     - Optional extra words

## Important Notes

1. **Type-Specific Fields**
   - Each type has specific required fields
   - These must be validated on both frontend and backend
   - Changes to type structure require updates to both

2. **Grading Requirements**
   - Auto-graded types: `multiple-choice`, `true-false`, `matching`, `drag-and-drop`, `listening`
   - Manually graded types: `writing`, `writing-long`, `speaking`, `assignment`

3. **Question Counting**
   - Different types count questions differently:
     - `drag-and-drop` subtypes have special counting rules
     - `writing` and `writing-long` show "N/A" for question count
     - Other types count individual questions

4. **Media Support**
   - `listening`: Audio files
   - `speaking`: Audio/video recording
   - `drag-and-drop/sequence`: Optional audio prompts
   - `drag-and-drop/image-fill-blank`: Image files

## Implementation Guidelines

1. **Frontend Changes**
   - Always update `handleTypeChange()` when modifying types
   - Maintain subtype visibility logic
   - Update question counting logic for new types

2. **Backend Changes**
   - Update validation for new types/subtypes
   - Maintain type-specific processing
   - Update grading logic if needed

3. **Database Considerations**
   - Assessment type is stored in the `type` field
   - Subtypes are stored in the question data
   - Media files are linked via the `MediaFile` relation

## Common Issues

1. **Subtype Visibility**
   - Subtype dropdown only shows for `drag-and-drop` type
   - Other types should hide the subtype container

2. **Question Counting**
   - Drag-and-drop subtypes have special counting rules
   - Writing types show "N/A" instead of 0

3. **Grading Criteria**
   - Auto-graded types hide grading criteria
   - Manually graded types show grading criteria

## Maintenance

This document must be updated whenever:
1. New assessment types are added
2. New subtypes are added
3. Type-specific behavior changes
4. Grading requirements change
5. Media support changes 