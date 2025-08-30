## Guide: Creating and Maintaining the two new assessment types (Connect Match (Line) and Phoneme Builder)

This document captures the end‑to‑end design, the teacher workflow, the student experience, the JSON data shape we store, and known pitfalls. Use it as a quick refresher when you need to make more of these assessments or tweak behavior.

### 1) Connect Match (Line)

- **Purpose**: Match a word/text to a picture/word by connecting left → right items. Mobile‑friendly (tap left, then right) – no native drag‑and‑drop.
- **Type value**: `line-match`

#### Teacher workflow
1. Go to Teacher → Assessments → Create Assessment.
2. Choose the usual subject/unit/part/section.
3. Set Type to “Connect Match (Line)”.
4. In the Questions section, click “Add Connect Match”.
5. For each pair, fill the left and right entries. Today this supports text or URLs. We are adding image upload support (see “Upcoming improvement” below).
6. Use the [+ Add Pair] button to add more rows.
7. Save the assessment.

#### Student experience
- Students tap a left item, then a right item to form a connection. The interface shows feedback and allows multiple connections. “Check Answers” records an attempt and displays a score; “Submit” records as final.

#### Grading logic (auto‑graded)
- We calculate the percentage by counting matches where the chosen right value equals the stored correct right value for that left index.
- Stored right column order is included in answers so grading works regardless of shuffle order.

#### Data shape in `Assessment.questions`
```json
{
  "type": "line-match",
  "pairs": [
    { "left": "word A", "right": "image-or-word B" },
    { "left": "word C", "right": "image-or-word D" }
  ]
}
```

#### Known issues and fixes
- 2025‑08: Buttons not visible after selecting the type.
  - Cause: the questions panel only whitelisted older types.
  - Fix: Updated the whitelist so `line-match` and `phoneme-build` show the Questions section and the relevant “Add …” button.
- 2025‑08: Teacher wanted images uploaded (not URLs).
  - Current state: Uses text/URL.
  - Action item (planned): Add image upload inputs on each side, store uploaded files under `/uploads/resources`, and persist structured pair values `{ kind: 'image'|'text', value: '...path or text...' }`. Student renderer to display `<img>` when `kind === 'image'`.

### 2) Phoneme Builder

- **Purpose**: Build a word by dragging/choosing phoneme tiles (1–3 letters) into blank positions. Example: `b__k` with the tile “oo”.
- **Type value**: `phoneme-build`

#### Teacher workflow
1. Choose Type “Phoneme Builder”.
2. Enter:
   - Word Template: use `__` to mark each blank (e.g., `b__k`, `c__l__r`).
   - Correct Tiles: comma‑separated list of the correct tile for each blank in order (e.g., `oo` or `ou, ou`).
   - Available Tiles: a comma‑separated bank including the correct tiles and distractors (e.g., `oo, oa, u, o`).
3. Save the assessment.

#### Student experience
- Students tap a tile to place it into the next blank; tap a blank to clear it. “Check Answers” records an attempt and shows a score; “Submit” records as final.

#### Grading logic (auto‑graded)
- Score is the percentage of blanks that contain the correct tile for their position.

#### Data shape in `Assessment.questions`
```json
{
  "type": "phoneme-build",
  "word": "b__k",
  "correctTiles": ["oo"],
  "tiles": ["oo", "oa", "u", "o"]
}
```

### 3) Common behaviors (applies to both types)

- “Check Answers” now counts as an attempt and is saved in the database (same policy we applied across other types).
- The submission flow no longer shows a confirmation dialog; pressing Submit directly submits (addresses mobile UX complaints).
- Attempts and score are visible in standard reporting screens.

### 4) Where to find the code

- Teacher editor (UI, builder forms):
  - `public/teacher/assessments.html`
- Student renderer (players + grading):
  - `public/student/assessment.html`
- Backend persistence:
  - No schema change required; assessments store `questions` as JSON in Prisma’s `Assessment.questions`. Create/Update endpoints already pass the JSON through.

### 5) Troubleshooting checklist

- The “Add …” button doesn’t show after changing Type:
  - Refresh the page; ensure Questions section is visible. The type must be one of: `multiple-choice`, `drag-and-drop`, `matching`, `true-false`, `assignment`, `change-sequence`, `line-match`, `phoneme-build`.
- Saved but nothing appears when editing:
  - Confirm the stored JSON has the expected keys (`pairs` for line‑match; `word`, `correctTiles`, `tiles` for phoneme‑build).
- Scores not recorded on Check:
  - Ensure the student player buttons call `submitAssessment` with `{ answers, score }`. This is built in for these types.

### 6) Upcoming improvement: Image uploads for Connect Match

- We will:
  - Add per‑pair file inputs for left/right.
  - Upload to `/uploads/resources` via the existing multer setup.
  - Save pairs as:
    ```json
    { "left": {"kind":"image","value":"/uploads/resources/....png"},
      "right": {"kind":"text","value":"apple"} }
    ```
  - Update the student renderer to show an `<img>` when `kind==='image'`, otherwise text.

### 7) Quick reference (teacher)

- Connect Match (Line): Add pairs → Save → Students connect via taps → Auto‑graded.
- Phoneme Builder: Template with `__` + Correct Tiles + Tile bank → Save → Students place tiles → Auto‑graded.

### 8) Revision log

- 2025‑08: Added types, editor UIs, student players, grading, check‑records‑attempts, and fixed Questions panel visibility.
- 2025‑08: Planned image upload enhancement for Connect Match (in progress).


