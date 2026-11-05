/*
 * Frida script for testing certificate-pinning bypasses on Android.
 *
 * Run:
 *   frida -U -f com.tencent.mm -l ssl-bypass.js --no-pause
 *
 * Intended for authorized security testing.
 */

Java.perform(function () {
    console.log("[*] SSL bypass script loaded");

    // 1. Hook the standard X509TrustManager
    try {
        var TrustManager = Java.registerClass({
            name: "com.lab.TrustManager",
            implements: [Java.use("javax.net.ssl.X509TrustManager")],
            methods: {
                checkClientTrusted: function (chain, authType) {},
                checkServerTrusted: function (chain, authType) {},
                getAcceptedIssuers: function () { return []; }
            }
        });

        var SSLContext = Java.use("javax.net.ssl.SSLContext");
        var TrustManagerArray = Java.array(
            "javax.net.ssl.TrustManager",
            [TrustManager.$new()]
        );

        SSLContext.init.overload(
            "[Ljavax.net.ssl.KeyManager;",
            "[Ljavax.net.ssl.TrustManager;",
            "java.security.SecureRandom"
        ).implementation = function (keyManager, trustManager, secureRandom) {
            console.log("[+] Overriding SSLContext.init TrustManager");
            this.init(keyManager, TrustManagerArray, secureRandom);
        };
    } catch (e) {
        console.log("[-] X509TrustManager hook failed: " + e);
    }

    // 2. Hook OkHttp3 CertificatePinner
    try {
        var CertificatePinner = Java.use("okhttp3.CertificatePinner");

        CertificatePinner.check.overload(
            "java.lang.String",
            "java.util.List"
        ).implementation = function (hostname, certs) {
            console.log(
                "[+] Bypassing OkHttp3 CertificatePinner for " + hostname
            );
            return;
        };
    } catch (e) {
        console.log("[-] OkHttp3 CertificatePinner not found: " + e);
    }

    // 3. Hook Android Conscrypt chain verification
    try {
        var TrustManagerImpl = Java.use(
            "com.android.org.conscrypt.TrustManagerImpl"
        );

        TrustManagerImpl.verifyChain.implementation = function (
            untrustedChain,
            trustAnchorChain,
            host,
            clientAuth,
            ocspData,
            tlsSctData
        ) {
            console.log(
                "[+] Bypassing TrustManagerImpl.verifyChain for " + host
            );
            return untrustedChain;
        };
    } catch (e) {
        console.log("[-] TrustManagerImpl hook failed: " + e);
    }

    console.log("[*] All available hooks installed. Launch app traffic now.");
});
