@echo off
echo Checking directory structure...
echo.
echo Current directory:
echo %CD%
echo.
echo Projects directory:
if exist projects (
    echo Projects directory exists
    dir projects
) else (
    echo Projects directory does not exist
)
echo.
echo Uploads\projects directory:
if exist uploads\projects (
    echo Uploads\projects directory exists
    dir uploads\projects
) else (
    echo Uploads\projects directory does not exist
)
echo.
echo Press any key to exit...
pause > nul
