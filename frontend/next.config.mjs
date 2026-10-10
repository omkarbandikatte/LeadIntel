/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // default bottom-left position collides with the app sidebar's Sign out button
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
