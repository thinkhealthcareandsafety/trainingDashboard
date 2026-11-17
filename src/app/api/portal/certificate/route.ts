export const dynamic = "force-dynamic";

/*
 * A participant's certificate download is closed (owner, 17 Nov: "it should only go through the mail"): the Good Samaritan
 * certificate reaches them only by email, with the thank-you, when the training ends. Old links get this answer.
 */
export async function GET() {
  return Response.json({ error: "Your certificate comes by email when the training ends." }, { status: 410 });
}
