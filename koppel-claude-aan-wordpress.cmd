@echo off
REM Dubbelklik dit bestand om Claude aan WordPress te koppelen.
REM Het echte werk zit in het .ps1-bestand ernaast; deze wrapper bestaat
REM alleen omdat Windows PowerShell-scripts niet zomaar laat dubbelklikken.
REM
REM De pause hieronder is er met opzet: klapt PowerShell er meteen uit
REM (geblokkeerd door beleid, virusscanner, ontbrekende PowerShell), dan
REM sloot dit venster vroeger onmiddellijk en zag je nooit waarom.
title Claude koppelen aan WordPress
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0koppel-claude-aan-wordpress.ps1"
if errorlevel 1 (
  echo.
  echo   Er is iets misgelopen. Foutcode: %errorlevel%
  echo   Stuur de tekst hierboven door, dan lossen we het op.
  echo.
)
pause
