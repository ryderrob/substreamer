const { withAppBuildGradle } = require("expo/config-plugins");

const SUFFIX_LINE = 'applicationIdSuffix ".debug"';

/** Index of the `}` matching the `{` at `open`. */
function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  throw new Error("with-side-by-side-suffix: unbalanced braces in app/build.gradle");
}

/** Range of the `{ ... }` body of the first `name {` block inside [from, to). */
function findBlock(text, name, from, to) {
  const re = new RegExp(`^[ \\t]*${name}[ \\t]*\\{`, "m");
  const match = re.exec(text.slice(from, to));
  if (!match) {
    throw new Error(
      `with-side-by-side-suffix: "${name} {" block not found in app/build.gradle; ` +
        "the generated template changed, update the plugin"
    );
  }
  const open = from + match.index + match[0].length - 1;
  return { open, close: matchingBrace(text, open) };
}

/** Adds the suffix line to one build type block; no-op if it already has a suffix. */
function addToBuildType(text, name, buildTypes) {
  const { open, close } = findBlock(text, name, buildTypes.open + 1, buildTypes.close);
  const body = text.slice(open + 1, close);
  if (/^[ \t]*applicationIdSuffix\b/m.test(body)) return text;

  // Place after `signingConfig ...` when present, else right after the opening brace.
  const signing = /^([ \t]*)signingConfig\b.*$/m.exec(body);
  const insertAt = signing ? open + 1 + signing.index + signing[0].length : open + 1;
  const indent = signing ? signing[1] : "        ";
  return text.slice(0, insertAt) + `\n${indent}${SUFFIX_LINE}` + text.slice(insertAt);
}

/** Pure transform: adds `applicationIdSuffix ".debug"` to the debug and release build types. */
function addSideBySideSuffix(gradleText) {
  const android = findBlock(gradleText, "android", 0, gradleText.length);
  const buildTypes = findBlock(gradleText, "buildTypes", android.open + 1, android.close);
  let text = addToBuildType(gradleText, "debug", buildTypes);
  // Inserting in debug shifts offsets, so re-locate buildTypes before release.
  const shiftedAndroid = findBlock(text, "android", 0, text.length);
  const shiftedBuildTypes = findBlock(text, "buildTypes", shiftedAndroid.open + 1, shiftedAndroid.close);
  text = addToBuildType(text, "release", shiftedBuildTypes);
  return text;
}

/** Applies the transform only when SUBSTREAMER_SIDE_BY_SIDE=1; otherwise returns the text unchanged. */
function applyIfEnabled(gradleText, env = process.env) {
  return env.SUBSTREAMER_SIDE_BY_SIDE === "1" ? addSideBySideSuffix(gradleText) : gradleText;
}

/**
 * Config plugin for side-by-side test builds.
 *
 * When SUBSTREAMER_SIDE_BY_SIDE=1 is set during `expo prebuild`, adds
 * `applicationIdSuffix ".debug"` to the debug and release build types of the generated
 * `android/app/build.gradle`, so the test APK installs next to the Play Store app
 * (`com.ghenry22.substream2`) without sharing its data. Without the variable (store and
 * EAS builds) the file is left untouched.
 */
function withSideBySideSuffix(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = applyIfEnabled(config.modResults.contents);
    return config;
  });
}

module.exports = withSideBySideSuffix;
module.exports.addSideBySideSuffix = addSideBySideSuffix;
module.exports.applyIfEnabled = applyIfEnabled;
