import os
from PIL import Image

# Paths (adjust if needed)
RESOURCES_DIR = './resources'
THUMBNAILS_DIR = './thumbnails'
THUMBNAIL_SIZE = (100, 175)  # (width, height)

# Ensure thumbnails directory exists
os.makedirs(THUMBNAILS_DIR, exist_ok=True)

# Supported image extensions
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}

def is_image(filename):
    return os.path.splitext(filename)[1].lower() in IMAGE_EXTS

def make_thumbnail(resource_path, thumbnail_path):
    try:
        with Image.open(resource_path) as img:
            img.thumbnail(THUMBNAIL_SIZE)
            img.save(thumbnail_path)
            print(f"Created thumbnail: {thumbnail_path}")
    except Exception as e:
        print(f"Failed to create thumbnail for {resource_path}: {e}")

def main():
    for filename in os.listdir(RESOURCES_DIR):
        if not is_image(filename):
            continue
        resource_path = os.path.join(RESOURCES_DIR, filename)
        thumbnail_path = os.path.join(THUMBNAILS_DIR, filename)
        if not os.path.exists(thumbnail_path):
            make_thumbnail(resource_path, thumbnail_path)
        else:
            print(f"Thumbnail already exists: {thumbnail_path}")

if __name__ == '__main__':
    main()