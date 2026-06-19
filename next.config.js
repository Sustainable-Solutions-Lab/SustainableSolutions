const withMDX = require('@next/mdx')({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx'],

  // Allow embedding as iframe on Stanford's site
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // X-Frame-Options only supports one domain; CSP frame-ancestors is preferred
            // and supports wildcards. Keep both for legacy browser compatibility.
            key: 'X-Frame-Options',
            value: 'ALLOW-FROM https://sustainablesolutions.stanford.edu',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.stanford.edu",
          },
        ],
      },
    ]
  },
}

module.exports = withMDX(nextConfig)
