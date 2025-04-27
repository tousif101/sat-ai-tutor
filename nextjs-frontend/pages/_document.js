import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Define MathJax configuration before loading the script */}
        <script 
          type="text/javascript" 
          dangerouslySetInnerHTML={{
            __html: `
              window.MathJax = {
                tex: {
                  inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
                  displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
                },
                svg: {
                  fontCache: 'global'
                },
                startup: {
                  ready: () => {
                    console.log('MathJax is loaded and ready');
                    MathJax.startup.defaultReady();
                  }
                }
              };
            `
          }}
        />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
        
        {/* Only load one MathJax script */}
        <script
          type="text/javascript" 
          id="MathJax-script" 
          async
          src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js"
        ></script>
      </body>
    </Html>
  );
}