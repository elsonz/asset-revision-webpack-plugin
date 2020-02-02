# asset-revision-webpack-plugin
Static asset revisioning with those assets that will not be processed by webpack

## Installation
``` shell
npm i -D asset-revision-webpack-plugin
```

## Usage
In your html template file, add `rev` or `md5` attribute at the specific `link` or `script` tags, in order to specify which assets need to be revisioning.
Those tags which do not have the above attributes will not be processed.
``` javascript
<link rev rel="stylesheet" href="//y.gtimg.cn/index.css?max_age=604800" />
<script MD5 src="//y.qq.com/music.js?max_age=604800&v=20200117"></script>
```

At the plugin section of your webpack config file, include the following
``` javascript
new HtmlWebpackPlugin({
    filename: 'index.html',
    template: 'src/index.html'
}),
new AssetRevisionWebpackPlugin()
// new AssetRevisionWebpackPlugin({ serverIp: '9.134.12.12', port: '80', timeout: 1000, filename: '[name].[hash].[ext]' })
```
the plugin will
1. Rename files with content hash and emit to the webpack output directory. dist/index-72f5103e.css
2. Replace asset URLs with hashed version in the HTML file that html-webpack-plugin generated for you. eg. index.css -> index-72f5103e.css

## Configration
- serverIp(optional): an ip address which tells axios where to fetch all asset files
- port(optional): same function as above. '80' is by default
- timeout(optional): connection/response timeout(ms) in axios fetch
- filename: the template string that defines the final hashed filename. default: '[name]-[hash].[ext]'
