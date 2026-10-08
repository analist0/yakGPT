/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  images: {
    // sharp has no Android (Termux) build; serve images as they are there
    unoptimized:
      process.platform === 'android' || process.env.YAKGPT_UNOPTIMIZED_IMAGES === '1',
  },
};

module.exports = nextConfig;
