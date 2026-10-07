package com.kosterik.nntu;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * MainActivity for NNTU Map & Schedule
 * Runs offline local assets with modern hardware-accelerated WebView.
 * Intercepts requests to safely stream assets without ERR_FILE_NOT_FOUND.
 * Created by kosterik
 */
public class MainActivity extends Activity {

    private WebView mWebView;
    private static final String VIRTUAL_HOST = "nntu-map.local";
    private static final String APP_URL = "https://" + VIRTUAL_HOST + "/src/index.html";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        mWebView = new WebView(this);
        setContentView(mWebView);

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    Uri uri = request.getUrl();
                    String host = uri.getHost();
                    String scheme = uri.getScheme();
                    if ("tg".equalsIgnoreCase(scheme)) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                            return true;
                        } catch (Exception ignored) {
                            return true;
                        }
                    }
                    if (host != null && !host.equalsIgnoreCase(VIRTUAL_HOST) && !urlContainsLocal(uri.toString())) {
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
                    String host = uri.getHost();
                    String scheme = uri.getScheme();
                    if ("tg".equalsIgnoreCase(scheme)) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                            return true;
                        } catch (Exception ignored) {
                            return true;
                        }
                    }
                    if (host != null && !host.equalsIgnoreCase(VIRTUAL_HOST) && !urlContainsLocal(url)) {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                            return true;
                        } catch (Exception ignored) {
                        }
                    }
                }
                return false;
            }

            private boolean urlContainsLocal(String url) {
                return url.contains(VIRTUAL_HOST) || url.contains("android_asset");
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
                if (path == null || path.isEmpty() || path.equals("/")) {
                    path = "src/index.html";
                }
                if (path.startsWith("/")) {
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
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Access-Control-Allow-Origin", "*");
                        headers.put("Access-Control-Allow-Methods", "GET, OPTIONS");
                        headers.put("Cache-Control", "no-cache");
                        return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, is);
                    } catch (Exception ignored) {
                    }
                }
                return null;
            }
        });

        // Load local application through intercepted virtual local scheme
        mWebView.loadUrl(APP_URL);
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
