"""Transactional email templates. Inline styles only (email clients ignore <style>).
All user-supplied values are HTML-escaped."""
from __future__ import annotations

from dataclasses import dataclass
from html import escape

from app.config import get_settings

INK = "#1C1917"
MUTED = "#57534E"
LINE = "#E7E5E4"
GOLD = "#C99A2E"
BRONZE = "#8A6417"
DISCLAIMER = (
    "LendWise is a loan screening prototype built on public LendingClub data. Its models assist a human "
    "reviewer, who makes the final decision. Nothing here is an actual credit offer."
)


@dataclass
class Rendered:
    subject: str
    html: str
    text: str


def usd(n: float) -> str:
    return f"${n:,.0f}" if float(n).is_integer() else f"${n:,.2f}"


def _site(path: str) -> str:
    return get_settings().public_site_url.rstrip("/") + path


def _layout(title: str, preheader: str, body: str, cta: tuple[str, str] | None = None) -> str:
    button = (
        f'<p style="margin:28px 0 8px"><a href="{escape(cta[1])}" '
        f'style="background:{GOLD};color:{INK};text-decoration:none;font-weight:600;padding:12px 22px;'
        f'border-radius:6px;display:inline-block">{escape(cta[0])}</a></p>'
        if cta
        else ""
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title></head>
<body style="margin:0;background:#FAFAF9;font-family:Arial,Helvetica,sans-serif;color:{INK}">
<span style="display:none;max-height:0;overflow:hidden">{escape(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid {LINE};border-radius:8px">
<tr><td style="padding:20px 28px;border-bottom:3px solid {GOLD}">
<span style="display:inline-block;background:{INK};color:#fff;font-weight:700;border-radius:5px;padding:3px 8px;margin-right:8px">L</span>
<span style="font-size:18px;font-weight:700;color:{INK}">LendWise</span></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6;color:{INK}">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:{INK}">{escape(title)}</h1>
{body}
{button}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid {LINE};font-size:12px;line-height:1.5;color:{MUTED}">
{escape(DISCLAIMER)}<br>Questions? Reply to this email or use the <a href="{escape(_site('/contact'))}" style="color:{BRONZE}">contact form</a>.
</td></tr>
</table></td></tr></table></body></html>"""


def _table(rows: list[tuple[str, str]]) -> str:
    cells = "".join(
        f'<tr><td style="padding:8px 0;border-bottom:1px solid {LINE};color:{MUTED}">{escape(k)}</td>'
        f'<td style="padding:8px 0;border-bottom:1px solid {LINE};text-align:right;font-weight:600">{escape(v)}</td></tr>'
        for k, v in rows
    )
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">{cells}</table>'


def _p(text: str) -> str:
    return f'<p style="margin:0 0 12px">{text}</p>'


def application_received(a) -> Rendered:
    first = a.full_name.split(" ")[0]
    rows = [
        ("Application ID", a.application_id),
        ("Loan amount", usd(a.loan_amount)),
        ("FICO score", str(a.fico)),
        ("Debt-to-income ratio", f"{a.dti:g}%"),
        ("Purpose", a.purpose),
    ]
    body = _p(f"Hi {escape(first)},") + _p(
        "Thank you for applying with LendWise. We have received your application and screened it. "
        "A loan officer will review the result and we will email you as soon as a decision is made."
    ) + _table(rows) + _p("Keep your application ID. You will need it, with this email address, to check your status.")
    text = (
        f"Hi {first},\n\nThank you for applying with LendWise. We have received your application. A loan officer will review it and email you the decision.\n\n"
        + "\n".join(f"{k}: {v}" for k, v in rows)
        + f"\n\nCheck your status: {_site('/status?id=' + a.application_id)}\n\n{DISCLAIMER}"
    )
    return Rendered(
        subject=f"We have received your application {a.application_id}",
        html=_layout("We have received your application", f"Application {a.application_id} received", body,
                     ("Check application status", _site(f"/status?id={a.application_id}"))),
        text=text,
    )


def decision(a, updated: bool = False) -> Rendered:
    first = a.full_name.split(" ")[0]
    approved = a.final_decision == "APPROVED"
    link = _site(f"/status?id={a.application_id}")
    prefix = "Update: " if updated else ""
    if approved:
        title = "Your loan application is approved"
        amount = a.approved_amount or a.loan_amount
        rows = [("Application ID", a.application_id), ("Requested amount", usd(a.loan_amount)), ("Approved amount", usd(amount))]
        lower = amount < a.loan_amount
        intro = (
            "Following a review by a loan officer, your application has been approved"
            + (" for a smaller amount than you asked for." if lower else ".")
            if updated
            else "Good news: a loan officer has reviewed your application and approved it"
            + (" for a smaller amount than you asked for." if lower else ".")
        )
        body = _p(f"Hi {escape(first)},") + _p(intro) + _table(rows) + _p(
            "This is a prototype, so no money will be paid out. In a real lender, the next step would be identity and income checks."
        )
        text = f"Hi {first},\n\n{intro}\n\n" + "\n".join(f"{k}: {v}" for k, v in rows) + f"\n\n{link}\n\n{DISCLAIMER}"
    else:
        title = "An update on your loan application"
        intro = (
            "Following a review by a loan officer, we are unable to approve your application at this time."
            if updated
            else "Thank you for applying. After a review by a loan officer, we are unable to approve your application at this time."
        )
        tips = (
            "LendWise looks at three things: the loan amount, your FICO score and your debt-to-income ratio. "
            "A smaller amount, a higher FICO score or a lower DTI all improve the result."
        )
        body = _p(f"Hi {escape(first)},") + _p(intro) + _p(tips)
        text = f"Hi {first},\n\n{intro}\n\n{tips}\n\n{link}\n\n{DISCLAIMER}"
    subject = f"{prefix}Decision on your application {a.application_id}"
    return Rendered(subject, _layout(title, subject, body, ("View your decision", link)), text)


def contact_ack(m) -> Rendered:
    first = m.name.split(" ")[0]
    quoted = escape(m.message).replace("\n", "<br>")
    body = (
        _p(f"Hi {escape(first)},")
        + _p(f"Thanks for getting in touch. Your reference is <strong>{escape(m.reference)}</strong>. We aim to reply within two business days.")
        + f'<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid {GOLD};background:#FAFAF9;color:{MUTED}">{quoted}</blockquote>'
    )
    text = f"Hi {first},\n\nThanks for getting in touch. Your reference is {m.reference}. We aim to reply within two business days.\n\n> {m.message}\n\n{DISCLAIMER}"
    return Rendered(f"We have received your message ({m.reference})", _layout("We have received your message", m.reference, body), text)


def contact_reply(m, reply: str) -> Rendered:
    first = m.name.split(" ")[0]
    reply_html = escape(reply).replace("\n", "<br>")
    quoted = escape(m.message).replace("\n", "<br>")
    body = (
        _p(f"Hi {escape(first)},") + f'<div style="margin:0 0 16px">{reply_html}</div>'
        + _p("Regards,<br>LendWise Support")
        + f'<p style="margin:24px 0 6px;font-size:12px;color:{MUTED}">Your original message ({escape(m.reference)}):</p>'
        + f'<blockquote style="margin:0;padding:12px 16px;border-left:3px solid {LINE};color:{MUTED};font-size:13px">{quoted}</blockquote>'
    )
    text = f"Hi {first},\n\n{reply}\n\nRegards,\nLendWise Support\n\n--- Your original message ({m.reference}) ---\n{m.message}\n\n{DISCLAIMER}"
    return Rendered(f"Re: your message {m.reference}", _layout("Reply from LendWise Support", f"Re: {m.reference}", body), text)


def info_requested(a, message: str) -> Rendered:
    first = a.full_name.split(" ")[0]
    link = _site(f"/status?id={a.application_id}")
    msg_html = escape(message).replace("\n", "<br>")
    body = (
        _p(f"Hi {escape(first)},")
        + _p(f"A loan officer reviewing application <strong>{escape(a.application_id)}</strong> needs a little more information:")
        + f'<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid {GOLD};background:#FAFAF9">{msg_html}</blockquote>'
        + _p("Please reply from your application status page. Your application will continue as soon as we hear from you.")
    )
    text = (
        f"Hi {first},\n\nA loan officer reviewing application {a.application_id} needs more information:\n\n{message}\n\n"
        f"Reply here: {link}\n\n{DISCLAIMER}"
    )
    return Rendered(
        f"More information needed for application {a.application_id}",
        _layout("We need a little more information", f"About application {a.application_id}", body, ("Reply to the officer", link)),
        text,
    )
