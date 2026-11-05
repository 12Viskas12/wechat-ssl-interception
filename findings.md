# Findings

## Environment
- WeChat 7.0.x on Android 11 (API 30), rooted emulator, mitmproxy as MITM proxy with a trusted system CA.
- Newer WeChat builds (8.0.x) failed to launch reliably on this setup (repeated ANR / process death on a rooted device) — downgrading to 7.0.x resolved it.

## Proxy behavior
- WeChat **ignores the Android system HTTP proxy setting**. Confirmed via `netstat`: the app opens direct TCP connections to Tencent IP ranges regardless of the configured proxy.
- Standard `iptables REDIRECT` + mitmproxy `transparent` mode fails in this setup — `SO_ORIGINAL_DST` can't be resolved because the redirect happens inside the emulator's virtual network, not on the host running mitmproxy.
- Workaround: `iptables -t nat ... DNAT --to-destination <host>:8080` on the device, combined with mitmproxy in **regular** mode, which resolves the real destination from the TLS SNI instead of `SO_ORIGINAL_DST`.

## Certificate trust
- Installing the mitmproxy CA as a user certificate is not enough — apps targeting modern Android only trust system CAs by default.
- Writing directly to `/system/etc/security/cacerts/` is blocked by dm-verity (`Read-only file system`, even as root, even after `mount -o remount,rw`).
- The [MagiskTrustUserCerts](https://github.com/AeonLucid/MagiskTrustUserCerts) module solves this by bind-mounting the user cert store over the system one at runtime, without modifying the partition.

## Traffic captured
Example request:
```
POST http://sgshort.wechat.com/mmtls/4669e23d HTTP/1.1
Accept: */*
Content-Type: application/octet-stream
Host: sgshort.wechat.com
Upgrade: mmtls
User-Agent: MicroMessenger Client
```

- Endpoint, headers, timing, and request/response sizes are fully visible.
- The request body is binary and unreadable — not standard TLS (that layer is already decrypted by mitmproxy), but a second, application-level encryption scheme: **MMTLS**, Tencent's own protocol, signaled by the `Upgrade: mmtls` header and `application/octet-stream` content type.

## Takeaway
A successful MITM position (root + trusted CA + proxy redirect all working) is not sufficient to read WeChat's actual content. Tencent layers its own encryption (MMTLS) on top of HTTP, independent of the TLS stack that Android's CA trust store and SSL-pinning bypasses target. Decrypting MMTLS itself would require reverse-engineering the protocol or extracting its session keys at runtime (e.g. via Frida hooks into `libMMProtocalJni.so` / `libXNet.so`), which is out of scope here.

What this interception setup *does* expose: which hosts WeChat talks to, when, how often, and how much data moves — traffic metadata, not content.
