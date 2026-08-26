import socket
import sys
import threading
import traceback

threading.excepthook = lambda a: print("[router] THREAD CRASH:", a.exc_type, a.exc_value, flush=True) or traceback.print_exception(a.exc_type, a.exc_value, a.exc_traceback, file=sys.stderr)

UPSTREAM = ("127.0.0.1", 18081)


def extract_sni(data: bytes):
    try:
        if len(data) < 43 or data[0] != 0x16 or data[5] != 0x01:
            return None
        p = 9
        p += 2 + 32
        sid = data[p]
        p += 1 + sid
        cs = int.from_bytes(data[p:p+2], "big")
        p += 2 + cs
        comp = data[p]
        p += 1 + comp
        ext_total = int.from_bytes(data[p:p+2], "big")
        p += 2
        end = min(p + ext_total, len(data))
        while p + 4 <= end:
            etype = int.from_bytes(data[p:p+2], "big")
            elen = int.from_bytes(data[p+2:p+4], "big")
            body = data[p+4:p+4+elen]
            if etype == 0 and len(body) >= 5 and body[2] == 0:
                nlen = int.from_bytes(body[3:5], "big")
                if len(body) >= 5 + nlen:
                    return body[5:5+nlen].decode("ascii", "ignore")
            p += 4 + elen
    except Exception:
        pass
    return None


def pump(src, dst, label):
    try:
        while True:
            d = src.recv(65536)
            if not d:
                break
            dst.sendall(d)
    except Exception:
        pass
    finally:
        try:
            src.close()
        except Exception:
            pass
        try:
            dst.close()
        except Exception:
            pass


def handle(client):
    try:
        data = b""
        sni = None
        while True:
            chunk = client.recv(65536)
            if not chunk:
                client.close()
                return
            data += chunk
            sni = extract_sni(data)
            if sni or len(data) > 262144:
                break
        host = sni or "unknown.invalid"
        up = socket.create_connection(UPSTREAM, 10)
        up.sendall(f"CONNECT {host}:443 HTTP/1.1\r\nHost: {host}:443\r\n\r\n".encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            part = up.recv(4096)
            if not part:
                client.close()
                return
            resp += part
        if b" 200" not in resp.split(b"\r\n", 1)[0]:
            print(f"[router] refused {host}: {resp[:40]!r}", flush=True)
            client.close()
            return
        up.sendall(data)
        print(f"[router] {host}", flush=True)
        threading.Thread(target=pump, args=(client, up, "c2u"), daemon=True).start()
        pump(up, client, "u2c")
    except Exception as e:
        print(f"[router] err {e}", flush=True)
        try:
            client.close()
        except Exception:
            pass


def main():
    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 9090))
    srv.listen(64)
    print("[router] listening :9090", flush=True)
    while True:
        try:
            c, _ = srv.accept()
        except Exception as e:
            print(f"[router] accept err {e}", flush=True)
            continue
        threading.Thread(target=handle, args=(c,), daemon=True).start()


main()
