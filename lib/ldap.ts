// Shared LDAP authentication helper used by both main login and portal login.

type LdapConfig = {
  host: string;
  port: number;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter: string;
};

export type LdapUser = {
  dn: string;
  name: string;
  username: string;
  email: string;
};

// Authenticate a user against LDAP. Returns user info on success, null on failure.
export async function ldapAuthenticate(
  config: LdapConfig,
  email: string,
  password: string
): Promise<LdapUser | null> {
  try {
    const ldap = await import("ldapjs").catch(() => null);
    if (!ldap) return null;

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

        // Step 2: search for the user by email or UPN
        const filter = `(&${config.userFilter}(|(mail=${email})(userPrincipalName=${email})))`;
        client.search(
          config.baseDn,
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
              userEmail = get("mail") || email;
              username  = get("sAMAccountName") || email.split("@")[0];
            });
            res.on("error", () => { client.destroy(); resolve(null); });
            res.on("end", () => {
              if (!userDn) { client.destroy(); resolve(null); return; }

              // Step 3: bind as the found user to verify their password
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
