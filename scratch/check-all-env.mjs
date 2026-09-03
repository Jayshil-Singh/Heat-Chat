console.log("Checking process.env keys...");
const keys = Object.keys(process.env).filter(
  (k) =>
    k.includes("SUPABASE") ||
    k.includes("POSTGRES") ||
    k.includes("DATABASE") ||
    k.includes("PG") ||
    k.includes("VERCEL")
);
console.log("Relevant env keys:", keys);
