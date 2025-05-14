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

# Important patterns to backup - focus on specific data files
BACKUP_PATTERNS=(
  "*.db"
  "*.sqlite"
  "*.sqlite3"
  ".env*"
  "PBS_passwords.txt"
  "Phumdham-pswds.txt"
  "portfolios/data temp/*"
)

# Find and copy each matching file
for pattern in "${BACKUP_PATTERNS[@]}"; do
  echo "Processing pattern: $pattern"
  
  # Handle directory paths specially
  if [[ "$pattern" == *"/"* ]]; then
    # Extract directory part
    dir_part=$(echo "$pattern" | sed 's/\/[^\/]*$//')
    
    # Create directory structure in backup
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME/$dir_part"
    
    # Find and copy files matching pattern
    find "$PROJECT_ROOT" -path "*$pattern" -type f 2>/dev/null | while read file; do
      rel_path=${file#$PROJECT_ROOT/}
      target_dir=$(dirname "$BACKUP_DIR/$BACKUP_NAME/$rel_path")
      mkdir -p "$target_dir"
      cp "$file" "$target_dir/"
      echo "  Backed up: $rel_path"
    done
  else
    # For simple file patterns
    find "$PROJECT_ROOT" -name "$pattern" -type f 2>/dev/null | while read file; do
      rel_path=${file#$PROJECT_ROOT/}
      target_dir=$(dirname "$BACKUP_DIR/$BACKUP_NAME/$rel_path")
      mkdir -p "$target_dir"
      cp "$file" "$target_dir/"
      echo "  Backed up: $rel_path"
    done
  fi
done

# Create zip archive
echo "Creating zip archive..."
cd "$BACKUP_DIR"
zip -r "${BACKUP_NAME}.zip" "$BACKUP_NAME" > /dev/null

# Remove the temporary directory
rm -rf "$BACKUP_NAME"

echo "Backup completed: $BACKUP_DIR/${BACKUP_NAME}.zip"
echo "Total size: $(du -h "${BACKUP_NAME}.zip" | cut -f1)" 