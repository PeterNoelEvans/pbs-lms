# Thumbnail Management

This document explains how to manage thumbnails for resources in the Teacher Resource Project.

## Directory Structure

```
uploads/
├── resources/     # Original resource files
├── thumbnails/    # Generated thumbnail images
├── make_thumbnails.py    # Script to generate thumbnails
└── update_thumbnails.py  # Script to update database paths
```

## Process Overview

The thumbnail management process consists of two steps:

1. Generate thumbnails from resource files
2. Update the database with correct thumbnail paths

## Step 1: Generate Thumbnails

Run the thumbnail generation script from the `uploads` directory:

```bash
cd uploads
python make_thumbnails.py
```

This script will:
- Process files in the `resources` directory
- Generate corresponding thumbnails in the `thumbnails` directory
- Support various file types (PDFs, images, etc.)

## Step 2: Update Database Paths

After generating thumbnails, update the database with the correct paths:

```bash
cd uploads
python update_thumbnails.py
```

This script will:
- Check for existing thumbnails in the `thumbnails` directory
- Update the database with correct web paths (`/uploads/thumbnails/filename`)
- Only update records where the thumbnail path has changed
- Provide feedback on the number of updates made

## Troubleshooting

If thumbnails are not appearing correctly:

1. Verify that thumbnails exist in the `uploads/thumbnails` directory
2. Check that filenames match between resources and thumbnails
3. Ensure the web server has proper permissions to access the thumbnails
4. Run both scripts in sequence to regenerate and update paths

## Notes

- Always run both scripts in sequence when adding new resources
- The thumbnail paths in the database should start with `/uploads/thumbnails/`
- Original resource files should be in the `uploads/resources` directory
- Thumbnails are stored in the `uploads/thumbnails` directory 