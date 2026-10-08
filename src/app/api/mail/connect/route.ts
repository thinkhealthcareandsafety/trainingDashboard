import { memberIdOf, signedInMember, unauthorized } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { MAIL_SCOPES, connectMailbox, mailboxInfo } from "@/lib/zohoMail";

export const dynamic = "force-dynamic";

// Zoho Mail mailboxes the dashboard sends from. GET ?address= — is it connected (any signed-in member);
// POST { address, code, clientId?, clientSecret? } — Admin connects it with a one-time code from the Zoho API console.

export async function GET(request: Request) {
  if (!memberIdOf(request)) return unauthorized();
  const address = new URL(request.url).searchParams.get("address") ?? "";
  try {
    return Response.json({ mailbox: address ? await mailboxInfo(address) : null, scopes: MAIL_SCOPES });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Only Admin connects a mailbox" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { address?: string; code?: string; clientId?: string; clientSecret?: string };
  if (!body.address || !body.code) return Response.json({ error: "Mailbox and code are needed" }, { status: 400 });
  try {
    const mailbox = await connectMailbox({ address: body.address, code: body.code, clientId: body.clientId, clientSecret: body.clientSecret, by: me.name });
    return Response.json({ ok: true, mailbox });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't connect" }, { status: 400 });
  }
}
