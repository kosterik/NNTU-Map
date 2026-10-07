package com.kosterik.nntu;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * MainActivity for NNTU Map & Schedule
 * Copies all assets to internal storage on first launch, then loads from real filesystem.
 * This eliminates all ERR_FILE_NOT_FOUND / ERR_NAME_NOT_RESOLVED issues
 * across all Android versions and OEM skins (Samsung, Xiaomi, etc).
 * Created by kosterik
 */
public class MainActivity extends Activity {

    private WebView mWebView;
    private static final String TAG = "NNTU_MAP";
    private static final String PREFS = "nntu_prefs";
    private static final String KEY_ASSETS_VERSION = "assets_v";
    private static final int CURRENT_ASSETS_VERSION = 3;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Step 1: Extract assets to internal storage (fast — only on first run or update)
        extractAssetsIfNeeded();

        // Step 2: Set up WebView
        mWebView = new WebView(this);
        setContentView(mWebView);

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, "[JS] " + consoleMessage.message()
                        + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                return true;
            }
        });

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    return handleExternalUrl(request.getUrl());
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null) {
                    return handleExternalUrl(Uri.parse(url));
                }
                return false;
            }

            private boolean handleExternalUrl(Uri uri) {
                String scheme = uri.getScheme();
                if (scheme == null) return false;
                if ("file".equalsIgnoreCase(scheme)) return false;

                if ("tg".equalsIgnoreCase(scheme)
                        || "http".equalsIgnoreCase(scheme)
                        || "https".equalsIgnoreCase(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        return true;
                    } catch (Exception ignored) {
                    }
                }
                return false;
            }
        });

        // Step 3: Load from real filesystem
        File indexFile = new File(getFilesDir(), "www/src/index.html");
        String url = Uri.fromFile(indexFile).toString();
        Log.d(TAG, "Loading: " + url);
        mWebView.loadUrl(url);
    }

    /**
     * Extracts APK assets (src/ and app_assets/) to getFilesDir()/www/
     * so WebView can load them via file:///data/data/com.kosterik.nntu/files/www/
     * Only runs on first launch or when CURRENT_ASSETS_VERSION changes.
     */
    private void extractAssetsIfNeeded() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        int installed = prefs.getInt(KEY_ASSETS_VERSION, 0);
        if (installed >= CURRENT_ASSETS_VERSION) {
            File check = new File(getFilesDir(), "www/src/index.html");
            if (check.exists()) return;
        }

        Log.d(TAG, "Extracting assets to internal storage...");
        File wwwDir = new File(getFilesDir(), "www");

        try {
            copyAssetFolder("src", new File(wwwDir, "src"));
            copyAssetFolder("app_assets", new File(wwwDir, "app_assets"));
            prefs.edit().putInt(KEY_ASSETS_VERSION, CURRENT_ASSETS_VERSION).apply();
            Log.d(TAG, "Assets extracted successfully.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to extract assets", e);
        }
    }

    private void copyAssetFolder(String assetPath, File destDir) throws Exception {
        String[] list = getAssets().list(assetPath);
        if (list == null || list.length == 0) {
            // It's a file, copy it
            copyAssetFile(assetPath, destDir);
            return;
        }

        // It's a directory
        destDir.mkdirs();
        for (String child : list) {
            String childAssetPath = assetPath + "/" + child;
            File childDest = new File(destDir, child);

            String[] subList = getAssets().list(childAssetPath);
            if (subList != null && subList.length > 0) {
                copyAssetFolder(childAssetPath, childDest);
            } else {
                copyAssetFile(childAssetPath, childDest);
            }
        }
    }

    private void copyAssetFile(String assetPath, File destFile) throws Exception {
        destFile.getParentFile().mkdirs();
        InputStream in = getAssets().open(assetPath);
        OutputStream out = new FileOutputStream(destFile);
        byte[] buf = new byte[65536];
        int len;
        while ((len = in.read(buf)) > 0) {
            out.write(buf, 0, len);
        }
        out.flush();
        out.close();
        in.close();
    }

    @Override
    public void onBackPressed() {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
