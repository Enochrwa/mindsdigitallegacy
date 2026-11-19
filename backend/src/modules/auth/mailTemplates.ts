/** Plain, accessible transactional emails. Every interpolated value is HTML-escaped. */
export interface Mail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

function layout(
  heading: string,
  intro: string,
  link: string | undefined,
  outro: string,
): Mail["html"] {
  const button =
    link === undefined
      ? ""
      : `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#0b2a4a;color:#ffffff;text-decoration:none;border-radius:6px">Continue</a></p><p>If the button does not work, copy this address into your browser:<br>${escapeHtml(link)}</p>`;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#1a1a1a"><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(intro)}</p>${button}<p>${escapeHtml(outro)}</p><p>Minds Digital Legacy, Kigali, Rwanda</p></body></html>`;
}

function build(subject: string, intro: string, link: string | undefined, outro: string): Mail {
  return {
    subject,
    text: [intro, link, outro, "Minds Digital Legacy, Kigali, Rwanda"]
      .filter((s) => s !== undefined)
      .join("\n\n"),
    html: layout(subject, intro, link, outro),
  };
}

const INTERNSHIP_COPY: Record<string, { subject: string; body: string }> = {
  received: {
    subject: "We received your internship application",
    body: "Thank you for applying. Our team will review your application. Receiving this email does not guarantee a place: we can only accept interns when we have a suitable project and a supervisor.",
  },
  shortlisted: {
    subject: "Your internship application was shortlisted",
    body: "Good news: your application has moved to the next stage. Sign in to see the status.",
  },
  interview: {
    subject: "Interview for your internship application",
    body: "We would like to talk to you. Sign in to see the status of your application; we will contact you about the time.",
  },
  offered: {
    subject: "You have an internship offer",
    body: "We would like to offer you a place. Sign in to read the intern agreement and accept or decline. The offer is not confirmed until you accept it and your placement is set up.",
  },
  rejected: {
    subject: "An update on your internship application",
    body: "Thank you for your interest. We are not able to offer you a place at this time. Sign in to see any message from our team. You are welcome to apply again when new internships open.",
  },
  placed: {
    subject: "Your internship placement is confirmed",
    body: "Your placement is confirmed and a supervisor has been assigned. Sign in to see the dates and your supervisor.",
  },
};

export const templates = {
  internshipUpdate: (name: string, title: string, kind: string, link: string): Mail => {
    const copy = INTERNSHIP_COPY[kind] ?? INTERNSHIP_COPY["received"];
    return build(
      copy?.subject ?? "Internship update",
      `Hello ${name}. About: ${title}. ${copy?.body ?? ""}`,
      link,
      "If you did not apply for an internship with us, ignore this email.",
    );
  },
  verifyEmail: (link: string): Mail =>
    build(
      "Confirm your email address",
      "Welcome to Minds Digital Legacy. Confirm your email address to activate your account. The link works once and expires in 24 hours.",
      link,
      "If you did not create an account, you can ignore this email.",
    ),
  resetPassword: (link: string): Mail =>
    build(
      "Reset your password",
      "We received a request to reset your password. The link works once and expires in one hour.",
      link,
      "If you did not ask for this, ignore this email: your password has not changed.",
    ),
  guardianConsent: (learnerName: string, link: string): Mail =>
    build(
      "Consent needed for a young learner",
      `${learnerName} (under 16) has asked to join Minds Digital Legacy and named you as parent or guardian. Please review and give your consent using the link below. The account stays inactive until you do. The link works once and expires in 7 days.`,
      link,
      "If you do not know this person or do not agree, ignore this email and no account will be activated.",
    ),
  signInCode: (name: string, code: string): Mail =>
    build(
      "Your MDL confirmation code",
      `Hello ${name}. Your confirmation code is ${code}. Enter it on the page where you are finishing your sign-up. It works for 15 minutes.`,
      undefined,
      "If you did not try to sign up with this email address, ignore this message. Nobody can use the code without being on that page.",
    ),
  existingAccount: (): Mail =>
    build(
      "About your registration",
      "Someone tried to register this email address, but an account already exists. If it was you, sign in or use the password reset option.",
      undefined,
      "If it was not you, no action is needed.",
    ),
};
