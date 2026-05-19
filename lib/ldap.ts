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
 * Escape a value for use inside an LDAP filter assertion (RFC 4515).
 * Non-ASCII characters (e.g. umlauts) are encoded as \xx hex bytes.
 */
function ldapEscape(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 127) {
      const bytes = Buffer.from(char, "utf8");
      for (const byte of bytes) result += "\\" + byte.toString(16).padStart(2, "0");
    } else if (char === "\\") result += "\\5c";
    else if (char === "*")  result += "\\2a";
    else if (char === "(")  result += "\\28";
    else if (char === ")")  result += "\\29";
    else if (char === "\0") result += "\\00";
    else result += char;
  }
  return result;
}

/**
 * Authenticate a user against LDAP.
 * - identifier can be an email address OR a plain sAMAccountName (e.g. "leif.sanden")
 * - useLoginBaseDn: true = restrict search to loginBaseDn (main app), false = use full baseDn (portal)
 * - Returns user info on success, null on failure / not found / wrong password.
 */
export async function ldapAuthenticate(
  config: LdapConfig,
  identifier: string,
  password: string,
  options?: { useLoginBaseDn?: boolean }
): Promise<LdapUser | null> {
  try {
    const ldap = await import("ldapjs").catch(() => null);
    if (!ldap) return null;

    const isEmail = identifier.includes("@");
    // Main app uses loginBaseDn (IT restriction); portal uses full baseDn
    const useLoginBase = options?.useLoginBaseDn ?? true;
    const searchBase = (useLoginBase && config.loginBaseDn?.trim()) ? config.loginBaseDn.trim() : config.baseDn;

    // Build search filter: by email/UPN or by sAMAccountName.
    // For sAMAccountName: also try with German umlauts transliterated
    // (AD stores "johannes.boehmler" but user may type "johannes.böhmler")
    let idFilter: string;
    if (isEmail) {
      const esc = ldapEscape(identifier);
      idFilter = `(|(mail=${esc})(userPrincipalName=${esc}))`;
    } else {
      const transliterated = identifier
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
        .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
        .replace(/ß/g, "ss");
      const escOrig  = ldapEscape(identifier);
      const escTrans = ldapEscape(transliterated);
      idFilter = transliterated !== identifier
        ? `(|(sAMAccountName=${escOrig})(sAMAccountName=${escTrans}))`
        : `(sAMAccountName=${escOrig})`;
    }
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
          { filter, scope: "sub", attributes: ["dn", "cn", "displayName", "mail", "sAMAccountName", "userPrincipalName"], sizeLimit: 2 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (searchErr: Error | null, res: any) => {
            if (searchErr) { client.destroy(); resolve(null); return; }

            let userDn = "";
            let userName = "";
            let userEmail = "";
            let username = "";
            let userUpn = "";

            res.on("searchReference", () => {});
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res.on("searchEntry", (entry: any) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const get = (a: string) => (entry.pojo?.attributes ?? []).find((x: any) => x.type === a)?.values?.[0] ?? "";
              userDn    = entry.dn.toString();
              userName  = get("displayName") || get("cn");
              userEmail = get("mail") || (isEmail ? identifier : `${identifier}@${config.baseDn.replace(/^dc=/i, "").replace(/,dc=/gi, ".")}`);
              username  = get("sAMAccountName") || identifier;
              userUpn   = get("userPrincipalName"); // preferred for bind — avoids DN non-ASCII issues
            });
            res.on("error", () => { client.destroy(); resolve(null); });
            res.on("end", () => {
              if (!userDn) { client.destroy(); resolve(null); return; }

              // Step 3: bind as the user to verify password.
              // Prefer UPN (user@domain) over DN — UPN is always ASCII and avoids
              // ldapjs encoding issues when the CN contains non-ASCII chars (umlauts).
              const bindName = userUpn || userDn;
              client.bind(bindName, password, (userBindErr: Error | null) => {
                client.destroy();
                if (userBindErr) { resolve(null); return; }
                // Normalise email: lowercase to avoid duplicate users on re-login
                if (userEmail) userEmail = userEmail.toLowerCase();
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
