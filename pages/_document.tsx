import { Head, Html, Main, NextScript } from "next/document";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";

export default function Document() {
  return (
    <Html lang="he" dir="rtl" {...mantineHtmlProps}>
      <Head>
        <ColorSchemeScript defaultColorScheme="dark" />
        <meta name="theme-color" content="#0a0b14" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>
      <body>
        <Main />
        <NextScript />

        {/* Only load eruda if ?eruda=true in URL */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('eruda') === 'true') {
                  const script = document.createElement('script');
                  script.src = '//cdn.jsdelivr.net/npm/eruda';
                  document.body.appendChild(script);
                  script.onload = function() { eruda.init(); };
                }
              })();
            `,
          }}
        />
        <script
          async
          src="https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/OpusMediaRecorder.umd.js"
        ></script>
        <script
          async
          src="https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/encoderWorker.umd.js"
        ></script>
      </body>
    </Html>
  );
}
