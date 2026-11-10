import React, { useEffect, useRef, useState } from "react";
let loading;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        loading = undefined;
        script.remove();
        reject(
          new Error(
            "Could not load verification. Check your connection and retry.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return loading;
}
export default function Captcha({ siteKey, onToken, reset }) {
  const target = useRef(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false,
      widget,
      api;
    onToken("");
    setError("");
    loadTurnstile()
      .then((loaded) => {
        if (disposed) return;
        api = loaded;
        widget = api.render(target.current, {
          sitekey: siteKey,
          action: "register",
          size: "flexible",
          callback: (token) => {
            if (!disposed) {
              onToken(token);
              setError("");
            }
          },
          "expired-callback": () => {
            if (!disposed) onToken("");
          },
          "error-callback": () => {
            if (!disposed) {
              onToken("");
              setError("Verification failed. Please retry.");
            }
          },
        });
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      if (widget !== undefined) api.remove(widget);
    };
  }, [siteKey, reset, retry, onToken]);
  return (
    <div>
      <div ref={target} />
      {error && (
        <div role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry verification
          </button>
        </div>
      )}
    </div>
  );
}
