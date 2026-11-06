import React, { useState, useEffect, createContext, useContext } from "react";
import { BookOpen, ArrowRight } from "lucide-react";
const Context = createContext(null),
  useApp = () => useContext(Context);
async function api(url, options = {}) {
  const r = await fetch("/api" + url, {
    credentials: "include",
    ...options,
    headers:
      options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" },
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 428) window.dispatchEvent(new Event("reauth-needed"));
    throw new Error(data.error || "Request failed");
  }
  return data;
}
function useData(url) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = () =>
    api(url)
      .then((value) => {
        setError("");
        setData(value);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    setData(null);
    load();
  }, [url]);
  return [data, error, load];
}
const fmt = (d) =>
    new Date(d).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  initials = (n) =>
    n
      ?.split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("");
function Avatar({ name, large = false }) {
  return (
    <span className={"avatar " + (large ? "large" : "")}>{initials(name)}</span>
  );
}
function ErrorBox({ children }) {
  return (
    children && (
      <div className="alert" role="alert">
        {children}
      </div>
    )
  );
}
function Empty({ children }) {
  return (
    <div className="empty">
      <BookOpen size={27} />
      <p>{children}</p>
    </div>
  );
}
function Field({ label, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function Form({
  endpoint,
  method = "POST",
  children,
  submit = "Save",
  onDone,
  transform,
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { toast } = useApp();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError("");
        try {
          const f = new FormData(form);
          const body = transform ? transform(f) : Object.fromEntries(f);
          const r = await api(endpoint, { method, body });
          toast(r.message || "Saved successfully");
          onDone?.(r, form);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ErrorBox>{error}</ErrorBox>
      {children}
      <button className="btn" disabled={busy}>
        {busy ? "Just a moment…" : submit}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}

export {
  Context,
  useApp,
  api,
  useData,
  fmt,
  Avatar,
  ErrorBox,
  Empty,
  Field,
  Form,
};
