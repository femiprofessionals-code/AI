#!/usr/bin/env bash
# Builds the WebView edition: the learning app exported for the web, bundled
# inside the tiny Android wrapper in shell/. Output: dist/MyLittleLearningWorld.apk
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
npx tsx tools/collect-lines.ts
npx tsx tools/gen-manifest.ts
npx tsx tools/prepare-private.ts
npx tsc --noEmit
npx tsx --test tests/*.test.ts
rm -rf shell/app/src/main/assets/www
EXPO_OFFLINE=1 npx expo export --platform web --output-dir shell/app/src/main/assets/www
echo "sdk.dir=$ANDROID_HOME" > shell/local.properties
(cd shell && ./gradlew -Dorg.gradle.java.installations.paths="$JAVA_HOME" assembleRelease)
mkdir -p dist
cp shell/app/build/outputs/apk/release/app-release.apk dist/MyLittleLearningWorld.apk
ls -la dist/MyLittleLearningWorld.apk
