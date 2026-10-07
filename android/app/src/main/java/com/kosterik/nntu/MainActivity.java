package com.kosterik.nntu;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * MainActivity for NNTU Map & Schedule
 * Runs local APK assets via an embedded loopback HTTP server (127.0.0.1).
 * Completely immune to:
 * - net::ERR_FILE_NOT_FOUND (no file:/// URI dependencies)
 * - net::ERR_NAME_NOT_RESOLVED (no external DNS queries)
 * - Multiprocess WebView renderer sandboxing on Samsung OneUI, Xiaomi MIUI, etc.
 * Created by kosterik
 */
public class MainActivity extends Activity {

    private WebView mWebView;
    private LocalAssetServer mServer;
    private static final String TAG = "NNTU_MAP";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Step 1: Start embedded loopback asset server
        mServer = new LocalAssetServer(getAssets());
        int port = mServer.start();

        // Step 2: Set up WebView
        mWebView = new WebView(this);
        setContentView(mWebView);

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
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
                String host = uri.getHost();
                if ("127.0.0.1".equals(host) || "localhost".equals(host)) {
                    return false;
                }

                String scheme = uri.getScheme();
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

        // Step 3: Load application
        if (port > 0) {
            String appUrl = "http://127.0.0.1:" + port + "/src/index.html";
            Log.d(TAG, "Loading local app URL: " + appUrl);
            mWebView.loadUrl(appUrl);
        } else {
            Log.e(TAG, "Local server failed to start, falling back to in-memory asset load");
            loadAppContentFallback();
        }
    }

    private void loadAppContentFallback() {
        try {
            InputStream is = getAssets().open("src/index.html");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int read;
            while ((read = is.read(buf)) != -1) {
                baos.write(buf, 0, read);
            }
            is.close();
            String html = baos.toString("UTF-8");
            mWebView.loadDataWithBaseURL("http://127.0.0.1/", html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            Log.e(TAG, "Fallback in-memory load failed", e);
        }
    }

    @Override
    public void onBackPressed() {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (mServer != null) {
            mServer.stop();
        }
        if (mWebView != null) {
            mWebView.destroy();
        }
        super.onDestroy();
    }
}
