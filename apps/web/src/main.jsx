import React, { useState, useEffect, createContext, useContext } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  BookOpen,
  ArrowUpRight,
  ArrowRight,
  Search,
  Star,
  CalendarDays,
  MessageCircle,
  LayoutDashboard,
  Users,
  Library,
  Bell,
  LogOut,
  Check,
  Plus,
  ShieldCheck,
  Menu,
  X,
  Leaf,
  Upload,
  Clock,
} from "lucide-react";
import "./style.css";
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
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
function useData(url) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = () =>
    api(url)
      .then(setData)
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
function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then((r) => setUser(r.user))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  return (
    <Context.Provider value={{ user, setUser, ready, toast: setToast }}>
      <BrowserRouter>
        <Scroll />
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tutors" element={<Tutors />} />
          <Route path="/tutors/:id" element={<Tutors />} />
          <Route path="/tutorials" element={<Resources />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/register" element={<Auth register />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/forgot-password" element={<Recovery />} />
          <Route path="/reset-password" element={<Recovery reset />} />
          <Route
            path="/book"
            element={
              <Protected>
                <Booking />
              </Protected>
            }
          />
          <Route
            path="/dashboard/*"
            element={
              <Protected>
                <Portal />
              </Protected>
            }
          />
          <Route path="/dev/mail" element={<Inbox />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/:page" element={<Info />} />
        </Routes>
        <Footer />
        {toast && (
          <div className="toast" role="status">
            <Check size={18} />
            {toast}
          </div>
        )}
      </BrowserRouter>
    </Context.Provider>
  );
}
function Scroll() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
function Header() {
  const { user, setUser } = useApp(),
    [open, setOpen] = useState(false),
    nav = useNavigate(),
    loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <>
      <div className="announcement">
        A little guidance can change everything.{" "}
        <Link to="/tutors">Find your learning partner ↗</Link>
      </div>
      <header>
        <div className="container header-inner">
          <Link to="/" className="brand">
            <span className="brand-icon">
              <BookOpen size={23} />
            </span>
            smart<span>tutor</span>
          </Link>
          <button
            className="icon mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <nav className={open ? "open" : ""}>
            <NavLink to="/tutors">Find a tutor</NavLink>
            <NavLink to="/tutorials">Explore resources</NavLink>
            <NavLink to="/about">Our story</NavLink>
          </nav>
          <div className="header-actions">
            {user ? (
              <>
                <Link
                  className="icon"
                  aria-label="Notifications"
                  to="/dashboard/notifications"
                >
                  <Bell size={19} />
                </Link>
                <Link className="btn small" to="/dashboard">
                  My dashboard ↗
                </Link>
                <button
                  className="icon"
                  aria-label="Sign out"
                  onClick={async () => {
                    await api("/auth/logout", { method: "POST" });
                    setUser(null);
                    nav("/");
                  }}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <Link className="login-link" to="/login">
                  Log in
                </Link>
                <Link className="btn small" to="/register">
                  Get started <ArrowUpRight size={16} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
function Home() {
  const [tutors] = useData("/tutors"),
    [q, setQ] = useState(""),
    nav = useNavigate();
  return (
    <main>
      <div className="container hero">
        <div>
          <div className="eyebrow">— BIG IDEAS START WITH A LITTLE HELP</div>
          <h1>
            Your potential.
            <br />
            Our guidance.
            <br />
            <em>Endless possibilities.</em>
          </h1>
          <p>
            Find the right tutor, make sense of the tricky stuff, and take your
            next step with confidence. Learning feels better together.
          </p>
          <form
            className="hero-search"
            onSubmit={(e) => {
              e.preventDefault();
              nav("/tutors?q=" + encodeURIComponent(q));
            }}
          >
            <Search size={20} />
            <input
              aria-label="What would you like to learn?"
              placeholder="What would you like to learn?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn" aria-label="Search tutors">
              <ArrowRight size={20} />
            </button>
          </form>
          <div className="popular">
            A little inspiration: <Link to="/tutors?q=Mathematics">Maths</Link>
            <Link to="/tutors?q=Computer">Coding</Link>
            <Link to="/tutors?q=English">English</Link>
          </div>
          <div className="hero-note">
            <span className="mini-stack">
              <b>EB</b>
              <b>MC</b>
              <b>SW</b>
            </span>
            <span>
              <strong>Different minds. Shared goals.</strong>
              <small>Personal support for your next breakthrough</small>
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="art-ring" />
          <span className="spark s1">✳</span>
          <div className="art-top">
            <span className="art-label">YOUR NEXT CHAPTER</span>
            <div className="art-title">
              Small steps.
              <br />
              <em>Big breakthroughs.</em>
            </div>
            <div className="art-book">
              <div className="book-left">
                <span>the art of</span>
                <strong>
                  figuring
                  <br />
                  it out.
                </strong>
                <i>↗</i>
              </div>
              <div className="book-right">
                <Leaf size={80} strokeWidth={1} />
                <hr />
                <span>Stay curious.</span>
              </div>
            </div>
            <small>A fresh perspective is closer than you think.</small>
          </div>
          <div className="float-card float-one">
            <span className="float-icon">
              <Check />
            </span>
            <div>
              <b>That “aha!” moment</b>
              <small>Let’s find yours.</small>
            </div>
          </div>
          <div className="float-card float-two">
            <span>✧</span>
            <b>
              Made for your kind
              <br />
              of learning.
            </b>
          </div>
          <span className="spark s2">✦</span>
        </div>
      </div>
      <div className="belief-bar">
        <div className="container">
          <span>
            <ShieldCheck />
            Thoughtful tutor approval
          </span>
          <span>
            <Users />
            One-to-one, human connection
          </span>
          <span>
            <Library />
            Resources to keep you growing
          </span>
          <span>
            <CalendarDays />
            Learning that fits your life
          </span>
        </div>
      </div>
      <section className="container section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
            <h2>
              What’s your next <em>“I get it”?</em>
            </h2>
          </div>
          <Link className="text-link" to="/tutorials">
            Explore all subjects ↗
          </Link>
        </div>
        <div className="subject-grid">
          {[
            ["Mathematics", "Numbers, meet possibility.", "peach", "∑"],
            ["Computer Science", "Build something brilliant.", "mint", "</>"],
            ["English", "Find the words. Find your voice.", "lavender", "Aa"],
            ["Physics", "Make sense of your world.", "blue", "↗"],
          ].map(([n, p, c, s]) => (
            <Link
              to={"/tutors?q=" + encodeURIComponent(n)}
              className={"subject-card " + c}
              key={n}
            >
              <div className="subject-top">
                <span>{s}</span>
                <ArrowUpRight size={22} />
              </div>
              <h3>{n}</h3>
              <p>{p}</p>
              <small>Find your tutor →</small>
            </Link>
          ))}
        </div>
      </section>
      <section className="tutor-section">
        <div className="container section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">GOOD PEOPLE. GREAT GUIDANCE.</div>
              <h2>
                A fresh perspective.
                <br />
                <em>A familiar face.</em>
              </h2>
            </div>
            <div>
              <p>
                Patient guides, thoughtful explanations,
                <br />
                and a little encouragement along the way.
              </p>
              <Link className="text-link" to="/tutors">
                Meet our tutors ↗
              </Link>
            </div>
          </div>
          <div className="tutor-grid">
            {tutors?.slice(0, 3).map((t, i) => (
              <TutorCard tutor={t} index={i} key={t.id} />
            ))}
          </div>
          <p className="demo-caption">
            Illustrative demo profiles. No real qualifications or endorsements
            are claimed.
          </p>
        </div>
      </section>
      <section className="container section how">
        <div>
          <div className="eyebrow">YOUR NEXT STEP, SIMPLIFIED</div>
          <h2>
            Less overwhelm.
            <br />
            <em>More moving forward.</em>
          </h2>
          <Link className="btn" to="/register">
            Start learning today ↗
          </Link>
        </div>
        <div>
          {[
            [
              "01",
              "Find your kind of tutor",
              "Explore subjects and meet a guide who gets your goals.",
            ],
            [
              "02",
              "Tell us what works for you",
              "Request a time. Our team will coordinate and confirm your session.",
            ],
            [
              "03",
              "Make your next breakthrough",
              "Connect, ask questions, and build confidence at your own pace.",
            ],
          ].map(([n, h, p]) => (
            <div className="step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="container cta">
        <div className="eyebrow">GIVE YOUR CURIOSITY SOMEWHERE TO GO</div>
        <h2>
          You don’t have to figure
          <br />
          it all out <em>on your own.</em>
        </h2>
        <Link className="btn light" to="/register">
          Let’s take the first step ↗
        </Link>
        <span className="cta-star">✳</span>
      </section>
    </main>
  );
}
function TutorCard({ tutor: t, index: i }) {
  return (
    <article className="tutor-card">
      <div className={"portrait tone" + (i % 3)}>
        <span className="approved">
          <ShieldCheck size={13} /> Approved tutor
        </span>
        <Avatar name={t.name} large />
        <span className="portrait-deco">{["✳", "↗", "✦"][i % 3]}</span>
      </div>
      <div className="tutor-content">
        <div className="tutor-title">
          <h3>{t.name}</h3>
          <span className="rating">
            <Star size={13} />
            {t.rating ? t.rating.toFixed(1) : "New"}
          </span>
        </div>
        <p className="tutor-subjects">
          {t.subjects.map((s) => s.name).join(" · ")}
        </p>
        <p className="tutor-bio">{t.bio}</p>
        <Link className="tutor-link" to={"/tutors/" + t.id}>
          Get to know {t.name.split(" ")[0]} <ArrowUpRight size={17} />
        </Link>
      </div>
    </article>
  );
}
function Tutors() {
  const [tutors, error] = useData("/tutors"),
    [p] = useSearchParams(),
    [q, setQ] = useState(p.get("q") || "");
  const selected = useLocation().pathname.split("/")[2];
  if (selected) {
    const t = tutors?.find((t) => t.id === Number(selected));
    return (
      <div className="container page">
        <Link to="/tutors" className="text-link">
          ← All tutors
        </Link>
        {t ? (
          <div className="profile-grid">
            <div className="panel">
              <Avatar name={t.name} large />
              <h1 className="spaced">{t.name}</h1>
              <p>{t.subjects.map((s) => s.name).join(" · ")}</p>
              <p>{t.bio}</p>
              <h3>Qualifications</h3>
              <p>{t.qualifications}</p>
              <h3>Student feedback</h3>
              {t.reviews.length ? (
                t.reviews.map((r) => (
                  <div className="list-item" key={r.id}>
                    <b>
                      {r.name} · {"★".repeat(r.rating)}
                    </b>
                    <p>{r.body}</p>
                  </div>
                ))
              ) : (
                <p>No reviews yet.</p>
              )}
            </div>
            <aside className="panel">
              <h2>Make time for your goals.</h2>
              <p>
                Choose a preferred time. Our team will coordinate and confirm
                your session.
              </p>
              <Link className="btn" to={"/book?tutor=" + t.id}>
                Request a session ↗
              </Link>
              <h3 className="spaced">Upcoming availability</h3>
              {t.availability.map((a) => (
                <p className="availability-item" key={a.id}>
                  {fmt(a.starts_at)} —{" "}
                  {new Date(a.ends_at).toLocaleTimeString()}
                </p>
              ))}
            </aside>
          </div>
        ) : (
          <Empty>{error || "Loading your tutor…"}</Empty>
        )}
      </div>
    );
  }
  return (
    <div className="container page">
      <div className="eyebrow">A LITTLE HELP GOES A LONG WAY</div>
      <h1>
        Find your <em>learning partner.</em>
      </h1>
      <p>Good questions deserve great guidance. Meet someone who can help.</p>
      <div className="search-toolbar">
        <Search size={20} />
        <input
          aria-label="Search tutors"
          placeholder="Search by subject, tutor name, or keyword"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="tutor-grid">
        {tutors
          ?.filter((t) =>
            (t.name + " " + t.bio + " " + t.subjects.map((s) => s.name))
              .toLowerCase()
              .includes(q.toLowerCase()),
          )
          .map((t, i) => (
            <TutorCard tutor={t} index={i} key={t.id} />
          ))}
      </div>
      <p className="demo-caption">
        Demo profiles. Sessions require administrator confirmation.
      </p>
    </div>
  );
}
function Resources() {
  const [items, error] = useData("/tutorials"),
    [subjects] = useData("/subjects"),
    [q, setQ] = useState(""),
    [subject, setSubject] = useState(""),
    [level, setLevel] = useState(""),
    [type, setType] = useState("");
  const { user } = useApp();
  const filtered = items?.filter(
    (t) =>
      (t.title + " " + t.tutor_name + " " + t.description)
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (!subject || String(t.subject_id) === subject) &&
      (!level || t.difficulty === level) &&
      (!type || t.type === type),
  );
  return (
    <div className="container page">
      <div className="eyebrow">A LITTLE KNOWLEDGE. A LOT OF POSSIBILITY.</div>
      <h1>
        Keep your curiosity <em>growing.</em>
      </h1>
      <p>Thoughtfully shared resources for your next step forward.</p>
      <div className="search-toolbar">
        <Search size={20} />
        <input
          aria-label="Search resources"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search resources, keywords, or tutor names"
        />
      </div>
      <div className="filter-row">
        <select
          aria-label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">All subjects</option>
          {subjects?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Difficulty"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="">All levels</option>
          {["Beginner", "Intermediate", "Advanced"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Format"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All formats</option>
          <option value="pdf">PDF</option>
          <option value="link">External link</option>
        </select>
        <small>{filtered?.length || 0} resources</small>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="resource-grid">
        {filtered?.map((t) => (
          <article className="resource-card" key={t.id}>
            <div className={"resource-art " + t.color}>
              <BookOpen size={50} strokeWidth={1} />
              <span>{t.subject}</span>
            </div>
            <div className="resource-content">
              <div className="eyebrow">
                {t.difficulty} · {t.type}
              </div>
              <h3>{t.title}</h3>
              <p>{t.description}</p>
              <div className="resource-bottom">
                <span>By {t.tutor_name}</span>
                {user ? (
                  <a
                    href={"/api/tutorials/" + t.id + "/open"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Open ↗
                  </a>
                ) : (
                  <Link to="/login" className="text-link">
                    Sign in to open ↗
                  </Link>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {filtered?.length === 0 && (
        <Empty>No resources match your filters.</Empty>
      )}
    </div>
  );
}
function Protected({ children }) {
  const { user, ready } = useApp();
  if (!ready) return <Empty>Getting things ready…</Empty>;
  if (!user)
    return (
      <div className="container page">
        <h1>Your next chapter starts here.</h1>
        <p>Sign in to continue.</p>
        <Link to="/login" className="btn">
          Sign in ↗
        </Link>
      </div>
    );
  return children;
}
function Auth({ register = false }) {
  const { setUser } = useApp(),
    nav = useNavigate(),
    [subjects] = useData("/subjects"),
    [config] = useData("/config"),
    [role, setRole] = useState("student"),
    [step, setStep] = useState("credentials"),
    [email, setEmail] = useState(""),
    [captcha, setCaptcha] = useState("");
  useEffect(() => setStep("credentials"), [register]);
  useEffect(() => {
    if (!register || !config?.captchaSiteKey) return;
    window.onTurnstileSuccess = setCaptcha;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    document.head.appendChild(script);
    return () => {
      script.remove();
      delete window.onTurnstileSuccess;
    };
  }, [register, config?.captchaSiteKey]);
  return (
    <div className="container auth-page">
      <div className="auth-story">
        <div className="eyebrow">YOUR NEXT CHAPTER</div>
        <h1>
          A little support.
          <br />
          <em>A brighter path.</em>
        </h1>
        <p>
          Bring your questions, your big ideas, and your not-quite-sure-yets.
          We’ll help you find your way.
        </p>
        <div className="auth-illustration">
          <BookOpen size={90} strokeWidth={1} />
          <span>Stay curious.</span>
        </div>
      </div>
      <div className="panel auth-form">
        <div className="eyebrow">
          {register ? "LET’S BEGIN" : "GOOD TO SEE YOU AGAIN"}
        </div>
        <h2>
          {step === "done"
            ? "Check your inbox."
            : register
              ? "Make room for possibility."
              : step === "otp"
                ? "One little security check."
                : "Welcome back."}
        </h2>
        <p>
          {step === "otp"
            ? `Enter the six-digit code sent to ${email}.`
            : "Your next breakthrough is waiting."}
        </p>
        {step === "done" ? (
          <p>
            Verify your email, then <Link to="/login">sign in</Link>. Tutors
            also need administrator approval.
          </p>
        ) : (
          <Form
            key={String(register) + step}
            endpoint={
              "/auth/" +
              (register ? "register" : step === "otp" ? "otp" : "login")
            }
            submit={
              register
                ? "Create account"
                : step === "otp"
                  ? "Verify and sign in"
                  : "Continue"
            }
            transform={(f) => {
              const v = Object.fromEntries(f);
              if (register) {
                if (v.password !== v.confirm)
                  throw new Error("Passwords do not match");
                if (v.email !== v.emailConfirm)
                  throw new Error("Email addresses do not match");
                return {
                  ...v,
                  role,
                  terms: v.terms === "on",
                  subjects: [Number(v.subject)],
                  captcha,
                };
              }
              return step === "otp" ? { email, code: v.code } : v;
            }}
            onDone={(r, form) => {
              if (register) setStep("done");
              else if (step === "otp") {
                setUser(r.user);
                nav("/dashboard");
              } else {
                setEmail(new FormData(form).get("email"));
                setStep("otp");
              }
            }}
          >
            {register && (
              <>
                <div className="role-toggle">
                  {["student", "tutor", "admin"].map((r) => (
                    <button
                      type="button"
                      key={r}
                      className={role === r ? "selected" : ""}
                      onClick={() => setRole(r)}
                    >
                      {r === "admin" ? "Invited admin" : r}
                    </button>
                  ))}
                </div>
                <Field label="Full name" name="name" required />
                <Field
                  label="Username"
                  name="username"
                  pattern="[a-zA-Z0-9_]{3,40}"
                  required
                />
              </>
            )}
            {step === "otp" ? (
              <Field
                label="Six-digit code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                required
              />
            ) : (
              <>
                <Field
                  label="Email address"
                  name="email"
                  type="email"
                  required
                />
                {register && (
                  <Field
                    label="Confirm email"
                    name="emailConfirm"
                    type="email"
                    required
                  />
                )}
                <Field
                  label="Password"
                  name="password"
                  type="password"
                  minLength={register ? 10 : 1}
                  required
                />
                {register ? (
                  <>
                    <Field
                      label="Confirm password"
                      name="confirm"
                      type="password"
                      required
                    />
                    <label>
                      Subject
                      <select name="subject" required>
                        {subjects?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {role === "student" && (
                      <>
                        <Field
                          label="Date of birth"
                          name="dob"
                          type="date"
                          required
                        />
                        <Field
                          label="Home address (private)"
                          name="address"
                          required
                        />
                      </>
                    )}
                    {role === "tutor" && (
                      <>
                        <Field
                          label="Qualifications"
                          name="qualifications"
                          required
                        />
                        <label>
                          About your teaching
                          <textarea name="bio" required />
                        </label>
                      </>
                    )}
                    {role === "admin" && (
                      <Field
                        label="Administrator invitation"
                        name="invite"
                        type="password"
                        required
                      />
                    )}
                    <label className="checkbox">
                      <input name="terms" type="checkbox" required />I agree to
                      the <Link to="/terms">Terms</Link> and{" "}
                      <Link to="/privacy">Privacy Policy</Link>.
                    </label>
                    {config?.captchaSiteKey && (
                      <div
                        className="cf-turnstile"
                        data-sitekey={config.captchaSiteKey}
                        data-callback="onTurnstileSuccess"
                      />
                    )}
                  </>
                ) : (
                  <Link className="forgot" to="/forgot-password">
                    Forgot your password?
                  </Link>
                )}
              </>
            )}
          </Form>
        )}
        <div className="auth-switch">
          {register ? "Already part of the community?" : "New around here?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </div>
        {config?.demo && (
          <div className="dev-note">
            Local demo: <b>alex@smarttutor.test</b>,{" "}
            <b>elena@smarttutor.test</b> or <b>admin@smarttutor.test</b>.
            Password: <b>LearnTogether!26</b>. Retrieve login codes from the{" "}
            <Link to="/dev/mail">local email inbox</Link>. Never use demo
            accounts in production.
          </div>
        )}
      </div>
    </div>
  );
}
function Verify() {
  const [p] = useSearchParams(),
    [done, setDone] = useState(false);
  return (
    <div className="container page narrow">
      <h1>One step closer.</h1>
      {done ? (
        <Link className="btn" to="/login">
          Email verified. Sign in ↗
        </Link>
      ) : (
        <Form
          endpoint="/auth/verify"
          transform={() => ({ token: p.get("token") })}
          submit="Verify my email"
          onDone={() => setDone(true)}
        />
      )}
    </div>
  );
}
function Recovery({ reset = false }) {
  const [p] = useSearchParams(),
    [done, setDone] = useState(false);
  return (
    <div className="container page narrow">
      <div className="panel">
        <h1>{reset ? "A fresh start." : "Let’s get you back in."}</h1>
        {done ? (
          <p>
            Check your inbox or <Link to="/login">return to sign in</Link>.
          </p>
        ) : (
          <Form
            endpoint={"/auth/" + (reset ? "reset" : "forgot")}
            transform={(f) => ({
              ...Object.fromEntries(f),
              ...(reset ? { token: p.get("token") } : {}),
            })}
            submit={reset ? "Update password" : "Send reset link"}
            onDone={() => setDone(true)}
          >
            {reset ? (
              <Field
                label="New password"
                name="password"
                type="password"
                minLength={10}
                required
              />
            ) : (
              <Field label="Email" name="email" type="email" required />
            )}
          </Form>
        )}
      </div>
    </div>
  );
}
function Booking() {
  const { user } = useApp(),
    [tutors] = useData("/tutors"),
    [subjects] = useData("/subjects"),
    [p] = useSearchParams(),
    [tutor, setTutor] = useState(p.get("tutor") || ""),
    [done, setDone] = useState(false);
  if (user.role !== "student")
    return <Empty>Session requests are available to students.</Empty>;
  return (
    <div className="container page narrow">
      <div className="eyebrow">LET’S MAKE A LITTLE PROGRESS</div>
      <h1>
        A session for <em>your next step.</em>
      </h1>
      <p>
        Tell us what you need. Our team will check availability and confirm your
        session.
      </p>
      <div className="panel">
        {done ? (
          <>
            <h2>Your request is in good hands.</h2>
            <p>
              This is a request, not a confirmed booking. Your admin team will
              assign the session.
            </p>
            <Link className="btn" to="/dashboard/sessions">
              View my sessions ↗
            </Link>
          </>
        ) : (
          <Form
            endpoint="/requests"
            submit="Send session request"
            transform={(f) => {
              const s = Object.fromEntries(f);
              return { ...s, starts_at: new Date(s.starts_at).toISOString() };
            }}
            onDone={() => setDone(true)}
          >
            <label>
              Your preferred tutor
              <select
                name="tutor_id"
                aria-label="Your preferred tutor"
                value={tutor}
                onChange={(e) => setTutor(e.target.value)}
                required
              >
                <option value="">Choose a tutor</option>
                {tutors?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {tutor && (
              <div className="slot-list">
                <b>Available windows · your local time</b>
                {tutors
                  ?.find((t) => t.id === Number(tutor))
                  ?.availability.map((a) => (
                    <small key={a.id}>
                      {fmt(a.starts_at)} —{" "}
                      {new Date(a.ends_at).toLocaleTimeString()}
                    </small>
                  ))}
              </div>
            )}
            <label>
              Subject
              <select aria-label="Subject" name="subject_id" required>
                {subjects?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <Field
                label="Preferred date and time (your local time)"
                name="starts_at"
                type="datetime-local"
                required
              />
              <label>
                Duration
                <select name="duration">
                  <option value="60">60 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="90">90 minutes</option>
                </select>
              </label>
            </div>
            <label>
              What would you like to work on?
              <textarea name="notes" required />
            </label>
            <p className="muted">
              Cancellations are handled by the admin team. Times shown in{" "}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            </p>
          </Form>
        )}
      </div>
    </div>
  );
}
function Portal() {
  const { user } = useApp();
  const items = [
    ["", "Overview", LayoutDashboard],
    ["sessions", "Sessions", CalendarDays],
    ...(user.role === "tutor"
      ? [
          ["upload", "My resources", Upload],
          ["availability", "Availability", Clock],
        ]
      : []),
    ...(user.role === "admin"
      ? [
          ["users", "People & approvals", Users],
          ["content", "Content library", Library],
          ["announcements", "Announcements", Bell],
          ["contacts", "Contact enquiries", MessageCircle],
        ]
      : [["messages", "Messages", MessageCircle]]),
    ["notifications", "Notifications", Bell],
  ];
  return (
    <div className="container portal">
      <aside className="sidebar">
        <div className="sidebar-person">
          <Avatar name={user.name} />
          <div>
            <b>{user.name}</b>
            <small>{user.role} space</small>
          </div>
        </div>
        <nav>
          {items.map(([href, label, Icon]) => (
            <NavLink
              key={href}
              to={"/dashboard" + (href ? "/" + href : "")}
              end
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf />
          <p>
            A little progress
            <br />
            is still progress.
          </p>
          <Link to="/tutorials">Learn something new ↗</Link>
        </div>
      </aside>
      <div className="portal-main">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="users" element={<People />} />
          <Route path="content" element={<Content />} />
          <Route path="upload" element={<UploadResource />} />
          <Route path="availability" element={<Availability />} />
          <Route path="messages" element={<Messages />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="contacts" element={<Contacts />} />
        </Routes>
      </div>
    </div>
  );
}
function Overview() {
  const { user } = useApp(),
    [stats, error] = useData("/stats"),
    [sessions] = useData("/sessions"),
    [notes] = useData("/announcements");
  return (
    <>
      <div className="portal-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL LEARNING SPACE</div>
          <h1>
            Hey, {user.name.split(" ")[0]}. <em>Keep growing.</em>
          </h1>
          <p>Here’s a little look at what’s ahead.</p>
        </div>
        {user.role === "student" && (
          <Link className="btn" to="/book">
            Request a session <Plus size={17} />
          </Link>
        )}
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="stat-grid">
        {stats &&
          Object.entries(stats).map(([k, v]) => (
            <div className="stat" key={k}>
              <span>{k}</span>
              <strong>{v}</strong>
              <small>Your community, in numbers</small>
            </div>
          ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Coming up next</h2>
          {sessions
            ?.filter((s) => s.status === "scheduled")
            .map((s) => (
              <div className="session-preview" key={s.id}>
                <CalendarDays />
                <div>
                  <h3>{s.subject}</h3>
                  <p>
                    {s.tutor_name} · {fmt(s.starts_at)}
                  </p>
                </div>
                <span className="badge">Confirmed</span>
              </div>
            ))}
          {sessions && !sessions.some((s) => s.status === "scheduled") && (
            <Empty>
              Your next chapter is still unwritten. Request a session to get
              started.
            </Empty>
          )}
        </section>
        <section className="panel inspiration">
          <Leaf size={35} />
          <h2>
            One question can
            <br />
            open a whole new door.
          </h2>
          <p>
            Make a little time for something you’ve always wanted to understand.
          </p>
          <Link to="/tutorials" className="text-link">
            Explore the library ↗
          </Link>
        </section>
      </div>
      <section className="panel spaced">
        <h2>Community notes</h2>
        {notes?.length ? (
          notes.map((n) => (
            <div className="list-item" key={n.id}>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </div>
          ))
        ) : (
          <p>No announcements. You’re all caught up.</p>
        )}
      </section>
      {user.role === "admin" && (
        <div className="row-actions spaced">
          {["csv", "pdf", "xlsx"].map((f) => (
            <a
              className="btn secondary"
              href={"/api/admin/export?format=" + f}
              key={f}
            >
              Export {f.toUpperCase()} ↗
            </a>
          ))}
        </div>
      )}
    </>
  );
}
function Action({ url, method = "POST", body, children, onDone }) {
  const { toast } = useApp(),
    [busy, setBusy] = useState(false);
  return (
    <button
      className="btn secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api(url, { method, body });
          toast(r.message || "Session updated");
          onDone?.();
        } catch (e) {
          toast(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}
function Sessions() {
  const { user } = useApp(),
    [sessions, error, reload] = useData("/sessions"),
    [requests, , reloadR] = useData("/requests"),
    [review, setReview] = useState(null);
  const refresh = () => {
    reload();
    reloadR();
  };
  return (
    <>
      <div className="portal-heading">
        <div>
          <h1>
            A little time to <em>learn.</em>
          </h1>
          <p>Requests, sessions, and progress.</p>
        </div>
        {user.role === "student" && (
          <Link className="btn" to="/book">
            Request a session ↗
          </Link>
        )}
      </div>
      <ErrorBox>{error}</ErrorBox>
      <h2>Awaiting assignment</h2>
      {requests
        ?.filter((r) => r.status === "pending")
        .map((r) => (
          <div className="panel session-row" key={r.id}>
            <div>
              <span className="badge amber">Pending request</span>
              <h3>
                {r.subject} · {r.tutor_name}
              </h3>
              <p>
                {r.student_name} · {fmt(r.starts_at)} · {r.duration} min
              </p>
              <small>{r.notes}</small>
            </div>
            {user.role === "admin" && (
              <Action url={"/requests/" + r.id + "/assign"} onDone={refresh}>
                Assign session
              </Action>
            )}
          </div>
        ))}
      {requests && !requests.some((r) => r.status === "pending") && (
        <p>No pending requests.</p>
      )}
      <h2 className="spaced">Your sessions</h2>
      {sessions?.map((s) => (
        <div className="panel session-row" key={s.id}>
          <div>
            <span className="badge">{s.status}</span>
            <h3>{s.subject}</h3>
            <p>
              {s.student_name} with {s.tutor_name}
            </p>
            <small>
              {fmt(s.starts_at)} — {new Date(s.ends_at).toLocaleTimeString()}
            </small>
            {s.reason && <p>{s.reason}</p>}
          </div>
          <div className="row-actions">
            {user.role === "admin" && s.status === "scheduled" && (
              <>
                <Action
                  url={"/sessions/" + s.id}
                  method="PATCH"
                  body={{
                    status: "cancelled",
                    reason: "Cancelled by administrator",
                  }}
                  onDone={refresh}
                >
                  Cancel session
                </Action>
                {s.ends_at < new Date().toISOString() && (
                  <Action
                    url={"/sessions/" + s.id}
                    method="PATCH"
                    body={{
                      status: "completed",
                      reason: "Attendance confirmed by administrator",
                    }}
                    onDone={refresh}
                  >
                    Mark completed
                  </Action>
                )}
              </>
            )}
            {user.role === "student" && s.status === "completed" && (
              <button className="btn secondary" onClick={() => setReview(s.id)}>
                Leave a review
              </button>
            )}
          </div>
        </div>
      ))}
      {sessions?.length === 0 && <Empty>No confirmed sessions yet.</Empty>}
      {review && (
        <div className="modal-backdrop">
          <div className="panel modal">
            <button
              className="icon modal-close"
              aria-label="Close review"
              onClick={() => setReview(null)}
            >
              <X />
            </button>
            <h2>How was your session?</h2>
            <Form
              endpoint="/reviews"
              transform={(f) => ({
                ...Object.fromEntries(f),
                session_id: review,
              })}
              submit="Publish review"
              onDone={() => setReview(null)}
            >
              <label>
                Rating
                <select name="rating">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Feedback
                <textarea name="body" required />
              </label>
            </Form>
          </div>
        </div>
      )}
    </>
  );
}
function People() {
  const [users, error, reload] = useData("/admin/users");
  return (
    <>
      <h1>
        Good people.
        <br />
        <em>A growing community.</em>
      </h1>
      <ErrorBox>{error}</ErrorBox>
      <h2>Pending tutor approvals</h2>
      {users
        ?.filter((u) => u.status === "pending")
        .map((u) => (
          <div className="panel session-row" key={u.id}>
            <div>
              <h3>{u.name}</h3>
              <p>{u.qualifications}</p>
              <small>
                {u.verified ? "Email verified" : "Email verification pending"}
              </small>
            </div>
            <div className="row-actions">
              {["active", "rejected"].map((s) => (
                <Action
                  key={s}
                  url={"/admin/users/" + u.id}
                  method="PATCH"
                  body={{ status: s }}
                  onDone={reload}
                >
                  {s === "active" ? "Approve" : "Reject"}
                </Action>
              ))}
            </div>
          </div>
        ))}
      <div className="panel spaced table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Status</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.name}</b>
                  <small>{u.email}</small>
                </td>
                <td>{u.role}</td>
                <td>
                  <span className="badge">{u.status}</span>
                </td>
                <td>
                  {u.role !== "admin" && (
                    <Action
                      url={"/admin/users/" + u.id}
                      method="PATCH"
                      body={{
                        status: u.status === "active" ? "suspended" : "active",
                      }}
                      onDone={reload}
                    >
                      {u.status === "active" ? "Suspend" : "Activate"}
                    </Action>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function UploadResource() {
  const [subjects] = useData("/subjects"),
    [type, setType] = useState("link");
  return (
    <>
      <h1>
        Share a little <em>knowledge.</em>
      </h1>
      <p>Your perspective could be someone else’s breakthrough.</p>
      <div className="panel">
        <Form
          endpoint={type === "pdf" ? "/tutorials/pdf" : "/tutorials"}
          submit="Save resource"
          transform={(f) =>
            type === "pdf" ? f : { ...Object.fromEntries(f), type }
          }
          onDone={(r, f) => f.reset()}
        >
          <Field label="Resource title" name="title" required />
          <label>
            Subject
            <select name="subject_id" aria-label="Subject" required>
              {subjects?.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea name="description" required />
          </label>
          <label>
            Difficulty
            <select name="difficulty">
              {["Beginner", "Intermediate", "Advanced"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <div className="role-toggle">
            <button
              type="button"
              className={type === "link" ? "selected" : ""}
              onClick={() => setType("link")}
            >
              External link
            </button>
            <button
              type="button"
              className={type === "pdf" ? "selected" : ""}
              onClick={() => setType("pdf")}
            >
              PDF document
            </button>
          </div>
          {type === "pdf" ? (
            <Field
              label="PDF (maximum 20 MB)"
              name="file"
              type="file"
              accept="application/pdf"
              required
            />
          ) : (
            <Field
              label="HTTPS resource URL"
              name="url"
              type="url"
              pattern="https://.*"
              required
            />
          )}
          <label>
            Publication
            <select name="status">
              <option value="published">Publish</option>
              <option value="draft">Save draft</option>
            </select>
          </label>
          <p className="muted">
            After publishing, only an administrator can edit or remove your
            resource.
          </p>
        </Form>
      </div>
    </>
  );
}
function Content() {
  const [items, error, reload] = useData("/tutorials");
  return (
    <>
      <UploadResource />
      <ErrorBox>{error}</ErrorBox>
      {items?.map((t) => (
        <div className="panel session-row" key={t.id}>
          <div>
            <h3>{t.title}</h3>
            <p>
              {t.tutor_name} · {t.status}
            </p>
          </div>
          <div className="row-actions">
            <Action
              method="PATCH"
              url={"/tutorials/" + t.id}
              body={{
                status: t.status === "published" ? "draft" : "published",
              }}
              onDone={reload}
            >
              {t.status === "published" ? "Unpublish" : "Publish"}
            </Action>
            <Action method="DELETE" url={"/tutorials/" + t.id} onDone={reload}>
              Remove
            </Action>
          </div>
        </div>
      ))}
    </>
  );
}
function Availability() {
  const [items, error, reload] = useData("/availability");
  return (
    <>
      <h1>
        Make room for <em>learning.</em>
      </h1>
      <p>Times are displayed in your local timezone.</p>
      <div className="panel">
        <ErrorBox>{error}</ErrorBox>
        <Form
          endpoint="/availability"
          transform={(f) => {
            const s = Object.fromEntries(f);
            return {
              starts_at: new Date(s.starts_at).toISOString(),
              ends_at: new Date(s.ends_at).toISOString(),
            };
          }}
          submit="Add availability"
          onDone={reload}
        >
          <div className="form-row">
            <Field
              label="From"
              name="starts_at"
              type="datetime-local"
              required
            />
            <Field
              label="Until"
              name="ends_at"
              type="datetime-local"
              required
            />
          </div>
        </Form>
      </div>
      {items?.map((a) => (
        <div className="panel session-row" key={a.id}>
          <p>
            {fmt(a.starts_at)} — {fmt(a.ends_at)}
          </p>
          <Action method="DELETE" url={"/availability/" + a.id} onDone={reload}>
            Remove
          </Action>
        </div>
      ))}
    </>
  );
}
function Messages() {
  const [peers, error] = useData("/peers"),
    [peer, setPeer] = useState("");
  return (
    <>
      <h1>
        A little <em>conversation.</em>
      </h1>
      <p>Your private space with assigned learning partners.</p>
      <ErrorBox>{error}</ErrorBox>
      <div className="message-layout">
        <div className="panel peers">
          {peers?.map((p) => (
            <button
              className={peer === String(p.id) ? "active" : ""}
              key={p.id}
              onClick={() => setPeer(String(p.id))}
            >
              <Avatar name={p.name} />
              {p.name}
            </button>
          ))}
          {peers?.length === 0 && (
            <p>Conversations open after your first assigned session.</p>
          )}
        </div>
        {peer ? (
          <Conversation peer={peer} />
        ) : (
          <div className="panel">
            <Empty>Choose a conversation to get started.</Empty>
          </div>
        )}
      </div>
    </>
  );
}
function Conversation({ peer }) {
  const [items, error, reload] = useData("/messages/" + peer),
    { user } = useApp();
  useEffect(() => {
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [peer]);
  return (
    <div className="panel conversation">
      <ErrorBox>{error}</ErrorBox>
      <div className="message-history" aria-live="polite">
        {items?.map((m) => (
          <div
            className={"message " + (m.sender_id === user.id ? "mine" : "")}
            key={m.id}
          >
            <p>{m.body}</p>
            <small>
              {fmt(m.created_at)} · {m.is_read ? "Read" : "Sent"}
            </small>
          </div>
        ))}
      </div>
      <Form
        endpoint={"/messages/" + peer}
        submit="Send message"
        onDone={(r, f) => {
          f.reset();
          reload();
        }}
      >
        <Field label="Message" name="body" required maxLength={3000} />
      </Form>
    </div>
  );
}
function Notifications() {
  const [items, error, reload] = useData("/notifications");
  return (
    <>
      <div className="portal-heading">
        <h1>
          You’re in <em>the loop.</em>
        </h1>
        <Action url="/notifications/read" onDone={reload}>
          Mark all read
        </Action>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {items?.map((n) => (
        <div
          className={"panel notification " + (!n.is_read ? "unread" : "")}
          key={n.id}
        >
          <Bell size={20} />
          <div>
            <h3>{n.title}</h3>
            <p>{n.body}</p>
            <small>{fmt(n.created_at)}</small>
          </div>
        </div>
      ))}
      {items?.length === 0 && <Empty>Nothing new. Enjoy a little quiet.</Empty>}
    </>
  );
}
function Announcements() {
  const [items, error, reload] = useData("/announcements");
  return (
    <>
      <h1>
        A note to <em>everyone.</em>
      </h1>
      <div className="panel">
        <Form
          endpoint="/announcements"
          submit="Publish announcement"
          onDone={(r, f) => {
            f.reset();
            reload();
          }}
        >
          <Field label="Title" name="title" required />
          <label>
            Your announcement
            <textarea name="body" required />
          </label>
        </Form>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {items?.map((a) => (
        <div className="panel spaced" key={a.id}>
          <h3>{a.title}</h3>
          <p>{a.body}</p>
        </div>
      ))}
    </>
  );
}
function Contacts() {
  const [items, error] = useData("/admin/contacts");
  return (
    <>
      <h1>
        A little <em>listening.</em>
      </h1>
      <ErrorBox>{error}</ErrorBox>
      {items?.map((c) => (
        <div className="panel spaced" key={c.id}>
          <h3>{c.name}</h3>
          <p>{c.email}</p>
          <p>{c.body}</p>
        </div>
      ))}
      {items?.length === 0 && <Empty>No enquiries yet.</Empty>}
    </>
  );
}
function Contact() {
  const [done, setDone] = useState(false);
  return (
    <div className="container page narrow">
      <div className="eyebrow">WE’RE HERE TO HELP</div>
      <h1>
        Let’s start a <em>conversation.</em>
      </h1>
      <div className="panel">
        {done ? (
          <p>
            Your enquiry is saved for the admin team. Thanks for reaching out.
          </p>
        ) : (
          <Form
            endpoint="/contact"
            submit="Send your message"
            onDone={() => setDone(true)}
          >
            <Field label="Your name" name="name" required />
            <Field label="Email" name="email" type="email" required />
            <label>
              What’s on your mind?
              <textarea name="body" required />
            </label>
          </Form>
        )}
      </div>
    </div>
  );
}
function Inbox() {
  const [items, error, reload] = useData("/dev/mail");
  return (
    <div className="container page narrow">
      <h1>Local email inbox</h1>
      <p>
        Development only. Messages are captured, not sent to real addresses.
        Never expose this inbox publicly.
      </p>
      <button className="btn" onClick={reload}>
        Refresh inbox
      </button>
      <ErrorBox>{error}</ErrorBox>
      {items?.map((m) => (
        <div className="panel spaced" key={m.id}>
          <small>To: {m.recipient}</small>
          <h3>{m.subject}</h3>
          <p className="mail-body">{m.body}</p>
        </div>
      ))}
    </div>
  );
}
function Info() {
  const page = useLocation().pathname;
  const data = {
    "/about": [
      "A little guidance. A world of possibility.",
      "SmartTutor brings students, tutors, and human encouragement together. Built as a Group D KOI capstone project, our purpose is to make academic support simpler to find and coordinate. This development version contains illustrative profiles and no claimed accreditation.",
    ],
    "/privacy": [
      "Your learning. Your privacy.",
      "Development notice, pending operator review: we store account details, hashed passwords, verification records, sessions, messages, views and contact enquiries to operate the service. Date of birth and address are private. Reviews display the student name publicly. Do not enter real or sensitive data in this demo. Retention, age/guardian policy, operator contacts and data-request procedures must be finalized before launch.",
    ],
    "/terms": [
      "A shared space. A little respect.",
      "Development terms, pending review: share only content you have permission to use. A request becomes a booking only when an administrator assigns it. Contact admin for cancellations. Sessions take place outside the platform. No payments are processed. Tutor credential verification is the operator’s responsibility.",
    ],
  }[page];
  return (
    <div className="container page narrow prose">
      <div className="eyebrow">SMARTTUTOR</div>
      <h1>{data?.[0] || "A little off course?"}</h1>
      <p>{data?.[1] || "That page isn’t here. Let’s get you back."}</p>
      <Link className="btn" to={data ? "/contact" : "/"}>
        {data ? "Talk to us" : "Back home"} ↗
      </Link>
    </div>
  );
}
function Footer() {
  return (
    <footer>
      <div className="container footer-main">
        <div>
          <Link to="/" className="brand">
            <span className="brand-icon">
              <BookOpen size={22} />
            </span>
            smart<span>tutor</span>
          </Link>
          <p>
            A little guidance.
            <br />A world of possibility.
          </p>
        </div>
        <div>
          <b>Keep exploring</b>
          <Link to="/tutors">Find a tutor</Link>
          <Link to="/tutorials">Learning resources</Link>
          <Link to="/register">Join the community</Link>
        </div>
        <div>
          <b>A little about us</b>
          <Link to="/about">Our story</Link>
          <Link to="/contact">Get in touch</Link>
          <Link to="/login">Your dashboard</Link>
        </div>
        <div className="footer-message">
          <span>STAY CURIOUS.</span>
          <div>
            There’s always
            <br />
            something <em>more to learn.</em> ↗
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} SmartTutor · A Group D capstone project.
        </span>
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <span>Made for curious minds. ✳</span>
        </div>
      </div>
    </footer>
  );
}
createRoot(document.getElementById("root")).render(<App />);
