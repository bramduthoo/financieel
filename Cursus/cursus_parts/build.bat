@echo off
pandoc metadata.yaml 01-introduction.md 02-foundations-part1.md 02-foundations-part2.md 02-foundations-part3.md 02-foundations-part4.md 03-database.md 04-1-lib.md 04-2-frame.md 04-3-wallets.md 04-4-income.md 04-5-dashboard-settings.md 04-6-root.md --top-level-division=chapter --highlight-style=tango --pdf-engine=xelatex -o ..\financieel-course.pdf
echo PDF built successfully.
pause