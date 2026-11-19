@echo off
cd /d "%~dp0"
echo.
echo --- Note Summary: pubblicazione su Internet (GitHub) ---
echo.
echo SE IL REPO NON ESISTE ANCORA:
echo 1) Vai su https://github.com/new
echo 2) Nome repository: note-summary
echo 3) Public, SENZA README
echo 4) Crea repository
echo.
pause
git remote remove origin 2>nul
git remote add origin https://github.com/carlo2424/note-summary.git
git branch -M main
git push -u origin main
echo.
echo Dopo il push, attendi 2-3 minuti e apri:
echo https://carlo2424.github.io/note-summary/
echo.
pause