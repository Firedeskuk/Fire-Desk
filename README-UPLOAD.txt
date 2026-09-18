Fire Desk, night 2 delivery (QR scanning, QR labels, select options editor)
Branch feat/mvp-night-2, 7 commits on top of main (410c200). Full report: NIGHT-2-REPORT.md.

What is in this zip
- files/                       every file added or changed on the branch, at its repo path
- DELETE-THESE-FILES.txt       the three files the branch deletes
- git/fire-desk-night-2.bundle the same commits as a git bundle, for the git route
- NIGHT-2-REPORT.md            the report, also inside files/docs

Upload route (browser, no git)
1. On GitHub open the repo, click the branch dropdown, type feat/mvp-night-2,
   click "Create branch feat/mvp-night-2 from main".
2. Stay on that branch. Click "Add file", then "Upload files". Drag the whole
   content of the files/ folder onto the page: the folders app, components,
   docs, lib, styles, tests and the root files (.gitignore, .npmrc, CLAUDE.md,
   package.json, package-lock.json). The uploader keeps the folder structure.
   Commit message: Add night 2 work. Commit directly to feat/mvp-night-2.
3. .gitignore and .npmrc are hidden files on Mac and Windows. If they did not
   upload, create them on GitHub (Add file, Create new file) and paste the
   content from files/.
4. Delete the three files in DELETE-THESE-FILES.txt on GitHub: open the file,
   click the bin icon, commit to feat/mvp-night-2.
5. Open the pull request feat/mvp-night-2 to main and paste NIGHT-2-REPORT.md
   as the description.

Git route (one command at a time, inside a clone of the repo)
1. git fetch /path/to/fire-desk-night-2.bundle feat/mvp-night-2:feat/mvp-night-2
2. git push -u origin feat/mvp-night-2
3. Open the pull request feat/mvp-night-2 to main on GitHub.

After the merge, on a laptop, one at a time: npm install, npm run build,
npm run lint, npm run typecheck, npm test.

Krotko po polsku dla Piotra: w folderze files/ sa wszystkie pliki z galezi
w swoich sciezkach. Zaloz na GitHubie galaz feat/mvp-night-2 z main, wgraj
zawartosc files/ przez "Upload files", usun recznie trzy pliki z listy
DELETE-THESE-FILES.txt, otworz pull request do main z raportem jako opisem.
