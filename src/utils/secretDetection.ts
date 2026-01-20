export interface SecretPattern {
    id: string;
    name: string;
    regex: RegExp;
}

export const SECRET_PATTERNS: SecretPattern[] = [
    {
        id: "aws_access_key",
        name: "AWS Access Key",
        regex: /AKIA[0-9A-Z]{16}/g
    },
    {
        id: "aws_secret_key",
        name: "AWS Secret Key",
        regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g
    },
    {
        id: "google_api_key",
        name: "Google API Key",
        regex: /AIza[0-9A-Za-z\-_]{35}/g
    },
    {
        id: "github_pat",
        name: "GitHub PAT",
        regex: /ghp_[0-9a-zA-Z]{36}/g
    },
    {
        id: "stripe_sk",
        name: "Stripe Secret Key",
        regex: /sk_live_[0-9a-zA-Z]{24}/g
    },
    {
        id: "slack_token",
        name: "Slack Token",
        regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g
    },
    {
        id: "bearer_token",
        name: "Bearer Token",
        regex: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi
    },
    {
        id: "generic_secret",
        name: "Generic Secret",
        regex: /(apikey|api_key|secret|token)['"\s:=]+[a-zA-Z0-9\-._]{8,}/gi
    }
];

export interface SecretMatch {
    patternId: string;
    patternName: string;
    value: string;
    fullMatch: string;
}

export function findSecrets(text: string): SecretMatch[] {
    const matches: SecretMatch[] = [];

    for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(text)) !== null) {
            let value = match[0];
            if (pattern.id === "bearer_token") {
                const parts = match[0].split(/\s+/);
                if (parts.length > 1) {
                    value = parts[1];
                }
            } else if (pattern.id === "generic_secret") {
                const parts = match[0].split(/['"\s:=]+/);
                if (parts.length > 1) {
                    value = parts[parts.length - 1];
                }
            }

            matches.push({
                patternId: pattern.id,
                patternName: pattern.name,
                value,
                fullMatch: match[0]
            });
        }
    }

    return matches;
}
