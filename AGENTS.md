<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Security

- Never commit secrets (passwords, tokens, API keys) to the repository.
- `.env*` files are ignored by git, except `.env.example` which serves as a template.
- Always verify that no sensitive data is present in the code before pushing.
- Database credentials and NextAuth secrets must remain in `.env` (not versioned).
