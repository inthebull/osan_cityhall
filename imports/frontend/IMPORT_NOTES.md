# Imported frontend (for review)

Source: local 시정연구모임/frontend (osan-ai-hall.html + a Grok app-builder workspace zip, extracted to workspace/).

Left out: .grok/, .vercel/, .tanstack/, node_modules; src/lib/auth/preview.ts (hardcoded OAuth client secret); attachments/F4O_오산시AI청사_팀원공유_상세기획.md (names a staff member); attachments/ghLSpisgsi7ot7SH-grok-workspace.zip (older nested copy).

src/lib/auth/* imports preview.ts, so it won't typecheck as-is. Auth is off (VITE_AUTH_ENABLED=false); the game is in src/game/.
