# Missing Matching Pairs Fix

## Issue Description
When a teacher creates a matching assessment, the matching pairs are not being properly saved or retrieved from the database. This causes the student view to display fallback content instead of the actual matching pairs.

## Root Cause Analysis
1. From the API response, we can see the assessment has type "matching" but the questions array only contains `[{"type":"matching"}]` with no actual matching pair data.
2. When examining the teacher interface form submission, the pairs data should be saved in the question object, but it appears this data is lost.

## Recommended Backend Fix
1. Check the assessment submission API endpoint to ensure it properly processes and saves the matching pairs data.
2. Verify that the database schema can store matching pairs data (likely as JSON in a column).
3. Update the assessment retrieval API to include the full matching pairs data when returning assessments to students.

## Database Update Example
```sql
-- If using a separate table for matching pairs:
CREATE TABLE matching_pairs (
  id SERIAL PRIMARY KEY,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  expression TEXT NOT NULL,
  meaning TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alternatively, ensure the questions table has a content JSONB column
ALTER TABLE questions ADD COLUMN IF NOT EXISTS content JSONB;
```

## API Fix Example
```javascript
// When saving an assessment
if (question.type === "matching" && question.pairs) {
  // Store the pairs data in the question content
  question.content = JSON.stringify({
    pairs: question.pairs,
    expressions: question.expressions,
    meanings: question.meanings
  });
}

// When retrieving an assessment
if (question.type === "matching" && question.content) {
  // Parse the content for the student view
  try {
    const content = JSON.parse(question.content);
    question.pairs = content.pairs;
    question.expressions = content.expressions;
    question.meanings = content.meanings;
  } catch (e) {
    console.error("Failed to parse matching content:", e);
  }
}
``` 