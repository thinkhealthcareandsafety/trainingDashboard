// Stand-in for @/lib/auth in tests: the signed-in member comes from the x-test-member header.
export const signedInMember = async (r: Request): Promise<{ id: string; name: string } | null> => { const h = r.headers.get("x-test-member"); return h ? JSON.parse(h) : null; };
export const unauthorized = () => Response.json({ error: "Please sign in" }, { status: 401 });
