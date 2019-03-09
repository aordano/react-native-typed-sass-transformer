var semver = require("semver");
var sass = require("node-sass");
var DtsCreator = require("typed-css-modules");
var path = require("path");
var appRoot = require("app-root-path");
var css2rn = require("css-to-react-native-transform").default;

var creator = new DtsCreator();
var upstreamTransformer = null;

var reactNativeVersionString = require("react-native/package.json").version;
var reactNativeMinorVersion = semver(reactNativeVersionString).minor;

if (reactNativeMinorVersion >= 59) {
  upstreamTransformer = require("metro-react-native-babel-transformer");
} else if (reactNativeMinorVersion >= 56) {
  upstreamTransformer = require("metro/src/reactNativeTransformer");
} else if (reactNativeMinorVersion >= 52) {
  upstreamTransformer = require("metro/src/transformer");
} else if (reactNativeMinorVersion >= 47) {
  upstreamTransformer = require("metro-bundler/src/transformer");
} else if (reactNativeMinorVersion === 46) {
  upstreamTransformer = require("metro-bundler/build/transformer");
} else {
  // handle RN <= 0.45
  var oldUpstreamTransformer = require("react-native/packager/transformer");
  upstreamTransformer = {
    transform({ src, filename, options }) {
      return oldUpstreamTransformer.transform(src, filename, options);
    }
  };
}

function isPlatformSpecific(filename) {
  var platformSpecific = [".native.", ".ios.", ".android."];
  return platformSpecific.some(name => filename.includes(name));
}

function renderToCSS({ src, filename, options }) {
  var defaultOpts = {
    includePaths: [path.dirname(filename), appRoot],
    indentedSyntax: filename.endsWith(".sass")
  };

  var opts = options.sassOptions
    ? Object.assign(defaultOpts, options.sassOptions, { data: src })
    : Object.assign(defaultOpts, { data: src });

  var result = sass.renderSync(opts);
  var css = result.css.toString();
  return css;
}

function renderToCSSPromise({ src, filename, options }) {
  return Promise.resolve(renderToCSS({ src, filename, options }));
}

function renderCSSToReactNative(css) {
  return css2rn(css, { parseMediaQueries: true });
}

module.exports.transform = function(src, filename, options) {
  if (typeof src === "object") {
    // handle RN >= 0.46
    ({ src, filename, options } = src);
  }

  if (filename.endsWith(".scss") || filename.endsWith(".sass")) {
    var css = renderToCSS({ src, filename, options });
    var cssObject = renderCSSToReactNative(css);

    if (isPlatformSpecific(filename)) {
      return upstreamTransformer.transform({
        src: "module.exports = " + JSON.stringify(cssObject),
        filename,
        options
      });
    }
    return creator.create(filename, css).then(content => {
      return content.writeFile().then(() => {
        return upstreamTransformer.transform({
          src: "module.exports = " + JSON.stringify(cssObject),
          filename,
          options
        });
      });
    });
  }
  return upstreamTransformer.transform({ src, filename, options });
};

module.exports.renderToCSS = renderToCSSPromise;
