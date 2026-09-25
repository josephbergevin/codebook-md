//@ts-check
'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: function(info) {
      // Handle source map paths correctly
      const absolutePath = info.absoluteResourcePath;
      // Convert Windows backslashes to forward slashes for URLs
      return `file:///${absolutePath.replace(/\\/g, '/')}`;
    }
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                sourceMap: true
              },
              transpileOnly: false
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'src/webview/templates/*.html',
          to: 'templates/[name][ext]'
        },
        // Icons for webviews - shipped with the extension so they work offline
        // and under the webviews' Content-Security-Policy
        {
          from: 'node_modules/@vscode/codicons/dist/codicon.{css,ttf}',
          to: 'codicons/[name][ext]'
        }
      ]
    })
  ],
  node: {
    __dirname: false,
    __filename: false
  },
  devtool: 'source-map',
  infrastructureLogging: {
    level: "log",
  },
};

/**
 * Notebook renderer that extends VS Code's built-in markdown cell renderer.
 * It runs in the notebook webview, so it targets the browser and must be
 * emitted as an ES module (VS Code imports it and calls `activate`).
 * @type WebpackConfig
 */
const notebookRendererConfig = {
  target: 'web',
  mode: 'none',
  entry: './src/notebookRenderer/index.ts',
  experiments: {
    outputModule: true
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'notebookMarkdown.js',
    library: {
      type: 'module'
    }
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // Only type-check this bundle's files, not the whole project
              onlyCompileBundledFiles: true,
              compilerOptions: {
                // Keep ES module syntax so webpack can emit a module library
                module: 'es2020'
              }
            }
          }
        ]
      }
    ]
  },
  devtool: 'source-map'
};

module.exports = [extensionConfig, notebookRendererConfig];
