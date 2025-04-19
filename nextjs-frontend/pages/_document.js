import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body className="antialiased">
        <Main />
        <NextScript />
        {/* Add MathJax script after NextScript to avoid hydration issues */}
        <script
          type="text/javascript" 
          id="MathJax-script" 
          async
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"
        />
        <script 
          type="text/javascript" 
          dangerouslySetInnerHTML={{
            __html: `
              window.MathJax = {
                tex: {
                  inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
                  displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
                  processEscapes: true
                },
                svg: {
                  fontCache: 'global'
                },
                options: {
                  enableMenu: false
                }
              };
            `
          }}
        />
      </body>
    </Html>
  );
}