package com.kosterik.nntu;

import android.content.res.AssetManager;
import android.util.Log;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * High-performance, offline-first embedded HTTP server for local APK assets.
 * Listens exclusively on 127.0.0.1 (loopback), completely eliminating
 * net::ERR_FILE_NOT_FOUND, net::ERR_NAME_NOT_RESOLVED, file:// CORS restrictions,
 * and multiprocess WebView sandboxing limitations across all Android versions (Samsung OneUI, Xiaomi MIUI, etc.).
 * Created by kosterik
 */
public class LocalAssetServer {

    private static final String TAG = "NNTU_SERVER";
    private final AssetManager mAssetManager;
    private ServerSocket mServerSocket;
    private int mPort = 0;
    private volatile boolean mRunning = false;
    private final ExecutorService mThreadPool = Executors.newCachedThreadPool();

    public LocalAssetServer(AssetManager assetManager) {
        this.mAssetManager = assetManager;
    }

    public synchronized int start() {
        if (mRunning && mPort > 0 && mServerSocket != null && !mServerSocket.isClosed()) {
            return mPort;
        }

        try {
            int[] ports = {49312, 49313, 49314, 0};
            for (int p : ports) {
                try {
                    mServerSocket = new ServerSocket();
                    mServerSocket.setReuseAddress(true);
                    mServerSocket.bind(new java.net.InetSocketAddress("127.0.0.1", p), 50);
                    break;
                } catch (Exception e) {
                    if (p == 0) throw e;
                }
            }
            mPort = mServerSocket.getLocalPort();
            mRunning = true;
            Log.d(TAG, "Local asset server started on http://127.0.0.1:" + mPort);

            Thread acceptThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    while (mRunning && mServerSocket != null && !mServerSocket.isClosed()) {
                        try {
                            final Socket client = mServerSocket.accept();
                            mThreadPool.execute(new Runnable() {
                                @Override
                                public void run() {
                                    handleClient(client);
                                }
                            });
                        } catch (Exception e) {
                            if (!mRunning) break;
                            Log.e(TAG, "Exception in accept loop", e);
                        }
                    }
                }
            }, "NNTU-AssetServer");
            acceptThread.setDaemon(true);
            acceptThread.start();
            return mPort;
        } catch (Exception e) {
            Log.e(TAG, "Failed to bind LocalAssetServer to loopback", e);
            mRunning = false;
            mPort = 0;
            return -1;
        }
    }

    public synchronized void stop() {
        mRunning = false;
        if (mServerSocket != null) {
            try {
                mServerSocket.close();
            } catch (Exception ignored) {}
            mServerSocket = null;
        }
        mPort = 0;
    }

    public int getPort() {
        return mPort;
    }

    public boolean isRunning() {
        return mRunning && mServerSocket != null && !mServerSocket.isClosed();
    }

    private void handleClient(Socket client) {
        try {
            client.setSoTimeout(10000);
            InputStream in = client.getInputStream();
            OutputStream rawOut = client.getOutputStream();
            BufferedOutputStream out = new BufferedOutputStream(rawOut);

            BufferedReader reader = new BufferedReader(new InputStreamReader(in, "UTF-8"));
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.trim().isEmpty()) {
                client.close();
                return;
            }

            // Consume HTTP headers
            String header;
            while ((header = reader.readLine()) != null) {
                if (header.trim().isEmpty()) break;
            }

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                sendResponse(out, 400, "Bad Request", "text/plain", "Bad Request".getBytes("UTF-8"));
                client.close();
                return;
            }

            String method = parts[0].toUpperCase();
            String rawUri = parts[1];

            // Strip query string
            int qIdx = rawUri.indexOf('?');
            if (qIdx != -1) {
                rawUri = rawUri.substring(0, qIdx);
            }

            String path = URLDecoder.decode(rawUri, "UTF-8");
            while (path.startsWith("/")) {
                path = path.substring(1);
            }

            if (path.isEmpty() || path.equals("index.html")) {
                path = "src/index.html";
            }

            if ("OPTIONS".equals(method)) {
                sendOptionsResponse(out);
                client.close();
                return;
            }

            // Proxy to my-api.nntu.ru for /api/
            if (path.equals("api/schedule/groups")) {
                boolean proxied = false;
                try {
                    java.net.URL url = new java.net.URL("https://my-api.nntu.ru/lesson-schedule/public/groups");
                    java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
                    conn.setRequestProperty("Accept", "application/json, text/plain, */*");
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);

                    int code = conn.getResponseCode();
                    if (code == 200) {
                        String cType = conn.getContentType();
                        StringBuilder proxySb = new StringBuilder();
                        proxySb.append("HTTP/1.1 200 OK\r\n");
                        proxySb.append("Content-Type: ").append(cType != null ? cType : "application/json; charset=UTF-8").append("\r\n");
                        proxySb.append("Access-Control-Allow-Origin: *\r\n");
                        proxySb.append("Connection: close\r\n\r\n");
                        out.write(proxySb.toString().getBytes("UTF-8"));

                        InputStream proxyIn = conn.getInputStream();
                        if (proxyIn != null) {
                            byte[] proxyBuf = new byte[8192];
                            int proxyRead;
                            while ((proxyRead = proxyIn.read(proxyBuf)) != -1) {
                                out.write(proxyBuf, 0, proxyRead);
                            }
                            proxyIn.close();
                        }
                        out.flush();
                        proxied = true;
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Proxy groups failed, serving local fallback", e);
                }

                if (!proxied) {
                    serveLocalAsset(out, "src/data/groups.json", "application/json; charset=UTF-8");
                }
                client.close();
                return;
            }


            // Find matching asset stream
            String[] candidates = new String[] {
                path,
                "src/" + path,
                "app_assets/" + path
            };

            InputStream assetStream = null;
            String matchedPath = null;
            for (String candidate : candidates) {
                try {
                    assetStream = mAssetManager.open(candidate);
                    matchedPath = candidate;
                    break;
                } catch (Exception ignored) {
                }
            }

            if (assetStream == null) {
                Log.w(TAG, "Asset not found: " + path);
                byte[] notFound = ("File not found: " + path).getBytes("UTF-8");
                sendResponse(out, 404, "Not Found", "text/plain; charset=UTF-8", notFound);
                client.close();
                return;
            }

            String mime = getMimeType(matchedPath);
            int length = assetStream.available();

            StringBuilder sb = new StringBuilder();
            sb.append("HTTP/1.1 200 OK\r\n");
            sb.append("Content-Type: ").append(mime).append("\r\n");
            if (length > 0) {
                sb.append("Content-Length: ").append(length).append("\r\n");
            }
            sb.append("Access-Control-Allow-Origin: *\r\n");
            sb.append("Access-Control-Allow-Methods: GET, POST, OPTIONS, HEAD\r\n");
            sb.append("Connection: close\r\n\r\n");
            out.write(sb.toString().getBytes("UTF-8"));

            if (!"HEAD".equals(method)) {
                byte[] buffer = new byte[65536];
                int read;
                while ((read = assetStream.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
            }
            out.flush();
            assetStream.close();
        } catch (Exception e) {
            // Client disconnect or socket error is normal
        } finally {
            try {
                client.close();
            } catch (Exception ignored) {}
        }
    }

    private void serveLocalAsset(BufferedOutputStream out, String assetPath, String mimeType) {
        try {
            InputStream is = null;
            try {
                is = mAssetManager.open(assetPath);
            } catch (Exception e) {
                try {
                    is = mAssetManager.open("app_assets/groups_cache.json");
                } catch (Exception ignored) {}
            }
            if (is != null) {
                int length = is.available();
                StringBuilder sb = new StringBuilder();
                sb.append("HTTP/1.1 200 OK\r\n");
                sb.append("Content-Type: ").append(mimeType).append("\r\n");
                sb.append("Access-Control-Allow-Origin: *\r\n");
                sb.append("Connection: close\r\n");
                if (length > 0) {
                    sb.append("Content-Length: ").append(length).append("\r\n");
                }
                sb.append("\r\n");
                out.write(sb.toString().getBytes("UTF-8"));

                byte[] buf = new byte[8192];
                int r;
                while ((r = is.read(buf)) != -1) {
                    out.write(buf, 0, r);
                }
                is.close();
                out.flush();
                return;
            }
        } catch (Exception ignored) {}
        try {
            sendResponse(out, 200, "OK", mimeType, "[]".getBytes("UTF-8"));
        } catch (Exception ignored) {}
    }

    private void sendResponse(OutputStream out, int status, String message, String mime, byte[] data) {
        try {
            StringBuilder sb = new StringBuilder();
            sb.append("HTTP/1.1 ").append(status).append(" ").append(message).append("\r\n");
            sb.append("Content-Type: ").append(mime).append("\r\n");
            sb.append("Content-Length: ").append(data.length).append("\r\n");
            sb.append("Access-Control-Allow-Origin: *\r\n");
            sb.append("Connection: close\r\n\r\n");
            out.write(sb.toString().getBytes("UTF-8"));
            out.write(data);
            out.flush();
        } catch (Exception ignored) {}
    }

    private void sendOptionsResponse(OutputStream out) {
        try {
            String resp = "HTTP/1.1 204 No Content\r\n"
                    + "Access-Control-Allow-Origin: *\r\n"
                    + "Access-Control-Allow-Methods: GET, POST, OPTIONS, HEAD\r\n"
                    + "Access-Control-Allow-Headers: *\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(resp.getBytes("UTF-8"));
            out.flush();
        } catch (Exception ignored) {}
    }

    private static String getMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=UTF-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=UTF-8";
        if (lower.endsWith(".css")) return "text/css; charset=UTF-8";
        if (lower.endsWith(".json")) return "application/json; charset=UTF-8";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml; charset=UTF-8";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }
}
