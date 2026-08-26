from mitmproxy import http


def response(flow: http.HTTPFlow):
    if "cronometer" in flow.request.pretty_host:
        print("=" * 70)
        print(f"{flow.request.method} {flow.request.pretty_url}")
        print("REQ HEADERS:", dict(flow.request.headers))
        body = flow.request.get_text() or ""
        print("REQ BODY:", body[:2000])
        print(f"<- {flow.response.status_code}")
        rbody = flow.response.get_text() or ""
        print("RESP BODY:", rbody[:3000])
