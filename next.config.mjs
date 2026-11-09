/** @type {import('next').NextConfig} */
const nextConfig = {
  // drei <Html> races with React 19 strict-mode double mounting in dev.
  reactStrictMode: false,
  devIndicators: false,
  // Keep Next from treating the parent Backroom repo as this app's workspace root.
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
};
export default nextConfig;
