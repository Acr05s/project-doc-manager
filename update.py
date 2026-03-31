#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Project Document Manager - Auto Update Tool
"""

import os
import sys
import json
import shutil
import zipfile
import subprocess
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

# Fix Windows console encoding
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

GITHUB_REPO = "Acr05s/project-doc-manager"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_GIT_URL = "https://github.com/Acr05s/project-doc-manager.git"

def get_current_version():
    """Get current version"""
    version_file = Path(__file__).parent / 'Version.txt'
    if version_file.exists():
        return version_file.read_text(encoding='utf-8').strip()
    return "unknown"

def get_latest_version():
    """Get latest version from GitHub"""
    try:
        req = Request(GITHUB_API_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return {
                'version': data['tag_name'],
                'download_url': data['zipball_url'],
                'published_at': data['published_at'],
                'body': data['body']
            }
    except Exception as e:
        print(f"[ERROR] Failed to get version info: {e}")
        return None

def download_update(download_url, save_path):
    """Download update package"""
    try:
        print("Downloading update...")
        req = Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(req, timeout=120) as response:
            with open(save_path, 'wb') as f:
                while True:
                    chunk = response.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)
                    print(".", end='', flush=True)
        print("\n[OK] Download complete")
        return True
    except Exception as e:
        print(f"\n[ERROR] Download failed: {e}")
        return False

def apply_update(zip_path, app_dir):
    """Apply update using zip package"""
    try:
        print("Extracting update...")
        temp_dir = app_dir / 'update_temp'
        temp_dir.mkdir(exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
        
        # Find extracted directory
        extracted_dirs = [d for d in temp_dir.iterdir() if d.is_dir()]
        if not extracted_dirs:
            print("[ERROR] Invalid update package structure")
            return False
        
        source_dir = extracted_dirs[0]
        
        # Update files (preserve user data)
        update_files = ['main.py', 'requirements.txt', 'Version.txt', 'app', 'static', 'templates', 'tools']
        for item in update_files:
            src = source_dir / item
            dst = app_dir / item
            if src.exists():
                if dst.exists():
                    if dst.is_dir():
                        shutil.rmtree(dst)
                    else:
                        dst.unlink()
                if src.is_dir():
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)
                print(f"[OK] Updated {item}")
        
        # Cleanup
        shutil.rmtree(temp_dir)
        zip_path.unlink()
        
        print("\n[OK] Update applied successfully!")
        print("Please restart the application.")
        return True
        
    except Exception as e:
        print(f"[ERROR] Failed to apply update: {e}")
        return False

def update_via_git(app_dir):
    """Update via git pull"""
    try:
        print("Updating via git...")
        
        # Check if git is available
        result = subprocess.run(['git', '--version'], capture_output=True, text=True)
        if result.returncode != 0:
            print("[ERROR] Git is not installed or not in PATH")
            return False
        
        # Pull latest changes
        result = subprocess.run(
            ['git', 'pull', 'origin', 'main'],
            cwd=app_dir,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("[OK] Git pull successful")
            
            # Check if requirements.txt changed
            if 'requirements.txt' in result.stdout or 'requirements.txt' in result.stderr:
                print("\nUpdating dependencies...")
                result = subprocess.run(
                    ['pip', 'install', '-r', 'requirements.txt'],
                    cwd=app_dir,
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    print("[OK] Dependencies updated")
                else:
                    print(f"[WARNING] Failed to update dependencies: {result.stderr}")
            
            return True
        else:
            print(f"[ERROR] Git pull failed: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"[ERROR] Git update failed: {e}")
        return False

def main():
    """Main function"""
    print("=" * 50)
    print("   Project Document Manager - Auto Update")
    print("=" * 50 + "\n")
    
    app_dir = Path(__file__).parent.absolute()
    current_version = get_current_version()
    
    print(f"Current version: {current_version}")
    print("Checking for updates...\n")
    
    # Try git update first
    print("Trying git update...")
    if update_via_git(app_dir):
        print("\n[OK] Git update completed successfully!")
        input("\nPress Enter to exit...")
        return
    
    print("\nGit update failed, trying release update...")
    
    # Fallback to release update
    latest = get_latest_version()
    if not latest:
        print("[ERROR] Unable to get latest version info")
        input("\nPress Enter to exit...")
        return
    
    print(f"Latest version: {latest['version']}")
    print(f"Published: {latest['published_at']}")
    print(f"\nRelease notes:")
    print(latest['body'][:500] + "..." if len(latest['body']) > 500 else latest['body'])
    
    if latest['version'] == current_version:
        print("\n[OK] Already up to date!")
        input("\nPress Enter to exit...")
        return
    
    print("\nNew version available!")
    choice = input("Download update? (y/n): ").strip().lower()
    
    if choice != 'y':
        print("Update cancelled")
        return
    
    # Download update
    update_zip = app_dir / 'update.zip'
    if not download_update(latest['download_url'], update_zip):
        input("\nPress Enter to exit...")
        return
    
    # Apply update
    if apply_update(update_zip, app_dir):
        # Update version file
        version_file = app_dir / 'Version.txt'
        version_file.write_text(latest['version'], encoding='utf-8')
        print(f"\n[OK] Updated to version {latest['version']}")
    
    input("\nPress Enter to exit...")

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"\n[ERROR] {e}")
        input("Press Enter to exit...")
