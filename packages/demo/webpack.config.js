"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var path_1 = __importDefault(require("path"));
var mini_css_extract_plugin_1 = __importDefault(require("mini-css-extract-plugin"));
var context = path_1.default.resolve(process.cwd());
var config = {
    mode: 'development',
    devtool: 'eval-source-map',
    context: context,
    target: 'web',
    entry: {
        index: './src/index.tsx',
    },
    output: {
        publicPath: '/lib/',
        path: path_1.default.resolve(context, 'lib'),
        filename: '[name].js',
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
    },
    plugins: [
        new mini_css_extract_plugin_1.default({
            filename: '[name].css',
            esModule: true,
        }),
    ],
    module: {
        rules: [
            { test: /.css$/i, loader: [mini_css_extract_plugin_1.default.loader, 'css-loader'] },
            { test: /.tsx?$/i, loader: 'ts-loader' },
        ],
    },
    devServer: {
        publicPath: '/lib/',
        contentBase: path_1.default.resolve(context, 'www'),
        port: 9000
    },
};
module.exports = config;
