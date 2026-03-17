/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["shiki"],
  // Scheduler uses Handlebars (require.extensions) and nodemailer; keep them on Node runtime
  serverExternalPackages: ["handlebars", "nodemailer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    middlewareClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
