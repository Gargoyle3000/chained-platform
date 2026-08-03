// Copying this file manually is not required. Run:
// powershell -ExecutionPolicy Bypass -File scripts/write-local-frontend-config.ps1
export default Object.freeze({
  mode: "local-supabase",
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseKey: "YOUR_LOCAL_PUBLISHABLE_OR_ANON_KEY",
  callbackUrl: "http://127.0.0.1:5500/auth-callback.html"
});

