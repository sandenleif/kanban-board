// Shared LDAP authentication helper.

type LdapConfig = {
  host: string;
  port: number;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter: string;
  loginBaseDn?: string | null; // if set, restricts login searches to this OU
};

export type LdapUser = {
  dn: string;
  name: string;
  username: string;
  email: string;
};

/**
 * Authenticate a user against LDAP.
 * - identifier can be an email address OR a plain sAMAccountName (e.g. "leif.sanden")
 * - Returns user info on success, null on failure / not found / wrong password.
 */
export async function ldapAuthenticate(
  config: LdapConfig,
  identifier: string,
  password: string
): Promise<LdapUser | null> {
  try {
    const ldap = await import("ldapjs").catch(() => null);
    if (!ldap) return null;

    const isEmail = identifier.includes("@");
    // For login, use loginBaseDn if configured (restricts to a specific OU/group)
    const searchBase = config.loginBaseDn?.trim() || config.baseDn;

    // Build search filter: by email/UPN or by sAMAccountName
    const idFilter = isEmail
      ? `(|(mail=${identifier})(userPrincipalName=${identifier}))`
      : `(sAMAccountName=${identifier})`;
    const filter = `(&${config.userFilter}${idFilter})`;

    return await new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any = ldap.createClient({
        url: `ldap://${config.host}:${config.port}`,
        timeout: 8000,
        connectTimeout: 6000,
        referrals: false,
      } as Parameters<typeof ldap.createClient>[0]);

      client.on("error", () => resolve(null));

      // Step 1: bind with service account
      client.bind(config.bindDn, config.bindPassword, (bindErr: Error | null) => {
        if (bindErr) { client.destroy(); resolve(null); return; }

        // Step 2: find the user
        client.search(
          searchBase,
          { filter, scope: "sub", attributes: ["dn", "cn", "displayName", "mail", "sAMAccountName"], sizeLimit: 2 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (searchErr: Error | null, res: any) => {
            if (searchErr) { client.destroy(); resolve(null); return; }

            let userDn = "";
            let userName = "";
            let userEmail = "";
            let username = "";

            res.on("searchReference", () => {});
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res.on("searchEntry", (entry: any) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const get = (a: string) => (entry.pojo?.attributes ?? []).find((x: any) => x.type === a)?.values?.[0] ?? "";
              userDn    = entry.dn.toString();
              userName  = get("displayName") || get("cn");
              userEmail = get("mail") || (isEmail ? identifier : `${identifier}@${config.baseDn.replace(/^dc=/i, "").replace(/,dc=/gi, ".")}`);
              username  = get("sAMAccountName") || identifier;
            });
            res.on("error", () => { client.destroy(); resolve(null); });
            res.on("end", () => {
              if (!userDn) { client.destroy(); resolve(null); return; }

              // Step 3: bind as the user to verify password
              client.bind(userDn, password, (userBindErr: Error | null) => {
                client.destroy();
                if (userBindErr) { resolve(null); return; }
                resolve({ dn: userDn, name: userName, username, email: userEmail });
              });
            });
          }
        );
      });
    });
  } catch {
    return null;
  }
}
