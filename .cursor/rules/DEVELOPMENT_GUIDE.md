---
title: Teacher Resource Platform Guide
author: Peter
date: 2025-05-19
tags: [documentation, best-practices, guide]
---


# 🛠️ Teacher Resource Platform: Development Guide & Best Practices

## Table of Contents
1. [General Principles](#general-principles)
2. [Frontend (HTML/JS)](#frontend-htmljs)
3. [Backend (Node.js/Express/Prisma)](#backend-nodejs-express-prisma)
4. [Data Contracts & API](#data-contracts--api)
5. [Validation & Type Safety](#validation--type-safety)
6. [File Uploads](#file-uploads)
7. [Error Handling](#error-handling)
8. [How to Add a New Feature](#how-to-add-a-new-feature)
9. [FAQ / Gotchas](#faq--gotchas)

---

## General Principles

- **Single Source of Truth:** The Prisma schema defines the database structure. All data sent to the backend must match this.
- **Type Safety:** Use TypeScript or validation libraries to enforce types on both frontend and backend.
- **Consistent Data Contracts:** Document and follow the expected structure for all API requests and responses.
- **Defensive Coding:** Always validate and sanitize incoming data on the backend.
- **Documentation:** Update this guide when adding new patterns or features.

---

## Frontend (HTML/JS)

- **Form Data:**
  - Use `formData.set('field', value)` for unique fields (e.g., `category`, `title`).
  - Use `formData.append('field', value)` only for fields that can have multiple values (e.g., file uploads, tags).
- **Field Types:**
  - Match the type expected by the backend (e.g., send strings for string fields, not arrays).
- **Validation:**
  - Validate required fields before submitting forms.
  - Use clear error messages for users.
- **API Calls:**
  - Always check the response for errors and handle them gracefully.
- **Audio/File Uploads:**
  - Upload files before submitting the main form if needed, and store the returned file path in a hidden input.

---

## Backend (Node.js/Express/Prisma)

- **Type Checking:**
  - Use TypeScript or a validation library (e.g., Zod, Yup, Joi) to validate incoming request bodies.
- **Prisma Usage:**
  - Only pass data to Prisma that matches the schema types (e.g., `category` must be a string or null, not an array).
  - If a field can be sent as an array (e.g., due to frontend bugs), coerce it to a string:  
    ```js
    if (Array.isArray(category)) category = category[0];
    ```
- **Error Handling:**
  - Catch and log errors, and return meaningful error messages to the frontend.
- **File Uploads:**
  - Store file paths in the database, not the files themselves.
  - Validate file types and sizes.

---

## Data Contracts & API

- **Document all endpoints** with:
  - Required and optional fields
  - Expected types (string, number, array, etc.)
  - Example request/response bodies
- **Keep frontend and backend in sync** by updating this guide and endpoint docs when changes are made.

---

## Validation & Type Safety

- **Frontend:**
  - Validate user input before sending to the backend.
- **Backend:**
  - Use a validation library (e.g., Zod, Yup, Joi) to enforce types and required fields.
  - Example with Zod:
    ```js
    const assessmentSchema = z.object({
      title: z.string(),
      category: z.string().optional(),
      // ... other fields
    });
    const parsed = assessmentSchema.parse(req.body);
    ```
- **Prisma:**
  - The schema is the source of truth for types. Do not pass data to Prisma that does not match the schema.

---

## File Uploads

- **Frontend:**
  - Use a separate API endpoint to upload files (e.g., audio), then store the returned file path in a hidden input.
  - Include the file path in the main form submission.
- **Backend:**
  - Validate file type and size.
  - Store files in a designated directory (e.g., `/uploads/resources/`).
  - Save only the file path in the database.

---

## Error Handling

- **Frontend:**
  - Show clear error messages to users.
  - Log errors to the console for debugging.
- **Backend:**
  - Log all errors with enough context to debug.
  - Return a 4xx or 5xx status code with a helpful message.
  - Never expose sensitive information in error messages.

---

## How to Add a New Feature

1. **Update the Prisma schema** if new fields are needed. Run migrations.
2. **Update backend validation** to include new fields.
3. **Update frontend forms and API calls** to send/receive the new fields.
4. **Document the new/changed API contract** in this guide.
5. **Test end-to-end** (frontend → backend → database).
6. **Update this guide** if new patterns or gotchas are discovered.

---

## FAQ / Gotchas

- **Q: Why did my form submission fail with a Prisma error about types?**
  - A: Check that you are sending the correct type (e.g., string, not array) for each field. See the Prisma schema.

- **Q: Why does my audio file not save?**
  - A: Make sure you upload the file first, store the path, and include it in the main form submission.

- **Q: How do I prevent duplicate fields in FormData?**
  - A: Use `set` for unique fields, not `append`.

- **Q: How do I validate incoming data on the backend?**
  - A: Use a validation library (see above) and always check types before saving to the database.

- **Q: What if I need to support multiple values for a field?**
  - A: Update the Prisma schema to use `String[]` and document the change here.

---

**Keep this guide up to date!**

If you find a new issue or pattern, add it here so the whole team benefits. 