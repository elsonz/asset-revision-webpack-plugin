const HtmlWebpackPlugin = require('html-webpack-plugin');
const htmlparser2 = require('htmlparser2');
const axios = require('axios').default;
const crypto = require('crypto');
const url = require('url');
const path = require('path');

class AssetRevisionWebpackPlugin {
    constructor(options = {}) {
        this.options = options;
        this.assetLinks = [];
        this.ast = [];
        this.innerId = 0;
        this.TARGET_ATTRS = ['rev', 'md5', 'REV', 'MD5'];
    }

    apply(compiler) {
        this.compilerOptions = compiler.options;

        compiler.hooks.compilation.tap('AssetRevisionWebpackPlugin', compilation => {
            // require HtmlWebpackPlugin v4.0.0+
            if (typeof HtmlWebpackPlugin.getHooks !== 'function') {
                throw new Error('HtmlWebpackPlugin v4 is required');
            }

            const hooks = HtmlWebpackPlugin.getHooks(compilation);

            hooks.beforeEmit.tapAsync('AssetRevisionWebpackPlugin-processing', (data, cb) => {
                const { html } = data;
                this.ast = htmlparser2.parseDOM(html.replace(/\r|\n/g, ''));

                this.findMd5AttrElements(0, this.ast, node => {
                    this.assetLinks.push(node);
                });

                const allUrls = this.assetLinks.map(({ attribs }) => attribs.href || attribs.src);

                // fetch all css files from server
                this.fetchAllStyleContent(allUrls)
                    .then(res => {
                        this.assetLinks.forEach((item, idx) => {
                            const { attribs } = item;
                            const currentRes = res[idx];
                            const hash = crypto
                                .createHash('md5')
                                .update(currentRes.data)
                                .digest('hex');

                            // rename file with content hash
                            const fileName = this.generateFileName(attribs.href || attribs.src, hash);

                            // What's the right way to add asset from a plugin
                            // https://github.com/webpack/webpack/issues/1175
                            compilation.assets[fileName] = {
                                source: () => new Buffer(currentRes.data),
                                size: () => Buffer.byteLength(currentRes.data)
                            };

                            const { output } = this.compilerOptions;
                            const processedUrl = url.resolve(output.publicPath.replace(/(?<!\/)$/, '/'), fileName);

                            if (item.attribs.href) {
                                item.attribs.href = processedUrl;
                            }

                            if (item.attribs.src) {
                                item.attribs.src = processedUrl;
                            }
                        });

                        // modify the ast, merge the processed result(href/src attribute of elements) in it
                        this.findMd5AttrElements(0, this.ast, (node, counter) => {
                            const targetNode = this.assetLinks[counter];
                            delete targetNode.attribs.md5;

                            return targetNode;
                        });

                        // convert AST to html string
                        data.html = htmlparser2.DomUtils.getOuterHTML(this.ast);

                        cb(null, data);
                    })
                    .catch(err => {
                        let reason = err;
                        if (axios.isCancel(err)) {
                            reason = new Error(err.message);
                        }

                        cb(reason, data);
                    });
            });
        });
    }

    generateFileName(href, hash) {
        const fileNameTpl = this.options.filename || '[name]-[hash].[ext]';
        const pathName = url.parse(href).pathname;
        const { name, ext } = path.parse(pathName);

        // simple string template engine
        const reg = /\[(\w+)\]/g;
        let match = null;
        let finalFileName = fileNameTpl;

        while ((match = reg.exec(fileNameTpl))) {
            let value = '';
            switch (match[1]) {
                case 'name':
                    value = name;
                    break;
                case 'hash':
                    value = hash.substring(0, 8);
                    break;
                case 'ext':
                    value = ext.replace('.', '');
                    break;
            }

            if (value) {
                finalFileName = finalFileName.replace(match[0], value);
            }
        }

        return finalFileName;
    }

    fetchAllStyleContent(urls) {
        let requests = [];

        for (let i = 0; i < urls.length; i += 1) {
            requests.push(this.fetchStyleContent(urls[i]));
        }

        return Promise.all(requests);
    }

    fetchStyleContent(url) {
        const { serverIp, port, timeout } = this.options;
        const CancelToken = axios.CancelToken;
        const source = CancelToken.source();

        const params = { timeout: timeout || 2000, responseType: 'text', cancelToken: source.token };

        if (serverIp) {
            Object.assign(params, {
                proxy: {
                    host: serverIp,
                    port: port || '80'
                }
            });
        }

        if (!/^https?\:\/\//.test(url)) {
            url = 'http:' + url;
        }

        // timeout in axios is `response timeout`, not connection timeout. So it needs to be cancel by cancelToken
        // https://github.com/axios/axios/issues/647#issuecomment-324584444
        setTimeout(
            () => source.cancel('connection timeout! Please make sure your server IP address is accessible'),
            params.timeout
        );

        return axios.get(url, params);
    }

    findMd5AttrElements(counter, ast, cb) {
        if (typeof cb !== 'function') return;

        for (let i = 0; i < ast.length; i += 1) {
            const node = ast[i];
            const { type, children, name, attribs } = node;

            if (type === 'tag' || type === 'script') {
                if (['html', 'head', 'body'].indexOf(name) >= 0 && children && children.length > 0) {
                    counter = this.findMd5AttrElements(counter, children, cb);
                } else if ((name === 'link' || name === 'script') && attribs) {
                    const hasAttr = Object.keys(attribs).some(attr => this.TARGET_ATTRS.indexOf(attr) >= 0);

                    if (hasAttr) {
                        const newNode = cb(node, counter++);
                        if (newNode) {
                            ast[i] = newNode;
                        }
                    }
                }
            }
        }

        return counter;
    }
}

module.exports = AssetRevisionWebpackPlugin;
