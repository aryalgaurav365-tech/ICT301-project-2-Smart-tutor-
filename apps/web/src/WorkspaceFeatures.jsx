import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, User, BarChart3, Clock, ShieldCheck, Mail } from "lucide-react";
import {
  useApp,
  useData,
  api,
  Field,
  Form,
  Empty,
  ErrorBox,
  fmt,
} from "./shared";
export function Reauthenticate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("reauth-needed", show);
    return () => window.removeEventListener("reauth-needed", show);
  }, []);
  return (
    open && (
      <div className="modal-backdrop">
        <div
          className="panel modal"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm your identity"
        >
          <button
            className="icon modal-close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
          <ShieldCheck />
          <h2>One quick identity check.</h2>
          <p>Confirm your password, then repeat the action you were taking.</p>
          <Form
            endpoint="/auth/reauth"
            submit="Confirm identity"
            onDone={() => setOpen(false)}
          >
            <Field
              label="Current password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Form>
        </div>
      </div>
    )
  );
}
export function Profile() {
  const [profile, error, reload] = useData("/profile"),
    [subjects] = useData("/subjects"),
    { user, setUser } = useApp();
  return (
    <>
      <h1>
        Your space.
        <br />
        <em>Your story.</em>
      </h1>
      <ErrorBox>{error}</ErrorBox>
      {profile && (
        <>
          <div className="panel">
            <Form
              key={profile.id + profile.name}
              endpoint="/profile"
              method="PATCH"
              submit="Update profile"
              transform={(f) => ({
                ...Object.fromEntries(f),
                subjects: f.getAll("subjects").map(Number),
              })}
              onDone={async () => {
                reload();
                const r = await api("/auth/me");
                setUser(r.user);
              }}
            >
              <Field
                label="Full name"
                name="name"
                defaultValue={profile.name}
                required
              />
              <label>
                About you
                <textarea name="bio" defaultValue={profile.bio || ""} />
              </label>
              {user.role === "tutor" && (
                <label>
                  Qualifications
                  <textarea
                    name="qualifications"
                    defaultValue={profile.qualifications || ""}
                    required
                  />
                </label>
              )}
              {user.role === "student" && (
                <Field
                  label="Home address (private)"
                  name="address"
                  defaultValue={profile.address || ""}
                />
              )}
              <Field
                label="Timezone (IANA name)"
                name="timezone"
                defaultValue={profile.timezone || "Australia/Sydney"}
                placeholder="Australia/Sydney"
                required
              />
              <label>
                Subjects (choose one or more)
                <select
                  aria-label="Profile subjects"
                  name="subjects"
                  multiple
                  defaultValue={profile.subjects.map(String)}
                  required
                >
                  {subjects?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Email, date of birth and role cannot be changed here. Contact
                your administrator for account corrections.
              </p>
            </Form>
          </div>
          <div className="panel spaced">
            <h2>Your profile photo</h2>
            {profile.photo && (
              <img
                className="avatar large avatar-photo"
                alt="Your current profile"
                src={"/api/profile/photo?v=" + Date.now()}
              />
            )}
            <Form
              endpoint="/profile/photo"
              submit="Upload photo"
              transform={(f) => f}
              onDone={reload}
            >
              <Field
                label="JPEG, PNG or WebP (up to 5 MB)"
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </Form>
            <p className="muted">
              Photos are resized and metadata removed. Approved tutors’ photos
              are visible publicly.
            </p>
          </div>
        </>
      )}
    </>
  );
}
export function MyDrafts() {
  const [items, error, reload] = useData("/my/tutorials"),
    [subjects] = useData("/subjects"),
    [edit, setEdit] = useState(null);
  const { toast } = useApp();
  return (
    <section className="spaced">
      <h2>Your resources</h2>
      <ErrorBox>{error}</ErrorBox>
      {items?.map((t) => (
        <div className="panel session-row" key={t.id}>
          <div>
            <span className="badge">{t.status}</span>
            <h3>{t.title}</h3>
            <small>{fmt(t.created_at)}</small>
          </div>
          {t.status === "draft" ? (
            <div className="row-actions">
              <button className="btn secondary" onClick={() => setEdit(t)}>
                Edit draft
              </button>
              <button
                className="btn secondary"
                onClick={async () => {
                  if (!window.confirm("Remove this unpublished draft?")) return;
                  try {
                    await api("/my/tutorials/" + t.id, { method: "DELETE" });
                    reload();
                  } catch (e) {
                    toast(e.message);
                  }
                }}
              >
                Remove draft
              </button>
            </div>
          ) : (
            <p className="muted">Contact admin for changes.</p>
          )}
        </div>
      ))}
      {items?.length === 0 && (
        <Empty>Your first resource is waiting to be shared.</Empty>
      )}
      {edit && (
        <div className="modal-backdrop">
          <div
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit resource draft"
          >
            <button
              className="icon modal-close"
              aria-label="Close draft"
              onClick={() => setEdit(null)}
            >
              <X />
            </button>
            <h2>A little refinement.</h2>
            <Form
              endpoint={"/my/tutorials/" + edit.id}
              method="PATCH"
              submit="Save draft"
              onDone={() => {
                setEdit(null);
                reload();
              }}
            >
              <Field
                label="Draft title"
                name="title"
                defaultValue={edit.title}
                required
              />
              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={edit.description}
                  required
                />
              </label>
              <label>
                Subject
                <select
                  aria-label="Draft subject"
                  name="subject_id"
                  defaultValue={edit.subject_id}
                >
                  {subjects?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Difficulty
                <select name="difficulty" defaultValue={edit.difficulty}>
                  {["Beginner", "Intermediate", "Advanced"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select name="status">
                  <option value="draft">Keep as draft</option>
                  <option value="published">Publish now</option>
                </select>
              </label>
            </Form>
          </div>
        </div>
      )}
    </section>
  );
}
export function ChangeButton({ session }) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState("cancel");
  return (
    <>
      <button className="btn secondary" onClick={() => setOpen(true)}>
        Request a change
      </button>
      {open && (
        <div className="modal-backdrop">
          <div
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-label="Request session change"
          >
            <button
              className="icon modal-close"
              aria-label="Close change request"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <h2>Plans change. We can help.</h2>
            <p>
              Your current session stays confirmed until an administrator
              approves the change.
            </p>
            <Form
              endpoint="/session-changes"
              submit="Send change request"
              transform={(f) => {
                const s = Object.fromEntries(f);
                return {
                  ...s,
                  session_id: session.id,
                  ...(s.starts_at
                    ? { starts_at: new Date(s.starts_at).toISOString() }
                    : {}),
                };
              }}
              onDone={() => setOpen(false)}
            >
              <label>
                Change type
                <select
                  aria-label="Change type"
                  name="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="cancel">Cancellation</option>
                  <option value="reschedule">Reschedule</option>
                </select>
              </label>
              {kind === "reschedule" && (
                <Field
                  label="Requested new time (local)"
                  type="datetime-local"
                  name="starts_at"
                  required
                />
              )}
              <label>
                Reason
                <textarea name="reason" required />
              </label>
            </Form>
          </div>
        </div>
      )}
    </>
  );
}
export function Changes() {
  const [items, error, reload] = useData("/session-changes"),
    { user } = useApp();
  return (
    <>
      <h1>
        A little flexibility.
        <br />
        <em>A clear next step.</em>
      </h1>
      <p>Requests remain pending until an administrator processes them.</p>
      <ErrorBox>{error}</ErrorBox>
      {items?.map((c) => (
        <div className="panel spaced" key={c.id}>
          <span className="badge">{c.status}</span>
          <h3>
            Session #{c.session_id} · {c.kind}
          </h3>
          <p>{c.reason}</p>
          {c.starts_at && <p>Proposed time: {fmt(c.starts_at)}</p>}
          {c.resolution && <p>Admin response: {c.resolution}</p>}
          {user.role === "admin" && c.status === "pending" && (
            <Form
              endpoint={"/session-changes/" + c.id + "/resolve"}
              submit="Resolve request"
              transform={(f) => ({
                ...Object.fromEntries(f),
                approve: f.get("approve") === "true",
              })}
              onDone={reload}
            >
              <label>
                Decision
                <select
                  aria-label={"Decision for change " + c.id}
                  name="approve"
                >
                  <option value="true">Approve</option>
                  <option value="false">Decline</option>
                </select>
              </label>
              <Field
                label="Explanation for both participants"
                name="resolution"
                required
              />
            </Form>
          )}
        </div>
      ))}
      {items?.length === 0 && (
        <Empty>No change requests. You’re all set.</Empty>
      )}
    </>
  );
}
export function Analytics() {
  const [from, setFrom] = useState(
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10)),
    [data, error] = useData("/analytics?" + new URLSearchParams({ from, to }));
  const total = (key) => data?.days.reduce((sum, d) => sum + d[key], 0) || 0,
    max = Math.max(1, ...(data?.days.map((d) => d.sessions) || []));
  return (
    <>
      <h1>
        See how far
        <br />
        <em>you’ve come.</em>
      </h1>
      <p>Your activity, drawn from real session and resource records.</p>
      <div className="form-row">
        <Field
          label="From date"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label="To date"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <ErrorBox>{error}</ErrorBox>
      {data && (
        <>
          <div className="stat-grid">
            {[
              ["Sessions", total("sessions")],
              ["Resource views", total("views")],
              ["Sign-ins", total("logins")],
              ["Completed sessions", data.completed],
              ["Tutoring minutes", data.minutes],
              [
                "Average tutor rating",
                data.averageRating?.toFixed(1) || "No reviews",
              ],
            ].map(([name, n]) => (
              <div className="stat" key={name}>
                <span>{name}</span>
                <strong>{n}</strong>
              </div>
            ))}
          </div>
          <section className="panel">
            <h2>Sessions over time</h2>
            <p className="muted">
              Scheduled, completed and cancelled sessions by date.
            </p>
            <div
              className="chart"
              role="img"
              aria-label={
                "Sessions from " + from + " to " + to + ": " + total("sessions")
              }
            >
              <div className="chart-bars">
                {data.days.map((d) => (
                  <div
                    key={d.date}
                    className="chart-column"
                    title={d.date + ": " + d.sessions + " sessions"}
                  >
                    <span
                      style={{
                        height: Math.max(2, (d.sessions / max) * 150) + "px",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="chart-labels">
                <small>{from}</small>
                <small>{to}</small>
              </div>
            </div>
            <details>
              <summary>View chart data as a table</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sessions</th>
                      <th>Views</th>
                      <th>Sign-ins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{d.sessions}</td>
                        <td>{d.views}</td>
                        <td>{d.logins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="panel spaced">
            <h2>Subjects you’re exploring</h2>
            {data.subjects.length ? (
              data.subjects.map((s) => (
                <div className="session-row" key={s.name}>
                  <b>{s.name}</b>
                  <span>{s.views} resource views</span>
                </div>
              ))
            ) : (
              <p>No resource views in this range.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function AdminTools() {
  const [audit, error, refresh] = useData("/admin/audit"),
    [mail, mailError, reload] = useData("/admin/mail"),
    { toast } = useApp();
  return (
    <>
      <h1>
        A thoughtful
        <br />
        <em>operation.</em>
      </h1>
      <section className="panel">
        <h2>Invite an administrator</h2>
        <p>
          Invitations are bound to one email, expire in 48 hours and can only be
          used once.
        </p>
        <Form endpoint="/admin/invites" submit="Email invitation">
          <Field
            label="New administrator email"
            name="email"
            type="email"
            required
          />
        </Form>
      </section>
      <section className="panel spaced">
        <h2>Email deliveries</h2>
        <ErrorBox>{mailError}</ErrorBox>
        <button className="btn secondary" onClick={reload}>
          Refresh deliveries
        </button>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {mail?.map((m) => (
                <tr key={m.id}>
                  <td>{m.recipient}</td>
                  <td>{m.subject}</td>
                  <td>
                    {m.status}
                    {m.status === "failed" && (
                      <button
                        className="text-link"
                        onClick={async () => {
                          try {
                            const r = await api(
                              "/admin/mail/" + m.id + "/retry",
                              { method: "POST" },
                            );
                            toast(r.message);
                            reload();
                          } catch (e) {
                            toast(e.message);
                          }
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </td>
                  <td>{m.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel spaced">
        <h2>Administrative activity</h2>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn secondary" onClick={refresh}>
          Refresh activity
        </button>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Action</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {audit?.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.action}</td>
                  <td>{fmt(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
