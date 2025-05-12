@echo off
SETLOCAL

:: ===============================
:: Cursor AI Chat History Relocation Script
::
:: PURPOSE:
:: This script deletes the existing Cursor data folder in AppData,
:: and replaces it with a symbolic link pointing to a custom location.
::
:: USAGE:
:: 1. Modify the two paths below if your setup is different.
:: 2. Save this file as 'link_cursor_data.bat'.
:: 3. Right-click and "Run as administrator".
:: 4. Cursor AI will now store its data where you want it backed up.
::
:: NOTE:
:: - This works on Windows 10/11.
:: - Must be run with Administrator privileges.
:: ===============================

:: ✅ Set the path where you want Cursor data to be stored
:: This should match the directory you copied Cursor’s original data into.
set "CURSOR_TARGET=F:\2025\Peter-s-Teacher-Resource-Project\.cursor_data"

:: ✅ Set the original path where Cursor expects to find its data
:: This typically lives under your AppData\Roaming folder.
set "CURSOR_SYMLINK=C:\Users\%USERNAME%\AppData\Roaming\Cursor"

echo.
echo =============================================
echo Linking Cursor data to your project folder...
echo ---------------------------------------------
echo From: %CURSOR_SYMLINK%
echo To:   %CURSOR_TARGET%
echo =============================================
echo.

:: ✅ Check if the original Cursor folder or link already exists
if exist "%CURSOR_SYMLINK%" (
    echo Removing existing folder or link at %CURSOR_SYMLINK% ...
    rmdir /S /Q "%CURSOR_SYMLINK%"
)

:: ✅ Create the symbolic link
mklink /D "%CURSOR_SYMLINK%" "%CURSOR_TARGET%"
if %errorlevel%==0 (
    echo.
    echo ✅ Success! Symbolic link created.
    echo Cursor AI will now use the new location.
) else (
    echo.
    echo ❌ Failed to create symbolic link.
    echo Make sure this script is run as Administrator.
)

echo.
pause
ENDLOCAL
