import { ImageResponse } from "next/og";

export const alt = "Cronometer MCP — Talk to your Cronometer data from your AI assistant";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const tools = [
  { name: "get_macro_targets", color: "#6ee7b7" },
  { name: "get_food_log", color: "#6ee7b7" },
  { name: "get_daily_nutrition", color: "#6ee7b7" },
  { name: "add_custom_food", color: "#fcd34d" },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          flexDirection: "column",
          justifyContent: "space-between",
          overflow: "hidden",
          background: "#060a08",
          color: "#d4d4d8",
          fontFamily: "Arial, sans-serif",
          padding: "56px 64px",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -260,
            left: 120,
            display: "flex",
            width: 900,
            height: 520,
            borderRadius: 999,
            background: "rgba(16, 185, 129, 0.16)",
            filter: "blur(90px)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: 12,
                background: "rgba(16, 185, 129, 0.1)",
              }}
            >
              <svg width="27" height="27" viewBox="0 0 24 24" fill="none">
                <path
                  d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"
                  stroke="#34d399"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"
                  stroke="#34d399"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: 14,
                color: "white",
                fontFamily: "monospace",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              cronometer<span style={{ color: "#34d399" }}>-mcp</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: 999,
              background: "rgba(16, 185, 129, 0.06)",
              color: "#6ee7b7",
              fontFamily: "monospace",
              fontSize: 15,
              padding: "8px 18px",
            }}
          >
            Open source · read &amp; write · MCP
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              color: "white",
              fontSize: 62,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
            }}
          >
            Talk to your <span style={{ color: "#5eead4" }}>&nbsp;Cronometer data</span> from your AI
            assistant.
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 900,
              marginTop: 22,
              color: "#a1a1aa",
              fontSize: 24,
              lineHeight: 1.45,
            }}
          >
            The open-source connector that lets ChatGPT, Claude, and Cursor use your food log,
            nutrition, biometrics, and fasting history—in plain language.
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          {tools.map((tool, index) => (
            <div
              key={tool.name}
              style={{
                display: "flex",
                alignItems: "center",
                marginLeft: index === 0 ? 0 : 12,
                border: `1px solid ${tool.color}40`,
                borderRadius: 10,
                background: `${tool.color}0f`,
                color: tool.color,
                fontFamily: "monospace",
                fontSize: 15,
                padding: "9px 15px",
              }}
            >
              <span
                style={{
                  display: "flex",
                  width: 7,
                  height: 7,
                  marginRight: 9,
                  borderRadius: 999,
                  background: tool.color,
                }}
              />
              {tool.name}
            </div>
          ))}
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              color: "#71717a",
              fontFamily: "monospace",
              fontSize: 15,
            }}
          >
            GET /mcp · OAuth 2.1
          </div>
        </div>
      </div>
    ),
    size,
  );
}
