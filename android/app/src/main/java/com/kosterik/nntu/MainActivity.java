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
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;

/**
 * MainActivity for NNTU Map & Schedule
 * Runs completely offline using embedded APK assets.
 * Uses loadDataWithBaseURL and shouldInterceptRequest to guarantee 100% offline reliability
 * without any DNS or ERR_NAME_NOT_RESOLVED / ERR_FILE_NOT_FOUND errors.
 * Created by kosterik
 */
public class MainActivity extends Activity {

    private WebView mWebView;
    private static final String TAG = "NNTU_MAP";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
                Log.d(TAG, "[JS] " + consoleMessage.message() + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                return true;
            }
        });

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    Uri uri = request.getUrl();
                    String scheme = uri.getScheme();
                    if ("tg".equalsIgnoreCase(scheme)) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                            return true;
                        } catch (Exception ignored) {
                            return true;
                        }
                    }
                    if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                            return true;
                        } catch (Exception ignored) {
                        }
                    }
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null) {
                    Uri uri = Uri.parse(url);
                    String scheme = uri.getScheme();
                    if ("tg".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                            return true;
                        } catch (Exception ignored) {
                        }
                    }
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    WebResourceResponse resp = handleAssetIntercept(request.getUrl());
                    if (resp != null) return resp;
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (url != null) {
                    WebResourceResponse resp = handleAssetIntercept(Uri.parse(url));
                    if (resp != null) return resp;
                }
                return super.shouldInterceptRequest(view, url);
            }

            private WebResourceResponse handleAssetIntercept(Uri uri) {
                String path = uri.getPath();
                if (path == null || path.isEmpty()) return null;

                while (path.startsWith("/")) {
                    path = path.substring(1);
                }
                if (path.startsWith("android_asset/")) {
                    path = path.substring("android_asset/".length());
                }

                String[] candidates = new String[] {
                    path,
                    "src/" + path,
                    "app_assets/" + path
                };

                for (String candidate : candidates) {
                    try {
                        InputStream is = getAssets().open(candidate);
                        String mime = getMimeType(candidate);
                        return new WebResourceResponse(mime, "UTF-8", is);
                    } catch (Exception ignored) {
                    }
                }
                return null;
            }
        });

        // Load the HTML directly from assets memory to completely eliminate ERR_NAME_NOT_RESOLVED / ERR_FILE_NOT_FOUND
        loadAppContent();
    }

    private void loadAppContent() {
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
            mWebView.loadDataWithBaseURL("file:///android_asset/src/", html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            Log.e(TAG, "Failed to load index.html via loadDataWithBaseURL, fallback to loadUrl", e);
            mWebView.loadUrl("file:///android_asset/src/index.html");
        }
    }

    private static String getMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
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
