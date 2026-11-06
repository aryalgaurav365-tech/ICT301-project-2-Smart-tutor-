import fs from "node:fs";
const origin = process.env.DEPLOY_API_ORIGIN;
if (
  !origin ||
  !origin.startsWith("https://") ||
  new URL(origin).pathname !== "/"
)
  throw new Error(
    "Set DEPLOY_API_ORIGIN to the HTTPS API origin without a path",
  );
fs.writeFileSync(
  "vercel.json",
  JSON.stringify(
    {
      buildCommand: "npm run build",
      outputDirectory: "apps/web/dist",
      framework: null,
      rewrites: [
        {
          source: "/api/:path*",
          destination: new URL("/api/:path*", origin).href,
        },
        { source: "/:path*", destination: "/index.html" },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("Generated vercel.json; review before committing.");
