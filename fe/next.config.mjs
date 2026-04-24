/** @type {import('next').NextConfig} */
// 브라우저는 보통 상대 경로 /api (nginx 동일 오리진). FE만 직접 열 때(포트 63105) Next가 BE로 넘김.
const BE_INTERNAL_URL = process.env.BE_INTERNAL_URL || 'http://127.0.0.1:48998'

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BE_INTERNAL_URL}/api/:path*` }]
  },
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  }
}

export default nextConfig
