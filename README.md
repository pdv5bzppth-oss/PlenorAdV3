
  # Political Opinion Article Planner

  This is a code bundle for Political Opinion Article Planner. The original project is available at https://www.figma.com/design/STfnpwpcSdjOVV0E7uUxaI/Political-Opinion-Article-Planner.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## GitHub Pages

  This app must be deployed from the generated `dist` folder, not directly from the repository root. In GitHub, set **Settings > Pages > Build and deployment > Source** to **GitHub Actions** so `.github/workflows/deploy-gh-pages.yml` builds and publishes the Vite output.

  ## Supabase Admin Settings

  The Edge Function needs `ADMIN_EMAILS` and `ADMIN_PASSWORD` secrets for global settings administration. `ADMIN_EMAILS` is a comma-separated allowlist for logged-in admin users, and `ADMIN_PASSWORD` is the temporary password fallback.
  
