#!/bin/bash

# Backup script for files ignored by git
# This script backs up files that are in .gitignore but should be preserved

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BACKUP_NAME="backup-$TIMESTAMP"
PROJECT_ROOT=$(pwd)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

echo "Starting backup of git-ignored files..."
echo "Backup location: $BACKUP_DIR/$BACKUP_NAME"

# Process .gitignore patterns to find files to back up
echo "Looking for critical data files..."

# Important patterns to backup - focusing on specific data files
echo "Processing database files..."
# First specifically list database locations (more likely to find them)
DB_FILES=$(find "$PROJECT_ROOT" -type f \( -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" \) 2>/dev/null)

if [ -z "$DB_FILES" ]; then
  echo "WARNING: No database files found. Check if your databases are in unusual locations."
else
  echo "Found $(echo "$DB_FILES" | wc -l) database files"
  while IFS= read -r file; do
    rel_path=${file#$PROJECT_ROOT/}
    target_dir=$(dirname "$BACKUP_DIR/$BACKUP_NAME/$rel_path")
    mkdir -p "$target_dir"
    cp "$file" "$target_dir/"
    echo "  Backed up database: $rel_path"
  done <<< "$DB_FILES"
fi

# Environment files
echo "Processing environment files..."
ENV_FILES=$(find "$PROJECT_ROOT" -name ".env*" -type f 2>/dev/null)
if [ -n "$ENV_FILES" ]; then
  while IFS= read -r file; do
    rel_path=${file#$PROJECT_ROOT/}
    target_dir=$(dirname "$BACKUP_DIR/$BACKUP_NAME/$rel_path")
    mkdir -p "$target_dir"
    cp "$file" "$target_dir/"
    echo "  Backed up env file: $rel_path"
  done <<< "$ENV_FILES"
fi

# Password files
echo "Processing password files..."
for pattern in "PBS_passwords.txt" "Phumdham-pswds.txt"; do
  PASSWORD_FILES=$(find "$PROJECT_ROOT" -name "$pattern" -type f 2>/dev/null)
  if [ -n "$PASSWORD_FILES" ]; then
    while IFS= read -r file; do
      rel_path=${file#$PROJECT_ROOT/}
      target_dir=$(dirname "$BACKUP_DIR/$BACKUP_NAME/$rel_path")
      mkdir -p "$target_dir"
      cp "$file" "$target_dir/"
      echo "  Backed up password file: $rel_path"
    done <<< "$PASSWORD_FILES"
  fi
done

# Portfolio data
echo "Processing portfolio data..."
if [ -d "$PROJECT_ROOT/portfolios/data temp" ]; then
  mkdir -p "$BACKUP_DIR/$BACKUP_NAME/portfolios/data temp"
  cp -R "$PROJECT_ROOT/portfolios/data temp/"* "$BACKUP_DIR/$BACKUP_NAME/portfolios/data temp/" 2>/dev/null
  echo "  Backed up: portfolios/data temp/"
fi

# Create a manifest of backed-up files
echo "Creating backup manifest..."
echo "Backup created on $(date)" > "$BACKUP_DIR/$BACKUP_NAME/backup-manifest.txt"
echo "" >> "$BACKUP_DIR/$BACKUP_NAME/backup-manifest.txt"
echo "Files included:" >> "$BACKUP_DIR/$BACKUP_NAME/backup-manifest.txt"
find "$BACKUP_DIR/$BACKUP_NAME" -type f | grep -v "backup-manifest.txt" | sort >> "$BACKUP_DIR/$BACKUP_NAME/backup-manifest.txt"

# Create zip archive
echo "Creating zip archive..."
cd "$BACKUP_DIR"
zip -r "${BACKUP_NAME}.zip" "$BACKUP_NAME" > /dev/null

# Remove the temporary directory
rm -rf "$BACKUP_NAME"

echo "Backup completed: $BACKUP_DIR/${BACKUP_NAME}.zip"
echo "Total size: $(du -h "${BACKUP_NAME}.zip" | cut -f1)"

# List database files that were found
echo ""
echo "Database files backed up:"
find "$PROJECT_ROOT" -type f \( -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" \) -exec basename {} \; | sort 