/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // @imgly/background-removal runs onnxruntime-web. Cross-origin isolation lets it
  // use SharedArrayBuffer (multi-threaded WASM), which is roughly 3-4x faster.
  // "credentialless" is used instead of "require-corp" so CDN assets still load.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // The matting stack is browser-only and is dynamically imported at call
      // time. Stub it on the server so webpack never tries to parse
      // onnxruntime's Node bundle while compiling client components for SSR.
      config.resolve.alias = {
        ...config.resolve.alias,
        '@imgly/background-removal': false,
        'onnxruntime-web': false,
        'onnxruntime-node': false,
      };
    } else {
      // onnxruntime-web and mediapipe reference node builtins they never call in the browser
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    }

    // onnxruntime ships prebuilt .mjs bundles with extensionless internal
    // imports, which strict ESM resolution rejects. Relaxing fullySpecified
    // fixes that without forcing type: 'javascript/auto' — that reclassification
    // breaks webpack's import.meta.url -> asset-URL rewriting, which onnxruntime's
    // threaded WASM build relies on to spawn its pthread worker (surfaces as
    // "url.replace is not a function" at runtime).
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: { fullySpecified: false },
    });
    return config;
  },
};

export default nextConfig;
