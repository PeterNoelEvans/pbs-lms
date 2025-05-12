import os
import sqlite3
from pathlib import Path

# Define paths using Path for better cross-platform compatibility
BASE_DIR = Path(__file__).parent  # This will be the uploads directory
RESOURCES_DIR = BASE_DIR / 'resources'
THUMBNAILS_DIR = BASE_DIR / 'thumbnails'
THUMBNAIL_PREFIX = '/uploads/thumbnails/'  # Keep this as is for web paths
DB_PATH = Path(__file__).parent.parent / 'prisma' / 'dev.db'  # Go up one level to find prisma

def update_thumbnails():
    # Ensure directories exist
    THUMBNAILS_DIR.mkdir(exist_ok=True)
    
    # Connect to database
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    try:
        # Get all resources
        cur.execute("SELECT * FROM Resource")
        resources = cur.fetchall()
        
        updates = 0
        for res in resources:
            # Get the resource URL or file path
            url = res['url'] or res['filePath']
            if not url:
                continue
                
            # Extract filename and create thumbnail path
            filename = os.path.basename(url)
            thumb_path = THUMBNAILS_DIR / filename
            
            # Check if thumbnail exists
            if thumb_path.exists():
                thumbnail_web_path = THUMBNAIL_PREFIX + filename
                
                # Only update if different
                if res['thumbnail'] != thumbnail_web_path:
                    cur.execute(
                        "UPDATE Resource SET thumbnail = ? WHERE id = ?",
                        (thumbnail_web_path, res['id'])
                    )
                    updates += 1
                    print(f"Updated resource {res['id']} with thumbnail {thumbnail_web_path}")
            else:
                print(f"Warning: No thumbnail found for {filename}")
        
        # Commit changes
        conn.commit()
        print(f"\nUpdated {updates} thumbnails successfully.")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    update_thumbnails() 