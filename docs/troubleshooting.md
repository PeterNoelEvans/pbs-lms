# Troubleshooting Guide: Teacher Resource Project

This guide covers common errors and their solutions for the assessment and student portal workflows. Use this as a first stop when you or your team encounter issues.

---

## 1. Assessment Not Saving or Validation Errors

**Symptoms:**
- Error: `An invalid form control with name='...' is not focusable.`
- Assessment form does not submit.

**Solution:**
- Ensure that only visible fields are marked as `required`. Hidden fields should have the `required` attribute removed dynamically.
- Check the browser console for which field is causing the error.

---

## 2. Skill/Category Not Persisting

**Symptoms:**
- After editing and saving, the Skill/Category (e.g., Vocabulary) reverts to another value (e.g., Grammar).

**Solution:**
- Ensure the edit logic sets the dropdown value from the assessment data (`assessment.category`).

---

## 3. Question Count Incorrect in Assessment List

**Symptoms:**
- The number of questions displayed is wrong (e.g., shows 5 for a sequence question that is actually 1).

**Solution:**
- For drag-and-drop sequence subtype, always display 1 (since it is a single sequence task).
- For fill-in-the-blank, count the number of sentences.

---

## 4. Student Portal: Assessment Not Loading (404 Error)

**Symptoms:**
- Student portal shows `404 Not Found` or `Failed to load assessment`.

**Solution:**
- Ensure the assessment exists in the database and is published.
- Double-check the assessment ID in the URL.
- If you recently deleted and recreated assessments, refresh the student portal and clear browser cache if needed.

---

## 5. Audio File Not Showing in Student Portal

**Symptoms:**
- Audio player does not appear, even though an audio file was attached in the teacher portal.

**Solution:**
- Confirm the audio file is present in the `mediaFiles` array in the assessment data.
- The frontend should check both `question.audioFileName` and the first audio file in `mediaFiles`.
- Always attach the audio file when saving, and provide a display name for clarity.

---

## 6. Score and Timer Not Displayed After Submission

**Symptoms:**
- After submitting, the success message appears but no score or time taken is shown.

**Solution:**
- Ensure the backend returns both `score` and `timeTaken` in the submission response.
- The frontend should display these values if present.
- The timer should be visible and running during the assessment.

---

## 7. Maximum Attempts Not Enforced or Not Displayed

**Symptoms:**
- Students can submit more times than allowed, or do not see how many attempts are left.

**Solution:**
- The backend should check the number of submissions and enforce `maxAttempts`.
- The frontend should display the number of attempts left and show a clear message if the limit is reached.

---

## 8. General Debugging Tips

- Use browser developer tools (Console and Network tabs) to inspect errors and outgoing data.
- Check the backend logs for error messages.
- If you make major changes, consider deleting and recreating test assessments to avoid data mismatches.

---

## 9. Updating Documentation

- After fixing or encountering new errors, update this guide so future issues can be resolved quickly.

---

**For more details, see:**
- `docs/teachers_guide.md` for teacher workflow
- `docs/development-considerations.md` for developer notes
- `docs/database.md` for data structure

---

_Last updated: [DATE]_ 