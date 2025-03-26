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

module.exports = [extensionConfig];
