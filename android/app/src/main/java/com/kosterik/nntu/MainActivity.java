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
import android.content.Context;
import android.content.SharedPreferences;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;

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
        mWebView.addJavascriptInterface(new WidgetBridge(), "AndroidWidget");

        if (android.os.Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        mWebView.setDownloadListener(new android.webkit.DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(android.net.Uri.parse(url));
                request.setMimeType(mimeType);
                String cookies = android.webkit.CookieManager.getInstance().getCookie(url);
                request.addRequestHeader("cookie", cookies);
                request.addRequestHeader("User-Agent", userAgent);
                request.setDescription("Скачивание обновления NNTU Map");
                request.setTitle(android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType));
                request.allowScanningByMediaScanner();
                request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType));
                android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                dm.enqueue(request);
                android.widget.Toast.makeText(getApplicationContext(), "Началось скачивание файла...", android.widget.Toast.LENGTH_LONG).show();
            }
        });

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

    public class WidgetBridge {
        @android.webkit.JavascriptInterface
        public void updateWidgetData(String groupName, String todayData, String tomorrowData) {
            SharedPreferences prefs = getSharedPreferences("WidgetData", Context.MODE_PRIVATE);
            prefs.edit()
                .putString("groupName", groupName)
                .putString("todayData", todayData)
                .putString("tomorrowData", tomorrowData)
                .apply();
            
            Intent intent = new Intent(MainActivity.this, WidgetDualProvider.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            int[] ids = AppWidgetManager.getInstance(getApplicationContext())
                    .getAppWidgetIds(new ComponentName(getApplicationContext(), WidgetDualProvider.class));
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            sendBroadcast(intent);

            Intent intent2 = new Intent(MainActivity.this, WidgetTomorrowProvider.class);
            intent2.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            int[] ids2 = AppWidgetManager.getInstance(getApplicationContext())
                    .getAppWidgetIds(new ComponentName(getApplicationContext(), WidgetTomorrowProvider.class));
            intent2.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids2);
            sendBroadcast(intent2);
        }

        @android.webkit.JavascriptInterface
        public void showNotification(String title, String message) {
            Intent intent = new Intent(MainActivity.this, NotificationAlarmReceiver.class);
            intent.setAction("SHOW_NOTIFICATION");
            intent.putExtra("title", title);
            intent.putExtra("message", message);
            sendBroadcast(intent);
        }

        @android.webkit.JavascriptInterface
        public void setAlarmClock(int hour, int minute, String message) {
            Intent intent = new Intent(android.provider.AlarmClock.ACTION_SET_ALARM);
            intent.putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, message);
            intent.putExtra(android.provider.AlarmClock.EXTRA_HOUR, hour);
            intent.putExtra(android.provider.AlarmClock.EXTRA_MINUTES, minute);
            intent.putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, false);
            try {
                startActivity(intent);
            } catch (Exception e) {
                Log.e(TAG, "No alarm app found", e);
            }
        }
    }
}
