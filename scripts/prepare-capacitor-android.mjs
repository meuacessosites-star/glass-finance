import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const gradleFile = "android/app/build.gradle";
let gradle = readFileSync(gradleFile, "utf8");
if (!gradle.includes("versionCode 1")) throw new Error("Unexpected Capacitor versionCode template");
gradle = gradle.replace("versionCode 1", "versionCode 2").replace('versionName "1.0"', 'versionName "1.1.0"');
if (!gradle.includes("buildTypes {")) throw new Error("Missing buildTypes in Capacitor Android project");
gradle = gradle.replace("buildTypes {", `buildTypes {
        debug {
            // Instala lado a lado com a versao existente da Play Store.
            applicationIdSuffix ".preview"
            versionNameSuffix "-teste"
        }`);
writeFileSync(gradleFile, gradle);

const manifestFile = "android/app/src/main/AndroidManifest.xml";
let manifest = readFileSync(manifestFile, "utf8");
if (!manifest.includes("android.permission.INTERNET")) {
  manifest = manifest.replace("</manifest>", '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>');
}
writeFileSync(manifestFile, manifest);

const stringsPath = "android/app/src/main/res/values/strings.xml";
let strings = readFileSync(stringsPath, "utf8");
strings = strings.replace(/<string name="app_name">[^<]+<\/string>/, '<string name="app_name">Glass Finance</string>');
writeFileSync(stringsPath, strings);

const icon = "public/favicon.png";
const dest = "android/app/src/main/res/drawable/glass_finance_launcher.png";
if (existsSync(icon)) {
  copyFileSync(icon, dest);
  manifest = readFileSync(manifestFile, "utf8").replace('@mipmap/ic_launcher', '@drawable/glass_finance_launcher');
  writeFileSync(manifestFile, manifest);
}
console.log("Capacitor native Android project prepared. Release: com.glassfinance.app / versionCode 2. Debug: .preview.");
